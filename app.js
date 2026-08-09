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
    meetingLink: document.getElementById("meeting-link").value,
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
  document.getElementById("meeting-link").value = draft.meetingLink || "";
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

restorePreferences();
restoreSavedDraft();
