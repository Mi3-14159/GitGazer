# VPC Endpoints — only the free S3 Gateway endpoint.
# All other AWS service traffic routes over IPv6 via EIGW using dual-stack endpoints.

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
