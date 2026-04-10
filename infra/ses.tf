resource "aws_ses_domain_identity" "this" {
  count  = var.ses_config.enabled ? 1 : 0
  domain = local.ses_domain
}

resource "aws_route53_record" "ses_verification" {
  count   = var.ses_config.enabled && var.custom_domain_config != null ? 1 : 0
  zone_id = var.custom_domain_config.hosted_zone_id
  name    = "_amazonses.${local.ses_domain}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.this[0].verification_token]
}

resource "aws_ses_domain_identity_verification" "this" {
  count  = var.ses_config.enabled && var.custom_domain_config != null ? 1 : 0
  domain = aws_ses_domain_identity.this[0].id

  depends_on = [aws_route53_record.ses_verification]
}

# ── DKIM ─────────────────────────────────────────────────────

resource "aws_ses_domain_dkim" "this" {
  count  = var.ses_config.enabled ? 1 : 0
  domain = aws_ses_domain_identity.this[0].domain
}

resource "aws_route53_record" "ses_dkim" {
  count   = var.ses_config.enabled && var.custom_domain_config != null ? 3 : 0
  zone_id = var.custom_domain_config.hosted_zone_id
  name    = "${aws_ses_domain_dkim.this[0].dkim_tokens[count.index]}._domainkey.${local.ses_domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.this[0].dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# ── MAIL FROM domain (for SPF / bounce handling) ─────────────

resource "aws_ses_domain_mail_from" "this" {
  count                  = var.ses_config.enabled ? 1 : 0
  domain                 = aws_ses_domain_identity.this[0].domain
  mail_from_domain       = "mail.${local.ses_domain}"
  behavior_on_mx_failure = "UseDefaultValue"
}

resource "aws_route53_record" "ses_mail_from_mx" {
  count   = var.ses_config.enabled && var.custom_domain_config != null ? 1 : 0
  zone_id = var.custom_domain_config.hosted_zone_id
  name    = "mail.${local.ses_domain}"
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

resource "aws_route53_record" "ses_mail_from_spf" {
  count   = var.ses_config.enabled && var.custom_domain_config != null ? 1 : 0
  zone_id = var.custom_domain_config.hosted_zone_id
  name    = "mail.${local.ses_domain}"
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

# ── DMARC ────────────────────────────────────────────────────

resource "aws_route53_record" "ses_dmarc" {
  count   = var.ses_config.enabled && var.custom_domain_config != null ? 1 : 0
  zone_id = var.custom_domain_config.hosted_zone_id
  name    = "_dmarc.${local.ses_domain}"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=quarantine; rua=mailto:dmarc@${local.ses_domain}"]
}

# ── Configuration set (tracking & reputation) ────────────────

resource "aws_ses_configuration_set" "this" {
  count = var.ses_config.enabled ? 1 : 0
  name  = "${var.name_prefix}-${terraform.workspace}"

  delivery_options {
    tls_policy = "Require"
  }
}
