/**
 * SANATIO detector-server.js
 * Uses ResNet18 via Colab/ngrok server.
 * Update SERVER_URL each time you restart Colab.
 */

const SERVER_URL = "https://sacrifice-oboe-ruckus.ngrok-free.dev/analyze";

async function analyzeWithServer(dataUrl) {
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
    throw new Error(err.error || "Server error");
  }

  return await response.json();
}

const PhotoAiModel = {
  async analyzeImage(dataUrl) {
    return await analyzeWithServer(dataUrl);
  },
  isReady() { return true; },
  async loadModel() { return true; },
  getMeta() {
    return { dataset: "ResNet18 via Colab server" };
  },
};
