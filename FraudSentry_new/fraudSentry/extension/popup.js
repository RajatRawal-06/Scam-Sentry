document.addEventListener('DOMContentLoaded', () => {
    // 1. Element References
    const mainFrame = document.querySelector('.frame');
    const startView = document.getElementById('start-view');
    const resultView = document.getElementById('result-view');
    
    // Buttons
    const startScanBtn = document.getElementById('startScanBtn');
    const rescanBtn = document.getElementById('rescanBtn');
    const knowMoreBtn = document.getElementById('knowMoreBtn');

    // Result Elements
    const progressCircle = document.getElementById('progress-circle');
    const scoreText = document.getElementById('score-text');
    const statusValue = document.getElementById('status-value');
    const reasonText = document.getElementById('reason-text');

    const DASHBOARD_URL = "http://127.0.0.1:5000/dashboard";

    // Initialize: Start compact
    showStartView();

    // Event Listeners
    startScanBtn.addEventListener('click', (e) => performScan(e.currentTarget));
    rescanBtn.addEventListener('click', (e) => performScan(e.currentTarget));
    
    knowMoreBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: DASHBOARD_URL });
    });

    // --- VIEW SWITCHING & RESIZING LOGIC ---

    function showStartView() {
        // Resize Window -> Compact
        mainFrame.classList.remove('result-mode');
        mainFrame.classList.add('scan-mode');

        startView.style.display = 'block';
        resultView.style.display = 'none';
    }

    function showResultView() {
        // Resize Window -> Tall
        mainFrame.classList.remove('scan-mode');
        mainFrame.classList.add('result-mode');

        startView.style.display = 'none';
        resultView.style.display = 'block';
    }

    // --- SCAN LOGIC ---

    async function performScan(btnElement) {
        // 1. Button Animation
        const textEl = btnElement.querySelector('.div');
        const originalText = textEl ? textEl.innerText : "SCAN";
        if (textEl) textEl.innerText = "SCANNING...";

        // 2. Prepare Result Data (Reset)
        statusValue.innerText = "ANALYZING...";
        statusValue.style.color = "#fff";
        scoreText.innerText = "--";
        reasonText.innerText = "Analyzing page content...";
        progressCircle.style.background = `conic-gradient(#777 360deg, #333 0deg)`;

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // 3. Get Text
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.body.innerText.substring(0, 1500)
        }, async (results) => {
            
            if (!results || !results[0]) {
                if (textEl) textEl.innerText = originalText;
                handleError("Could not access page content.");
                return;
            }

            const pageText = results[0].result;

            // 4. Call Backend
            try {
                const response = await fetch('http://localhost:5000/check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: tab.url, text: pageText })
                });

                const data = await response.json();
                
                // 5. Update UI & Resize
                chrome.storage.local.set({ lastScan: data });
                
                if (textEl) textEl.innerText = originalText;
                
                showResultView(); // This triggers the resize to 500px
                updateResultUI(data);
                
                chrome.tabs.sendMessage(tab.id, { action: "applyUI", data: data });

            } catch (error) {
                console.error(error);
                if (textEl) textEl.innerText = originalText;
                handleError("Server Offline. Check localhost:5000");
            }
        });
    }

    function handleError(msg) {
        showResultView();
        statusValue.innerText = "ERROR";
        statusValue.style.color = "#e74c3c";
        reasonText.innerText = msg;
        scoreText.innerText = "!";
        progressCircle.style.background = `conic-gradient(#e74c3c 100%, #333 0deg)`;
    }

    function updateResultUI(res) {
        const score = res.trust_score || 0;
        const status = res.status || "suspicious";

        scoreText.innerText = `${score}%`;
        statusValue.innerText = status.toUpperCase();
        
        // --- UPDATED: Word Limit Logic for ~6 lines ---
        let reason = res.reason || "No specific reason provided.";
        if (reason.length > 280) {
            reason = reason.substring(0, 280) + "...";
        }
        reasonText.innerText = reason;
        // ----------------------------------------------

        // Colors
        let color = "#2ecc71"; // Green
        if (status === "dangerous") color = "#e74c3c"; // Red
        else if (status === "suspicious") color = "#f39c12"; // Orange

        statusValue.style.color = color;

        // Circle Gradient
        const degrees = score * 3.6;
        progressCircle.style.background = `conic-gradient(${color} ${degrees}deg, #333 0deg)`;
    }
});