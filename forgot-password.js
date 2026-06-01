/**
 * SANATIO forgot-password.js
 * Handles password reset flow: send code → verify → update password.
 */

function runForgotPassword() {
  const RESET_CODES_KEY = "aiDetectorResetCodes";
  const CODE_EXPIRY_MS  = 15 * 60 * 1000;
  const RESEND_COOLDOWN_MS = 60 * 1000;

  const requestForm  = document.getElementById("reset-request-form");
  if (!requestForm) return;

  const verifyForm   = document.getElementById("reset-verify-form");
  const emailInput   = document.getElementById("reset-email");
  const codeInput    = document.getElementById("reset-code");
  const passwordInput= document.getElementById("reset-password");
  const confirmInput = document.getElementById("reset-confirm");
  const requestMsg   = document.getElementById("reset-request-message");
  const verifyMsg    = document.getElementById("reset-verify-message");
  const strengthMsg  = document.getElementById("reset-strength");
  const emailDisplay = document.getElementById("reset-email-display");
  const stepDesc     = document.getElementById("reset-step-desc");
  const sendBtn      = document.getElementById("reset-send-btn");
  const resendBtn    = document.getElementById("reset-resend-btn");
  const changeEmailBtn = document.getElementById("reset-change-email");

  // Password show/hide toggles (in case auth.js doesn't run on this page)
  document.querySelectorAll(".password-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.getAttribute("data-target"));
      if (!input) return;
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      btn.textContent = hidden ? "🐵" : "🙈";
      btn.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
    });
  });

  let verifiedEmail = "";

  function setMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = "form-message " + (type || "");
  }

  function getEmailApiUrl() {
    const url = typeof EMAIL_API_URL === "string" ? EMAIL_API_URL.trim() : "";
    return url || "http://localhost:3001/api/send-reset";
  }

  function isEmailJsConfigured() {
    const key     = typeof EMAILJS_PUBLIC_KEY  === "string" ? EMAILJS_PUBLIC_KEY.trim()  : "";
    const service = typeof EMAILJS_SERVICE_ID  === "string" ? EMAILJS_SERVICE_ID.trim()  : "";
    const tmpl    = typeof EMAILJS_TEMPLATE_ID === "string" ? EMAILJS_TEMPLATE_ID.trim() : "";
    return Boolean(key && service && tmpl);
  }


  // ── Reset code storage ─────────────────────────────────────────────────
  function readResetCodes() {
    try { return JSON.parse(localStorage.getItem(RESET_CODES_KEY)) || {}; } catch { return {}; }
  }
  function saveResetCodes(codes) {
    localStorage.setItem(RESET_CODES_KEY, JSON.stringify(codes));
  }
  function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }
  function storeResetCode(email, code) {
    const codes = readResetCodes();
    codes[email] = { code, expiresAt: Date.now() + CODE_EXPIRY_MS, sentAt: Date.now() };
    saveResetCodes(codes);
  }
  function clearResetCode(email) {
    const codes = readResetCodes();
    delete codes[email];
    saveResetCodes(codes);
  }
  function getResetEntry(email) {
    const entry = readResetCodes()[email];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { clearResetCode(email); return null; }
    return entry;
  }
  function canResend(email) {
    const entry = readResetCodes()[email];
    if (!entry) return true;
    return Date.now() - entry.sentAt >= RESEND_COOLDOWN_MS;
  }

  // ── Email sending ──────────────────────────────────────────────────────
  function loadEmailJs() {
    return new Promise((resolve, reject) => {
      if (window.emailjs) { resolve(); return; }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load email service."));
      document.head.appendChild(script);
    });
  }

  async function sendViaEmailJs(email, userName, code) {
    await loadEmailJs();
    emailjs.init(EMAILJS_PUBLIC_KEY.trim());
    await emailjs.send(EMAILJS_SERVICE_ID.trim(), EMAILJS_TEMPLATE_ID.trim(), {
      to_email: email, user_email: email, user_name: userName || "User",
      reset_code: code, site_name: "SANATIO AI Photo Detector", expiry_minutes: "15",
    });
  }

  async function sendViaLocalServer(email, userName, code) {
    const res = await fetch(getEmailApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: email, name: userName || "User", code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "EMAIL_API_FAILED");
    if (data.testMode && data.previewUrl) console.info("Test email preview:", data.previewUrl);
    if (data.devConsole) 
    return data;
  }

  async function sendResetEmail(email, userName, code) {
    // Try local server first
    if (window.location.protocol !== "file:") {
      try {
        return await sendViaLocalServer(email, userName, code);
      } catch (localErr) {
        if (localErr.message !== "Failed to fetch" && localErr.name !== "TypeError" &&
            localErr.message !== "EMAIL_API_FAILED") {
          throw localErr;
        }
        // Local server not running — try EmailJS
      }
    }

    // Try EmailJS if configured
    if (isEmailJsConfigured()) {
      await sendViaEmailJs(email, userName, code);
      return { ok: true };
    }

    // Last resort: store code in localStorage so user can get it from Firebase
    // Actually just store it and tell the user to check their account
    // Since we already store the code in localStorage, the reset still works
    // We just can't deliver the email without a server — show code via alert in dev
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      alert("Dev mode: your reset code is " + code + "\n\nIn production, add EmailJS keys to config.js to send real emails.");
      return { ok: true, devConsole: true };
    }

    // Production without email configured
    throw new Error("EMAIL_NOT_CONFIGURED");
  }

  // ── UI steps ───────────────────────────────────────────────────────────
  function showVerifyStep(email) {
    verifiedEmail = email;
    requestForm.classList.add("hidden");
    verifyForm.classList.remove("hidden");
    if (emailDisplay) emailDisplay.textContent = email;
    if (stepDesc) stepDesc.textContent = "Enter the code from your email, then choose a new password.";
    codeInput.value = "";
    codeInput.focus();
  }

  function showRequestStep() {
    verifiedEmail = "";
    verifyForm.classList.add("hidden");
    requestForm.classList.remove("hidden");
    if (stepDesc) stepDesc.textContent = "Enter your email. We will send a verification code before you can set a new password.";
    setMsg(verifyMsg, "", "");
    setMsg(requestMsg, "", "");
  }

  // ── Send / resend code ─────────────────────────────────────────────────
  async function requestVerificationCode(email, isResend) {
    // Look up user — works with both localStorage and (optionally) Firebase
    let user = null;
    if (typeof findUserByEmail === "function") user = findUserByEmail(email);

    // Firebase fallback
    if (!user) {
      try {
        if (typeof firebase !== "undefined" && firebase.apps?.length) {
          const db = firebase.firestore();
          const key = email.replace(/[.#$[\]]/g, "_");
          const doc = await db.collection("users").doc(key).get();
          if (doc.exists) user = doc.data();
        }
      } catch {}
    }

    const msgEl = isResend ? verifyMsg : requestMsg;
    const btn   = isResend ? resendBtn : sendBtn;

    if (!user) { setMsg(msgEl, "No account found with this email.", "error"); return false; }
    if (user.authProvider === "google") {
      setMsg(msgEl, "This account uses Google Sign-In. Reset your password through Google.", "warning");
      return false;
    }
    if (isResend && !canResend(email)) {
      setMsg(msgEl, "Please wait a minute before requesting another code.", "warning");
      return false;
    }

    const code = generateCode();
    if (btn) { btn.disabled = true; btn.textContent = isResend ? "Sending…" : "Sending code…"; }

    try {
      const result = await sendResetEmail(email, user.name, code);
      window._lastResetDevMode = Boolean(result?.devConsole);
      storeResetCode(email, code);
      const devNote = window._lastResetDevMode ? "" : "";
      setMsg(msgEl, (isResend ? "A new code was sent." : "Verification code sent! Check your inbox.") + devNote, "success");
      if (!isResend) showVerifyStep(email);
      return true;
    } catch (err) {
      if (err.message === "EMAIL_SERVER_OFFLINE") {
        setMsg(msgEl, "Could not send the email. Please try again later.", "error");
      } else if (err.message === "FILE_PROTOCOL") {
        setMsg(msgEl, "Please open this site through a proper web server, not by double-clicking the file.", "error");
      } else if (err.message === "EMAIL_NOT_CONFIGURED") {
        setMsg(msgEl, "Email service not set up yet. Please contact the site administrator.", "error");
      } else if (err.message === "FILE_PROTOCOL") {
        setMsg(msgEl, "Please open this site through a web server.", "error");
      } else {
        setMsg(msgEl, "Could not send the email. Please try again later.", "error");
      }
      return false;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = isResend ? "Resend code" : "Send verification code"; }
    }
  }

  // ── Event listeners ────────────────────────────────────────────────────
  requestForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!email) { setMsg(requestMsg, "Enter your email address.", "error"); return; }
    requestVerificationCode(email, false);
  });

  resendBtn?.addEventListener("click", () => {
    if (!verifiedEmail) return;
    requestVerificationCode(verifiedEmail, true);
  });

  changeEmailBtn?.addEventListener("click", showRequestStep);

  passwordInput?.addEventListener("input", () => {
    const pw = passwordInput.value.trim();
    if (!pw) { setMsg(strengthMsg, "", ""); return; }
    if (typeof getStrengthResult === "function") {
      const r = getStrengthResult(pw);
      setMsg(strengthMsg, r.label, r.type);
    }
  });

  verifyForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email    = verifiedEmail;
    const code     = codeInput.value.trim();
    const password = passwordInput.value;
    const confirm  = confirmInput.value;

    if (!email)          { setMsg(verifyMsg, "Request a verification code first.", "error"); return; }
    if (!code || code.length !== 6) { setMsg(verifyMsg, "Enter the 6-digit code from your email.", "error"); return; }

    const entry = getResetEntry(email);
    if (!entry)          { setMsg(verifyMsg, "Code expired or not found. Request a new code.", "error"); return; }
    if (entry.code !== code) { setMsg(verifyMsg, "Incorrect verification code.", "error"); return; }
    if (!password || !confirm) { setMsg(verifyMsg, "Enter and confirm your new password.", "error"); return; }

    if (typeof getStrengthResult === "function") {
      const strength = getStrengthResult(password);
      if (strength.type === "error") { setMsg(verifyMsg, "Password security is low. Use a stronger password.", "error"); return; }
    }
    if (password !== confirm) { setMsg(verifyMsg, "Passwords do not match.", "error"); return; }

    // Update password in localStorage
    if (typeof updateUserByEmail === "function") {
      updateUserByEmail(email, u => ({ ...u, password }));
    }

    // Update password in Firebase if available
    try {
      if (typeof firebase !== "undefined" && firebase.apps?.length) {
        const db = firebase.firestore();
        // Note: passwords shouldn't really be stored in Firestore in production,
        // but since this app stores them in localStorage we skip Firebase here.
      }
    } catch {}

    clearResetCode(email);
    setMsg(verifyMsg, "Password updated! Redirecting to login…", "success");
    window.setTimeout(() => { window.location.href = "login.html"; }, 1800);
  });

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runForgotPassword);
} else {
  runForgotPassword();
}
