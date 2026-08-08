import json
import os

import google.generativeai as genai
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

load_dotenv()

API_KEY = os.environ.get("GEMINI_API_KEY")
MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")

if not API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is not set. Copy .env.example to .env and add your key."
    )

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel(MODEL_NAME)

app = Flask(__name__, static_folder=".", static_url_path="")

PROMPT_TEMPLATE = """You are an assistant that analyzes workplace meeting transcripts.

Given the transcript below, produce a JSON object with exactly these fields:
- "summary": a concise summary of the meeting (2-4 sentences)
- "decisions": an array of strings, each a decision that was made
- "actionItems": an array of strings, each an action item (include the owner if the transcript names one)
- "openQuestions": an array of strings, each an unresolved question raised in the meeting
- "followUpEmail": a follow-up email draft addressed to the meeting attendees, written in a {tone} tone, {formality} formality, and {length} length

If a category has nothing to report, use an empty array for it.

Transcript:
{transcript}

Respond with ONLY the JSON object, no extra text or markdown formatting.
"""


@app.route("/api/analyze", methods=["POST"])
def analyze():
    data = request.get_json(force=True, silent=True) or {}
    transcript = (data.get("transcript") or "").strip()
    preferences = data.get("preferences") or {}

    if not transcript:
        return jsonify({"error": "Transcript is required."}), 400

    prompt = PROMPT_TEMPLATE.format(
        tone=preferences.get("tone", "professional"),
        formality=preferences.get("formality", "neutral"),
        length=preferences.get("length", "medium"),
        transcript=transcript,
    )

    try:
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"},
        )
    except Exception as exc:  # AI call failed (bad key, rate limit, network, etc.)
        return jsonify({"error": f"AI request failed: {exc}"}), 502

    try:
        result = json.loads(response.text)
    except (ValueError, AttributeError):
        return jsonify({"error": "The AI response could not be parsed. Please try again."}), 502

    return jsonify(result)


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


if __name__ == "__main__":
    app.run(port=int(os.environ.get("PORT", 5000)), debug=True)
