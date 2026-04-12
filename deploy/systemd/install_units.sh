#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/opt/linkforge"
RUN_USER="ubuntu"

for arg in "$@"; do
  case "$arg" in
    --repo-dir=*)
      REPO_DIR="${arg#*=}"
      ;;
    --user=*)
      RUN_USER="${arg#*=}"
      ;;
    *)
      echo "[ERROR] Unknown argument: $arg"
      echo "Usage: $0 [--repo-dir=/opt/linkforge] [--user=ubuntu]"
      exit 1
      ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "[ERROR] Run as root (sudo) to install systemd units."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install_unit() {
  local source_file="$1"
  local target_file="$2"

  sed -e "s|/opt/linkforge|$REPO_DIR|g" -e "s|User=ubuntu|User=$RUN_USER|g" -e "s|Group=ubuntu|Group=$RUN_USER|g" "$source_file" > "$target_file"
}

install_unit "$SCRIPT_DIR/linkforge-backend.service" /etc/systemd/system/linkforge-backend.service
install_unit "$SCRIPT_DIR/linkforge-frontend.service" /etc/systemd/system/linkforge-frontend.service

systemctl daemon-reload
systemctl enable linkforge-backend.service linkforge-frontend.service
systemctl restart linkforge-backend.service linkforge-frontend.service

echo "[DONE] Installed and restarted linkforge-backend/linkforge-frontend systemd services."
