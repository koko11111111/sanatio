/**
 * SANATIO forgot-password.js
 * Password reset flow:
 *  1. User enters email → code stored in localStorage → shown on screen (no email server needed)
 *  2. User enters code + new password → password updated
 */

function runForgotPassword() {
  const RESET_CODES_KEY  = "aiDetectorResetCodes";
  const CODE_EXPIRY_MS   = 15 * 60 * 1000;
  const RESEND_COOLDOWN  = 60 * 1000;

  const requestForm    = document.getElementById("reset-request-form");
  if (!requestForm) return;

  const verifyForm     = document.getElementById("reset-verify-form");
  const emailInput     = document.getElementById("reset-email");
  const codeInput      = document.getElementById("reset-code");
  const passwordInput  = document.getElementById("reset-password");
  const confirmInput   = document.getElementById("reset-confirm");
  const requestMsg     = document.getElementById("reset-request-message");
  const verifyMsg      = document.getElementById("reset-verify-message");
  const strengthMsg    = document.getElementById("reset-strength");
  const emailDisplay   = document.getElementById("reset-email-display");
  const stepDesc       = document.getElementById("reset-step-desc");
  const sendBtn        = document.getElementById("reset-send-btn");
  const resendBtn      = document.getElementById("reset-resend-btn");
  const changeEmailBtn = document.getElementById("reset-change-email");
  const codeDisplay    = document.getElementById("reset-code-display");

  let verifiedEmail = "";

  // ── Password show/hide toggles ─────────────────────────────────────────
  document.querySelectorAll(".password-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.getAttribute("data-target"));
      if (!input) return;
      const hidden = input.type === "password";
      input.type   = hidden ? "text" : "password";
      btn.textContent = hidden ? "🐵" : "🙈";
      btn.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
    });
  });

  function setMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = "form-message " + (type || "");
  }

  // ── Code storage ────────────────────────────────────────────────────────
  function readCodes() {
    try { return JSON.parse(localStorage.getItem(RESET_CODES_KEY)) || {}; } catch { return {}; }
  }
  function saveCodes(c) { localStorage.setItem(RESET_CODES_KEY, JSON.stringify(c)); }
  function generateCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

  function storeCode(email, code) {
    const c = readCodes();
    c[email] = { code, expiresAt: Date.now() + CODE_EXPIRY_MS, sentAt: Date.now() };
    saveCodes(c);
  }
  function clearCode(email) {
    const c = readCodes(); delete c[email]; saveCodes(c);
  }
  function getEntry(email) {
    const e = readCodes()[email];
    if (!e) return null;
    if (Date.now() > e.expiresAt) { clearCode(email); return null; }
    return e;
  }
  function canResend(email) {
    const e = readCodes()[email];
    return !e || (Date.now() - e.sentAt >= RESEND_COOLDOWN);
  }

  // ── Look up user ────────────────────────────────────────────────────────
  async function findUser(email) {
    // localStorage first
    if (typeof findUserByEmail === "function") {
      const u = findUserByEmail(email);
      if (u) return u;
    }
    // Firebase fallback
    try {
      if (typeof firebase !== "undefined" && firebase.apps?.length) {
        const doc = await firebase.firestore()
          .collection("users").doc(email.replace(/[.#$[\]]/g, "_")).get();
        if (doc.exists) return doc.data();
      }
    } catch {}
    return null;
  }

  // ── Show/hide steps ──────────────────────────────────────────────────────
  function showVerifyStep(email, code) {
    verifiedEmail = email;
    requestForm.classList.add("hidden");
    verifyForm.classList.remove("hidden");
    if (emailDisplay) emailDisplay.textContent = email;
    if (stepDesc) stepDesc.textContent = "Enter the 6-digit code below, then set your new password.";

    // Show the code directly on screen — no email server needed
    if (codeDisplay) {
      codeDisplay.textContent = code;
      codeDisplay.parentElement?.classList.remove("hidden");
    }
    codeInput.value = "";
    codeInput.focus();
  }

  function showRequestStep() {
    verifiedEmail = "";
    verifyForm.classList.add("hidden");
    requestForm.classList.remove("hidden");
    if (stepDesc) stepDesc.textContent = "Enter your email address to reset your password.";
    setMsg(verifyMsg, "", "");
    setMsg(requestMsg, "", "");
    if (codeDisplay) codeDisplay.parentElement?.classList.add("hidden");
  }

  // ── Request code ─────────────────────────────────────────────────────────
  async function requestCode(email, isResend) {
    const msgEl = isResend ? verifyMsg : requestMsg;
    const btn   = isResend ? resendBtn : sendBtn;

    if (isResend && !canResend(email)) {
      setMsg(msgEl, "Please wait a moment before requesting another code.", "warning");
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = "Please wait…"; }

    const user = await findUser(email);

    if (!user) {
      setMsg(msgEl, "No account found with this email.", "error");
      if (btn) { btn.disabled = false; btn.textContent = isResend ? "Resend code" : "Send verification code"; }
      return;
    }
    if (user.authProvider === "google") {
      setMsg(msgEl, "This account uses Google Sign-In. Please reset your password through Google.", "warning");
      if (btn) { btn.disabled = false; btn.textContent = isResend ? "Resend code" : "Send verification code"; }
      return;
    }

    const code = generateCode();
    storeCode(email, code);

    if (isResend) {
      // Update the displayed code
      if (codeDisplay) codeDisplay.textContent = code;
      setMsg(msgEl, "A new code has been generated.", "success");
    } else {
      showVerifyStep(email, code);
    }

    if (btn) { btn.disabled = false; btn.textContent = isResend ? "Resend code" : "Send verification code"; }
  }

  // ── Password strength ────────────────────────────────────────────────────
  passwordInput?.addEventListener("input", () => {
    const pw = passwordInput.value.trim();
    if (!pw) { setMsg(strengthMsg, "", ""); return; }
    if (typeof getStrengthResult === "function") {
      const r = getStrengthResult(pw);
      setMsg(strengthMsg, r.label, r.type);
    }
  });

  // ── Event listeners ──────────────────────────────────────────────────────
  requestForm.addEventListener("submit", e => {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!email) { setMsg(requestMsg, "Please enter your email address.", "error"); return; }
    requestCode(email, false);
  });

  resendBtn?.addEventListener("click", () => {
    if (verifiedEmail) requestCode(verifiedEmail, true);
  });

  changeEmailBtn?.addEventListener("click", showRequestStep);

  verifyForm.addEventListener("submit", e => {
    e.preventDefault();
    const code     = codeInput.value.trim();
    const password = passwordInput.value;
    const confirm  = confirmInput.value;

    if (!verifiedEmail) { setMsg(verifyMsg, "Please request a code first.", "error"); return; }
    if (!code || code.length !== 6) { setMsg(verifyMsg, "Enter the 6-digit code shown above.", "error"); return; }

    const entry = getEntry(verifiedEmail);
    if (!entry) { setMsg(verifyMsg, "Code expired. Please request a new one.", "error"); return; }
    if (entry.code !== code) { setMsg(verifyMsg, "Incorrect code. Please try again.", "error"); return; }
    if (!password || !confirm) { setMsg(verifyMsg, "Please enter and confirm your new password.", "error"); return; }

    if (typeof getStrengthResult === "function") {
      if (getStrengthResult(password).type === "error") {
        setMsg(verifyMsg, "Password too weak. Use uppercase, lowercase, number and symbol.", "error");
        return;
      }
    }
    if (password !== confirm) { setMsg(verifyMsg, "Passwords do not match.", "error"); return; }

    // Save new password
    if (typeof updateUserByEmail === "function") {
      updateUserByEmail(verifiedEmail, u => ({ ...u, password }));
    }
    clearCode(verifiedEmail);

    setMsg(verifyMsg, "✓ Password updated! Redirecting to login…", "success");
    setTimeout(() => { window.location.href = "login.html"; }, 1500);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runForgotPassword);
} else {
  runForgotPassword();
}
