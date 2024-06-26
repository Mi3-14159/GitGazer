data "aws_cloudfront_cache_policy" "managed_caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "managed_caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "managed_all_viewer_except_host_header" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_origin_access_control" "ui_bucket" {
  count                             = var.with_frontend_stack ? 1 : 0
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
    domain_name = "${aws_api_gateway_rest_api.this.id}.execute-api.${var.aws_region}.amazonaws.com"
    origin_id   = aws_api_gateway_rest_api.this.id
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  dynamic "origin" {
    for_each = var.with_frontend_stack ? [1] : []
    content {
      domain_name = "${aws_api_gateway_rest_api.this.id}.execute-api.${var.aws_region}.amazonaws.com"
      origin_id   = "${aws_api_gateway_rest_api.this.id}-frontend"
      origin_path = "/${local.api_gateway_stage_name}/${local.frontend_failover_sub_path}"
      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  dynamic "origin" {
    for_each = var.with_frontend_stack ? [1] : []
    content {
      domain_name              = module.ui_bucket.s3_bucket_bucket_regional_domain_name
      origin_id                = module.ui_bucket.s3_bucket_id
      origin_access_control_id = aws_cloudfront_origin_access_control.ui_bucket[0].id
    }
  }

  origin_group {
    origin_id = "frontend-with-failover"

    failover_criteria {
      status_codes = [403]
    }

    dynamic "member" {
      for_each = var.with_frontend_stack ? [module.ui_bucket.s3_bucket_id, "${aws_api_gateway_rest_api.this.id}-frontend"] : []
      content {
        origin_id = member.value
      }
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = var.with_frontend_stack ? [1] : []
    content {
      path_pattern             = "/${local.api_gateway_stage_name}/api/*"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD", "OPTIONS"]
      target_origin_id         = aws_api_gateway_rest_api.this.id
      viewer_protocol_policy   = "https-only"
      cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
      origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer_except_host_header.id
    }
  }

  dynamic "default_cache_behavior" {
    for_each = var.with_frontend_stack ? [1] : []
    content {
      allowed_methods        = ["GET", "HEAD", "OPTIONS"]
      cached_methods         = ["GET", "HEAD", "OPTIONS"]
      target_origin_id       = "frontend-with-failover"
      viewer_protocol_policy = "redirect-to-https"
      cache_policy_id        = data.aws_cloudfront_cache_policy.managed_caching_optimized.id
      compress               = true
    }
  }

  dynamic "default_cache_behavior" {
    for_each = var.with_frontend_stack ? [] : [1]
    content {
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD", "OPTIONS"]
      target_origin_id         = aws_apigatewayv2_api.this.id
      viewer_protocol_policy   = "https-only"
      cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
      origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer_except_host_header.id
    }
  }
}
