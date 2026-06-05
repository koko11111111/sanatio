const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

require("dotenv").config();

const PORT = Number(process.env.EMAIL_PORT || 3001);
const app = express();

app.use(cors());
app.use(express.json());

let transporterPromise = null;

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    const user = process.env.SMTP_USER || "";
    const pass = process.env.SMTP_PASS || "";

    if (user && pass) {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user, pass },
      });
      transport._sanatioMode = "live";
      return transport;
    }

    const testAccount = await nodemailer.createTestAccount();
    const transport = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    transport._sanatioMode = "test";
    console.log("");
    console.log("  No .env Gmail settings found — using TEST email (Ethereal).");
    console.log("  To send real emails, copy .env.example to .env and add your Gmail app password.");
    console.log("");
    return transport;
  })();

  return transporterPromise;
}

function buildMail(to, name, code) {
  const safeName = String(name || "User").replace(/[<>]/g, "");
  const safeCode = String(code).replace(/[^\d]/g, "").slice(0, 6);
  const from = process.env.SMTP_FROM || '"SANATIO" <noreply@sanatio.local>';

  return {
    from,
    to,
    subject: "Your SANATIO password reset code",
    text:
      `Hi ${safeName},\n\n` +
      `Your password reset verification code is: ${safeCode}\n\n` +
      `This code expires in 15 minutes.\n\n` +
      `If you did not request a reset, you can ignore this email.\n\n` +
      `— SANATIO AI Photo Detector`,
    html:
      `<div style="font-family:Arial,sans-serif;max-width:480px;color:#222">` +
      `<h2 style="color:#8f7b3f">SANATIO — Password Reset</h2>` +
      `<p>Hi ${safeName},</p>` +
      `<p>Your verification code is:</p>` +
      `<p style="font-size:28px;letter-spacing:6px;font-weight:bold;color:#8f7b3f">${safeCode}</p>` +
      `<p>This code expires in <strong>15 minutes</strong>.</p>` +
      `<p style="color:#666;font-size:13px">If you did not request this, ignore this email.</p>` +
      `</div>`,
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "sanatio-email" });
});

app.post("/api/send-reset", async (req, res) => {
  const to = String(req.body?.to || "").trim().toLowerCase();
  const name = String(req.body?.name || "User").trim();
  const code = String(req.body?.code || "").trim();

  if (!to || !to.includes("@")) {
    res.status(400).json({ ok: false, error: "Valid email address required." });
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ ok: false, error: "Valid 6-digit code required." });
    return;
  }

  try {
    const transport = await getTransporter();
    const info = await transport.sendMail(buildMail(to, name, code));
    const previewUrl = nodemailer.getTestMessageUrl(info);

    if (transport._sanatioMode === "test") {
      console.log(`  Test email for ${to} — preview: ${previewUrl || "(see Ethereal inbox)"}`);
    } else {
      console.log(`  Reset email sent to ${to}`);
    }

    res.json({
      ok: true,
      testMode: transport._sanatioMode === "test",
      previewUrl: previewUrl || null,
    });
  } catch (error) {
    console.error("  Email send failed:", error.message);
    res.status(500).json({ ok: false, error: error.message || "Could not send email." });
  }
});

app.listen(PORT, () => {
  console.log("");
  console.log(`  SANATIO email server running at http://localhost:${PORT}`);
  console.log("  Keep this window open while testing Forgot Password.");
  console.log("");
});
