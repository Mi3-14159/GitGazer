# VPC Endpoints — the free S3 Gateway endpoint and a Bedrock Runtime interface endpoint.
# Other AWS service traffic routes over IPv6 via EIGW using dual-stack endpoints.
# Bedrock Runtime has no dual-stack (AAAA) endpoint, so it needs the interface endpoint.

# S3 Gateway Endpoint (free — avoids routing S3 traffic externally)
resource "aws_vpc_endpoint" "s3" {
  count             = var.vpc.create ? 1 : 0
  vpc_id            = local.vpc_id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = module.vpc.private_route_table_ids

  tags = {
    Name = "${var.name_prefix}-vpce-s3-${terraform.workspace}"
  }
}

resource "aws_security_group" "vpce_bedrock_runtime" {
  count       = var.vpc.create ? 1 : 0
  name_prefix = "${var.name_prefix}-vpce-bedrock-runtime-${terraform.workspace}"
  description = "Allow Lambda functions to reach the Bedrock Runtime VPC endpoint"
  vpc_id      = local.vpc_id

  ingress {
    description     = "HTTPS from Lambda functions"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }

  tags = {
    Name = "${var.name_prefix}-vpce-bedrock-runtime-${terraform.workspace}"
  }
}

resource "aws_vpc_endpoint" "bedrock_runtime" {
  count               = var.vpc.create ? 1 : 0
  vpc_id              = local.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.bedrock-runtime"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.private_subnets
  security_group_ids  = [aws_security_group.vpce_bedrock_runtime[0].id]
  private_dns_enabled = true

  tags = {
    Name = "${var.name_prefix}-vpce-bedrock-runtime-${terraform.workspace}"
  }
}
