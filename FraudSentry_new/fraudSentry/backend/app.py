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
# LOAD TRAFFIC DATA + HIGH VALUE BRANDS
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

                    # Protect top 1000 brands only
                    if count < 1000:
                        token = domain.split(".")[0]
                        if len(token) >= 3:
                            HIGH_VALUE_BRANDS.add(token)
                    count += 1

        print(f"[Traffic] Loaded {len(TOP_DOMAINS)} domains")
        print(f"[Brands] Protected {len(HIGH_VALUE_BRANDS)} high-value brands")

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
# DOMAIN AGE
# =====================================================

def get_domain_age_days(domain):
    try:
        w = whois.whois(domain)
        creation = w.creation_date
        if isinstance(creation, list):
            creation = creation[0]
        return (datetime.now() - creation).days
    except:
        return None

# =====================================================
# STRUCTURE + ECOSYSTEM DETECTION
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
# STRICT TYPOSQUATTING (Levenshtein)
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
# ROUTES
# =====================================================

@app.route('/')
def home():
    return "<h2>Fraud-Sentry Backend Running</h2><p><a href='/dashboard'>Open Dashboard</a></p>"

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

    if not url:
        return jsonify({"error": "Missing URL"}), 400

    parsed = urlparse(url)
    domain = parsed.netloc.lower().replace("www.", "")

    # LLM inference
    response = requests.post(
        INFERENCE_URL,
        json={"url": url, "text": text}
    )

    result = response.json()

    base_score = result.get("trust_score", 60)
    risk_category = result.get("risk_category", "unknown")

    piracy, streaming, risky_tld = analyze_structure(url)
    domain_age = get_domain_age_days(domain)

    typo_flag, matched_brand = is_typosquatting(domain)

    # =====================================================
    # STABLE WEIGHTED SCORING
    # =====================================================

    structure_score = 100
    if risky_tld:
        structure_score -= 15
    if piracy:
        structure_score -= 30
    if streaming:
        structure_score -= 25
    structure_score = max(0, structure_score)

    reputation_score = 100 if domain in TOP_DOMAINS else 50

    if domain_age:
        if domain_age > 1000:
            age_score = 100
        elif domain_age > 365:
            age_score = 80
        elif domain_age > 90:
            age_score = 60
        else:
            age_score = 40
    else:
        age_score = 50

    final_score = int(
        0.4 * base_score +
        0.3 * structure_score +
        0.2 * reputation_score +
        0.1 * age_score
    )

    final_score = max(0, min(100, final_score))

    # =====================================================
    # HIGH REPUTATION SHIELD (Fix LLM Hallucination)
    # =====================================================

    if domain in TOP_DOMAINS and not piracy and not streaming and not risky_tld:
        if risk_category in ["malware", "phishing"]:
            risk_category = "unknown"
            final_score = max(final_score, 75)

    # =====================================================
    # HARD OVERRIDES
    # =====================================================

    if typo_flag:
        status = "dangerous"
        final_score = min(final_score, 30)

    elif risk_category in ["phishing", "malware"] and domain not in TOP_DOMAINS:
        status = "dangerous"
        final_score = min(final_score, 35)

    elif (piracy or streaming) and risky_tld:
        status = "dangerous"
        final_score = min(final_score, 40)

    elif piracy or streaming:
        final_score = min(final_score, 65)
        status = "suspicious"

    else:
        if final_score < 45:
            status = "dangerous"
        elif final_score < 70:
            status = "suspicious"
        else:
            status = "safe"

    result["trust_score"] = final_score
    result["status"] = status
    result["method"] = "final-production-engine"

    save_to_db(url, status, final_score)

    return jsonify(result)

if __name__ == "__main__":
    app.run(port=5000, debug=True)
