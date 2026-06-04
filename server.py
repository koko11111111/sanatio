"""
SANATIO AI Detector Server — production ready for Render.com
"""

import os
import io
import base64
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision import models

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_PATH = os.environ.get("MODEL_PATH", "ai_detector_model.pth")
IMAGE_SIZE  = 224
PORT        = int(os.environ.get("PORT", 5050))
DEVICE      = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ── Load model ────────────────────────────────────────────────────────────────
print(f"Loading model from {MODEL_PATH} on {DEVICE}...")
model = models.resnet18()
model.fc = nn.Linear(model.fc.in_features, 2)
model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
model.to(DEVICE)
model.eval()
print("Model ready.")

# ── Inference ─────────────────────────────────────────────────────────────────
def predict(image_bytes: bytes) -> dict:
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")

    img = cv2.resize(img, (IMAGE_SIZE, IMAGE_SIZE))
    img = img.astype(np.float32) / 255.0
    img = np.transpose(img, (2, 0, 1))
    tensor = torch.tensor(img, dtype=torch.float32).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        probs = torch.softmax(model(tensor), dim=1)[0]

    real_score = round(probs[0].item() * 100, 1)
    ai_score   = round(probs[1].item() * 100, 1)

    return {
        "aiScore":     ai_score,
        "realScore":   real_score,
        "likelyLabel": "Likely AI-generated" if ai_score >= 50 else "Likely real",
    }

# ── HTTP handler ──────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        # Health check for Render
        if urlparse(self.path).path in ("/", "/health"):
            body = json.dumps({"ok": True, "status": "SANATIO AI Server running"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))

        if path == "/analyze":
            try:
                data_url = body.get("image", "")
                if "," in data_url:
                    data_url = data_url.split(",", 1)[1]
                result   = predict(base64.b64decode(data_url))
                self._json(200, result)
                print(f"  → {result['likelyLabel']} (AI {result['aiScore']}%)")
            except Exception as e:
                self._json(500, {"error": str(e)})

        elif path == "/label":
            # Save labeled image for future retraining
            try:
                label     = body.get("label", "")
                name      = body.get("name", "image.jpg")
                data_url  = body.get("image", "")
                if "," in data_url:
                    data_url = data_url.split(",", 1)[1]
                folder = "/data/real" if label == "real" else "/data/fake"
                os.makedirs(folder, exist_ok=True)
                with open(f"{folder}/{name}", "wb") as f:
                    f.write(base64.b64decode(data_url))
                self._json(200, {"ok": True})
                print(f"  Labeled {name} as {label}")
            except Exception as e:
                self._json(500, {"error": str(e)})

        elif path == "/retrain":
            self._json(200, {"ok": True, "message": "Retraining not supported on free tier. Download labeled data and retrain locally."})

        else:
            self.send_response(404)
            self.end_headers()

    def _json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

# ── Start ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    httpd = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"SANATIO AI Server running on port {PORT}")
    httpd.serve_forever()
