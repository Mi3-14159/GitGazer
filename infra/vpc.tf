module "vpc" {
  create_vpc = var.vpc.create
  source     = "terraform-aws-modules/vpc/aws"
  version    = "~> 6.0"

  name = "${var.name_prefix}-${terraform.workspace}"
  cidr = var.vpc.config.cidr_block

  azs             = var.vpc.config.azs
  private_subnets = var.vpc.config.private_subnets
  public_subnets  = var.vpc.config.public_subnets

  enable_nat_gateway = var.vpc.config.enable_nat_gateway
  single_nat_gateway = var.vpc.config.single_nat_gateway
}
