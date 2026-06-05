"""
SANATIO AI Detector — Hugging Face Space
API endpoint: POST /analyze  { "image": "<base64 data URL>" }
              GET  /health
"""
from __future__ import annotations

import base64
import os
from io import BytesIO

import cv2
import numpy as np
import torch
import torch.nn as nn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel
from torchvision import models

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_PATH = os.environ.get("MODEL_PATH", "ai_detector_model.pth")
IMAGE_SIZE = 224
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ── Load model ────────────────────────────────────────────────────────────────
print(f"Loading model from '{MODEL_PATH}' on {DEVICE}...")

resnet = models.resnet18()
resnet.fc = nn.Linear(resnet.fc.in_features, 2)

if os.path.exists(MODEL_PATH):
    resnet.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
    print("Model loaded from file.")
else:
    # No .pth file — use random weights so the server still starts.
    # Upload ai_detector_model.pth to the Space files to get real predictions.
    print("WARNING: ai_detector_model.pth not found — using untrained weights.")
    print("Upload your model file to this Space for accurate results.")

resnet.to(DEVICE)
resnet.eval()

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="SANATIO AI Detector", version="1.0.0")

# Allow requests from any origin (your static website calling this API)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ── Inference ─────────────────────────────────────────────────────────────────
def predict_from_bytes(image_bytes: bytes) -> dict:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    if img is None:
        # Fallback: try PIL
        try:
            pil_img = Image.open(BytesIO(image_bytes)).convert("RGB")
            img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        except Exception:
            raise ValueError("Could not decode image — unsupported format.")

    img = cv2.resize(img, (IMAGE_SIZE, IMAGE_SIZE))
    img = img.astype(np.float32) / 255.0
    img = np.transpose(img, (2, 0, 1))  # HWC → CHW
    tensor = torch.tensor(img, dtype=torch.float32).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        probs = torch.softmax(resnet(tensor), dim=1)[0]

    real_score = round(float(probs[0].item()) * 100, 1)
    ai_score   = round(float(probs[1].item()) * 100, 1)

    return {
        "aiScore":     ai_score,
        "realScore":   real_score,
        "likelyLabel": "Likely AI-generated" if ai_score >= 50 else "Likely real",
    }

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True, "status": "SANATIO AI Server running", "device": str(DEVICE)}

@app.get("/")
def root():
    return {"ok": True, "service": "SANATIO AI Detector", "usage": "POST /analyze with {image: '<dataURL>'}"}


class AnalyzeRequest(BaseModel):
    image: str  # base64 data URL or raw base64


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    try:
        data = req.image
        # Strip data URL prefix if present (data:image/jpeg;base64,...)
        if "," in data:
            data = data.split(",", 1)[1]

        # Decode base64
        try:
            image_bytes = base64.b64decode(data)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 image data.")

        if len(image_bytes) > 10 * 1024 * 1024:  # 10 MB limit
            raise HTTPException(status_code=413, detail="Image too large. Max 10 MB.")

        result = predict_from_bytes(image_bytes)
        print(f"  → {result['likelyLabel']} (AI {result['aiScore']}%)")
        return result

    except HTTPException:
        raise
    except Exception as exc:
        print(f"  Error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
