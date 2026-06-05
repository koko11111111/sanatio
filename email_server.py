"""
SANATIO password-reset email server (no npm required).
Run: python email_server.py
Or double-click start-email.bat
"""
from __future__ import annotations

import json
import os
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("EMAIL_PORT", "3001"))
ENV_PATH = Path(__file__).resolve().parent / ".env"


def load_env_file() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def build_message(to_email: str, name: str, code: str) -> MIMEMultipart:
    safe_name = re.sub(r"[<>]", "", name or "User")
    safe_code = re.sub(r"\D", "", code)[:6]
    from_addr = os.environ.get("SMTP_FROM", '"SANATIO" <noreply@sanatio.local>')

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your SANATIO password reset code"
    msg["From"] = from_addr
    msg["To"] = to_email

    text = (
        f"Hi {safe_name},\n\n"
        f"Your password reset verification code is: {safe_code}\n\n"
        f"This code expires in 15 minutes.\n\n"
        f"If you did not request a reset, ignore this email.\n\n"
        f"— SANATIO AI Photo Detector"
    )
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;color:#222">
      <h2 style="color:#8f7b3f">SANATIO — Password Reset</h2>
      <p>Hi {safe_name},</p>
      <p>Your verification code is:</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:bold;color:#8f7b3f">{safe_code}</p>
      <p>This code expires in <strong>15 minutes</strong>.</p>
      <p style="color:#666;font-size:13px">If you did not request this, ignore this email.</p>
    </div>
  """
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))
    return msg


def send_email(to_email: str, name: str, code: str) -> dict:
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASS", "").strip()
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com").strip()
    port = int(os.environ.get("SMTP_PORT", "587"))

    msg = build_message(to_email, name, code)

    if not user or not password:
        print("")
        print("  WARNING: No Gmail in .env — printing code to this window only (dev mode).")
        print(f"  To: {to_email}")
        print(f"  Code: {code}")
        print("  Copy .env.example to .env and add SMTP_USER + SMTP_PASS for real emails.")
        print("")
        return {"ok": True, "testMode": True, "devConsole": True}

    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(user, password)
        server.send_message(msg)

    print(f"  Reset email sent to {to_email}")
    return {"ok": True, "testMode": False}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    def _cors(self) -> None:
        # Only allow localhost origins — this server must not be public-facing.
        origin = self.headers.get("Origin", "")
        allowed = origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1")
        allowed_origin = origin if allowed else "http://localhost"
        self.send_header("Access-Control-Allow-Origin", allowed_origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") == "/api/health":
            body = json.dumps({"ok": True, "service": "sanatio-email-python"}).encode("utf-8")
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/api/send-reset":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"ok": False, "error": "Invalid JSON."})
            return

        to_email = str(payload.get("to", "")).strip().lower()
        name = str(payload.get("name", "User")).strip()
        code = str(payload.get("code", "")).strip()

        if "@" not in to_email:
            self._json(400, {"ok": False, "error": "Valid email address required."})
            return
        if not re.fullmatch(r"\d{6}", code):
            self._json(400, {"ok": False, "error": "Valid 6-digit code required."})
            return

        try:
            result = send_email(to_email, name, code)
            self._json(200, result)
        except Exception as exc:  # noqa: BLE001
            print(f"  Email send failed: {exc}")
            self._json(500, {"ok": False, "error": str(exc)})

    def _json(self, status: int, data: dict) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    load_env_file()
    server = ThreadingHTTPServer(("localhost", PORT), Handler)
    print("")
    print(f"  SANATIO email server (Python) at http://localhost:{PORT}")
    print("  Keep this window open while testing Forgot Password.")
    if not ENV_PATH.exists():
        print("  Tip: copy .env.example to .env for real Gmail delivery.")
    print("")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")


if __name__ == "__main__":
    main()
