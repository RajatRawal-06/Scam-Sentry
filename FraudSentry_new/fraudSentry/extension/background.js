import { createRuntime } from "@runanywhere/web";
import { createLlamaCppEngine } from "@runanywhere/web-llamacpp";

// =====================================================
// INITIAL STORAGE SETUP
// =====================================================

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ ignoredSites: [], lastScan: null });
  console.log("Fraud-Sentry installed");
});

// =====================================================
// LOAD RUNANYWHERE MODEL
// =====================================================

let engine = null;
let modelReady = false;

async function loadModel() {
  try {
    console.log("Initializing RunAnywhere...");

    const runtime = await createRuntime();

    engine = await createLlamaCppEngine(runtime, {
      modelPath: chrome.runtime.getURL("models/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf"),
      contextSize: 1024
    });

    modelReady = true;
    console.log("LLM Loaded Successfully");
  } catch (err) {
    console.error("Model load failed:", err);
  }
}

loadModel();

// =====================================================
// SYSTEM PROMPT
// =====================================================

const SYSTEM_PROMPT = `
You are Fraud-Sentry, a cybersecurity URL analyzer.

Be strict with piracy, streaming, cracked software,
fake banks, and impersonation.

Return ONLY valid JSON:

{
  "status": "safe" | "suspicious" | "dangerous",
  "trust_score": <0-100>,
  "risk_category": "phishing" | "malware" | "piracy" | "unknown",
  "reason": "<short explanation>"
}
`;

// =====================================================
// MESSAGE LISTENER
// =====================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.type === "SCAN_URL") {

    (async () => {

      if (!modelReady) {
        sendResponse({ error: "Model still loading..." });
        return;
      }

      try {

        const prompt = `
${SYSTEM_PROMPT}

URL: ${request.url}

Page Content:
${request.text.substring(0, 500)}
`;

        const response = await engine.generate({
          prompt,
          maxTokens: 200,
          temperature: 0.05
        });

        let cleaned = response.text.replace(/```json|```/g, "").trim();

        let parsed;

        try {
          parsed = JSON.parse(cleaned);
        } catch {
          const match = cleaned.match(/\{[\s\S]*\}/);
          parsed = match ? JSON.parse(match[0]) : null;
        }

        if (!parsed) {
          sendResponse({ error: "Invalid model response" });
          return;
        }

        // Send LLM output to Flask scoring engine
        const flaskResponse = await fetch("http://localhost:5000/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: request.url,
            text: request.text,
            llm_score: parsed.trust_scoare,
            llm_category: parsed.risk_category
          })
        });

        const finalResult = await flaskResponse.json();

        chrome.storage.local.set({ lastScan: finalResult });

        sendResponse(finalResult);

      } catch (err) {
        console.error("Scan error:", err);
        sendResponse({ error: "Scan failed" });
      }

    })();

    return true; // Required for async
  }
});
