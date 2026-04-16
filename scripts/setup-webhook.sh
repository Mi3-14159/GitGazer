#!/usr/bin/env bash
#
# setup-webhook.sh — Set up GitHub webhooks for GitGazer on repositories,
#                    organizations, or all repos matching GitHub topics.
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated, OR a GitHub personal access token
#   - The GitGazer Webhook Payload URL and Secret from the Integrations page
#
# Targets:
#   - Single repository
#   - Organization (org-level webhook)
#   - Multiple repositories (manual list)
#   - By topic (all repos under an owner/org matching one or more GitHub topics)
#
# Usage:
#   ./scripts/setup-webhook.sh
#
# Environment variables (optional, to skip interactive prompts):
#   GITHUB_TOKEN          — Personal access token (skips gh CLI)
#   GITGAZER_WEBHOOK_URL  — Full webhook payload URL (e.g. https://app.gitgazer.com/api/import/<id>)
#   GITGAZER_WEBHOOK_SECRET — Webhook secret from GitGazer

set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✔${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✘${NC}  $*" >&2; }

# ─── Dependency check ─────────────────────────────────────────────────────────
check_dependencies() {
    local missing=()
    for cmd in curl jq; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        error "Missing required tools: ${missing[*]}"
        echo "  Install them and try again."
        exit 1
    fi
}

# ─── GitHub auth ──────────────────────────────────────────────────────────────
resolve_github_token() {
    if [[ -n "${GITHUB_TOKEN:-}" ]]; then
        GH_TOKEN="$GITHUB_TOKEN"
        info "Using GITHUB_TOKEN from environment."
        return
    fi

    if command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
        GH_TOKEN=$(gh auth token 2>/dev/null)
        info "Using token from GitHub CLI."
        return
    fi

    echo ""
    warn "No GitHub token found. You can either:"
    echo "  1) Set GITHUB_TOKEN env variable"
    echo "  2) Install and authenticate the GitHub CLI (gh auth login)"
    echo ""
    read -rsp "${BOLD}Enter GitHub Personal Access Token: ${NC}" GH_TOKEN
    echo ""

    if [[ -z "$GH_TOKEN" ]]; then
        error "A GitHub token is required."
        exit 1
    fi
}

# ─── GitHub API helpers ───────────────────────────────────────────────────────
gh_api() {
    local method="$1" endpoint="$2"
    shift 2
    curl -sf -X "$method" \
        -H "Authorization: token ${GH_TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "$@" \
        "https://api.github.com${endpoint}"
}

# ─── Collect GitGazer config ─────────────────────────────────────────────────
collect_webhook_config() {
    if [[ -n "${GITGAZER_WEBHOOK_URL:-}" ]]; then
        WEBHOOK_URL="$GITGAZER_WEBHOOK_URL"
    else
        echo ""
        echo -e "${BOLD}GitGazer Webhook Configuration${NC}"
        echo "  Copy these from your GitGazer Integrations page."
        echo ""
        read -rp "  Webhook Payload URL: " WEBHOOK_URL
    fi

    if [[ -z "$WEBHOOK_URL" ]]; then
        error "Webhook URL is required."
        exit 1
    fi

    if [[ -n "${GITGAZER_WEBHOOK_SECRET:-}" ]]; then
        WEBHOOK_SECRET="$GITGAZER_WEBHOOK_SECRET"
    else
        read -rsp "  Webhook Secret: " WEBHOOK_SECRET
        echo ""
    fi

    if [[ -z "$WEBHOOK_SECRET" ]]; then
        error "Webhook secret is required."
        exit 1
    fi
}

# ─── Event selection ──────────────────────────────────────────────────────────
AVAILABLE_EVENTS=("workflow_run" "workflow_job" "pull_request" "pull_request_review")

select_events() {
    echo ""
    echo -e "${BOLD}Select webhook events to subscribe to:${NC}"
    echo ""
    echo "  1) workflow_run + workflow_job           (recommended — CI/CD monitoring)"
    echo "  2) All supported events                  (CI/CD + pull request tracking)"
    echo "  3) Custom selection"
    echo ""
    read -rp "  Choice [1]: " event_choice
    event_choice="${event_choice:-1}"

    case "$event_choice" in
        1)
            SELECTED_EVENTS=("workflow_run" "workflow_job")
            ;;
        2)
            SELECTED_EVENTS=("${AVAILABLE_EVENTS[@]}")
            ;;
        3)
            SELECTED_EVENTS=()
            for evt in "${AVAILABLE_EVENTS[@]}"; do
                read -rp "  Include ${evt}? [y/N]: " yn
                if [[ "$yn" =~ ^[Yy] ]]; then
                    SELECTED_EVENTS+=("$evt")
                fi
            done
            if [[ ${#SELECTED_EVENTS[@]} -eq 0 ]]; then
                error "At least one event must be selected."
                exit 1
            fi
            ;;
        *)
            error "Invalid choice."
            exit 1
            ;;
    esac

    info "Events: ${SELECTED_EVENTS[*]}"
}

# ─── Target selection ─────────────────────────────────────────────────────────
select_target_type() {
    echo ""
    echo -e "${BOLD}Where do you want to create the webhook?${NC}"
    echo ""
    echo "  1) Repository    — monitor a single repository"
    echo "  2) Organization  — monitor all repositories in an org"
    echo "  3) Multiple repos — set up webhooks on several repos at once"
    echo "  4) By topic      — all repos matching GitHub topics (in an owner/org)"
    echo ""
    read -rp "  Choice [1]: " target_choice
    TARGET_TYPE="${target_choice:-1}"
}

# ─── Search repos by topic ────────────────────────────────────────────────────
search_repos_by_topic() {
    local owner="$1"
    shift
    local topics=("$@")
    local page=1 per_page=100
    local all_repos=()

    # Build query: topic:a+topic:b+org:owner
    local topic_query=""
    for t in "${topics[@]}"; do
        topic_query+="topic:${t}+"
    done

    local topics_display
    topics_display=$(printf "'%s' " "${topics[@]}")
    info "Searching for repos in ${owner} with topics ${topics_display}..."

    while true; do
        local response
        if ! response=$(gh_api GET "/search/repositories?q=${topic_query}org:${owner}&per_page=${per_page}&page=${page}" 2>&1); then
            # Fallback: maybe it's a user, not an org
            if ! response=$(gh_api GET "/search/repositories?q=${topic_query}user:${owner}&per_page=${per_page}&page=${page}" 2>&1); then
                error "Failed to search repositories."
                return 1
            fi
        fi

        local names
        names=$(echo "$response" | jq -r '.items[].full_name' 2>/dev/null)
        if [[ -z "$names" ]]; then
            break
        fi

        while IFS= read -r name; do
            all_repos+=("$name")
        done <<< "$names"

        local total
        total=$(echo "$response" | jq -r '.total_count')
        if (( page * per_page >= total )); then
            break
        fi
        ((page++))
    done

    if [[ ${#all_repos[@]} -eq 0 ]]; then
        warn "No repositories found matching topics ${topics_display}under ${owner}."
        return 1
    fi

    TOPIC_REPOS=("${all_repos[@]}")
    return 0
}

# ─── Create repo webhook ─────────────────────────────────────────────────────
create_repo_webhook() {
    local owner="$1" repo="$2"
    local events_json
    events_json=$(printf '%s\n' "${SELECTED_EVENTS[@]}" | jq -R . | jq -sc .)

    local payload
    payload=$(jq -n \
        --arg url "$WEBHOOK_URL" \
        --arg secret "$WEBHOOK_SECRET" \
        --argjson events "$events_json" \
        '{
            name: "web",
            active: true,
            events: $events,
            config: {
                url: $url,
                content_type: "json",
                secret: $secret,
                insecure_ssl: "0"
            }
        }')

    local response
    if response=$(gh_api POST "/repos/${owner}/${repo}/hooks" -d "$payload" 2>&1); then
        local hook_id
        hook_id=$(echo "$response" | jq -r '.id')
        success "${owner}/${repo} — webhook created (id: ${hook_id})"
        return 0
    else
        local err_msg
        err_msg=$(echo "$response" | jq -r '.message // .errors[0].message // "Unknown error"' 2>/dev/null || echo "$response")
        if echo "$err_msg" | grep -qi "hook already exists"; then
            warn "${owner}/${repo} — webhook already exists, skipping."
            return 0
        fi
        error "${owner}/${repo} — failed: ${err_msg}"
        return 1
    fi
}

# ─── Create org webhook ──────────────────────────────────────────────────────
create_org_webhook() {
    local org="$1"
    local events_json
    events_json=$(printf '%s\n' "${SELECTED_EVENTS[@]}" | jq -R . | jq -sc .)

    local payload
    payload=$(jq -n \
        --arg url "$WEBHOOK_URL" \
        --arg secret "$WEBHOOK_SECRET" \
        --argjson events "$events_json" \
        '{
            name: "web",
            active: true,
            events: $events,
            config: {
                url: $url,
                content_type: "json",
                secret: $secret,
                insecure_ssl: "0"
            }
        }')

    local response
    if response=$(gh_api POST "/orgs/${org}/hooks" -d "$payload" 2>&1); then
        local hook_id
        hook_id=$(echo "$response" | jq -r '.id')
        success "${org} (org) — webhook created (id: ${hook_id})"
    else
        local err_msg
        err_msg=$(echo "$response" | jq -r '.message // .errors[0].message // "Unknown error"' 2>/dev/null || echo "$response")
        error "${org} (org) — failed: ${err_msg}"
        return 1
    fi
}

# ─── List existing webhooks ──────────────────────────────────────────────────
list_webhooks() {
    local target_type="$1" target="$2"
    local endpoint

    if [[ "$target_type" == "repo" ]]; then
        endpoint="/repos/${target}/hooks"
    else
        endpoint="/orgs/${target}/hooks"
    fi

    local response
    if response=$(gh_api GET "$endpoint" 2>&1); then
        local count
        count=$(echo "$response" | jq 'length')
        if [[ "$count" -eq 0 ]]; then
            info "No webhooks found on ${target}."
        else
            echo ""
            echo -e "${BOLD}Existing webhooks on ${target}:${NC}"
            echo "$response" | jq -r '.[] | "  id: \(.id)  active: \(.active)  url: \(.config.url)  events: \(.events | join(", "))"'
        fi
    fi
}

# ─── Interactive flows ────────────────────────────────────────────────────────
flow_single_repo() {
    echo ""
    read -rp "  Repository (owner/repo): " repo_full

    if [[ ! "$repo_full" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]]; then
        error "Invalid format. Use owner/repo (e.g. my-org/my-repo)."
        exit 1
    fi

    local owner="${repo_full%%/*}"
    local repo="${repo_full##*/}"

    list_webhooks "repo" "$repo_full"
    echo ""
    create_repo_webhook "$owner" "$repo"
}

flow_organization() {
    echo ""
    read -rp "  Organization name: " org_name

    if [[ -z "$org_name" ]]; then
        error "Organization name is required."
        exit 1
    fi

    list_webhooks "org" "$org_name"
    echo ""
    create_org_webhook "$org_name"
}

flow_multiple_repos() {
    echo ""
    echo "  Enter repositories one per line (owner/repo). Empty line to finish:"
    local repos=()
    while true; do
        read -rp "  > " repo_full
        [[ -z "$repo_full" ]] && break
        if [[ ! "$repo_full" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]]; then
            warn "Skipping invalid format: ${repo_full}"
            continue
        fi
        repos+=("$repo_full")
    done

    if [[ ${#repos[@]} -eq 0 ]]; then
        error "No repositories provided."
        exit 1
    fi

    echo ""
    info "Setting up webhooks on ${#repos[@]} repositories..."
    echo ""

    local succeeded=0 failed=0
    for repo_full in "${repos[@]}"; do
        local owner="${repo_full%%/*}"
        local repo="${repo_full##*/}"
        if create_repo_webhook "$owner" "$repo"; then
            ((succeeded++))
        else
            ((failed++))
        fi
    done

    echo ""
    echo -e "${BOLD}Summary:${NC} ${GREEN}${succeeded} succeeded${NC}, ${RED}${failed} failed${NC}"
}

flow_by_topic() {
    echo ""
    read -rp "  Owner or organization: " owner

    if [[ -z "$owner" ]]; then
        error "Owner/organization is required."
        exit 1
    fi

    echo ""
    echo "  Enter topics (comma or space separated). Repos must match ALL topics."
    read -rp "  GitHub topics: " topics_input

    if [[ -z "$topics_input" ]]; then
        error "At least one topic is required."
        exit 1
    fi

    # Normalize: replace commas with spaces, collapse whitespace, trim
    local normalized
    normalized=$(echo "$topics_input" | tr ',' ' ' | tr -s ' ' | sed 's/^ *//;s/ *$//')

    local topics=()
    read -ra topics <<< "$normalized"

    if [[ ${#topics[@]} -eq 0 ]]; then
        error "At least one topic is required."
        exit 1
    fi

    if ! search_repos_by_topic "$owner" "${topics[@]}"; then
        exit 1
    fi

    local topics_display
    topics_display=$(printf "'%s' " "${topics[@]}")

    echo ""
    info "Found ${#TOPIC_REPOS[@]} repositories matching topics ${topics_display}:"
    for r in "${TOPIC_REPOS[@]}"; do
        echo "    ${r}"
    done

    echo ""
    read -rp "  Proceed with all ${#TOPIC_REPOS[@]} repos? [Y/n]: " confirm
    if [[ "$confirm" =~ ^[Nn] ]]; then
        info "Aborted."
        exit 0
    fi

    echo ""
    local succeeded=0 failed=0
    for repo_full in "${TOPIC_REPOS[@]}"; do
        local repo_owner="${repo_full%%/*}"
        local repo_name="${repo_full##*/}"
        if create_repo_webhook "$repo_owner" "$repo_name"; then
            ((succeeded++))
        else
            ((failed++))
        fi
    done

    echo ""
    echo -e "${BOLD}Summary:${NC} ${GREEN}${succeeded} succeeded${NC}, ${RED}${failed} failed${NC}"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║     GitGazer — Webhook Setup         ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
    echo ""

    check_dependencies
    resolve_github_token
    collect_webhook_config
    select_events
    select_target_type

    case "$TARGET_TYPE" in
        1) flow_single_repo ;;
        2) flow_organization ;;
        3) flow_multiple_repos ;;
        4) flow_by_topic ;;
        *)
            error "Invalid target type."
            exit 1
            ;;
    esac

    echo ""
    success "Done! Your webhooks are configured."
    info "Verify delivery at: https://github.com → Settings → Webhooks → Recent Deliveries"
    echo ""
}

main "$@"
