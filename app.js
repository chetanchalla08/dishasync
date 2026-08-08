const generateBtn = document.getElementById("generate-btn");
const statusMessage = document.getElementById("status-message");
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

function fillList(listEl, items) {
  listEl.innerHTML = "";
  (items || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    listEl.appendChild(li);
  });
}

async function handleGenerate() {
  const transcript = transcriptField.value.trim();

  if (!transcript) {
    showStatus("Paste a transcript first.", true);
    resultsSection.hidden = true;
    return;
  }

  generateBtn.disabled = true;
  showStatus("Analyzing transcript...");
  resultsSection.hidden = true;

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        preferences: {
          tone: toneField.value,
          length: lengthField.value,
          formality: formalityField.value,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    summaryEl.textContent = data.summary || "";
    fillList(decisionsEl, data.decisions);
    fillList(actionsEl, data.actionItems);
    fillList(questionsEl, data.openQuestions);
    emailEl.value = data.followUpEmail || "";

    resultsSection.hidden = false;
    statusMessage.hidden = true;
  } catch (err) {
    showStatus(err.message, true);
  } finally {
    generateBtn.disabled = false;
  }
}

generateBtn.addEventListener("click", handleGenerate);
