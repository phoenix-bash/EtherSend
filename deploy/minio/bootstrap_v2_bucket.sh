#!/usr/bin/env sh
set -eu

if [ -z "${V2_S3_ENDPOINT:-}" ] || [ -z "${V2_S3_ACCESS_KEY_ID:-}" ] || [ -z "${V2_S3_SECRET_ACCESS_KEY:-}" ] || [ -z "${V2_S3_BUCKET:-}" ]; then
  echo "[ERROR] Missing one or more required MinIO environment variables."
  exit 1
fi

mc alias set linkforge "$V2_S3_ENDPOINT" "$V2_S3_ACCESS_KEY_ID" "$V2_S3_SECRET_ACCESS_KEY"
mc mb --ignore-existing "linkforge/$V2_S3_BUCKET"
mc anonymous set private "linkforge/$V2_S3_BUCKET"

# Some recent MinIO builds may reject PutBucketCors with NotImplemented.
# Global CORS is configured on the MinIO container via MINIO_API_CORS_ALLOW_ORIGIN.
if ! mc cors set "linkforge/$V2_S3_BUCKET" /bootstrap/v2-upload-cors.xml; then
  echo "[WARN] Bucket-level CORS apply failed; relying on global CORS (MINIO_API_CORS_ALLOW_ORIGIN)."
fi

echo "[DONE] MinIO bucket '$V2_S3_BUCKET' is ready with CORS policy."
