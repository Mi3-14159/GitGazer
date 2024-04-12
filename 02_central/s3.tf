module "ui_bucket" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "~> 4.1"

  bucket        = "${data.aws_caller_identity.current.account_id}-${var.name_prefix}-ui-${terraform.workspace}"
  acl           = "private"
  attach_policy = false

  control_object_ownership = true
  object_ownership         = "ObjectWriter"

  versioning = {
    enabled = false
  }
}

resource "aws_s3_bucket_policy" "ui_bucket" {
  bucket = module.ui_bucket.s3_bucket_id
  policy = data.aws_iam_policy_document.s3_policy_cf_bucket.json
}

data "aws_iam_policy_document" "s3_policy_cf_bucket" {
  statement {
    sid       = "AllowCloudFront"
    actions   = ["s3:GetObject"]
    resources = ["${module.ui_bucket.s3_bucket_arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"

      values = [aws_cloudfront_distribution.this.arn]
    }
  }

  statement {
    sid    = "denyInsecureTransport"
    effect = "Deny"

    actions = [
      "s3:*",
    ]

    resources = [
      module.ui_bucket.s3_bucket_arn,
      "${module.ui_bucket.s3_bucket_arn}/*",
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
