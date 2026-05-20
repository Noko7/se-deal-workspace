## Nutanix VM Deployment Runbook

### Recommended baseline

- OS: Ubuntu 24.04 LTS
- VM size: 2 vCPU, 8 GB RAM, 40+ GB disk
- Ports:
  - `22/tcp` SSH
  - `3000/tcp` app (or proxy-only if fronted by NGINX/Caddy)

### 1) Provision VM in Nutanix

Use your preferred Nutanix flow (Prism Central/Prism Element), then:

- assign static IP/DNS
- add your SSH key
- enable outbound internet

Optional: use `deploy/nutanix/cloud-init.yaml` for first-boot setup.

### 2) Bootstrap VM runtime

SSH into VM:

```bash
ssh seadmin@<vm-ip>
```

Run:

```bash
cd /tmp
curl -LO https://raw.githubusercontent.com/<your-org>/<your-repo>/main/deploy/nutanix/bootstrap-ubuntu.sh
chmod +x bootstrap-ubuntu.sh
./bootstrap-ubuntu.sh
```

Log out/in once to apply docker group membership.

### 3) Deploy app

```bash
export REPO_URL=git@github.com:<your-org>/<your-repo>.git
export BRANCH=main
bash /opt/se-deal-workspace/deploy/nutanix/deploy.sh
```

### 4) Validate

```bash
cd /opt/se-deal-workspace
./deploy/nutanix/validate.sh 127.0.0.1 3000
```

From your laptop:

- `http://<vm-ip>:3000`
- `http://<vm-ip>:3000/api/health`
- `http://<vm-ip>:3000/api/connectors`

### 5) Enable startup service

```bash
sudo cp /opt/se-deal-workspace/deploy/nutanix/systemd/se-deal-workspace.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable se-deal-workspace
sudo systemctl start se-deal-workspace
sudo systemctl status se-deal-workspace
```

### 6) Backup/restore operations

Backup:

```bash
cd /opt/se-deal-workspace
./deploy/nutanix/backup-db.sh
```

Restore:

```bash
cd /opt/se-deal-workspace
./deploy/nutanix/restore-db.sh /opt/se-deal-workspace/backups/dev-<timestamp>.db.gz
```

### Upgrade flow

```bash
cd /opt/se-deal-workspace
git pull --ff-only origin main
docker compose up --build -d
```
