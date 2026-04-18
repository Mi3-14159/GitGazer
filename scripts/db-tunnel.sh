#!/usr/bin/env bash
#
# db-tunnel.sh — Start an SSM port-forwarding session to the Aurora RDS Proxy
#                through the bastion host, so you can connect to the database
#                locally on localhost:5432.
#
# Prerequisites:
#   - AWS CLI v2 installed and configured
#   - Session Manager plugin installed
#     (https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)
#   - Sufficient IAM permissions for ssm:StartSession and ec2:DescribeInstances
#
# Usage:
#   pnpm run db:tunnel
#   # or directly:
#   ./scripts/db-tunnel.sh [--local-port 5432] [--workspace prod]
#
# Environment variables (optional):
#   AWS_PROFILE   — AWS CLI profile to use
#   AWS_REGION    — Override the default region (default: eu-central-1)

set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✔${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✘${NC}  $*" >&2; }

# ─── Defaults ─────────────────────────────────────────────────────────────────
NAME_PREFIX="gitgazer"
REGION="${AWS_REGION:-eu-central-1}"
LOCAL_PORT="5432"
TF_WORKSPACE="prod"
REMOTE_PORT="5432"

# ─── Parse arguments ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --local-port)
            LOCAL_PORT="$2"
            shift 2
            ;;
        --workspace)
            TF_WORKSPACE="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--local-port PORT] [--workspace WORKSPACE] [--region REGION]"
            echo ""
            echo "Options:"
            echo "  --local-port PORT       Local port to bind (default: 5432)"
            echo "  --workspace WORKSPACE   Terraform workspace name (default: prod)"
            echo "  --region REGION         AWS region (default: eu-central-1)"
            echo ""
            echo "Environment variables:"
            echo "  AWS_PROFILE    AWS CLI profile to use"
            echo "  AWS_REGION     Override the default region"
            exit 0
            ;;
        *)
            error "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# ─── Dependency check ─────────────────────────────────────────────────────────
check_dependencies() {
    local missing=()
    for cmd in aws session-manager-plugin; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        error "Missing required tools: ${missing[*]}"
        if [[ " ${missing[*]} " == *" session-manager-plugin "* ]]; then
            echo "  Install the Session Manager plugin:"
            echo "  https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html"
        fi
        exit 1
    fi
}

check_dependencies

# ─── Resolve bastion instance ID ──────────────────────────────────────────────
BASTION_NAME="${NAME_PREFIX}-bastion-${TF_WORKSPACE}"

info "Looking up bastion instance ${BOLD}${BASTION_NAME}${NC} in ${BOLD}${REGION}${NC}..."

INSTANCE_ID=$(aws ec2 describe-instances \
    --region "$REGION" \
    --filters \
        "Name=tag:Name,Values=${BASTION_NAME}" \
        "Name=instance-state-name,Values=running" \
    --query "Reservations[0].Instances[0].InstanceId" \
    --output text 2>/dev/null)

if [[ -z "$INSTANCE_ID" || "$INSTANCE_ID" == "None" ]]; then
    error "No running bastion instance found with Name tag: ${BASTION_NAME}"
    echo "  Make sure the bastion is enabled (enable_bastion = true) and running."
    exit 1
fi

success "Found bastion: ${BOLD}${INSTANCE_ID}${NC}"

# ─── Resolve RDS Proxy endpoint ──────────────────────────────────────────────
PROXY_NAME="${NAME_PREFIX}-${TF_WORKSPACE}"

info "Looking up RDS Proxy endpoint ${BOLD}${PROXY_NAME}${NC}..."

PROXY_ENDPOINT=$(aws rds describe-db-proxies \
    --region "$REGION" \
    --db-proxy-name "$PROXY_NAME" \
    --query "DBProxies[0].Endpoint" \
    --output text 2>/dev/null)

if [[ -z "$PROXY_ENDPOINT" || "$PROXY_ENDPOINT" == "None" ]]; then
    error "No RDS Proxy found with name: ${PROXY_NAME}"
    exit 1
fi

success "Found RDS Proxy: ${BOLD}${PROXY_ENDPOINT}${NC}"

# ─── Start SSM port-forwarding session ────────────────────────────────────────
echo ""
info "Starting SSM port-forwarding session..."
echo -e "  ${CYAN}Local${NC}:  localhost:${BOLD}${LOCAL_PORT}${NC}"
echo -e "  ${CYAN}Remote${NC}: ${PROXY_ENDPOINT}:${BOLD}${REMOTE_PORT}${NC}"
echo -e "  ${CYAN}Via${NC}:    ${INSTANCE_ID}"
echo ""
success "Connect with: ${BOLD}psql -h localhost -p ${LOCAL_PORT} -U root${NC}"
echo -e "  ${YELLOW}Press Ctrl+C to close the tunnel${NC}"
echo ""

exec aws ssm start-session \
    --region "$REGION" \
    --target "$INSTANCE_ID" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters "{\"host\":[\"${PROXY_ENDPOINT}\"],\"portNumber\":[\"${REMOTE_PORT}\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}"
