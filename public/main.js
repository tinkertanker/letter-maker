const form = document.getElementById('matrix-form');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submit-btn');
const nameInput = document.getElementById('name');
const emailUserIdInput = document.getElementById('emailUserId');

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type || '';
}

function clearStatus() {
  statusEl.textContent = '';
  statusEl.className = '';
}

async function handleSubmit(event) {
  event.preventDefault();
  clearStatus();

  const name = nameInput.value.trim();
  const emailUserId = emailUserIdInput.value.trim().toLowerCase();

  if (!name) {
    setStatus('Name cannot be empty, bro.', 'error');
    nameInput.focus();
    return;
  }

  const emailPattern = /^[a-z0-9._%+-]{1,64}$/;
  if (!emailPattern.test(emailUserId)) {
    setStatus('Email user ID must be alphanumeric and before the @, knn.', 'error');
    emailUserIdInput.focus();
    return;
  }

  submitBtn.disabled = true;
  setStatus('Warming up the matrix, please hold…');

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, emailUserId }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (parseError) {
      // ignore
    }

    if (!response.ok) {
      const errorMessage = payload?.error || 'Something went wrong while generating your PDF.';
      throw new Error(errorMessage);
    }

    const recipient = payload?.to || `${emailUserId}@tinkertanker.com`;
    setStatus(`PDF emailed to ${recipient}. Ho say bo!`, 'success');
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Unexpected error occurred.';
    setStatus(`Wah knn, ${message}`, 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

form.addEventListener('submit', handleSubmit);
