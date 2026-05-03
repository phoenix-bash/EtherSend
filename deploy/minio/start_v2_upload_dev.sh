#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

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
  exit 1
}

require_cmd docker

COMPOSE_ARGS=(-f docker-compose.yml -f docker-compose.v2-upload.dev.yml)
MINIO_API_PORT="${MINIO_API_PORT:-9000}"
MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT:-9001}"

echo "[STEP] Starting base infrastructure + MinIO..."
run_docker_compose "${COMPOSE_ARGS[@]}" up -d postgres redis minio

echo "[STEP] Bootstrapping MinIO bucket and CORS policy..."
run_docker_compose "${COMPOSE_ARGS[@]}" run --rm minio-bootstrap

echo ""
echo "[DONE] V2 upload local storage is ready."
echo "Set backend env for MinIO development:"
echo "  ENABLE_V2_UPLOAD=true"
echo "  V2_S3_BUCKET=${V2_S3_BUCKET:-linkforge-dev-v2}"
echo "  V2_S3_REGION=${V2_S3_REGION:-ap-south-1}"
echo "  V2_S3_ENDPOINT=http://localhost:${MINIO_API_PORT}"
echo "  # For phone/LAN clients, set to host machine IP (example: http://192.168.1.10:${MINIO_API_PORT})"
echo "  V2_S3_PUBLIC_ENDPOINT="
echo "  V2_S3_FORCE_PATH_STYLE=true"
echo "  V2_S3_ACCESS_KEY_ID=${V2_S3_ACCESS_KEY_ID:-minioadmin}"
echo "  V2_S3_SECRET_ACCESS_KEY=${V2_S3_SECRET_ACCESS_KEY:-minioadmin123}"
echo ""
echo "MinIO console: http://localhost:${MINIO_CONSOLE_PORT}"
