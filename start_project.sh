#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$ROOT_DIR/.pids"
LOG_DIR="$ROOT_DIR/logs"

backend_pid_file="$PID_DIR/backend.pid"
frontend_pid_file="$PID_DIR/frontend.pid"
root_env_file="$ROOT_DIR/.env"
backend_env_file="$ROOT_DIR/apps/backend/.env"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] Required command not found: $1"
    exit 1
  fi
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v corepack >/dev/null 2>&1; then
    echo "[ERROR] pnpm is not installed and corepack is unavailable."
    exit 1
  fi

  echo "[STEP] pnpm not found. Bootstrapping via corepack..."
  corepack enable
  corepack prepare pnpm@9.12.0 --activate

  if ! command -v pnpm >/dev/null 2>&1; then
    echo "[ERROR] Failed to activate pnpm via corepack."
    exit 1
  fi
}

ensure_env_file() {
  local source_file="$1"
  local target_file="$2"

  if [[ ! -f "$target_file" ]]; then
    cp "$source_file" "$target_file"
    echo "[OK] Created $(realpath --relative-to="$ROOT_DIR" "$target_file") from template."
  fi
}

get_env_var() {
  local file_path="$1"
  local key="$2"

  if [[ ! -f "$file_path" ]]; then
    return 0
  fi

  local line
  line="$(grep -E "^${key}=" "$file_path" | head -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 0
  fi

  echo "${line#*=}"
}

set_env_var() {
  local file_path="$1"
  local key="$2"
  local value="$3"

  if grep -qE "^${key}=" "$file_path"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file_path"
  else
    printf "%s=%s\n" "$key" "$value" >> "$file_path"
  fi
}

port_in_use() {
  local port="$1"
  ss -ltn | awk '{print $4}' | grep -Eq ":${port}$"
}

container_owns_port() {
  local container_name="$1"
  local port="$2"

  docker ps --format '{{.Names}}\t{{.Ports}}' | awk -F '\t' -v name="$container_name" -v port="$port" '
    $1 == name && $2 ~ (":" port "->") { found = 1 }
    END { exit(found ? 0 : 1) }
  '
}

find_free_port() {
  local start_port="$1"
  local port="$start_port"

  while port_in_use "$port"; do
    port=$((port + 1))
  done

  echo "$port"
}

resolve_infra_port() {
  local configured_port="$1"
  local container_name="$2"

  if [[ -z "$configured_port" ]]; then
    configured_port="0"
  fi

  if [[ "$configured_port" -gt 0 ]] && port_in_use "$configured_port" && ! container_owns_port "$container_name" "$configured_port"; then
    local free_port
    free_port="$(find_free_port "$configured_port")"
    echo "$free_port"
    return 0
  fi

  echo "$configured_port"
}

sync_infra_env() {
  local default_postgres_port=5432
  local default_redis_port=6379

  local configured_postgres_port
  local configured_redis_port
  configured_postgres_port="$(get_env_var "$root_env_file" "POSTGRES_PORT")"
  configured_redis_port="$(get_env_var "$root_env_file" "REDIS_PORT")"

  if [[ -z "$configured_postgres_port" ]]; then
    configured_postgres_port="$default_postgres_port"
  fi
  if [[ -z "$configured_redis_port" ]]; then
    configured_redis_port="$default_redis_port"
  fi

  local postgres_port
  local redis_port
  postgres_port="$(resolve_infra_port "$configured_postgres_port" "linkforge-postgres")"
  redis_port="$(resolve_infra_port "$configured_redis_port" "linkforge-redis")"

  if [[ "$postgres_port" != "$configured_postgres_port" ]]; then
    echo "[WARN] Port $configured_postgres_port is busy. Using PostgreSQL host port $postgres_port."
  fi
  if [[ "$redis_port" != "$configured_redis_port" ]]; then
    echo "[WARN] Port $configured_redis_port is busy. Using Redis host port $redis_port."
  fi

  local db_url
  local redis_url
  db_url="postgresql://linkforge:linkforge@localhost:${postgres_port}/linkforge"
  redis_url="redis://localhost:${redis_port}"

  set_env_var "$root_env_file" "POSTGRES_PORT" "$postgres_port"
  set_env_var "$root_env_file" "REDIS_PORT" "$redis_port"
  set_env_var "$root_env_file" "DATABASE_URL" "$db_url"
  set_env_var "$root_env_file" "REDIS_URL" "$redis_url"

  set_env_var "$backend_env_file" "DATABASE_URL" "$db_url"
  set_env_var "$backend_env_file" "REDIS_URL" "$redis_url"
}

sync_backend_oauth_env() {
  local keys=(
    "GOOGLE_CLIENT_ID"
    "GOOGLE_CLIENT_SECRET"
    "GITHUB_CLIENT_ID"
    "GITHUB_CLIENT_SECRET"
    "OAUTH_CALLBACK_BASE_URL"
    "FRONTEND_BASE_URL"
  )

  local key
  for key in "${keys[@]}"; do
    local value
    value="$(get_env_var "$root_env_file" "$key")"
    if [[ -n "$value" ]]; then
      set_env_var "$backend_env_file" "$key" "$value"
    fi
  done
}

is_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      return 0
    fi
    rm -f "$pid_file"
  fi
  return 1
}

start_service() {
  local service_name="$1"
  local command="$2"
  local pid_file="$3"
  local log_file="$4"

  if is_running "$pid_file"; then
    echo "[INFO] $service_name is already running (PID $(cat "$pid_file"))."
    return 0
  fi

  nohup bash -lc "cd '$ROOT_DIR' && $command" >"$log_file" 2>&1 &
  local pid=$!
  echo "$pid" >"$pid_file"
  echo "[OK] Started $service_name (PID $pid). Logs: $(realpath --relative-to="$ROOT_DIR" "$log_file")"
}

main() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    echo "[ERROR] Do not run this script with sudo/root."
    echo "[HINT] Run as your normal user: ./start_local.sh"
    exit 1
  fi

  ensure_pnpm
  require_cmd docker
  require_cmd ss

  mkdir -p "$PID_DIR" "$LOG_DIR"

  ensure_env_file "$ROOT_DIR/.env.example" "$root_env_file"
  ensure_env_file "$ROOT_DIR/apps/backend/.env.example" "$backend_env_file"
  ensure_env_file "$ROOT_DIR/apps/frontend/.env.example" "$ROOT_DIR/apps/frontend/.env.local"

  sync_infra_env
  sync_backend_oauth_env

  echo "[STEP] Starting infrastructure containers..."
  docker compose --project-directory "$ROOT_DIR" -f "$ROOT_DIR/docker-compose.yml" up -d

  echo "[STEP] Installing dependencies..."
  CI=1 pnpm install --force

  echo "[STEP] Preparing database client/schema..."
  pnpm --filter @linkforge/backend prisma:generate
  pnpm --filter @linkforge/backend exec prisma db push

  echo "[STEP] Starting backend and frontend..."
  start_service "EtherSend Backend" "pnpm --filter @linkforge/backend dev" "$backend_pid_file" "$LOG_DIR/backend.log"
  start_service "EtherSend Frontend" "pnpm --filter @linkforge/frontend dev" "$frontend_pid_file" "$LOG_DIR/frontend.log"

  echo ""
  echo "EtherSend is starting in background."
  echo "- Frontend: http://localhost:3000"
  echo "- Backend : http://localhost:4000"
  echo ""
  echo "Use 'tail -f logs/backend.log' or 'tail -f logs/frontend.log' to inspect startup logs."
}

main "$@"