/**
 * SANATIO detector-server.js
 * Uses ResNet18 via Hugging Face Spaces
 */

const HF_SPACE = "https://kfokesfojefoef-sanatio-ai-server.hf.space";

async function analyzeWithServer(dataUrl) {
  const response = await fetch(`${HF_SPACE}/run/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fn_index: 0,
      data: [dataUrl],
    }),
  });

  if (!response.ok) throw new Error(`Server error ${response.status}`);

  const result = await response.json();
  const jsonStr = result.data?.[0];
  if (!jsonStr) throw new Error("No output from server");

  const data = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
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
