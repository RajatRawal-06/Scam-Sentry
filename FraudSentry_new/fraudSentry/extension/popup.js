document.addEventListener("DOMContentLoaded", () => {
    const mainFrame = document.querySelector(".frame");
    const startView = document.getElementById("start-view");
    const resultView = document.getElementById("result-view");

    const startScanBtn = document.getElementById("startScanBtn");
    const rescanBtn = document.getElementById("rescanBtn");
    const knowMoreBtn = document.getElementById("knowMoreBtn");

    const scoreArc = document.getElementById("score-arc");
    const scoreValue = document.getElementById("score-value");
    const statusValue = document.getElementById("status-value");
    const verdictBadge = document.getElementById("verdict-badge");
    const verdictCopy = document.getElementById("verdict-copy");
    const signalsList = document.getElementById("signals-list");
    const scannedUrl = document.getElementById("scanned-url");
    const resultUrl = document.getElementById("result-url");
    const lastScanTime = document.getElementById("last-scan-time");

    const DASHBOARD_URL = "http://127.0.0.1:5000/dashboard";
    let activeTabUrl = "";

    showStartView();
    updateActiveTabPreview();

    startScanBtn.addEventListener("click", (event) => performScan(event.currentTarget));
    rescanBtn.addEventListener("click", (event) => performScan(event.currentTarget));

    knowMoreBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: DASHBOARD_URL });
    });

    function showStartView() {
        mainFrame.classList.remove("result-mode");
        mainFrame.classList.add("scan-mode");
        startView.style.display = "flex";
        resultView.style.display = "none";
    }

    function showResultView() {
        mainFrame.classList.remove("scan-mode");
        mainFrame.classList.add("result-mode");
        startView.style.display = "none";
        resultView.style.display = "flex";
    }

    function updateActiveTabPreview() {
        if (typeof chrome === "undefined" || !chrome.tabs?.query) return;

        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            activeTabUrl = tab?.url || "";
            if (activeTabUrl) {
                scannedUrl.textContent = activeTabUrl;
                resultUrl.textContent = activeTabUrl;
            }
        });
    }

    async function performScan(btnElement) {
        const originalText = btnElement.textContent.trim() || "SCAN";
        btnElement.textContent = "SCANNING...";
        btnElement.disabled = true;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) {
                handleError("No active browser tab is available.", activeTabUrl);
                restoreButton(btnElement, originalText);
                return;
            }

            activeTabUrl = tab.url || activeTabUrl;
            showResultView();
            setLoadingState(activeTabUrl);

            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => document.body.innerText.substring(0, 1500)
            }, async (results) => {
                if (chrome.runtime.lastError || !results || !results[0]) {
                    handleError("Could not access page content.", activeTabUrl);
                    restoreButton(btnElement, originalText);
                    return;
                }

                const pageText = results[0].result;

                try {
                    const response = await fetch("http://localhost:5000/check", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url: tab.url, text: pageText })
                    });

                    const data = await response.json();
                    chrome.storage.local.set({ lastScan: data });
                    updateResultUI(data, tab.url);

                    chrome.tabs.sendMessage(tab.id, { action: "applyUI", data }, () => {
                        void chrome.runtime.lastError;
                    });
                } catch (error) {
                    console.error(error);
                    handleError("Server Offline. Check localhost:5000", activeTabUrl);
                } finally {
                    restoreButton(btnElement, originalText);
                }
            });
        } catch (error) {
            console.error(error);
            handleError("Could not start the scan.", activeTabUrl);
            restoreButton(btnElement, originalText);
        }
    }

    function restoreButton(btnElement, originalText) {
        btnElement.textContent = originalText;
        btnElement.disabled = false;
    }

    function setLoadingState(url) {
        resultUrl.textContent = url || "Current tab";
        scoreValue.textContent = "--";
        statusValue.textContent = "ANALYZING...";
        verdictCopy.textContent = "Scanning threat posture...";
        lastScanTime.textContent = "Running now";
        verdictBadge.dataset.level = "unknown";
        renderScore(0, "unknown");

        signalsList.innerHTML = "";
        ["Querying page text", "Contacting local inference engine", "Compiling threat signals"].forEach((label) => {
            const item = document.createElement("li");
            item.className = "signal-item signal-unknown";
            item.innerHTML = `<span class="signal-icon skeleton">...</span><span class="signal-msg">${label}</span>`;
            signalsList.appendChild(item);
        });
    }

    function handleError(message, url) {
        showResultView();
        resultUrl.textContent = url || "Scan target unavailable";
        scoreValue.textContent = "!";
        statusValue.textContent = "ERROR";
        verdictCopy.textContent = message;
        lastScanTime.textContent = formatScanTime(new Date());
        verdictBadge.dataset.level = "error";
        renderScore(0, "error");
        renderSignals({
            status: "error",
            trust_score: 0,
            reason: message
        }, "error");
    }

    function updateResultUI(res, url) {
        const score = clampScore(res.trust_score);
        const level = normalizeLevel(res.status, score);
        const label = level === "error" ? "ERROR" : level.toUpperCase();

        resultUrl.textContent = url || activeTabUrl || "Scan target unavailable";
        scoreValue.textContent = `${score}%`;
        statusValue.textContent = label;
        verdictCopy.textContent = verdictMessage(level);
        lastScanTime.textContent = formatScanTime(new Date());
        verdictBadge.dataset.level = level;

        renderScore(score, level);
        renderSignals(res, level);
    }

    function renderScore(score, level) {
        const hex = document.querySelector("#result-view .hex-frame");
        const circumference = 2 * Math.PI * 62;
        const colorMap = {
            safe: {
                stroke: "#00e5c3",
                hex: "#00e5c3",
                glow: "drop-shadow(0 0 20px rgba(0, 229, 195, 0.4))"
            },
            suspicious: {
                stroke: "#f5a623",
                hex: "#f5a623",
                glow: "drop-shadow(0 0 20px rgba(245, 166, 35, 0.4))"
            },
            dangerous: {
                stroke: "#e8365d",
                hex: "#e8365d",
                glow: "drop-shadow(0 0 20px rgba(232, 54, 93, 0.5))"
            },
            error: {
                stroke: "#e8365d",
                hex: "#e8365d",
                glow: "drop-shadow(0 0 20px rgba(232, 54, 93, 0.5))"
            },
            unknown: {
                stroke: "#4a6274",
                hex: "#4a6274",
                glow: "drop-shadow(0 0 14px rgba(74, 98, 116, 0.35))"
            }
        };
        const color = colorMap[level] || colorMap.suspicious;
        const dashVal = (clampScore(score) / 100) * circumference;

        scoreArc.setAttribute("stroke", color.stroke);
        scoreArc.setAttribute("stroke-dasharray", `${dashVal} ${circumference}`);
        scoreArc.style.filter = color.glow;
        hex.setAttribute("stroke", color.hex);
        hex.style.opacity = "0.6";
        hex.style.animation = level === "dangerous" || level === "error"
            ? "hexPulse 1.8s ease-in-out infinite"
            : "none";
    }

    function renderSignals(res, level) {
        const reason = String(res.reason || "No specific reason provided by the inference engine.");
        const fragments = reason
            .split(/(?<=[.!?])\s+|\n+/)
            .map((part) => part.trim())
            .filter(Boolean)
            .slice(0, 5);

        signalsList.innerHTML = "";
        addSignal(
            level === "safe" ? "signal-ok" : level === "dangerous" || level === "error" ? "signal-danger" : "signal-warn",
            level === "safe" ? "OK" : level === "dangerous" || level === "error" ? "!!" : "!",
            `Model verdict: ${(res.status || level).toString().toUpperCase()}`
        );

        fragments.forEach((fragment) => {
            const className = classifySignal(fragment, level);
            const icon = className === "signal-ok" ? "OK" : className === "signal-danger" ? "!!" : "!";
            addSignal(className, icon, fragment);
        });
    }

    function addSignal(className, icon, message) {
        const item = document.createElement("li");
        const iconEl = document.createElement("span");
        const msgEl = document.createElement("span");

        item.className = `signal-item ${className}`;
        iconEl.className = "signal-icon";
        iconEl.textContent = icon;
        msgEl.className = "signal-msg";
        msgEl.textContent = message;

        item.append(iconEl, msgEl);
        signalsList.appendChild(item);
    }

    function verdictMessage(level) {
        const messages = {
            safe: "This site appears safe. Continue browsing with confidence.",
            suspicious: "This site may be risky. Proceed with caution.",
            dangerous: "High-risk indicators detected. Avoid entering sensitive data.",
            error: "Scan could not complete. Check the local protection service.",
            unknown: "Scanning threat posture..."
        };
        return messages[level] || messages.suspicious;
    }

    function formatScanTime(date) {
        return date.toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        });
    }

    function classifySignal(text, level) {
        const value = text.toLowerCase();
        if (level === "safe") return "signal-ok";
        if (level === "dangerous" || level === "error") return "signal-danger";
        if (/(phishing|scam|credential|password|login|verify|certificate|ssl|malware|payment|urgent)/.test(value)) {
            return "signal-danger";
        }
        return "signal-warn";
    }

    function normalizeLevel(status, score) {
        const value = String(status || "").toLowerCase();
        if (["safe", "suspicious", "dangerous", "error"].includes(value)) return value;
        if (score >= 75) return "dangerous";
        if (score >= 35) return "suspicious";
        return "safe";
    }

    function clampScore(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }
});
