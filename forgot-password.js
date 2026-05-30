function runForgotPassword() {
  const RESET_CODES_KEY = "aiDetectorResetCodes";
  const CODE_EXPIRY_MS = 15 * 60 * 1000;
  const RESEND_COOLDOWN_MS = 60 * 1000;

  const requestForm = document.getElementById("reset-request-form");
  if (!requestForm) return;

  const verifyForm = document.getElementById("reset-verify-form");
  const emailInput = document.getElementById("reset-email");
  const codeInput = document.getElementById("reset-code");
  const passwordInput = document.getElementById("reset-password");
  const confirmInput = document.getElementById("reset-confirm");
  const requestMsg = document.getElementById("reset-request-message");
  const verifyMsg = document.getElementById("reset-verify-message");
  const strengthMsg = document.getElementById("reset-strength");
  const emailDisplay = document.getElementById("reset-email-display");
  const stepDesc = document.getElementById("reset-step-desc");
  const sendBtn = document.getElementById("reset-send-btn");
  const resendBtn = document.getElementById("reset-resend-btn");
  const changeEmailBtn = document.getElementById("reset-change-email");
  const emailjsHint = document.getElementById("reset-emailjs-hint");

  let verifiedEmail = "";

  function setMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = "form-message " + (type || "");
  }

  function isEmailJsConfigured() {
    const key = typeof EMAILJS_PUBLIC_KEY === "string" ? EMAILJS_PUBLIC_KEY.trim() : "";
    const service = typeof EMAILJS_SERVICE_ID === "string" ? EMAILJS_SERVICE_ID.trim() : "";
    const template = typeof EMAILJS_TEMPLATE_ID === "string" ? EMAILJS_TEMPLATE_ID.trim() : "";
    return Boolean(key && service && template);
  }

  function getEmailApiUrl() {
    const url = typeof EMAIL_API_URL === "string" ? EMAIL_API_URL.trim() : "";
    return url || "http://localhost:3001/api/send-reset";
  }

  async function checkEmailServerStatus() {
    if (!emailjsHint || window.location.protocol === "file:") return;
    const base = getEmailApiUrl().replace(/\/api\/send-reset\/?$/i, "");
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) {
        emailjsHint.innerHTML =
          'Email server is running. Use <code>start-all.bat</code> to start site + email together.';
        emailjsHint.className = "footer-text reset-emailjs-hint reset-emailjs-hint-ok";
      }
    } catch {
      emailjsHint.innerHTML =
        'Start the email server: double-click <code>start-email.bat</code> (or <code>start-all.bat</code>), then try again.';
      emailjsHint.className = "footer-text reset-emailjs-hint";
    }
  }

  function readResetCodes() {
    try {
      return JSON.parse(localStorage.getItem(RESET_CODES_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveResetCodes(codes) {
    localStorage.setItem(RESET_CODES_KEY, JSON.stringify(codes));
  }

  function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function storeResetCode(email, code) {
    const codes = readResetCodes();
    codes[email] = {
      code,
      expiresAt: Date.now() + CODE_EXPIRY_MS,
      sentAt: Date.now(),
    };
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
    if (Date.now() > entry.expiresAt) {
      clearResetCode(email);
      return null;
    }
    return entry;
  }

  function canResend(email) {
    const entry = readResetCodes()[email];
    if (!entry) return true;
    return Date.now() - entry.sentAt >= RESEND_COOLDOWN_MS;
  }

  function loadEmailJs() {
    return new Promise((resolve, reject) => {
      if (window.emailjs) {
        resolve();
        return;
      }
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
    await emailjs.send(
      EMAILJS_SERVICE_ID.trim(),
      EMAILJS_TEMPLATE_ID.trim(),
      {
        to_email: email,
        user_email: email,
        user_name: userName || "User",
        reset_code: code,
        site_name: "SANATIO AI Photo Detector",
        expiry_minutes: "15",
      }
    );
  }

  async function sendViaLocalServer(email, userName, code) {
    const response = await fetch(getEmailApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: email, name: userName || "User", code }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "EMAIL_API_FAILED");
    }

    if (data.testMode && data.previewUrl) {
      console.info("Test email preview (Ethereal):", data.previewUrl);
    }
    if (data.devConsole) {
      console.info("Dev mode: check the start-email.bat window for your 6-digit code.");
    }

    return data;
  }

  async function sendResetEmail(email, userName, code) {
    if (window.location.protocol === "file:") {
      throw new Error("FILE_PROTOCOL");
    }

    try {
      return await sendViaLocalServer(email, userName, code);
    } catch (localError) {
      if (isEmailJsConfigured()) {
        await sendViaEmailJs(email, userName, code);
        return;
      }
      if (localError.message === "Failed to fetch" || localError.name === "TypeError") {
        throw new Error("EMAIL_SERVER_OFFLINE");
      }
      throw localError;
    }
  }

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
    if (stepDesc) {
      stepDesc.textContent = "Enter your email. We will send a verification code before you can set a new password.";
    }
    setMessage(verifyMsg, "", "");
    setMessage(requestMsg, "", "");
  }

  async function requestVerificationCode(email, isResend) {
    const user = findUserByEmail(email);
    if (!user) {
      setMessage(isResend ? verifyMsg : requestMsg, "No account found with this email.", "error");
      return false;
    }

    if (user.authProvider === "google") {
      setMessage(
        isResend ? verifyMsg : requestMsg,
        "This account uses Google Sign-In. Reset your password through Google.",
        "warning"
      );
      return false;
    }

    if (isResend && !canResend(email)) {
      setMessage(verifyMsg, "Please wait a minute before requesting another code.", "warning");
      return false;
    }

    const code = generateCode();
    const msgEl = isResend ? verifyMsg : requestMsg;
    const btn = isResend ? resendBtn : sendBtn;

    if (btn) {
      btn.disabled = true;
      btn.textContent = isResend ? "Sending…" : "Sending code…";
    }

    try {
      const sendResult = await sendResetEmail(email, user.name, code);
      window._lastResetDevMode = Boolean(sendResult?.devConsole);
      storeResetCode(email, code);
      const devNote = window._lastResetDevMode
        ? " Code is shown in the start-email.bat window (add .env for real Gmail)."
        : "";
      setMessage(
        msgEl,
        (isResend ? "A new code was sent." : "Verification code sent! Check your inbox.") + devNote,
        "success"
      );
      if (!isResend) showVerifyStep(email);
      return true;
    } catch (error) {
      if (error.message === "EMAIL_SERVER_OFFLINE") {
        setMessage(
          msgEl,
          "Email server is not running. Double-click start-email.bat (or start-all.bat), then try again.",
          "error"
        );
      } else if (error.message === "FILE_PROTOCOL") {
        setMessage(
          msgEl,
          "Open the site at http://localhost:8080 using start-all.bat — not by double-clicking HTML files.",
          "error"
        );
      } else {
        setMessage(msgEl, error.message || "Could not send email. Check start-email.bat window for errors.", "error");
      }
      return false;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = isResend ? "Resend code" : "Send verification code";
      }
    }
  }

  requestForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!email) {
      setMessage(requestMsg, "Enter your email address.", "error");
      return;
    }
    requestVerificationCode(email, false);
  });

  resendBtn?.addEventListener("click", () => {
    if (!verifiedEmail) return;
    requestVerificationCode(verifiedEmail, true);
  });

  changeEmailBtn?.addEventListener("click", () => {
    showRequestStep();
  });

  passwordInput?.addEventListener("input", () => {
    const pw = passwordInput.value.trim();
    if (!pw) {
      setMessage(strengthMsg, "", "");
      return;
    }
    const result = getStrengthResult(pw);
    setMessage(strengthMsg, result.label, result.type);
  });

  verifyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = verifiedEmail;
    const code = codeInput.value.trim();
    const password = passwordInput.value;
    const confirm = confirmInput.value;

    if (!email) {
      setMessage(verifyMsg, "Request a verification code first.", "error");
      return;
    }

    if (!code || code.length !== 6) {
      setMessage(verifyMsg, "Enter the 6-digit code from your email.", "error");
      return;
    }

    const entry = getResetEntry(email);
    if (!entry) {
      setMessage(verifyMsg, "Code expired or not found. Request a new code.", "error");
      return;
    }

    if (entry.code !== code) {
      setMessage(verifyMsg, "Incorrect verification code.", "error");
      return;
    }

    if (!password || !confirm) {
      setMessage(verifyMsg, "Enter and confirm your new password.", "error");
      return;
    }

    const strength = getStrengthResult(password);
    if (strength.type === "error") {
      setMessage(verifyMsg, "Password security is low. Use a stronger password.", "error");
      return;
    }

    if (password !== confirm) {
      setMessage(verifyMsg, "Passwords do not match.", "error");
      return;
    }

    updateUserByEmail(email, (u) => ({ ...u, password }));
    clearResetCode(email);
    setMessage(verifyMsg, "Password updated! Redirecting to login…", "success");

    window.setTimeout(() => {
      window.location.href = "login.html";
    }, 1800);
  });

  checkEmailServerStatus();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runForgotPassword);
} else {
  runForgotPassword();
}
