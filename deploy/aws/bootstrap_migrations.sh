#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/apps/backend/prisma/migrations"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] Missing required command: $1"
    exit 1
  fi
}

has_migration_sql() {
  [[ -d "$MIGRATIONS_DIR" ]] && find "$MIGRATIONS_DIR" -type f -name migration.sql | read -r
}

main() {
  require_cmd pnpm

  cd "$ROOT_DIR"

  if ! has_migration_sql; then
    echo "[ERROR] No Prisma migration files found in apps/backend/prisma/migrations"
    echo "[ERROR] Create and commit migrations before production deployment."
    echo "[ERROR] Example: pnpm --filter @linkforge/backend prisma:migrate"
    exit 1
  fi

  echo "[STEP] Generating Prisma client..."
  pnpm --filter @linkforge/backend prisma:generate

  echo "[STEP] Applying Prisma migrations (deploy)..."
  pnpm --filter @linkforge/backend prisma:deploy

  echo "[DONE] Migrations applied successfully."
}

main "$@"