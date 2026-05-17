console.log("Fraud-Sentry: Content script loaded");

/**
 * Generates a unique key for the current page based on origin and path.
 */
function getPageKey() {
    return window.location.origin + window.location.pathname;
}

/**
 * Check if current page is localhost/local network
 */
function isLocalHost() {
    const hostname = window.location.hostname;
    return (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        hostname.startsWith("172.16.") ||
        hostname === "[::1]" || // IPv6 localhost
        hostname.endsWith(".local")
    );
}

/**
 * Listens for messages from the popup. 
 * This is the entry point for the manual scan triggered by the button.
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "manualScan") {
        console.log("Fraud-Sentry: Manual scan requested");
        
        // BLOCK LOCALHOST IMMEDIATELY
        if (isLocalHost()) {
            console.log("Fraud-Sentry: Localhost detected - scan blocked");
            sendResponse({
                status: "safe",
                trust_score: 100,
                reason: "Scanning is disabled on local development servers.",
                action: "Continue browsing safely"
            });
            return true;
        }
        
        startFraudSentry((result) => {
            if (!result) {
                sendResponse({
                    status: "error",
                    trust_score: 0,
                    reason: "Scan failed or page ignored",
                });
            } else {
                sendResponse(result);
            }
        });
        return true; // REQUIRED for asynchronous response
    }
});

/**
 * Main logic to decide if a scan should proceed or be blocked.
 */
function startFraudSentry(callback) {
    const currentUrl = window.location.href;
    const pageKey = getPageKey();
    
    // --- STEP 1: DOUBLE-CHECK LOCALHOST (redundant safety) ---
    if (isLocalHost()) {
        console.log("Fraud-Sentry: Local/Dev site detected. Skipping scan.");
        if (callback) {
            callback({
                status: "safe",
                trust_score: 100,
                reason: "Scanning is disabled on local development servers.",
                action: "Continue browsing safely"
            });
        }
        return; 
    }
    
    // --- STEP 2: PREPARE PAGE DATA ---
    // Grabbing the first 1500 characters of text to send to Gemini
    const pageText = document.body.innerText.substring(0, 1500);
    
    // --- STEP 3: CHECK USER IGNORE LIST ---
    chrome.storage.local.get({ ignoredSites: [] }, (data) => {
        if (data.ignoredSites.includes(pageKey)) {
            console.log("Fraud-Sentry: Page is on user allowlist.");
            if (callback) {
                callback({
                    status: "safe",
                    trust_score: 100,
                    reason: "This page is trusted (ignored by user).",
                    action: "Continue browsing safely"
                });
            }
            return;
        }
        
        // --- STEP 4: RUN THE SCAN ---
        runScan(pageText, currentUrl, callback);
    });
}

/**
 * Sends the page text and URL to the Flask backend for AI analysis.
 */
async function runScan(text, url, callback) {
    try {
        // Ensure your Flask server is running on port 5000
        const response = await fetch("http://127.0.0.1:5000/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: url, text: text })
        });
        
        const data = await response.json();
        
        // Save the result so the popup can display it even if it's closed/reopened
        chrome.storage.local.set({ lastScan: data });
        if (callback) callback(data);
    } catch (err) {
        console.error("Fraud-Sentry: Backend connection error:", err);
        if (callback) {
            callback({
                status: "error",
                trust_score: 0,
                reason: "Cannot connect to FraudSentry server. Please ensure the backend is running.",
                action: "Check if Flask server is running on port 5000"
            });
        }
    }
}

// IMPORTANT: Remove any automatic scan on page load
// If you have code like this somewhere, DELETE IT:
// window.addEventListener('load', () => startFraudSentry());
// OR: startFraudSentry(); (at the bottom of the file)