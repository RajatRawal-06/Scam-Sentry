# Fraud-Sentry AWS/GCP Deployment Guide

## Architecture on a single VM

```
Internet → Nginx (:443 HTTPS) → Flask (:5000)
                                      ↓ internal
                            Node.js Inference (:5001)
                                      ↓
                             GGUF model file (disk)
```

## Prerequisites

- Ubuntu 22.04 EC2 (t3.medium or higher recommended for LLM)
- Node.js 18+ and Python 3.10+ installed
- Domain name or Elastic IP

---

## 1. Upload project

```bash
# From your local machine
scp -r fraudSentry/ ubuntu@YOUR_EC2_IP:~/fraud-sentry/
```

## 2. Install dependencies

```bash
# On the server
cd ~/fraud-sentry/fraudSentry/inference-server
npm install

cd ~/fraud-sentry/fraudSentry/backend
pip install flask flask-cors requests
```

## 3. Download the GGUF model on the server

```bash
pip install huggingface_hub
huggingface-cli download Qwen/Qwen2.5-0.5B-Instruct-GGUF \
  Qwen2.5-0.5B-Instruct-Q4_K_M.gguf \
  --local-dir ~/fraud-sentry/fraudSentry/inference-server/models
```

## 4. Install and configure Nginx

```bash
sudo apt install nginx -y
sudo cp nginx.conf /etc/nginx/sites-available/fraud-sentry
sudo ln -s /etc/nginx/sites-available/fraud-sentry /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 5. Start servers (persistent with nohup or systemd)

```bash
# Inference server (background)
cd ~/fraud-sentry/fraudSentry/inference-server
nohup npm start > ~/inference.log 2>&1 &

# Flask server (background)
cd ~/fraud-sentry/fraudSentry/backend
nohup python app.py > ~/flask.log 2>&1 &
```

## 6. Update Chrome extension

Edit `extension/manifest.json`: replace `http://localhost:5000/*` with `https://YOUR_DOMAIN/*` in `host_permissions`.

---

## Recommended EC2 instance types

| Instance | vCPU | RAM | Cost/hr | Notes |
|----------|------|-----|---------|-------|
| t3.medium | 2 | 4 GB | ~$0.04 | Qwen 0.5B (tight) |
| t3.large  | 2 | 8 GB | ~$0.08 | Recommended minimum |
| t3.xlarge | 4 | 16 GB | ~$0.17 | Comfortable for 1.5B model |
