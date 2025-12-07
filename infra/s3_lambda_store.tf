module "lambda_store" {
  source                   = "terraform-aws-modules/s3-bucket/aws"
  version                  = "~> 5.9"
  force_destroy            = true
  bucket                   = "${data.aws_caller_identity.current.account_id}-${var.name_prefix}-lambda-store-${terraform.workspace}"
  attach_policy            = false
  control_object_ownership = true
  object_ownership         = "BucketOwnerEnforced"

  versioning = {
    enabled = true
  }
}

resource "aws_s3_bucket_policy" "lambda_store" {
  bucket = module.lambda_store.s3_bucket_id
  policy = data.aws_iam_policy_document.lambda_store_s3_policy_cf_bucket.json
}

data "aws_iam_policy_document" "lambda_store_s3_policy_cf_bucket" {
  statement {
    sid    = "denyInsecureTransport"
    effect = "Deny"

    actions = [
      "s3:*",
    ]

    resources = [
      module.lambda_store.s3_bucket_arn,
      "${module.lambda_store.s3_bucket_arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values = [
        "false"
      ]
    }
  }
}
