#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run this script as a non-root user with sudo access."
  exit 1
fi

echo "[1/6] Updating apt packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

echo "[2/6] Installing base dependencies..."
sudo apt-get install -y \
  ca-certificates \
  curl \
  git \
  gnupg \
  lsb-release \
  ufw \
  jq

echo "[3/6] Installing Docker Engine + Compose plugin..."
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "[4/6] Enabling Docker service..."
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker "${USER}"

echo "[5/6] Configuring firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw --force enable

echo "[6/6] Final checks..."
docker --version
docker compose version

cat <<'EOF'

Bootstrap complete.

Important:
- Log out and log back in so docker group membership applies.
- Then run deploy/nutanix/deploy.sh from your repo checkout path.
EOF
