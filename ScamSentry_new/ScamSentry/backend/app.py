from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import sqlite3
import requests
import csv
import whois
from urllib.parse import urlparse
from datetime import datetime
import os
import Levenshtein

app = Flask(__name__)
CORS(app)

INFERENCE_URL = "http://localhost:5001/infer"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "stats.db")
TOP_LIST_PATH = os.path.join(BASE_DIR, "top-1m.csv")

# =====================================================
# CACHES
# =====================================================

SCAN_CACHE = {}
AGE_CACHE = {}

# =====================================================
# LOAD TRAFFIC DATA
# =====================================================

TOP_DOMAINS = set()
HIGH_VALUE_BRANDS = set()

def load_top_domains():
    try:
        with open(TOP_LIST_PATH, newline='', encoding="utf-8") as f:
            reader = csv.reader(f)
            count = 0
            for row in reader:
                if len(row) > 1:
                    domain = row[1].strip().lower()
                    TOP_DOMAINS.add(domain)

                    if count < 1000:
                        token = domain.split(".")[0]
                        if len(token) >= 3:
                            HIGH_VALUE_BRANDS.add(token)
                    count += 1

        print(f"[Traffic] Loaded {len(TOP_DOMAINS)} domains")
        print(f"[Brands] Protected {len(HIGH_VALUE_BRANDS)} brands")

    except Exception as e:
        print("Traffic load error:", e)

load_top_domains()

# =====================================================
# DATABASE
# =====================================================

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT,
            is_scam INTEGER,
            score INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

init_db()

def save_to_db(url, status, score):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    is_scam = 1 if status != "safe" else 0
    cursor.execute(
        "INSERT INTO scans (url, is_scam, score) VALUES (?, ?, ?)",
        (url, is_scam, score)
    )
    conn.commit()
    conn.close()

# =====================================================
# DOMAIN AGE (CACHED)
# =====================================================

def get_domain_age_days(domain):
    if domain in AGE_CACHE:
        return AGE_CACHE[domain]

    try:
        w = whois.whois(domain)
        creation = w.creation_date
        if isinstance(creation, list):
            creation = creation[0]
        age = (datetime.now() - creation).days
        AGE_CACHE[domain] = age
        return age
    except:
        AGE_CACHE[domain] = None
        return None

# =====================================================
# STRUCTURE DETECTION
# =====================================================

PIRACY_KEYWORDS = ["repack", "fitgirl", "torrent", "crack", "warez", "patch"]
STREAMING_KEYWORDS = ["flix", "stream", "movies", "watchfree", "hd"]
RISKY_TLDS = [".xyz", ".top", ".site", ".icu", ".online"]
SENSITIVE_WORDS = ["bank", "login", "secure", "verify", "account"]

def analyze_structure(url):
    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    path = parsed.path.lower()

    piracy = any(word in domain or word in path for word in PIRACY_KEYWORDS)
    streaming = any(word in domain or word in path for word in STREAMING_KEYWORDS)
    risky_tld = any(domain.endswith(tld) for tld in RISKY_TLDS)

    return piracy, streaming, risky_tld

# =====================================================
# TYPOSQUATTING (STRICT LEVENSHTEIN)
# =====================================================

def is_typosquatting(domain):

    if domain in TOP_DOMAINS:
        return False, None

    root = domain.split(".")[0]

    for brand in HIGH_VALUE_BRANDS:
        if abs(len(root) - len(brand)) <= 1:
            distance = Levenshtein.distance(root, brand)

            if distance == 1 and root != brand:
                if any(word in domain for word in SENSITIVE_WORDS):
                    return True, brand

    return False, None

# =====================================================
# HELPER: BASE DOMAIN EXTRACTION
# =====================================================

def get_base_domain(domain):
    parts = domain.split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return domain

# =====================================================
# ROUTES
# =====================================================

@app.route('/dashboard')
def dashboard():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM scans")
    total_scans = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM scans WHERE is_scam = 1")
    scams_found = cursor.fetchone()[0]

    cursor.execute("""
        SELECT url, is_scam, score, timestamp
        FROM scans
        ORDER BY timestamp DESC
        LIMIT 10
    """)
    recent_scans = cursor.fetchall()

    conn.close()

    return render_template(
        "dashboard.html",
        total=total_scans,
        scams=scams_found,
        recent=recent_scans
    )

@app.route('/check', methods=['POST'])
def check():

    data = request.json
    url = data.get("url")
    text = data.get("text", "")
    llm_score = data.get("llm_score")
    llm_category = data.get("llm_category")
    llm_reason = data.get("llm_reason")

    if not url:
        return jsonify({"error": "Missing URL"}), 400

    parsed = urlparse(url)
    domain = parsed.netloc.lower().replace("www.", "")
    base_domain = get_base_domain(domain)

    # CACHE RETURN
    if domain in SCAN_CACHE:
        return jsonify(SCAN_CACHE[domain])

    piracy, streaming, risky_tld = analyze_structure(url)
    typo_flag, _ = is_typosquatting(domain)
    domain_age = get_domain_age_days(domain)

    # =====================================================
    # REPUTATION FIX (BASE DOMAIN CHECK)
    # =====================================================

    if domain in TOP_DOMAINS:
        reputation_score = 100
    elif base_domain in TOP_DOMAINS:
        reputation_score = 90
    else:
        reputation_score = 50

    # =====================================================
    # STRUCTURE SCORE
    # =====================================================

    structure_score = 100
    if risky_tld:
        structure_score -= 15
    if piracy:
        structure_score -= 30
    if streaming:
        structure_score -= 25
    structure_score = max(0, structure_score)

    # =====================================================
    # AGE SCORE
    # =====================================================

    if domain_age:
        if domain_age > 1000:
            age_score = 100
        elif domain_age > 365:
            age_score = 85
        elif domain_age > 90:
            age_score = 65
        else:
            age_score = 40
    else:
        age_score = 50

    # =====================================================
    # SMART LLM SKIP LOGIC
    # =====================================================

    skip_llm = (
        domain in TOP_DOMAINS
        or base_domain in TOP_DOMAINS
        or piracy
        or streaming
        or typo_flag
        or (domain_age and domain_age > 365)
    )

    base_score = 70
    risk_category = "unknown"

    if llm_score is not None:
        base_score = llm_score
        risk_category = llm_category or "unknown"
    else:
        base_score = 70
        risk_category = "unknown"

    # =====================================================
    # FINAL SCORE
    # =====================================================

    final_score = int(
        0.4 * base_score +
        0.3 * structure_score +
        0.2 * reputation_score +
        0.1 * age_score
    )

    final_score = max(0, min(100, final_score))

    # =====================================================
    # HARD OVERRIDES
    # =====================================================

    if typo_flag:
        status = "dangerous"
        final_score = min(final_score, 30)

    elif (piracy or streaming) and risky_tld:
        status = "dangerous"
        final_score = min(final_score, 40)

    elif piracy or streaming:
        status = "suspicious"
        final_score = min(final_score, 65)

    elif risk_category in ["phishing", "malware"] and reputation_score < 90:
        status = "dangerous"
        final_score = min(final_score, 35)

    else:
        if final_score < 45:
            status = "dangerous"
        elif final_score < 70:
            status = "suspicious"
        else:
            status = "safe"

    result = {
        "trust_score": final_score,
        "status": status,
        "reason": llm_reason if llm_reason else "No specific reason provided.",
        "method": "stable-production-engine"
    }

    SCAN_CACHE[domain] = result
    save_to_db(url, status, final_score)

    return jsonify(result)

if __name__ == "__main__":
    app.run(port=5000, debug=True)
