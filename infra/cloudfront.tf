data "aws_cloudfront_cache_policy" "managed_caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "managed_caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "managed_all_viewer_except_host_header" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_response_headers_policy" "cors_policy" {
  name = "${var.name_prefix}-cors-policy-${terraform.workspace}"

  cors_config {
    access_control_allow_credentials = true

    access_control_allow_headers {
      items = ["Content-Type", "X-Amz-Date", "Authorization", "X-Api-Key", "X-Amz-Security-Token", "X-Amz-User-Agent"]
    }

    access_control_allow_methods {
      items = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    }

    access_control_allow_origins {
      items = local.cors_allowed_origins
    }

    access_control_max_age_sec = 600

    origin_override = true
  }
}

resource "aws_cloudfront_origin_access_control" "ui_bucket" {
  name                              = "${var.name_prefix}-ui-bucket-${terraform.workspace}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "this" {
  comment             = "CDN for ${var.name_prefix}-${terraform.workspace}"
  enabled             = true
  is_ipv6_enabled     = true
  price_class         = "PriceClass_100"
  default_root_object = "index.html"
  http_version        = "http2and3"
  aliases             = var.custom_domain_config != null ? [var.custom_domain_config.domain_name] : []

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.custom_domain_config != null ? [1] : []
    content {
      acm_certificate_arn      = var.custom_domain_config.certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }

  }

  dynamic "viewer_certificate" {
    for_each = var.custom_domain_config == null ? [1] : []
    content {
      cloudfront_default_certificate = true
    }
  }

  origin {
    domain_name = "${aws_apigatewayv2_api.this.id}.execute-api.${var.aws_region}.amazonaws.com"
    origin_id   = aws_apigatewayv2_api.this.id
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin {
    domain_name              = module.ui_bucket.s3_bucket_bucket_regional_domain_name
    origin_id                = module.ui_bucket.s3_bucket_id
    origin_access_control_id = aws_cloudfront_origin_access_control.ui_bucket.id
  }

  origin {
    domain_name = "${aws_apigatewayv2_api.this.id}.execute-api.${var.aws_region}.amazonaws.com"
    origin_id   = "${aws_apigatewayv2_api.this.id}-frontend"
    origin_path = "/${local.frontend_failover_sub_path}"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin_group {
    origin_id = "frontend-with-failover"

    failover_criteria {
      status_codes = [403]
    }

    member {
      origin_id = module.ui_bucket.s3_bucket_id
    }
    member {
      origin_id = "${aws_apigatewayv2_api.this.id}-frontend"
    }
  }

  ordered_cache_behavior {
    path_pattern               = "/api/*"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    target_origin_id           = aws_apigatewayv2_api.this.id
    viewer_protocol_policy     = "https-only"
    cache_policy_id            = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.managed_all_viewer_except_host_header.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.cors_policy.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    target_origin_id       = "frontend-with-failover"
    viewer_protocol_policy = "redirect-to-https"
    cache_policy_id        = data.aws_cloudfront_cache_policy.managed_caching_optimized.id
    compress               = true
  }
}
