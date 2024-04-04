data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

resource "aws_cloudfront_distribution" "this" {
  comment             = "CDN for ${data.terraform_remote_state.prerequisite.outputs.name_prefix}"
  enabled             = true
  is_ipv6_enabled     = true
  price_class         = "PriceClass_100"
  default_root_object = "/"

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  origin {
    domain_name = replace(data.aws_apigatewayv2_api.authorizer.api_endpoint, "https://", "")
    origin_id   = data.aws_apigatewayv2_api.authorizer.id
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    target_origin_id       = data.aws_apigatewayv2_api.authorizer.id
    viewer_protocol_policy = "https-only"

    cache_policy_id = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  ordered_cache_behavior {
    path_pattern           = "/auth/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    target_origin_id       = data.aws_apigatewayv2_api.authorizer.id
    viewer_protocol_policy = "https-only"

    cache_policy_id = data.aws_cloudfront_cache_policy.caching_disabled.id
  }
}
