const generateBtn = document.getElementById("generate-btn");
const statusMessage = document.getElementById("status-message");
const transcriptField = document.getElementById("transcript");

generateBtn.addEventListener("click", () => {
  if (!transcriptField.value.trim()) {
    statusMessage.textContent = "Paste a transcript first — AI processing isn't connected yet (that's Phase 2).";
  } else {
    statusMessage.textContent = "Got it! AI processing isn't connected yet — that's what we build in Phase 2.";
  }
  statusMessage.hidden = false;
});
