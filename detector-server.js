/**
 * SANATIO detector-server.js
 * Uses ResNet18 via Hugging Face Spaces
 */

const SERVER_URL = "https://kfokesfojefoef-sanatio-ai-server.hf.space/api/analyze";

async function analyzeWithServer(dataUrl) {
  const response = await fetch(SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [dataUrl] }),
  });

  if (!response.ok) throw new Error(`Server error ${response.status}`);

  const result = await response.json();
  
  // Gradio returns { data: [actual_result] }
  const data = result.data && result.data[0] ? result.data[0] : result;
  
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
    return { dataset: "AI Detector via Hugging Face Space" };
  },
};
