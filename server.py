"""
SANATIO AI Detector Server
Loads the trained ResNet18 model and serves predictions via HTTP.
Run this with: python server.py
Then open your SANATIO website normally.
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
from PIL import Image

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_PATH = "ai_detector_model.pth"
IMAGE_SIZE  = 224
PORT        = 5050
DEVICE      = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ── Load model once at startup ────────────────────────────────────────────────
print(f"Loading model from {MODEL_PATH} ...")
model = models.resnet18()
model.fc = nn.Linear(model.fc.in_features, 2)
model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
model.to(DEVICE)
model.eval()
print(f"Model ready on {DEVICE}. Server starting on http://localhost:{PORT}")

# ── Inference ─────────────────────────────────────────────────────────────────
def predict(image_bytes: bytes) -> dict:
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")

    img = cv2.resize(img, (IMAGE_SIZE, IMAGE_SIZE))
    img = img.astype(np.float32) / 255.0
    img = np.transpose(img, (2, 0, 1))                   # HWC → CHW
    tensor = torch.tensor(img, dtype=torch.float32).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        outputs = model(tensor)
        probs   = torch.softmax(outputs, dim=1)[0]

    real_score = round(probs[0].item() * 100, 1)
    ai_score   = round(probs[1].item() * 100, 1)
    label      = "Likely AI-generated" if ai_score >= 50 else "Likely real"

    return {
        "aiScore":    ai_score,
        "realScore":  real_score,
        "likelyLabel": label,
    }

# ── HTTP handler ──────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # silence default access log

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path

        if path != "/analyze":
            self.send_response(404)
            self.end_headers()
            return

        try:
            length    = int(self.headers.get("Content-Length", 0))
            body      = json.loads(self.rfile.read(length))
            data_url  = body.get("image", "")

            # Strip data:image/...;base64, prefix
            if "," in data_url:
                data_url = data_url.split(",", 1)[1]

            image_bytes = base64.b64decode(data_url)
            result      = predict(image_bytes)

            response = json.dumps(result).encode()
            self.send_response(200)
            self.send_header("Content-Type",   "application/json")
            self.send_header("Content-Length", str(len(response)))
            self._cors()
            self.end_headers()
            self.wfile.write(response)
            print(f"  → {result['likelyLabel']} (AI {result['aiScore']}% / Real {result['realScore']}%)")

        except Exception as e:
            error = json.dumps({"error": str(e)}).encode()
            self.send_response(500)
            self.send_header("Content-Type",   "application/json")
            self.send_header("Content-Length", str(len(error)))
            self._cors()
            self.end_headers()
            self.wfile.write(error)
            print(f"  ✗ Error: {e}")

# ── Start ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if not os.path.exists(MODEL_PATH):
        print(f"ERROR: {MODEL_PATH} not found. Put it in the same folder as this script.")
        exit(1)

    httpd = HTTPServer(("localhost", PORT), Handler)
    print(f"✓ SANATIO AI Server running → http://localhost:{PORT}/analyze")
    print("  Keep this window open while using the website.")
    print("  Press Ctrl+C to stop.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
