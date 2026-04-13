module "docs_bucket" {
  source        = "terraform-aws-modules/s3-bucket/aws"
  version       = "~> 5.2"
  create_bucket = var.docs_config.enabled
  force_destroy = "true"

  bucket        = "${data.aws_caller_identity.current.account_id}-${var.name_prefix}-docs-${terraform.workspace}"
  acl           = "private"
  attach_policy = false

  control_object_ownership = true
  object_ownership         = "ObjectWriter"

  versioning = {
    enabled = true
  }
}

resource "aws_s3_bucket_policy" "docs_bucket" {
  count  = var.docs_config.enabled ? 1 : 0
  bucket = module.docs_bucket.s3_bucket_id
  policy = data.aws_iam_policy_document.s3_policy_cf_docs_bucket[0].json
}

data "aws_iam_policy_document" "s3_policy_cf_docs_bucket" {
  count = var.docs_config.enabled ? 1 : 0

  statement {
    sid       = "AllowCloudFront"
    actions   = ["s3:GetObject"]
    resources = ["${module.docs_bucket.s3_bucket_arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"

      values = [aws_cloudfront_distribution.docs[0].arn]
    }
  }

  statement {
    sid    = "denyInsecureTransport"
    effect = "Deny"

    actions = [
      "s3:*",
    ]

    resources = [
      module.docs_bucket.s3_bucket_arn,
      "${module.docs_bucket.s3_bucket_arn}/*",
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
