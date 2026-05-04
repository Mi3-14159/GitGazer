data "aws_ami" "amazon_linux_2023" {
  count = var.enable_bastion ? 1 : 0

  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023*-kernel-*-arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

resource "aws_iam_role" "bastion" {
  count = var.enable_bastion ? 1 : 0

  name               = "${var.name_prefix}-bastion-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.bastion_assume_role[0].json
}

data "aws_iam_policy_document" "bastion_assume_role" {
  count = var.enable_bastion ? 1 : 0

  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role_policy_attachment" "bastion_ssm" {
  count = var.enable_bastion ? 1 : 0

  role       = aws_iam_role.bastion[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "bastion_logs" {
  count = var.enable_bastion ? 1 : 0

  role       = aws_iam_role.bastion[0].name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}

resource "aws_iam_instance_profile" "bastion" {
  count = var.enable_bastion ? 1 : 0

  name = "${var.name_prefix}-bastion-${terraform.workspace}"
  role = aws_iam_role.bastion[0].name
}

resource "aws_security_group" "bastion" {
  count = var.enable_bastion ? 1 : 0

  name_prefix = "${var.name_prefix}-bastion-${terraform.workspace}"
  description = "Bastion host / egress only / access via SSM Session Manager"
  vpc_id      = local.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    ipv6_cidr_blocks = ["::/0"]
  }
}

resource "aws_security_group_rule" "bastion_to_rds_proxy" {
  count = var.enable_bastion ? 1 : 0

  description              = "Allow bastion host to connect to RDS Proxy for database access"
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.bastion[0].id
  security_group_id        = aws_security_group.rds_proxy.id
}

resource "aws_instance" "bastion" {
  count = var.enable_bastion ? 1 : 0

  ami                    = data.aws_ami.amazon_linux_2023[0].id
  instance_type          = "t4g.nano"
  subnet_id              = local.private_subnets[0]
  iam_instance_profile   = aws_iam_instance_profile.bastion[0].name
  vpc_security_group_ids = [aws_security_group.bastion[0].id]
  ipv6_address_count     = 1

  user_data_base64 = base64encode(<<-EOF
    #!/bin/bash

    # Configure SSM Agent for IPv6 dual-stack endpoints
    SSM_CONFIG_DIR="/etc/amazon/ssm"
    SSM_CONFIG="$SSM_CONFIG_DIR/amazon-ssm-agent.json"

    if [ ! -f "$SSM_CONFIG" ]; then
      cp "$SSM_CONFIG_DIR/amazon-ssm-agent.json.template" "$SSM_CONFIG"
    fi

    python3 -c "
    import json
    with open('$SSM_CONFIG') as f:
        cfg = json.load(f)
    cfg.setdefault('Agent', {})['Region'] = '${var.aws_region}'
    cfg['Agent']['UseDualStackEndpoint'] = True
    with open('$SSM_CONFIG', 'w') as f:
        json.dump(cfg, f, indent=4)
    "

    systemctl enable --now amazon-ssm-agent
    systemctl restart amazon-ssm-agent
  EOF
  )

  metadata_options {
    http_tokens   = "required" # IMDSv2 only
    http_endpoint = "enabled"
  }

  tags = {
    Name = "${var.name_prefix}-bastion-${terraform.workspace}"
  }
}
