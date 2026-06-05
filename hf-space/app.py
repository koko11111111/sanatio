"""
SANATIO AI Detector — Hugging Face Space (Gradio)
Exposes a /analyze API endpoint your website can call.
Uses scikit-learn logistic regression model (matches train_model.py)
"""
import base64
import json
import math
import os
from io import BytesIO

import gradio as gr
import numpy as np
from PIL import Image

# ── Load model ────────────────────────────────────────────────────────────────
MODEL_PATH = "ai-detector.json"

if os.path.exists(MODEL_PATH):
    with open(MODEL_PATH, "r") as f:
        model_data = json.load(f)
    print("Model loaded from ai-detector.json")
    print(f"Model expects {len(model_data['weights'])} features")
else:
    print("ERROR: ai-detector.json not found!")
    print("The Space will start but predictions will fail.")
    model_data = None

# ── Feature extraction (must match train_model.py) ───────────────────────────
TARGET_SIZE = 128

def extract_features(img: Image.Image) -> list:
    img = img.convert("RGB").resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0

    features = []

    # Per-channel stats
    for c in range(3):
        channel = arr[:, :, c].ravel()
        channel_sorted = np.sort(channel)
        features.append(float(channel.mean()))
        features.append(float(channel.std()))
        features.append(float(channel_sorted[int(len(channel_sorted) * 0.25)]))
        features.append(float(channel_sorted[int(len(channel_sorted) * 0.75)]))

    # Grayscale histogram
    gray = arr.mean(axis=2).ravel()
    hist, _ = np.histogram(gray, bins=16, range=(0, 1), density=True)
    hist = hist / (hist.sum() or 1)
    features.extend(hist.tolist())

    # Gradient stats
    gy, gx = np.gradient(arr.mean(axis=2))
    grad = np.sqrt(gx**2 + gy**2).ravel()
    grad_sorted = np.sort(grad)
    features.append(float(grad.mean()))
    features.append(float(grad.std()))
    features.append(float(grad_sorted[int(len(grad_sorted) * 0.9)]))

    # Laplacian stats
    gray2d = arr.mean(axis=2)
    lap = (
        -4 * gray2d
        + np.roll(gray2d, 1, axis=0)
        + np.roll(gray2d, -1, axis=0)
        + np.roll(gray2d, 1, axis=1)
        + np.roll(gray2d, -1, axis=1)
    )
    features.append(float(lap.var()))
    features.append(float(np.abs(lap).mean()))

    # Channel correlations
    r = arr[:, :, 0].ravel()
    g = arr[:, :, 1].ravel()
    b = arr[:, :, 2].ravel()
    features.append(float(np.corrcoef(r, g)[0, 1]))
    features.append(float(np.corrcoef(r, b)[0, 1]))
    features.append(float(np.corrcoef(g, b)[0, 1]))

    return features

def sigmoid(x):
    """Sigmoid with overflow protection"""
    if x < -500:
        return 0.0
    elif x > 500:
        return 1.0
    return 1 / (1 + math.exp(-x))

# ── Inference ─────────────────────────────────────────────────────────────────
def predict_from_bytes(image_bytes: bytes) -> dict:
    if model_data is None:
        return {"error": "Model not loaded", "aiScore": 0, "realScore": 0, "likelyLabel": "Error"}

    try:
        pil_img = Image.open(BytesIO(image_bytes)).convert("RGB")
        features = extract_features(pil_img)
        
        # Validate feature count
        expected_features = len(model_data["weights"])
        if len(features) != expected_features:
            return {
                "error": f"Feature mismatch: got {len(features)}, expected {expected_features}",
                "aiScore": 0,
                "realScore": 0,
                "likelyLabel": "Error"
            }
        
        # Apply scaler
        mean = model_data["scalerMean"]
        scale = model_data["scalerScale"]
        features_scaled = [(features[i] - mean[i]) / scale[i] for i in range(len(features))]
        
        # Apply logistic regression
        weights = model_data["weights"]
        bias = model_data["bias"]
        logit = sum(features_scaled[i] * weights[i] for i in range(len(features_scaled))) + bias
        ai_prob = sigmoid(logit)
        real_prob = 1 - ai_prob
        
        ai_score = round(ai_prob * 100, 1)
        real_score = round(real_prob * 100, 1)
        
        return {
            "aiScore": ai_score,
            "realScore": real_score,
            "likelyLabel": "Likely AI-generated" if ai_score >= 50 else "Likely real",
        }
    except Exception as e:
        return {"error": str(e), "aiScore": 0, "realScore": 0, "likelyLabel": "Error"}

# ── Gradio API function ───────────────────────────────────────────────────────
def analyze(image_b64: str) -> dict:
    """
    Accepts a base64 data URL or raw base64 string.
    Returns aiScore, realScore, likelyLabel.
    """
    try:
        data = image_b64
        if "," in data:
            data = data.split(",", 1)[1]
        
        # Validate base64 size (max 10MB encoded = ~13MB base64)
        if len(data) > 13 * 1024 * 1024:
            return {"error": "Image too large (max 10MB)", "aiScore": 0, "realScore": 0, "likelyLabel": "Error"}
        
        image_bytes = base64.b64decode(data)
        return predict_from_bytes(image_bytes)
    except Exception as e:
        return {"error": str(e), "aiScore": 0, "realScore": 0, "likelyLabel": "Error"}

# ── Gradio UI (simple, just to satisfy HF — real usage is via API) ────────────
with gr.Blocks(title="SANATIO AI Detector") as demo:
    gr.Markdown("# SANATIO AI Detector\nAPI for detecting AI-generated photos.")
    gr.Markdown("This Space is used as a backend API by the SANATIO website.")

    with gr.Row():
        inp = gr.Image(type="filepath", label="Test an image")
        out = gr.JSON(label="Result")

    def analyze_upload(img_path):
        if img_path is None:
            return {"error": "No image provided"}
        with open(img_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        return analyze(b64)

    gr.Button("Analyze").click(analyze_upload, inputs=inp, outputs=out)

    # Hidden API endpoint — this is what detector-server.js calls
    gr.Interface(
        fn=analyze,
        inputs=gr.Textbox(label="base64 image", visible=False),
        outputs=gr.JSON(visible=False),
        api_name="analyze",
    )

demo.launch()
