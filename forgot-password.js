/**
 * SANATIO forgot-password.js
 * Step 1: enter email → generate code → show on screen
 * Step 2: enter code + new password → save
 */

function runForgotPassword() {
  const RESET_KEY     = "aiDetectorResetCodes";
  const EXPIRY_MS     = 15 * 60 * 1000;
  const COOLDOWN_MS   = 60 * 1000;

  const requestForm   = document.getElementById("reset-request-form");
  if (!requestForm) return;

  const verifySection = document.getElementById("reset-verify-form");
  const innerForm     = document.getElementById("reset-verify-inner-form");
  const emailInput    = document.getElementById("reset-email");
  const codeInput     = document.getElementById("reset-code");
  const passwordInput = document.getElementById("reset-password");
  const confirmInput  = document.getElementById("reset-confirm");
  const requestMsg    = document.getElementById("reset-request-message");
  const verifyMsg     = document.getElementById("reset-verify-message");
  const strengthMsg   = document.getElementById("reset-strength");
  const emailDisplay  = document.getElementById("reset-email-display");
  const codeDisplay   = document.getElementById("reset-code-display");
  const sendBtn       = document.getElementById("reset-send-btn");
  const resendBtn     = document.getElementById("reset-resend-btn");
  const changeBtn     = document.getElementById("reset-change-email");

  let currentEmail = "";

  // Password toggles
  document.querySelectorAll(".password-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "🐵" : "🙈";
    });
  });

  function msg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = "form-message " + (type||"");
  }

  // Code storage
  function readCodes() {
    try { return JSON.parse(localStorage.getItem(RESET_KEY)) || {}; } catch { return {}; }
  }
  function saveCode(email, code) {
    const c = readCodes();
    c[email] = { code, expiresAt: Date.now()+EXPIRY_MS, sentAt: Date.now() };
    localStorage.setItem(RESET_KEY, JSON.stringify(c));
  }
  function clearCode(email) {
    const c = readCodes(); delete c[email];
    localStorage.setItem(RESET_KEY, JSON.stringify(c));
  }
  function getCode(email) {
    const e = readCodes()[email];
    if (!e || Date.now() > e.expiresAt) { clearCode(email); return null; }
    return e;
  }
  function canResend(email) {
    const e = readCodes()[email];
    return !e || Date.now()-e.sentAt >= COOLDOWN_MS;
  }
  function makeCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // Find user in localStorage or Firebase
  async function findUser(email) {
    if (typeof findUserByEmail === "function") {
      const u = findUserByEmail(email);
      if (u) return u;
    }
    try {
      if (typeof firebase !== "undefined" && firebase.apps?.length) {
        const doc = await firebase.firestore()
          .collection("users").doc(email.replace(/[.#$[\]]/g,"_")).get();
        if (doc.exists) return doc.data();
      }
    } catch {}
    return null;
  }

  // Show step 2 with code
  function showStep2(email, code) {
    currentEmail = email;
    requestForm.classList.add("hidden");
    verifySection.classList.remove("hidden");
    if (emailDisplay) emailDisplay.textContent = email;
    if (codeDisplay) codeDisplay.textContent = code;
    codeInput.value = "";
    codeInput.focus();
  }

  // Back to step 1
  function showStep1() {
    currentEmail = "";
    verifySection.classList.add("hidden");
    requestForm.classList.remove("hidden");
    msg(requestMsg, "", "");
    msg(verifyMsg, "", "");
  }

  // Request / resend code
  async function requestCode(email, isResend) {
    const btnEl = isResend ? resendBtn : sendBtn;
    const msgEl = isResend ? verifyMsg : requestMsg;

    if (isResend && !canResend(email)) {
      msg(msgEl, "Please wait before requesting another code.", "warning");
      return;
    }

    if (btnEl) { btnEl.disabled = true; btnEl.textContent = "Please wait…"; }

    const user = await findUser(email);
    if (!user) {
      msg(msgEl, "No account found with this email.", "error");
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = isResend ? "Generate New Code" : "Get Reset Code"; }
      return;
    }
    if (user.authProvider === "google") {
      msg(msgEl, "This account uses Google. Reset your password via Google instead.", "warning");
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = isResend ? "Generate New Code" : "Get Reset Code"; }
      return;
    }

    const code = makeCode();
    saveCode(email, code);

    if (isResend) {
      if (codeDisplay) codeDisplay.textContent = code;
      msg(msgEl, "New code generated.", "success");
    } else {
      showStep2(email, code);
    }

    if (btnEl) { btnEl.disabled = false; btnEl.textContent = isResend ? "Generate New Code" : "Get Reset Code"; }
  }

  // Password strength
  passwordInput?.addEventListener("input", () => {
    const pw = passwordInput.value.trim();
    if (!pw) { msg(strengthMsg, "", ""); return; }
    if (typeof getStrengthResult === "function") {
      const r = getStrengthResult(pw);
      msg(strengthMsg, r.label, r.type);
    }
  });

  // Step 1 submit
  requestForm.addEventListener("submit", e => {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!email) { msg(requestMsg, "Please enter your email.", "error"); return; }
    requestCode(email, false);
  });

  // Resend
  resendBtn?.addEventListener("click", () => {
    if (currentEmail) requestCode(currentEmail, true);
  });

  // Change email
  changeBtn?.addEventListener("click", showStep1);

  // Step 2 submit
  innerForm?.addEventListener("submit", e => {
    e.preventDefault();
    const code    = codeInput.value.trim();
    const pw      = passwordInput.value;
    const confirm = confirmInput.value;

    if (!currentEmail) { msg(verifyMsg, "Please start over.", "error"); return; }
    if (!code || code.length !== 6) { msg(verifyMsg, "Enter the 6-digit code shown above.", "error"); return; }

    const entry = getCode(currentEmail);
    if (!entry) { msg(verifyMsg, "Code expired. Generate a new one.", "error"); return; }
    if (entry.code !== code) { msg(verifyMsg, "Wrong code. Check the code shown above.", "error"); return; }
    if (!pw || !confirm) { msg(verifyMsg, "Please fill in both password fields.", "error"); return; }

    if (typeof getStrengthResult === "function") {
      if (getStrengthResult(pw).type === "error") {
        msg(verifyMsg, "Password too weak. Add uppercase, lowercase, number and symbol.", "error");
        return;
      }
    }
    if (pw !== confirm) { msg(verifyMsg, "Passwords don't match.", "error"); return; }

    if (typeof updateUserByEmail === "function") {
      updateUserByEmail(currentEmail, u => ({ ...u, password: pw }));
    }
    clearCode(currentEmail);
    msg(verifyMsg, "✓ Password updated! Taking you to login…", "success");
    setTimeout(() => { window.location.href = "login.html"; }, 1500);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runForgotPassword);
} else {
  runForgotPassword();
}
