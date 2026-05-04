data "aws_rds_engine_version" "postgresql" {
  engine  = "aurora-postgresql"
  version = var.db_config.engine_version
}

module "db" {
  source  = "terraform-aws-modules/rds-aurora/aws"
  version = "~> 10.2"

  name                                          = "${var.name_prefix}-${terraform.workspace}"
  engine                                        = data.aws_rds_engine_version.postgresql.engine
  engine_mode                                   = "provisioned"
  engine_version                                = data.aws_rds_engine_version.postgresql.version
  storage_encrypted                             = true
  master_username                               = "root"
  manage_master_user_password                   = true
  kms_key_id                                    = aws_kms_key.this.arn
  master_user_secret_kms_key_id                 = aws_kms_key.this.arn
  cloudwatch_log_group_kms_key_id               = aws_kms_key.this.arn
  vpc_id                                        = local.vpc_id
  subnets                                       = local.private_subnets
  cluster_performance_insights_enabled          = true
  cluster_performance_insights_kms_key_id       = aws_kms_key.this.arn
  cluster_performance_insights_retention_period = var.db_config.cluster_performance_insights_retention_period
  cluster_monitoring_interval                   = var.db_config.cluster_monitoring_interval
  apply_immediately                             = true
  skip_final_snapshot                           = false
  final_snapshot_identifier                     = "${var.name_prefix}-${terraform.workspace}-final"
  enable_http_endpoint                          = var.db_config.enable_http_endpoint
  cluster_instance_class                        = var.db_config.instance_class
  serverlessv2_scaling_configuration            = var.db_config.serverlessv2_scaling_configuration
  create_db_subnet_group                        = true
  create_security_group                         = true
  security_group_name                           = "${var.name_prefix}-${terraform.workspace}-aurora-sg"
  security_group_ingress_rules = {
    rds_proxy = {
      referenced_security_group_id = aws_security_group.rds_proxy.id
    }
  }
  create_monitoring_role          = true
  create_cloudwatch_log_group     = true
  instances                       = var.db_config.instances
  enabled_cloudwatch_logs_exports = ["postgresql"]
  deletion_protection             = true
  availability_zones              = local.availability_zones
}

module "rds_proxy" {
  source  = "terraform-aws-modules/rds-proxy/aws"
  version = "~> 4.4"

  name                   = "${var.name_prefix}-${terraform.workspace}"
  iam_role_name          = "${var.name_prefix}-${terraform.workspace}-rds-proxy-role"
  vpc_subnet_ids         = local.private_subnets
  vpc_security_group_ids = [aws_security_group.rds_proxy.id]
  endpoint_network_type  = "DUAL"

  auth = {
    "superuser" = {
      auth_scheme               = "SECRETS"
      client_password_auth_type = "POSTGRES_SCRAM_SHA_256"
      iam_auth                  = "REQUIRED"
      description               = "Aurora PostgreSQL superuser password"
      secret_arn                = module.db.cluster_master_user_secret[0].secret_arn
    }
  }

  engine_family         = "POSTGRESQL"
  require_tls           = true
  target_db_cluster     = true
  db_cluster_identifier = module.db.cluster_id

  kms_key_arns = [module.db.cluster_master_user_secret[0].kms_key_id]
}

resource "aws_security_group" "rds_proxy" {
  name_prefix = "${var.name_prefix}-rds-proxy-${terraform.workspace}"
  description = "Security group for RDS Proxy"
  vpc_id      = local.vpc_id

  tags = {
    Name = "${var.name_prefix}-rds-proxy-${terraform.workspace}"
  }
}

resource "aws_security_group_rule" "rds_proxy_to_aurora" {
  description              = "Allow RDS Proxy to reach Aurora cluster"
  type                     = "egress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = module.db.security_group_id
  security_group_id        = aws_security_group.rds_proxy.id
}

resource "aws_security_group" "lambda" {
  name_prefix = "${var.name_prefix}-lambda-${terraform.workspace}"
  description = "Security group for Lambda functions connecting to RDS Proxy"
  vpc_id      = local.vpc_id

  egress {
    description = "Allow all IPv4 egress (VPC endpoints, RDS)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description      = "Allow all IPv6 egress (GitHub API via EIGW)"
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = {
    Name = "${var.name_prefix}-lambda-${terraform.workspace}"
  }
}

resource "aws_security_group_rule" "lambda_to_rds_proxy" {
  description              = "Allow Lambda functions to connect to RDS Proxy"
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.lambda.id
  security_group_id        = aws_security_group.rds_proxy.id
}
