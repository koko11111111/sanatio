// ── AI detection server URL ────────────────────────────────────────────────
// Paste your Hugging Face Space URL here.
// Format: https://YOUR-USERNAME-sanatio-ai-detector.hf.space/analyze
//
// How to find it:
//   1. Go to your Space on huggingface.co
//   2. Click the three dots (⋮) → "Embed this Space"
//   3. Copy the "Direct URL" and add /analyze at the end
//
// Example:
//   const SERVER_URL = "https://johndoe-sanatio-ai-detector.hf.space/analyze";

const SERVER_URL = ""; // <-- paste your HF Space URL here

async function analyzeWithServer(dataUrl) {
  if (!SERVER_URL) {
    throw new Error(
      "AI server not configured. Open detector-server.js and set SERVER_URL to your running server endpoint."
    );
  }

  const response = await fetch(SERVER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "69420",
    },
    body: JSON.stringify({ image: dataUrl }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error (HTTP ${response.status})`);
  }

  return await response.json();
}

const PhotoAiModel = {
  async analyzeImage(dataUrl) {
    return await analyzeWithServer(dataUrl);
  },
  isReady() {
    return Boolean(SERVER_URL);
  },
  async loadModel() {
    return Boolean(SERVER_URL);
  },
  getMeta() {
    return { dataset: "ResNet18 via Python server", serverUrl: SERVER_URL || "(not set)" };
  },
};
