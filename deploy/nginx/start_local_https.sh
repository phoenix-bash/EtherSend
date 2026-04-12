#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_FILE="$ROOT_DIR/deploy/nginx/certs/linkforge.local.crt"
KEY_FILE="$ROOT_DIR/deploy/nginx/certs/linkforge.local.key"

if [[ ! -f "$CERT_FILE" || ! -f "$KEY_FILE" ]]; then
  echo "[STEP] TLS certificate not found. Generating a local self-signed certificate..."
  bash "$ROOT_DIR/deploy/nginx/generate_local_cert.sh"
fi

docker compose --project-directory "$ROOT_DIR" -f "$ROOT_DIR/docker-compose.tls.yml" up -d

echo "Local HTTPS proxy is running."
echo "Open https://localhost"
