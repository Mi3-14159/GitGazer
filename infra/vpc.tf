module "vpc" {
  create_vpc = var.vpc.create
  source     = "terraform-aws-modules/vpc/aws"
  version    = "~> 6.0"

  name = "${var.name_prefix}-${terraform.workspace}"
  cidr = var.vpc.config.cidr_block

  azs             = var.vpc.config.azs
  private_subnets = var.vpc.config.private_subnets
  public_subnets  = var.vpc.config.public_subnets

  enable_nat_gateway     = var.vpc.config.enable_nat_gateway
  single_nat_gateway     = var.vpc.config.single_nat_gateway
  create_egress_only_igw = var.vpc.config.create_egress_only_igw

  enable_ipv6                                   = var.vpc.config.enable_ipv6
  public_subnet_assign_ipv6_address_on_creation = var.vpc.config.public_subnet_assign_ipv6_address_on_creation

  public_subnet_ipv6_prefixes  = var.vpc.config.public_subnet_ipv6_prefixes
  private_subnet_ipv6_prefixes = var.vpc.config.private_subnet_ipv6_prefixes

  private_subnet_enable_dns64 = var.vpc.config.enable_nat_gateway && var.vpc.config.enable_ipv6
}
