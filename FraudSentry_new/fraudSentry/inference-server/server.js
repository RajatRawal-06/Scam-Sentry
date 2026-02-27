/**
 * Fraud-Sentry — Ecosystem-Aware LLM Inference Server
 */

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { getLlama, LlamaChatSession } from "node-llama-cpp";

const PORT = process.env.INFERENCE_PORT || 5001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODEL_PATH =
  process.env.MODEL_PATH ||
  path.join(__dirname, "models", "Qwen2.5-0.5B-Instruct-Q4_K_M.gguf");

const app = express();
app.use(cors());
app.use(express.json());

let llama = null;
let model = null;
let modelLoaded = false;
let initError = null;

/* =====================================================
   UPDATED SYSTEM PROMPT
===================================================== */

const SYSTEM_PROMPT = `
You are Fraud-Sentry, an advanced cybersecurity ecosystem evaluator.

Evaluate TOTAL website risk.

High-risk ecosystems include:
• Pirated software distribution
• Torrent / repack / crack platforms
• Illegal streaming websites
• Popup-heavy ad ecosystems
• Malware-prone download portals

SAFE requires strong legitimacy evidence.

If unsure → classify as suspicious.

Return STRICT JSON:

{
  "status": "safe" | "suspicious" | "dangerous",
  "trust_score": 0-100,
  "risk_category": "legitimate" | "banking" | "phishing" | "malware" | "piracy" | "unknown",
  "reason": "short explanation",
  "action": "recommendation"
}

Never default to safe without clear legitimacy.
Piracy ecosystem cannot be safe.
Malware ecosystem must be dangerous.
`;

async function initModel() {
  try {
    llama = await getLlama({ gpu: false });

    model = await llama.loadModel({
      modelPath: MODEL_PATH,
      gpuLayers: 0
    });

    modelLoaded = true;
    console.log("✅ Model Loaded");
  } catch (err) {
    initError = err;
    console.error("❌ Model Load Error:", err.message);
  }
}

app.post("/infer", async (req, res) => {
  if (initError) return res.status(500).json({ error: initError.message });
  if (!modelLoaded) return res.status(503).json({ error: "Model loading..." });

  const { url, text } = req.body;
  if (!url) return res.status(400).json({ error: "Missing URL field" });

  try {
    const context = await model.createContext({ contextSize: 2048 });

    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: SYSTEM_PROMPT
    });

    const prompt =
      `URL: ${url}\n\nPage Content:\n${(text || "").substring(0, 1500)}`;

    const response = await session.prompt(prompt, {
      maxTokens: 400,
      temperature: 0.1
    });

    await context.dispose();

    const cleaned = response.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }

    if (!parsed)
      return res.status(500).json({ error: "Invalid JSON from model" });

    parsed.method = "llm-ecosystem-aware";

    return res.json(parsed);

  } catch (err) {
    console.error("[LLM ERROR]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Inference server running → http://localhost:${PORT}`);
  initModel();
});