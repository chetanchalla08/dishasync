const STORAGE_KEY = "dishasync_draft";
const PREFS_KEY = "dishasync_preferences";

const generateBtn = document.getElementById("generate-btn");
const regenerateBtn = document.getElementById("regenerate-btn");
const copyBtn = document.getElementById("copy-btn");
const saveBtn = document.getElementById("save-btn");

const statusMessage = document.getElementById("status-message");
const saveStatus = document.getElementById("save-status");

const transcriptField = document.getElementById("transcript");
const resultsSection = document.getElementById("results");
const meetingLinkField = document.getElementById("meeting-link");
const linkDetectionEl = document.getElementById("link-detection");
const transcriptFileInput = document.getElementById("transcript-file");

const outlookStatusEl = document.getElementById("outlook-status");
const outlookConnectBtn = document.getElementById("outlook-connect-btn");
const outlookDisconnectBtn = document.getElementById("outlook-disconnect-btn");
const outlookDraftBtn = document.getElementById("outlook-draft-btn");

const toneField = document.getElementById("tone");
const lengthField = document.getElementById("length");
const formalityField = document.getElementById("formality");

const summaryEl = document.getElementById("result-summary");
const decisionsEl = document.getElementById("result-decisions");
const actionsEl = document.getElementById("result-actions");
const questionsEl = document.getElementById("result-questions");
const emailEl = document.getElementById("result-email");

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.hidden = false;
  statusMessage.classList.toggle("error", isError);
}

function showSaveStatus(message) {
  saveStatus.textContent = message;
  saveStatus.hidden = false;
}

function fillList(listEl, items) {
  listEl.innerHTML = "";
  (items || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    listEl.appendChild(li);
  });
}

function getPreferences() {
  return {
    tone: toneField.value,
    length: lengthField.value,
    formality: formalityField.value,
  };
}

function savePreferences() {
  localStorage.setItem(PREFS_KEY, JSON.stringify(getPreferences()));
}

function restorePreferences() {
  const raw = localStorage.getItem(PREFS_KEY);
  if (!raw) return;

  let prefs;
  try {
    prefs = JSON.parse(raw);
  } catch {
    return;
  }

  toneField.value = prefs.tone || toneField.value;
  lengthField.value = prefs.length || lengthField.value;
  formalityField.value = prefs.formality || formalityField.value;
}

function detectPlatform(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (hostname.includes("zoom.us")) return "Zoom";
  if (hostname.includes("meet.google.com")) return "Google Meet";
  if (hostname.includes("teams.microsoft.com") || hostname.includes("teams.live.com")) return "Microsoft Teams";
  return "unrecognized";
}

