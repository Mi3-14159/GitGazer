resource "aws_cloudfront_origin_access_control" "docs_bucket" {
  count                             = var.docs_config.enabled ? 1 : 0
  name                              = "${var.name_prefix}-docs-bucket-${terraform.workspace}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "docs_url_rewrite" {
  count   = var.docs_config.enabled ? 1 : 0
  name    = "${var.name_prefix}-docs-url-rewrite-${terraform.workspace}"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOF
    function handler(event) {
      var request = event.request;
      var uri = request.uri;

      if (uri.endsWith('/')) {
        request.uri += 'index.html';
      } else if (!uri.includes('.')) {
        request.uri += '/index.html';
      }

      return request;
    }
  EOF
}

resource "aws_cloudfront_response_headers_policy" "docs_security_headers" {
  count = var.docs_config.enabled ? 1 : 0
  name  = "${var.name_prefix}-docs-security-headers-${terraform.workspace}"

  security_headers_config {
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    content_security_policy {
      content_security_policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; frame-ancestors 'none';"
      override                = true
    }
  }
}

resource "aws_cloudfront_distribution" "docs" {
  count               = var.docs_config.enabled ? 1 : 0
  comment             = "Docs CDN for ${var.name_prefix}-${terraform.workspace}"
  enabled             = true
  is_ipv6_enabled     = true
  price_class         = "PriceClass_100"
  default_root_object = "index.html"
  http_version        = "http2and3"
  aliases             = var.docs_config.domain_name != null ? [var.docs_config.domain_name] : []

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.docs_config.certificate_arn != null ? [1] : []
    content {
      acm_certificate_arn      = var.docs_config.certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.docs_config.certificate_arn == null ? [1] : []
    content {
      cloudfront_default_certificate = true
    }
  }

  origin {
    domain_name              = module.docs_bucket.s3_bucket_bucket_regional_domain_name
    origin_id                = module.docs_bucket.s3_bucket_id
    origin_access_control_id = aws_cloudfront_origin_access_control.docs_bucket[0].id
  }

  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    target_origin_id           = module.docs_bucket.s3_bucket_id
    viewer_protocol_policy     = "redirect-to-https"
    cache_policy_id            = data.aws_cloudfront_cache_policy.managed_caching_optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.docs_security_headers[0].id
    compress                   = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.docs_url_rewrite[0].arn
    }
  }

  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }
}
