

const SERVER_URL = "https://kfokesfojefoef-sanatio-ai-server.hf.space/api/analyze";

async function analyzeWithServer(dataUrl) {
  const response = await fetch(SERVER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: [dataUrl] }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Server error");
  }

  const result = await response.json();
  // Gradio returns { data: [actual_result] }
  return result.data && result.data[0] ? result.data[0] : result;
}

const PhotoAiModel = {
  async analyzeImage(dataUrl) {
    return await analyzeWithServer(dataUrl);
  },
  isReady() { return true; },
  async loadModel() { return true; },
  getMeta() {
    return { dataset: "AI Detector via Hugging Face Space" };
  },
};
