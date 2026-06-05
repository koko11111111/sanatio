/**
 * SANATIO detector-server.js
 * Uses ResNet18 via Hugging Face Spaces (Gradio 5)
 */

const HF_SPACE = "https://kfokesfojefoef-sanatio-ai-server.hf.space";

async function analyzeWithServer(dataUrl) {
  // Use Gradio's /run/predict endpoint (works on both Gradio 4 and 5)
  const response = await fetch(`${HF_SPACE}/run/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fn_index: 1,
      data: [dataUrl],
    }),
  });

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }

  const result = await response.json();
  const output = result.data?.[0];

  if (!output) throw new Error("No output from server");
  if (output.error) throw new Error(output.error);

  return {
    aiScore:     output.aiScore     ?? 50,
    realScore:   output.realScore   ?? 50,
    likelyLabel: output.likelyLabel ?? "Unknown",
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
