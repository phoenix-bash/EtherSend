#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

ROOT_ENV_FILE="$ROOT_DIR/.env"
BACKEND_ENV_FILE="$ROOT_DIR/apps/backend/.env"
FRONTEND_ENV_FILE="$ROOT_DIR/apps/frontend/.env.local"
MIGRATION_BOOTSTRAP_SCRIPT="$ROOT_DIR/deploy/aws/bootstrap_migrations.sh"

SKIP_INFRA="false"

for arg in "$@"; do
  case "$arg" in
    --skip-infra)
      SKIP_INFRA="true"
      ;;
    *)
      echo "[ERROR] Unknown argument: $arg"
      echo "Usage: $0 [--skip-infra]"
      exit 1
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] Missing required command: $1"
    exit 1
  fi
}

run_docker_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
    return
  fi

  echo "[ERROR] Neither 'docker compose' nor 'docker-compose' is available."
  echo "[ERROR] Install Docker Compose plugin or docker-compose binary, then retry."
  exit 1
}

ensure_env_file() {
  local source_file="$1"
  local target_file="$2"

  if [[ ! -f "$target_file" ]]; then
    cp "$source_file" "$target_file"
    echo "[WARN] Created missing env file: $target_file"
    echo "[WARN] Update this file with production values before exposing the service publicly."
  fi
}

get_env_value() {
  local env_file="$1"
  local key="$2"
  local line
  line="$(grep -E "^${key}=" "$env_file" | tail -n 1 || true)"

  if [[ -z "$line" ]]; then
    echo ""
    return
  fi

  echo "${line#*=}"
}

is_loopback_value() {
  local value="$1"
  [[ "$value" == *"localhost"* || "$value" == *"127.0.0.1"* || "$value" == *"::1"* ]]
}

upsert_env_value() {
  local env_file="$1"
  local key="$2"
  local value="$3"
  local escaped_value="${value//&/\\&}"

  if grep -q "^${key}=" "$env_file"; then
    sed -i "s|^${key}=.*|${key}=${escaped_value}|" "$env_file"
    return
  fi

  echo "${key}=${value}" >> "$env_file"
}

validate_reverse_proxy_env() {
  local frontend_base_url
  local oauth_callback_base_url
  local frontend_api_base_url

  frontend_base_url="$(get_env_value "$BACKEND_ENV_FILE" "FRONTEND_BASE_URL")"
  oauth_callback_base_url="$(get_env_value "$BACKEND_ENV_FILE" "OAUTH_CALLBACK_BASE_URL")"
  frontend_api_base_url="$(get_env_value "$FRONTEND_ENV_FILE" "NEXT_PUBLIC_API_BASE_URL")"

  if [[ -z "$frontend_base_url" || -z "$oauth_callback_base_url" ]]; then
    echo "[ERROR] Missing FRONTEND_BASE_URL or OAUTH_CALLBACK_BASE_URL in $BACKEND_ENV_FILE"
    exit 1
  fi

  if is_loopback_value "$frontend_base_url" || is_loopback_value "$oauth_callback_base_url"; then
    echo "[ERROR] apps/backend/.env still uses localhost URLs."
    echo "[ERROR] Set FRONTEND_BASE_URL to your public URL (example: https://your-domain.com)."
    echo "[ERROR] Set OAUTH_CALLBACK_BASE_URL to that URL with /api suffix (example: https://your-domain.com/api)."
    exit 1
  fi

  if [[ -z "$frontend_api_base_url" ]]; then
    echo "[WARN] NEXT_PUBLIC_API_BASE_URL is missing. Setting it to /api for reverse-proxy mode."
    upsert_env_value "$FRONTEND_ENV_FILE" "NEXT_PUBLIC_API_BASE_URL" "/api"
    frontend_api_base_url="/api"
  fi

  if is_loopback_value "$frontend_api_base_url"; then
    echo "[WARN] NEXT_PUBLIC_API_BASE_URL points to localhost. Rewriting it to /api."
    upsert_env_value "$FRONTEND_ENV_FILE" "NEXT_PUBLIC_API_BASE_URL" "/api"
    frontend_api_base_url="/api"
  fi

  if [[ "$frontend_api_base_url" != "/api" ]]; then
    echo "[WARN] NEXT_PUBLIC_API_BASE_URL is '$frontend_api_base_url'."
    echo "[WARN] For no-port public access with deploy/nginx/linkforge.conf, use NEXT_PUBLIC_API_BASE_URL=/api."
  fi

  if [[ "$oauth_callback_base_url" != */api ]]; then
    echo "[WARN] OAUTH_CALLBACK_BASE_URL does not end with /api."
    echo "[WARN] OAuth callback URLs must be /api/auth/<provider>/callback behind Nginx."
  fi
}

main() {
  require_cmd pnpm
  require_cmd pm2
  require_cmd docker

  cd "$ROOT_DIR"

  mkdir -p logs/pm2

  ensure_env_file "$ROOT_DIR/.env.example" "$ROOT_ENV_FILE"
  ensure_env_file "$ROOT_DIR/apps/backend/.env.example" "$BACKEND_ENV_FILE"
  ensure_env_file "$ROOT_DIR/apps/frontend/.env.example" "$FRONTEND_ENV_FILE"
  validate_reverse_proxy_env

  if [[ "$SKIP_INFRA" != "true" ]]; then
    echo "[STEP] Starting PostgreSQL and Redis via docker compose..."
    run_docker_compose up -d
  else
    echo "[INFO] Skipping infrastructure start (--skip-infra)."
  fi

  echo "[STEP] Installing dependencies..."
  pnpm install --frozen-lockfile || pnpm install

  echo "[STEP] Generating Prisma client..."
  pnpm --filter @linkforge/backend prisma:generate

  echo "[STEP] Running strict migration bootstrap..."
  bash "$MIGRATION_BOOTSTRAP_SCRIPT"

  echo "[STEP] Building backend and frontend..."
  pnpm --filter @linkforge/backend build
  pnpm --filter @linkforge/frontend build

  echo "[STEP] Starting/reloading processes via PM2..."
  pm2 startOrReload ecosystem.config.cjs --env production
  pm2 save

  echo ""
  echo "[DONE] Deployment completed."
  echo "- Frontend expected on :3000"
  echo "- Backend expected on :4000"
  echo "- Verify backend health: curl http://127.0.0.1:4000/health"
}

main "$@"
