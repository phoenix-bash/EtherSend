#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="$ROOT_DIR/deploy/nginx/certs"
CRT_FILE="$CERT_DIR/linkforge.local.crt"
KEY_FILE="$CERT_DIR/linkforge.local.key"
DAYS="${TLS_CERT_DAYS:-825}"

mkdir -p "$CERT_DIR"

openssl req \
  -x509 \
  -nodes \
  -newkey rsa:2048 \
  -sha256 \
  -days "$DAYS" \
  -keyout "$KEY_FILE" \
  -out "$CRT_FILE" \
  -subj "/C=US/ST=Local/L=Local/O=LinkForge/OU=Dev/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

chmod 600 "$KEY_FILE"
chmod 644 "$CRT_FILE"

echo "Generated self-signed certificate: $CRT_FILE"
echo "Generated private key: $KEY_FILE"
