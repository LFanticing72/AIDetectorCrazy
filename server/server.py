import os
import re
import base64
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

app = Flask(__name__)
CORS(app)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

MODEL        = os.getenv("OPENAI_MODEL", "gpt-5.4")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
REPO         = os.getenv("GITHUB_REPO", "LFanticing72/helf")
BRANCH       = os.getenv("GITHUB_BRANCH", "main")

def strip_comments(text: str) -> str:
    # Remove Python # comments
    text = re.sub(r'(?m)^\s*#.*\n?', '', text)
    text = re.sub(r'\s+#[^\'\"]+$', '', text, flags=re.MULTILINE)
    # Remove docstrings
    text = re.sub(r'(\"\"\"[\s\S]*?\"\"\"|\'\'\'[\s\S]*?\'\'\')', '', text)
    # Remove lines like "Here is...", "This function...", "Note:" etc.
    text = re.sub(r'(?mi)^(here is|this (code|function|script|snippet)|note:|explanation:|output:).*\n?', '', text)
    # Strip markdown code fences
    text = re.sub(r'```\w*\n?', '', text)
    return text.strip()


SYSTEM_PROMPT = (
    "You are a coding assistant. "
    "NEVER add comments to code. No inline comments, no docstrings, no explanatory text before or after code blocks. "
    "Output only raw code unless explicitly asked for explanation. "
    "Do not say things like 'Here is the code' or 'This function does X'. "
    "Just output the code directly."
)
MAX_HISTORY   = 20

# ── MongoDB ───────────────────────────────────────────────────────────────────

_mongo = MongoClient(os.getenv("MONGODB_URL"))
_db    = _mongo[os.getenv("MONGODB_DB", "tumour_detector")]
_col   = _db["chat_history"]

CONV_ID = "main"  # single conversation document

def load_history() -> list:
    doc = _col.find_one({"_id": CONV_ID})
    return doc["messages"] if doc else []

def save_history(messages: list):
    _col.replace_one({"_id": CONV_ID}, {"_id": CONV_ID, "messages": messages}, upsert=True)

def api_messages(full: list) -> list:
    system = [m for m in full if m["role"] == "system"]
    rest   = [m for m in full if m["role"] != "system"]
    return system + rest[-MAX_HISTORY:]


# ── GitHub ────────────────────────────────────────────────────────────────────

BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
COUNTER_FILE = os.path.join(BASE_DIR, "counter.txt")

def get_next_number() -> int:
    if not os.path.exists(COUNTER_FILE):
        with open(COUNTER_FILE, "w") as f:
            f.write("1")
        return 1
    with open(COUNTER_FILE) as f:
        num = int(f.read().strip())
    with open(COUNTER_FILE, "w") as f:
        f.write(str(num + 1))
    return num

def upload_to_github(content: str, github_path: str):
    encoded = base64.b64encode(content.encode()).decode()
    url  = f"https://api.github.com/repos/{REPO}/contents/{github_path}"
    resp = requests.put(
        url,
        json={"message": f"Add {github_path}", "content": encoded, "branch": BRANCH},
        headers={"Authorization": f"token {GITHUB_TOKEN}", "Accept": "application/vnd.github+json"},
    )
    return resp.status_code, resp.json()


# ── routes ────────────────────────────────────────────────────────────────────

@app.route("/chat", methods=["POST"])
def chat():
    prompt = request.get_json().get("prompt", "")

    full = load_history()
    if not full:
        full.append({"role": "system", "content": SYSTEM_PROMPT})

    prompt_with_reminder = prompt + "\n\n[No comments in code. No explanatory text. Raw code only.]"
    to_send  = api_messages(full) + [{"role": "user", "content": prompt_with_reminder}]
    response = client.chat.completions.create(model=MODEL, messages=to_send)
    reply    = strip_comments(response.choices[0].message.content)

    full.append({"role": "user",      "content": prompt})
    full.append({"role": "assistant", "content": reply})
    save_history(full)

    return jsonify({"response": reply})


@app.route("/upload-image", methods=["POST"])
def upload_image():
    if not request.files:
        return jsonify({"error": "No file uploaded"}), 400

    img      = next(iter(request.files.values()))
    img_b64  = base64.b64encode(img.read()).decode()
    ext      = os.path.splitext(img.filename or "")[1].lower()
    mime     = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
                ".gif": "image/gif",  ".webp": "image/webp"}.get(ext, "image/jpeg")

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": [
                {"type": "text", "text": (
                    "Extract all text from this image. "
                    "Restore diacritics, fix spacing and formatting, "
                    "and rebuild the document structure without changing meaning."
                )},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_b64}"}},
            ]}],
        )
        cleaned_text = resp.choices[0].message.content
    except Exception as e:
        return jsonify({"error": f"GPT vision failed: {e}"}), 500

    count      = get_next_number()
    gh_status, gh_resp = upload_to_github(cleaned_text, f"image{count}_cleaned.txt")

    full = load_history()
    if not full:
        full.append({"role": "system", "content": SYSTEM_PROMPT})
    full.append({"role": "user", "content": f"[OCR image{count}]\n{cleaned_text}"})
    save_history(full)

    return jsonify({
        "status": "ok",
        "saved_as": f"image{count}",
        "cleaned_text": cleaned_text,
        "github_status": gh_status,
        "github_response": gh_resp,
    })


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
