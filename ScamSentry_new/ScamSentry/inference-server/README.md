# Fraud-Sentry Inference Server

A lightweight Node.js server that runs an LLM **locally** using the [RunAnywhere Web SDK](https://docs.runanywhere.ai/web/introduction) (`@runanywhere/web` + `@runanywhere/web-llamacpp`). No cloud API keys needed.

Flask calls `POST http://localhost:5001/infer` — this server returns a structured JSON analysis of the URL.

---

## 📦 Setup

### 1. Install dependencies

```bash
cd fraudSentry/inference-server
npm install
```

### 2. Download a GGUF model

You need a quantized GGUF model file. Place it in the `models/` folder.

**Recommended (fast, ~400 MB):**
```bash
# Create models directory
mkdir models

# Option A: Using huggingface-cli (pip install huggingface_hub)
huggingface-cli download Qwen/Qwen2.5-0.5B-Instruct-GGUF \
  Qwen2.5-0.5B-Instruct-Q4_K_M.gguf \
  --local-dir ./models

# Option B: Direct wget/curl
# Find the download URL on: https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF
```

**Alternative (better quality, ~1 GB):**
```bash
huggingface-cli download Qwen/Qwen2.5-1.5B-Instruct-GGUF \
  Qwen2.5-1.5B-Instruct-Q4_K_M.gguf \
  --local-dir ./models
```

### 3. Set model path (if filename differs)

```bash
# Windows PowerShell
$env:MODEL_PATH = "C:\path\to\fraudSentry\inference-server\models\your-model.gguf"

# Or edit the MODEL_PATH constant directly in server.js
```

### 4. Start the server

```bash
npm start
# Server runs on http://localhost:5001
```

---

## 🧪 Test it standalone

```bash
curl -X POST http://localhost:5001/infer \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"http://free-prize-winner.xyz\",\"text\":\"Congratulations you have won a prize click here\"}"
```

Expected response:
```json
{
  "status": "dangerous",
  "trust_score": 5,
  "reason": "URL is a known phishing pattern with prize-winning social engineering text.",
  "action": "Do not click any links. Close the page immediately.",
  "highlights": ["Congratulations you have won a prize", "click here"]
}
```

---

## 🌐 API Reference

### `GET /health`
Returns model load status.

### `POST /infer`
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | ✅ | The URL being scanned |
| `text` | string | ❌ | Page text (first 1500 chars) |

Returns a JSON object: `{ status, trust_score, reason, action, highlights }`

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INFERENCE_PORT` | `5001` | Port for this server |
| `MODEL_PATH` | `./models/Qwen2.5-0.5B-Instruct.Q4_K_M.gguf` | Path to GGUF model |

---

## 🚀 AWS/GCP Deployment

On a cloud instance, run both servers as background processes:
```bash
# Start inference server
nohup npm start > inference.log 2>&1 &

# Start Flask
cd ../backend
nohup python app.py > flask.log 2>&1 &
```

Use Nginx to proxy Flask externally (see `../deploy/nginx.conf`).
