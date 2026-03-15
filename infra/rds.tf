data "aws_rds_engine_version" "postgresql" {
  engine  = "aurora-postgresql"
  version = var.db_config.engine_version
}

module "db" {
  source  = "terraform-aws-modules/rds-aurora/aws"
  version = " ~> 10.2"

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
  vpc_id                                        = var.db_config.vpc_id
  subnets                                       = var.db_config.subnets
  cluster_performance_insights_enabled          = true
  cluster_performance_insights_kms_key_id       = aws_kms_key.this.arn
  cluster_performance_insights_retention_period = var.db_config.cluster_performance_insights_retention_period
  cluster_monitoring_interval                   = var.db_config.cluster_monitoring_interval
  apply_immediately                             = true
  skip_final_snapshot                           = false
  final_snapshot_identifier                     = "${var.name_prefix}-${terraform.workspace}-final"
  enable_http_endpoint                          = true
  cluster_instance_class                        = var.db_config.instance_class
  serverlessv2_scaling_configuration            = var.db_config.serverlessv2_scaling_configuration
  create_db_subnet_group                        = true
  create_security_group                         = true
  create_monitoring_role                        = true
  create_cloudwatch_log_group                   = true
  instances                                     = var.db_config.instances
  enabled_cloudwatch_logs_exports               = ["postgresql", "instance", "iam-db-auth-error"]
  deletion_protection                           = true
}
