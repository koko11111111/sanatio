/**
 * SANATIO detector-server.js
 * Points to the live Render server instead of localhost.
 * Replace YOUR_RENDER_URL with your actual Render URL after deploying.
 */

const SERVER_URL = "https://YOUR_RENDER_URL.onrender.com/analyze";

async function analyzeWithServer(dataUrl) {
  const response = await fetch(SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    return { dataset: "ResNet18 — deployed on Render" };
  },
};
