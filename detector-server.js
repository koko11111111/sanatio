/**
 * SANATIO detector-server.js
 * Uses ResNet18 via Hugging Face Spaces (Gradio 5 API format)
 */

const HF_SPACE = "https://kfokesfojefoef-sanatio-ai-server.hf.space";

async function analyzeWithServer(dataUrl) {
  // Step 1: queue the job
  const queueRes = await fetch(`${HF_SPACE}/queue/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [dataUrl],
      fn_index: 1,  // analyze_base64 is the second function
      session_hash: Math.random().toString(36).slice(2),
    }),
  });

  if (!queueRes.ok) throw new Error("Could not reach HF Space");

  const { event_id } = await queueRes.json();

  // Step 2: poll for result
  return new Promise((resolve, reject) => {
    const es = new EventSource(`${HF_SPACE}/queue/data?session_hash=${event_id}`);
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.msg === "process_completed") {
        es.close();
        const output = msg.output?.data?.[0];
        if (!output) return reject(new Error("No output from server"));
        resolve({
          aiScore:     output.aiScore     ?? 50,
          realScore:   output.realScore   ?? 50,
          likelyLabel: output.likelyLabel ?? "Unknown",
        });
      } else if (msg.msg === "process_errored") {
        es.close();
        reject(new Error(msg.output?.error || "Server error"));
      }
    };
    es.onerror = () => { es.close(); reject(new Error("Connection lost")); };
    setTimeout(() => { es.close(); reject(new Error("Timeout")); }, 30000);
  });
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
