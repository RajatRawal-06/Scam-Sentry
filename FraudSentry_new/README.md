# 🛡️ FRAUD-SENTRY  
### Stop scams before you pay.

---

## 🧠 Overview

Fraud-Sentry is a browser extension powered by a fully local AI system that detects phishing, scam, and suspicious payment websites in real-time — before users enter sensitive information.

Unlike cloud-based AI solutions, Fraud-Sentry runs a locally deployed Large Language Model (LLM) using the RunAnywhere SDK, ensuring all AI inference happens directly on the client device.

✔ No cloud APIs  
✔ No external AI calls  
✔ No data leaves the device  
✔ Fully private on-device AI  

Fraud-Sentry combines instant rule-based detection with intelligent local AI reasoning to provide fast, private, and reliable scam protection.

---

## 🏗 Architecture Overview

Fraud-Sentry uses a two-layer detection system:

### 🥇 Layer 1 — Rule-Based Detection
Instant checks for:
- Suspicious TLDs (.xyz, .tk, etc.)
- Raw IP-based URLs
- Phishing keywords
- Lookalike domains
- SSL inconsistencies
- Urgency and scam language patterns

If a website is clearly malicious, the user is warned immediately.

---

### 🥈 Layer 2 — RunAnywhere Local LLM Analysis

If rule-based checks are inconclusive:

- URL and extracted webpage text are sent to a locally deployed LLM
- The model runs entirely on-device using RunAnywhere SDK
- Semantic intent and fraud reasoning are performed
- A risk score is generated and returned

All inference happens locally on the user’s machine.

No external servers are contacted.

---

## 🤖 AI Model

Deployment Platform: RunAnywhere SDK  
Model Type: Lightweight Instruction-Tuned LLM  
Execution: Fully Local  
Inference: On-device  

This project does NOT use:

❌ Google Gemini  
❌ OpenAI  
❌ Any cloud-based AI API  

All AI processing runs entirely on the client machine.

---

## 🔐 Why This Matters

Fraud does not exploit technology.  
It exploits trust.

Most fraud detection systems rely on cloud-based models that require sending user data externally. Fraud-Sentry eliminates that risk by keeping all AI reasoning local.

This ensures:

- Complete privacy  
- Zero data leakage  
- Reduced latency  
- Offline capability  
- No API costs  

---

## 🎯 Use Cases

Fraud-Sentry protects users when they are:

• Shopping on unfamiliar websites  
• Clicking unknown payment links  
• Entering card or UPI details  
• Visiting suspicious login pages  
• Redirected to cloned banking portals  

A warning appears before payment is made.

---

## 🚀 Hackathon Context

Fraud-Sentry demonstrates how locally deployed LLMs using RunAnywhere SDK can:

• Deliver AI-powered scam detection  
• Operate without cloud dependency  
• Preserve user privacy  
• Provide real-time protection  
• Reduce real-world financial fraud  

Built as a fully functional prototype showcasing on-device AI security.