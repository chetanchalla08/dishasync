import json
import os
import secrets

import google.generativeai as genai
import msal
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, request, send_from_directory, session

load_dotenv()

API_KEY = os.environ.get("GEMINI_API_KEY")
MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")

if not API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is not set. Copy .env.example to .env and add your key."
    )

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel(MODEL_NAME)

MS_CLIENT_ID = os.environ.get("MS_CLIENT_ID")
MS_CLIENT_SECRET = os.environ.get("MS_CLIENT_SECRET")
MS_REDIRECT_URI = os.environ.get("MS_REDIRECT_URI", "http://localhost:5050/auth/callback")
MS_AUTHORITY = "https://login.microsoftonline.com/consumers"
MS_SCOPES = ["Mail.ReadWrite"]
MS_CONFIGURED = bool(MS_CLIENT_ID and MS_CLIENT_SECRET)

app = Flask(__name__, static_folder=".", static_url_path="")
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32)


def get_msal_app():
    return msal.ConfidentialClientApplication(
        MS_CLIENT_ID,
        authority=MS_AUTHORITY,
        client_credential=MS_CLIENT_SECRET,
    )

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


@app.route("/auth/login")
def auth_login():
    if not MS_CONFIGURED:
        return "Outlook integration isn't configured yet.", 503

    auth_url = get_msal_app().get_authorization_request_url(
        MS_SCOPES,
        redirect_uri=MS_REDIRECT_URI,
    )
    return redirect(auth_url)


@app.route("/auth/callback")
def auth_callback():
    code = request.args.get("code")
    if not code:
        return "Sign-in was cancelled or failed.", 400

    result = get_msal_app().acquire_token_by_authorization_code(
        code,
        scopes=MS_SCOPES,
        redirect_uri=MS_REDIRECT_URI,
    )

    if "access_token" not in result:
        return f"Sign-in failed: {result.get('error_description', 'unknown error')}", 400

    session["ms_access_token"] = result["access_token"]
    session["ms_account"] = result.get("id_token_claims", {}).get(
        "preferred_username", "your Microsoft account"
    )

    return redirect("/")


@app.route("/auth/logout")
def auth_logout():
    session.pop("ms_access_token", None)
    session.pop("ms_account", None)
    return redirect("/")


@app.route("/api/auth/status")
def auth_status():
    return jsonify({
        "configured": MS_CONFIGURED,
        "signedIn": "ms_access_token" in session,
        "account": session.get("ms_account"),
    })


@app.route("/api/create-draft", methods=["POST"])
def create_draft():
    access_token = session.get("ms_access_token")
    if not access_token:
        return jsonify({"error": "Not signed in to Outlook."}), 401

    data = request.get_json(force=True, silent=True) or {}
    email_text = (data.get("email") or "").strip()
    if not email_text:
        return jsonify({"error": "No email content to draft."}), 400

    lines = email_text.split("\n")
    if lines[0].lower().startswith("subject:"):
        subject = lines[0][len("subject:"):].strip() or "Follow-up"
        body_text = "\n".join(lines[1:]).strip()
    else:
        subject = "Follow-up"
        body_text = email_text

    graph_response = requests.post(
        "https://graph.microsoft.com/v1.0/me/messages",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json={
            "subject": subject,
            "body": {"contentType": "Text", "content": body_text},
        },
        timeout=15,
    )

    if graph_response.status_code >= 400:
        return jsonify({"error": f"Outlook draft creation failed: {graph_response.text}"}), 502

    return jsonify({"success": True})


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


if __name__ == "__main__":
    app.run(port=int(os.environ.get("PORT", 5050)), debug=True)
