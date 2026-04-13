resource "aws_route53_record" "cf_a" {
  count   = var.custom_domain_config != null ? 1 : 0
  zone_id = var.custom_domain_config.hosted_zone_id
  name    = var.custom_domain_config.domain_name
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.this.domain_name
    zone_id                = aws_cloudfront_distribution.this.hosted_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "cf_aaaa" {
  count   = var.custom_domain_config != null ? 1 : 0
  zone_id = var.custom_domain_config.hosted_zone_id
  name    = var.custom_domain_config.domain_name
  type    = "AAAA"
  alias {
    name                   = aws_cloudfront_distribution.this.domain_name
    zone_id                = aws_cloudfront_distribution.this.hosted_zone_id
    evaluate_target_health = true
  }
}

# --- Docs site DNS records ---

resource "aws_route53_record" "docs_a" {
  count   = var.docs_config.enabled && var.docs_config.domain_name != null ? 1 : 0
  zone_id = coalesce(var.docs_config.hosted_zone_id, try(var.custom_domain_config.hosted_zone_id, null))
  name    = var.docs_config.domain_name
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.docs[0].domain_name
    zone_id                = aws_cloudfront_distribution.docs[0].hosted_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "docs_aaaa" {
  count   = var.docs_config.enabled && var.docs_config.domain_name != null ? 1 : 0
  zone_id = coalesce(var.docs_config.hosted_zone_id, try(var.custom_domain_config.hosted_zone_id, null))
  name    = var.docs_config.domain_name
  type    = "AAAA"
  alias {
    name                   = aws_cloudfront_distribution.docs[0].domain_name
    zone_id                = aws_cloudfront_distribution.docs[0].hosted_zone_id
    evaluate_target_health = true
  }
}
