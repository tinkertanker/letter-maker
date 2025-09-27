const form = document.getElementById("letter-form");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submit-btn");
const nameInput = document.getElementById("name");
const emailUserIdInput = document.getElementById("emailUserId");

const statusVariants = {
  info: "primary",
  success: "success",
  error: "danger"
};

function showStatus(message, tone = "info") {
  if (!statusEl) return;
  statusEl.variant = statusVariants[tone] ?? "neutral";
  statusEl.textContent = message;
  statusEl.open = true;
}

function clearStatus() {
  if (!statusEl) return;
  statusEl.open = false;
  statusEl.textContent = "";
  statusEl.variant = "neutral";
}

function toggleLoading(isLoading) {
  if (!submitBtn) return;
  submitBtn.disabled = isLoading;
  if ("loading" in submitBtn) {
    submitBtn.loading = isLoading;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  clearStatus();

  const name = nameInput?.value.trim() ?? "";
  const emailUserId = emailUserIdInput?.value.trim().toLowerCase() ?? "";

  if (!name) {
    showStatus("Please enter a name.", "error");
    nameInput?.focus({ preventScroll: true });
    return;
  }

  const emailPattern = /^[a-z0-9._%+-]{1,64}$/;
  if (!emailPattern.test(emailUserId)) {
    showStatus(
      "Please provide a valid email user ID (letters, numbers, and . _ % + - are allowed).",
      "error"
    );
    emailUserIdInput?.focus({ preventScroll: true });
    return;
  }

  toggleLoading(true);
  showStatus("Preparing your document…", "info");

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, emailUserId })
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (parseError) {
      // Ignore JSON parse issues so we can fall back to generic errors.
    }

    if (!response.ok) {
      const errorMessage =
        payload?.error ||
        "Something went wrong while generating your document.";
      throw new Error(errorMessage);
    }

    const recipient = payload?.to || `${emailUserId}@tinkertanker.com`;
    showStatus(`Your document is on its way to ${recipient}.`, "success");
    form.reset();
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    showStatus(message, "error");
  } finally {
    toggleLoading(false);
  }
}

form?.addEventListener("submit", handleSubmit);
