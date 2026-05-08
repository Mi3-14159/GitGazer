# Plan: Make RDS Proxy Optional

## Overview

The RDS Proxy is currently always created. This plan makes it conditional via a new `enable_rds_proxy` variable, allowing environments (e.g. dev) to connect Lambdas directly to Aurora and save cost.

---

## Files to Update

### 1. `infra/variables.tf`

- Add new variable:

    ```hcl
      variable "enable_rds_proxy" {
        type        = bool
        description = "Whether to create an RDS Proxy for connection pooling between Lambda and Aurora"
        default     = true
      }
    ```

---

### 2. `infra/rds.tf`

| Resource / Block                               | Change                                                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module "rds_proxy"`                           | Wrap with `count = var.enable_rds_proxy ? 1 : 0`                                                                                                    |
| `aws_security_group.rds_proxy`                 | Wrap with `count = var.enable_rds_proxy ? 1 : 0`                                                                                                    |
| `aws_security_group_rule.rds_proxy_to_aurora`  | Wrap with `count = var.enable_rds_proxy ? 1 : 0`                                                                                                    |
| `aws_security_group_rule.lambda_to_rds_proxy`  | Wrap with `count = var.enable_rds_proxy ? 1 : 0`                                                                                                    |
| `module "db"` → `security_group_ingress_rules` | Make the `rds_proxy` ingress rule conditional. When proxy is disabled, add a `lambda_direct` rule allowing `aws_security_group.lambda.id` directly. |

---

### 3. `infra/main.tf` (locals)

- `rds_proxy_resource_id` local — make conditional:

    ```hcl
    rds_proxy_resource_id = var.enable_rds_proxy ? element(split(":", module.rds_proxy[0].proxy_arn), 6) : null
    ```

---

### 4. `infra/api_rest_lambda.tf`| Change |

| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| IAM policy `rds-db:connect` statement (line ~154) | Wrap with `dynamic "statement"` or make conditional — only include when `var.enable_rds_proxy` is true |
| Environment variable `RDS_HOST` (line ~205) | Use conditional: `module.rds_proxy[0].proxy_endpoint` when enabled, otherwise `module.db.cluster_endpoint` |

---

### 5. `infra/api_websocket_lambda.tf`

| Location                                          | Change                                                 |
| ------------------------------------------------- | ------------------------------------------------------ |
| IAM policy `rds-db:connect` statement (line ~100) | Same as REST lambda — conditional                      |
| Environment variable `RDS_HOST` (line ~137)       | Conditional: proxy endpoint or Aurora cluster endpoint |

---

### 6. `infra/worker_lambda.tf`

| Location                                          | Change                                                 |
| ------------------------------------------------- | ------------------------------------------------------ |
| IAM policy `rds-db:connect` statement (line ~114) | Same pattern — conditional                             |
| Environment variable `RDS_HOST` (line ~152)       | Conditional: proxy endpoint or Aurora cluster endpoint |

---

### 7. `infra/org_sync_scheduler.tf`

| Location                                               | Change                                                 |
| ------------------------------------------------------ | ------------------------------------------------------ |
| IAM policy `rds-db:connect` statement (line ~79)       | Same pattern — conditional                             |
| Environment variable `RDS_HOST` (line ~115) ---------- | ------------------------------------------------------ |
| IAM policy `rds-db:connect` statement (line ~79)       | Same pattern — conditional                             |
| Environment variable `RDS_HOST` (line ~115)            | Conditional: proxy endpoint or Aurora cluster endpoint |

---

### 8. `infra/bastion.tf`

- `aws_security_group_rule.bastion_to_rds_proxy` (line ~86):
    - Change count to `var.enable_bastion && var.enable_rds_proxy ? 1 : 0`
    - When proxy is disabled but bastion is enabled, add a new rule allowing bastion → Aurora directly (`module.db.security_group_id`)

---

## Strategy for Lambda Environment Variables

When the proxy is disabled, Lambdas need a **direct connection string** to Aurora. Two options:

**Option A (recommended):** Rename the env var to something generic like `RDS_HOST` and set it conditionally:

```hcl
RDS_HOST = var.enable_rds_proxy ? module.rds_proxy[0].proxy_endpoint : module.db.cluster_endpoint
```

This requires a small change in the application code to read `RDS_HOST` instead of `RDS_PROXY_ENDPOINT`.

**Option B:** Keep `RDS_PROXY_ENDPOINT` name (misleading when proxy is off) and conditionally assign Aurora endpoint:

```hcl
RDS_PROXY_ENDPOINT = var.enable_rds_proxy ? module.rds_proxy[0].proxy_endpoint : module.db.cluster_endpoint
```

No application code changes needed.

---

## Strategy for IAM Auth

When the proxy is enabled, Lambdas use **IAM authentication** via `rds-db:connect` to the proxy. When disabled:

- If connecting directly with IAM auth to Aurora: keep the `rds-db:connect` permission but target the Aurora cluster resource ID instead.
- If connecting with password auth (via Secrets Manager): remove the `rds-db:connect` statement entirely and grant `secretsmanager:GetSecretValue` on the master user secret.

**Recommendation:** Use IAM auth for direct connections too (Aurora supports it). Change the resource ARN to reference the cluster resource ID:

```hcl
"arn:aws:rds-db:${var.aws_region}:${data.aws_caller_identity.current.account_id}:dbuser:${local.db_resource_id}/*"
```

f connecting directly with IAM auth to Aurora: keep the `rds-db:connect` permission but target the Aurora cluster resource ID instead.

- If connecting with password auth (via Secrets Manager): remove the `rds-db:connect` statement entirely and grant `secretsmanager:GetSecretValue` on the master user secret.

**Recommendation:** Use IAM auth for direct connections too (Aurora supports it). Change the resource ARN to reference the cluster resource ID:

```hcl
"arn:aws:rds-db:${var.aws_region}:${data.aws_caller_identity.current.account_id}:dbuser:${local.db_resource_id}/*"
```

Where `db_resource_id` resolves to either the proxy or cluster resource ID.

---

## New Local Values Needed

```hcl
locals {
  # Endpoint Lambdas connect to (proxy or direct Aurora)
  database_endpoint = var.enable_rds_proxy ? module.rds_proxy[0].proxy_endpoint : module.db.cluster_endpoint

  # Resource ID for IAM auth (proxy or cluster)
  db_resource_id = var.enable_rds_proxy ? element(split(":", module.rds_proxy[0].proxy_arn), 6) : module.db.cluster_resource_id
}
```

---

## Testing Checklist

- [ ] `terraform plan` with `enable_rds_proxy = true` — no changes (backward-compatible)
- [ ] `terraform plan` with `enable_rds_proxy = false` — proxy resources removed, Lambda env vars point to Aurora
- [ ] Verify Lambda can connect to Aurora directly (IAM auth or password)
- [ ] Verify bastion connectivity works in both modes
- [ ] Validate security group rules allow correct traffic paths in both modes
