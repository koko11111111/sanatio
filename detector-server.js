
const SERVER_URL = "https://kfokesfojefoef-sanatio-ai-server.hf.space/analyze";

async function analyzeWithServer(dataUrl) {
  const response = await fetch(SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${response.status}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  return {
    aiScore:     data.aiScore,
    realScore:   data.realScore,
    likelyLabel: data.likelyLabel,
  };
}

const PhotoAiModel = {
  async analyzeImage(dataUrl) {
    return await analyzeWithServer(dataUrl);
  },
  isReady() { return true; },
  async loadModel() { return true; },
  getMeta() {
    return { dataset: "ResNet18 via Hugging Face Spaces" };
  },
};
