/**
 * SANATIO detector-server.js
 * Replaces photo-model.js inference — calls the local Python server instead.
 * Make sure server.py (start-server.bat) is running before using the website.
 */

const SERVER_URL = "http://localhost:5050/analyze";

async function analyzeWithServer(dataUrl) {
  const response = await fetch(SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Server error — is the server running?");
  }

  return await response.json();
  // Returns: { aiScore, realScore, likelyLabel }
}

// Override PhotoAiModel.analyzeImage to use the server
const PhotoAiModel = {
  async analyzeImage(dataUrl) {
    return await analyzeWithServer(dataUrl);
  },
  isReady() { return true; },
  async loadModel() { return true; },
  getMeta() {
    return {
      dataset: "ResNet18 (trained by your team)",
      note: "Running via local Python server",
    };
  },
};
