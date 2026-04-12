#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  echo "[ERROR] Run this script as a regular sudo-capable user, not root."
  exit 1
fi

echo "[STEP] Installing base packages..."
sudo apt update
sudo apt install -y git curl unzip build-essential docker.io docker-compose-plugin nginx

echo "[STEP] Enabling Docker for current user..."
sudo usermod -aG docker "$USER"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[STEP] Installing PM2 globally..."
  sudo npm install -g pm2
fi

if [[ -z "${NVM_DIR:-}" ]]; then
  export NVM_DIR="$HOME/.nvm"
fi

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "[STEP] Installing nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi

# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"

echo "[STEP] Installing Node.js 24 and pnpm..."
nvm install 24
nvm use 24
corepack enable
corepack prepare pnpm@9.12.0 --activate

echo "[DONE] Base setup complete. Open a new shell (or run: newgrp docker) before deployment."