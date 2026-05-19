#!/usr/bin/env bash
set -euo pipefail

# Production deploy sync — mirrors railway-sync-v2-preview.sh but targets
# the `production` environment. Requires an interactive confirmation.
#
# Prerequisites:
#   - Railway CLI authenticated (`railway whoami`)
#   - Required prod env vars set in Railway (see docs/railway-deployment.md):
#       NODE_ENV=production, MINI_APP_URL, ADMIN_URL,
#       TELEGRAM_WEBHOOK_URL, TELEGRAM_WEBHOOK_SECRET,
#       TELEGRAM_BOT_TOKEN, DATABASE_URL, TZ, PORT

PROJECT_ID="4277e453-47fa-461f-99b0-aa956ac1a87e"
ENVIRONMENT="production"
API_ORIGIN="https://minerva-api.up.railway.app"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ "${CONFIRM_PROD:-}" != "yes" ]; then
  printf 'WARNING: this will sync bundles AND redeploy api-server to PRODUCTION (%s).\n' "$ENVIRONMENT"
  printf 'Type "deploy production" to continue: '
  read -r confirm
  if [ "$confirm" != "deploy production" ]; then
    printf 'Aborted.\n'
    exit 1
  fi
fi

push_bundle() {
  local service="$1"
  local src_root="$2"
  local js_file css_file
  js_file="$(ls "$src_root"/assets/index-*.js)"
  css_file="$(ls "$src_root"/assets/index-*.css)"

  printf 'Syncing %s\n' "$service"
  printf '  JS: %s\n' "$(basename "$js_file")"
  printf '  CSS: %s\n' "$(basename "$css_file")"

  send_file() {
    local src="$1"
    local remote="$2"
    local remote_dir tmp_dir
    remote_dir="$(dirname "$remote")"
    tmp_dir="$(mktemp -d)"

    gzip -c "$src" | base64 -w0 | split -b 40000 - "$tmp_dir/chunk_"

    railway ssh -p "$PROJECT_ID" -e "$ENVIRONMENT" -s "$service" "mkdir -p '$remote_dir' && rm -f '$remote.gz.b64' '$remote'" >/dev/null

    for part in "$tmp_dir"/chunk_*; do
      local chunk
      chunk="$(<"$part")"
      railway ssh -p "$PROJECT_ID" -e "$ENVIRONMENT" -s "$service" "printf '%s' '$chunk' >> '$remote.gz.b64'" >/dev/null
    done

    railway ssh -p "$PROJECT_ID" -e "$ENVIRONMENT" -s "$service" "base64 -d '$remote.gz.b64' | gzip -d > '$remote' && rm -f '$remote.gz.b64'" >/dev/null
    rm -rf "$tmp_dir"
  }

  send_file "$src_root/index.html" "/app/dist/public/index.html"
  send_file "$js_file" "/app/dist/public/assets/$(basename "$js_file")"
  send_file "$css_file" "/app/dist/public/assets/$(basename "$css_file")"
}

cd "$ROOT_DIR"

printf 'Checking Railway auth...\n'
railway whoami >/dev/null
printf 'Railway auth OK\n'

printf 'Building admin with API origin %s\n' "$API_ORIGIN"
VITE_API_ORIGIN="$API_ORIGIN" pnpm --filter @workspace/admin build
printf 'Building mini-app with API origin %s\n' "$API_ORIGIN"
VITE_API_ORIGIN="$API_ORIGIN" BASE_PATH=/ pnpm --filter @workspace/mini-app build

push_bundle "@workspace/admin" "$ROOT_DIR/artifacts/admin/dist/public"
push_bundle "@workspace/mini-app" "$ROOT_DIR/artifacts/mini-app/dist/public"

printf 'Frontend bundles synced to Railway production.\n'

printf 'Deploying api-server...\n'
if railway up -p "$PROJECT_ID" -e "$ENVIRONMENT" -s "@workspace/api-server" --ci --verbose; then
  printf 'api-server deploy submitted successfully.\n'
else
  printf 'api-server deploy failed. Check Railway Deployments for @workspace/api-server.\n'
  exit 1
fi

printf 'Current live endpoints:\n'
printf '  admin: %s\n' 'https://minerva-admin.up.railway.app/'
printf '  mini-app: %s\n' 'https://minerva-app.up.railway.app/'
printf '  api: %s\n' 'https://minerva-api.up.railway.app/api/healthz'
