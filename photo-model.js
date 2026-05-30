/**
 * SANATIO photo-model.js v2
 * Browser inference for AI vs real photo classifier.
 * Model file: assets/model/ai-detector.json (created by train-model.bat)
 *
 * Changes from v1:
 *  - Threshold now 50% (model v2 is properly calibrated, no need to adjust)
 *  - Added model version check and warning for old v1 models
 *  - Feature extraction matches train_model.py exactly
 *  - Better error messages
 */
const PhotoAiModel = (function () {
  const MODEL_URL = "assets/model/ai-detector.json";
  let model = null;
  let loadPromise = null;

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  // ── Feature extraction (must match train_model.py exactly) ──────────────

  function extractFeaturesFromImageData(data, width, height) {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas not supported");

    const temp = document.createElement("canvas");
    temp.width = width;
    temp.height = height;
    const tctx = temp.getContext("2d");
    tctx.putImageData(new ImageData(data, width, height), 0, 0);
    ctx.drawImage(temp, 0, 0, size, size);

    const img = ctx.getImageData(0, 0, size, size).data;
    const features = [];

    // Per-channel stats: mean, std, q25, q75
    for (let c = 0; c < 3; c += 1) {
      const values = [];
      for (let i = c; i < img.length; i += 4) {
        values.push(img[i] / 255);
      }
      values.sort((a, b) => a - b);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);
      const q25 = values[Math.floor(values.length * 0.25)];
      const q75 = values[Math.floor(values.length * 0.75)];
      features.push(mean, std, q25, q75);
    }

    // Grayscale histogram (16 bins)
    const gray = [];
    for (let i = 0; i < img.length; i += 4) {
      gray.push((img[i] + img[i + 1] + img[i + 2]) / (3 * 255));
    }
    const bins = 16;
    const hist = new Array(bins).fill(0);
    gray.forEach((v) => {
      const idx = Math.min(bins - 1, Math.floor(v * bins));
      hist[idx] += 1;
    });
    const histSum = hist.reduce((s, v) => s + v, 0) || 1;
    hist.forEach((v) => features.push(v / histSum));

    // Gradient stats: mean, std, p90
    const grad = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = y * size + x;
        const left = gray[i];
        const right = x > 0 ? gray[y * size + (x - 1)] : left;
        const up = y > 0 ? gray[(y - 1) * size + x] : left;
        const gx = left - right;
        const gy = left - up;
        grad.push(Math.sqrt(gx * gx + gy * gy));
      }
    }
    const gradSorted = grad.slice().sort((a, b) => a - b);
    const gradMean = grad.reduce((s, v) => s + v, 0) / grad.length;
    const gradVar = grad.reduce((s, v) => s + (v - gradMean) ** 2, 0) / grad.length;
    const gradP90 = gradSorted[Math.floor(gradSorted.length * 0.9)];
    features.push(gradMean, Math.sqrt(gradVar), gradP90);

    // Laplacian stats: variance, abs_mean
    const lapVals = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const c = gray[y * size + x];
        const n = y > 0 ? gray[(y - 1) * size + x] : c;
        const s = y < size - 1 ? gray[(y + 1) * size + x] : c;
        const w = x > 0 ? gray[y * size + (x - 1)] : c;
        const e = x < size - 1 ? gray[y * size + (x + 1)] : c;
        lapVals.push(-4 * c + n + s + w + e);
      }
    }
    const lapMean = lapVals.reduce((s, v) => s + v, 0) / lapVals.length;
    const lapVar = lapVals.reduce((s, v) => s + (v - lapMean) ** 2, 0) / lapVals.length;
    const lapAbsMean = lapVals.reduce((s, v) => s + Math.abs(v), 0) / lapVals.length;
    features.push(lapVar, lapAbsMean);

    // Channel cross-correlations
    function corr(a, b) {
      const n = a.length;
      const meanA = a.reduce((s, v) => s + v, 0) / n;
      const meanB = b.reduce((s, v) => s + v, 0) / n;
      let num = 0, denA = 0, denB = 0;
      for (let i = 0; i < n; i += 1) {
        const da = a[i] - meanA;
        const db = b[i] - meanB;
        num += da * db;
        denA += da * da;
        denB += db * db;
      }
      return num / (Math.sqrt(denA * denB) || 1);
    }

    function sampleChannel(channelIndex, step) {
      const values = [];
      for (let y = 0; y < size; y += step) {
        for (let x = 0; x < size; x += step) {
          const i = (y * size + x) * 4;
          values.push(img[i + channelIndex] / 255);
        }
      }
      return values;
    }

    const r = sampleChannel(0, 4);
    const g = sampleChannel(1, 4);
    const b = sampleChannel(2, 4);
    features.push(corr(r, g), corr(r, b), corr(g, b));

    return features;
  }

  function extractFeaturesFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data, width, height } = ctx.getImageData(0, 0, size, size);
        resolve(extractFeaturesFromImageData(data, width, height));
      };
      img.onerror = () => reject(new Error("Could not load image for analysis."));
      img.src = dataUrl;
    });
  }

  // ── Inference ────────────────────────────────────────────────────────────

  function predictFeatures(features) {
    if (!model) throw new Error("Model not loaded");

    // Warn if running an old v1 model (the one that always says real)
    if ((model.version || 1) < 2) {
      console.warn(
        "SANATIO: Old model detected (version 1). " +
        "This model has accuracy issues — re-run train-model.bat to get the fixed v2 model."
      );
    }

    const scaled = features.map((value, i) => {
      const scale = model.scalerScale[i] || 1;
      return (value - model.scalerMean[i]) / scale;
    });

    let logit = model.bias;
    for (let i = 0; i < scaled.length; i += 1) {
      logit += scaled[i] * model.weights[i];
    }

    const aiProb = sigmoid(logit);
    const aiScore = Math.round(aiProb * 100);

    // Threshold: 50% for v2 (properly calibrated), 30% for v1 (collapsed model workaround)
    const threshold = (model.version || 1) >= 2 ? 50 : 30;
    const likelyLabel = aiScore >= threshold ? "Likely AI-generated" : "Likely real";

    return { aiScore, likelyLabel, aiProb };
  }

  // ── Model loading ─────────────────────────────────────────────────────────

  async function loadModel() {
    if (model) return model;
    if (loadPromise) return loadPromise;

    loadPromise = fetch(MODEL_URL)
      .then((response) => {
        if (!response.ok) throw new Error("MODEL_MISSING");
        return response.json();
      })
      .then((data) => {
        model = data;
        const v = model.version || 1;
        const acc = model.meta?.balancedAccuracy || model.meta?.testAccuracy || "?";
        console.info(`SANATIO: Model v${v} loaded. Balanced accuracy: ${acc}`);
        if (v < 2) {
          console.warn("SANATIO: Re-run train-model.bat to upgrade to model v2 (fixes always-real bug).");
        }
        return model;
      })
      .catch((error) => {
        loadPromise = null;
        throw error;
      });

    return loadPromise;
  }

  async function analyzeImage(dataUrl) {
    await loadModel();
    const features = await extractFeaturesFromDataUrl(dataUrl);
    return predictFeatures(features);
  }

  function isReady() {
    return Boolean(model);
  }

  function getMeta() {
    return model?.meta || null;
  }

  return { loadModel, analyzeImage, isReady, getMeta };
})();