function handleLinkInput() {
  const url = meetingLinkField.value.trim();

  if (!url) {
    linkDetectionEl.hidden = true;
    return;
  }

  const platform = detectPlatform(url);

  if (platform === null) {
    linkDetectionEl.textContent = "That doesn't look like a valid link — it'll still be saved as text.";
  } else if (platform === "unrecognized") {
    linkDetectionEl.textContent = "Link saved, but we don't recognize this platform yet.";
  } else {
    linkDetectionEl.textContent = `Detected: ${platform} link.`;
  }
  linkDetectionEl.hidden = false;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_FILE_EXTENSIONS = [".txt", ".md"];

function handleFileUpload() {
  const file = transcriptFileInput.files[0];
  if (!file) return;

  const hasAllowedExtension = ALLOWED_FILE_EXTENSIONS.some((ext) =>
    file.name.toLowerCase().endsWith(ext)
  );

  if (!hasAllowedExtension) {
    showStatus("Please upload a .txt or .md file — other formats aren't supported yet.", true);
    transcriptFileInput.value = "";
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    showStatus("That file is too large (max 2MB).", true);
    transcriptFileInput.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    transcriptField.value = reader.result;
    showStatus(`Loaded "${file.name}" (${reader.result.length.toLocaleString()} characters) into the transcript box.`);
  };

  reader.onerror = () => {
    showStatus("Couldn't read that file — try pasting the transcript instead.", true);
  };

  reader.readAsText(file);
  transcriptFileInput.value = "";
}

async function refreshOutlookStatus() {
  try {
    const response = await fetch("/api/auth/status");
    const status = await response.json();

    if (!status.configured) {
      outlookStatusEl.textContent = "Outlook integration isn't set up yet.";
      outlookConnectBtn.hidden = true;
      outlookDisconnectBtn.hidden = true;
      outlookDraftBtn.hidden = true;
      return;
    }

    if (status.signedIn) {
      outlookStatusEl.textContent = `Connected as ${status.account}.`;
      outlookConnectBtn.hidden = true;
      outlookDisconnectBtn.hidden = false;
      outlookDraftBtn.hidden = false;
    } else {
      outlookStatusEl.textContent = "Not connected.";
      outlookConnectBtn.hidden = false;
      outlookDisconnectBtn.hidden = true;
      outlookDraftBtn.hidden = true;
    }
  } catch {
    outlookStatusEl.textContent = "Couldn't check Outlook connection status.";
  }
}

async function handleDisconnectOutlook() {
  await fetch("/auth/logout");
  refreshOutlookStatus();
}

async function handleCreateOutlookDraft() {
  outlookDraftBtn.disabled = true;
  showSaveStatus("Creating draft in Outlook...");

  try {
    const response = await fetch("/api/create-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailEl.value }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    showSaveStatus("Draft created in your Outlook Drafts folder.");
  } catch (err) {
    showSaveStatus(err.message);
  } finally {
    outlookDraftBtn.disabled = false;
  }
}

function applyResults(data) {
  summaryEl.textContent = data.summary || "";
  fillList(decisionsEl, data.decisions);
  fillList(actionsEl, data.actionItems);
  fillList(questionsEl, data.openQuestions);
  emailEl.value = data.followUpEmail || "";
  resultsSection.hidden = false;
}

async function handleGenerate() {
  const transcript = transcriptField.value.trim();

  if (!transcript) {
    showStatus("Paste a transcript first.", true);
    resultsSection.hidden = true;
    return;
  }

  generateBtn.disabled = true;
  regenerateBtn.disabled = true;
  saveStatus.hidden = true;
  showStatus("Analyzing transcript...");

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, preferences: getPreferences() }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    applyResults(data);
    statusMessage.hidden = true;
  } catch (err) {
    showStatus(err.message, true);
  } finally {
    generateBtn.disabled = false;
    regenerateBtn.disabled = false;
  }
}

function handleCopy() {
  navigator.clipboard
    .writeText(emailEl.value)
    .then(() => showSaveStatus("Email copied to clipboard."))
    .catch(() => showSaveStatus("Couldn't copy — select and copy the text manually."));
}

function handleSave() {
  const draft = {
    savedAt: new Date().toISOString(),
    transcript: transcriptField.value,
    meetingLink: meetingLinkField.value,
    preferences: getPreferences(),
    results: {
      summary: summaryEl.textContent,
      decisions: Array.from(decisionsEl.querySelectorAll("li")).map((li) => li.textContent),
      actionItems: Array.from(actionsEl.querySelectorAll("li")).map((li) => li.textContent),
      openQuestions: Array.from(questionsEl.querySelectorAll("li")).map((li) => li.textContent),
      followUpEmail: emailEl.value,
    },
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  showSaveStatus(`Draft saved locally at ${new Date(draft.savedAt).toLocaleTimeString()}.`);
}

function restoreSavedDraft() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  let draft;
  try {
    draft = JSON.parse(raw);
  } catch {
    return;
  }

  transcriptField.value = draft.transcript || "";
  meetingLinkField.value = draft.meetingLink || "";
  if (draft.preferences) {
    toneField.value = draft.preferences.tone || toneField.value;
    lengthField.value = draft.preferences.length || lengthField.value;
    formalityField.value = draft.preferences.formality || formalityField.value;
  }
  if (draft.results) {
    applyResults(draft.results);
  }

  showSaveStatus(`Restored your draft saved at ${new Date(draft.savedAt).toLocaleString()}.`);
}

generateBtn.addEventListener("click", handleGenerate);
regenerateBtn.addEventListener("click", handleGenerate);
copyBtn.addEventListener("click", handleCopy);
saveBtn.addEventListener("click", handleSave);

toneField.addEventListener("change", savePreferences);
lengthField.addEventListener("change", savePreferences);
formalityField.addEventListener("change", savePreferences);

meetingLinkField.addEventListener("input", handleLinkInput);
transcriptFileInput.addEventListener("change", handleFileUpload);

outlookDisconnectBtn.addEventListener("click", handleDisconnectOutlook);
outlookDraftBtn.addEventListener("click", handleCreateOutlookDraft);

restorePreferences();
restoreSavedDraft();
handleLinkInput();
refreshOutlookStatus();
