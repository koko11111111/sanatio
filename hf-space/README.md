---
title: SANATIO AI Detector
emoji: 🐍
colorFrom: green
colorTo: yellow
sdk: fastapi
app_file: app.py
pinned: false
---

# SANATIO AI Detector Server

REST API for detecting AI-generated photos.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/analyze` | Analyze an image |

## POST /analyze

**Request body (JSON):**
```json
{ "image": "<base64 data URL or raw base64>" }
```

**Response:**
```json
{
  "aiScore": 82.3,
  "realScore": 17.7,
  "likelyLabel": "Likely AI-generated"
}
```

## Setup

1. Upload `ai_detector_model.pth` to this Space's file storage
2. The server loads it automatically on startup
3. Copy your Space URL into `detector-server.js` in your website:
   ```js
   const SERVER_URL = "https://YOUR-USERNAME-sanatio-ai-detector.hf.space/analyze";
   ```
