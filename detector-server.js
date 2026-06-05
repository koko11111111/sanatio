

const SERVER_URL = "https://kfokesfojefoef-sanatio-ai-server.hf.space/api/analyze";

async function analyzeWithServer(dataUrl) {
  const response = await fetch(SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [dataUrl] }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Server error");
  }

  const result = await response.json();
  // HF Gradio API returns { data: [returnValue] }
  const data = result.data ? result.data[0] : result;
  return {
    aiScore:     data.aiScore     ?? data.ai_score     ?? 50,
    realScore:   data.realScore   ?? data.real_score   ?? 50,
    likelyLabel: data.likelyLabel ?? data.likely_label ?? "Unknown",
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
