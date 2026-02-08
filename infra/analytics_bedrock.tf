resource "aws_bedrock_guardrail" "query_generation" {
  name                      = "${var.name_prefix}-query-generation-${terraform.workspace}"
  description               = "Guardrail for query generation in analytics"
  blocked_input_messaging   = "Sorry, the model cannot process this input."
  blocked_outputs_messaging = "Sorry, the model cannot answer this question."

  content_policy_config {
    tier_config = [
      {
        tier_name = "STANDARD"
      },
    ]

    filters_config {
      input_action    = "BLOCK"
      input_strength  = "HIGH"
      output_action   = "BLOCK"
      output_strength = "HIGH"
      type            = "HATE"
    }
    filters_config {
      input_action    = "BLOCK"
      input_strength  = "HIGH"
      output_action   = "BLOCK"
      output_strength = "HIGH"
      type            = "INSULTS"
    }
    filters_config {
      input_action    = "BLOCK"
      input_strength  = "HIGH"
      output_action   = "BLOCK"
      output_strength = "HIGH"
      type            = "MISCONDUCT"
    }
    filters_config {
      input_action    = "BLOCK"
      input_strength  = "HIGH"
      output_action   = "BLOCK"
      output_strength = "HIGH"
      type            = "SEXUAL"
    }
    filters_config {
      input_action    = "BLOCK"
      input_strength  = "HIGH"
      output_action   = "BLOCK"
      output_strength = "HIGH"
      type            = "VIOLENCE"
    }
    filters_config {
      input_action    = "BLOCK"
      input_strength  = "HIGH"
      output_strength = "NONE"
      type            = "PROMPT_ATTACK"
    }
  }

  contextual_grounding_policy_config {
    filters_config {
      threshold = 0.7
      type      = "GROUNDING"
    }
    filters_config {
      threshold = 0.7
      type      = "RELEVANCE"
    }
  }

  cross_region_config {
    guardrail_profile_identifier = "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:guardrail-profile/eu.guardrail.v1:0"
  }
}

resource "awscc_bedrock_prompt" "query_generation" {
  name        = "${var.name_prefix}-query-generation-${terraform.workspace}"
  description = "Prompt for query generation in analytics"
  tags        = local.default_tags
}
