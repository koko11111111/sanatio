const USERS_KEY = "aiDetectorUsers";
const REMEMBERED_EMAIL_KEY = "aiDetectorRememberedEmail";
const CURRENT_USER_KEY = "aiDetectorCurrentUser";

function isStorageAvailable() {
  try {
    const testKey = "__sanatio_storage_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function isAuthPage(filename) {
  const href = (window.location.href || "").toLowerCase();
  const path = (window.location.pathname || "").toLowerCase();
  const file = filename.toLowerCase();
  return href.includes(file) || path.endsWith("/" + file) || path.endsWith(file);
}

function readUsers() {
  if (!isStorageAvailable()) return [];
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  if (!isStorageAvailable()) {
    throw new Error("Storage blocked");
  }
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function findUserByEmail(email) {
  const users = readUsers();
  return users.find((user) => user.email === email) || null;
}

function updateUserByEmail(email, updater) {
  const users = readUsers();
  const nextUsers = users.map((user) => {
    if (user.email !== email) return user;
    return updater(user);
  });
  saveUsers(nextUsers);
}

function setCurrentUser(user) {
  if (!isStorageAvailable()) {
    throw new Error("Storage blocked");
  }
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({
    name: user.name,
    email: user.email,
    profilePhoto: user.profilePhoto || "",
    createdAt: user.createdAt || "",
  }));
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  } catch {
    return null;
  }
}

function logoutCurrentUser() {
  localStorage.removeItem(CURRENT_USER_KEY);
}

function saveProfilePhotoForCurrentUser(photoDataUrl) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  updateUserByEmail(currentUser.email, (user) => ({ ...user, profilePhoto: photoDataUrl }));
  const refreshedUser = findUserByEmail(currentUser.email);
  if (refreshedUser) {
    setCurrentUser(refreshedUser);
  }
}

function requireLoginForPage() {
  const path = (window.location.pathname || "").toLowerCase();
  const href = (window.location.href || "").toLowerCase();
  const isProtected =
    path.endsWith("aipage.html") ||
    path.endsWith("/aipage.html") ||
    path.endsWith("community.html") ||
    path.endsWith("/community.html") ||
    href.includes("aipage.html") ||
    href.includes("community.html");
  if (!isProtected) return;

  if (!getCurrentUser()) {
    window.location.href = "login.html";
  }
}

function showStorageWarning() {
  if (isStorageAvailable()) return;
  const loginMsg = document.getElementById("login-message");
  const signupMsg = document.getElementById("signup-message");
  const text = "This browser blocked saved accounts. Open the site via http://localhost (use a local server) or allow storage for this page.";
  if (loginMsg) {
    loginMsg.textContent = text;
    loginMsg.className = "form-message error";
  }
  if (signupMsg) {
    signupMsg.textContent = text;
    signupMsg.className = "form-message error";
  }
}

function showLoggedInNotice() {
  if (!isAuthPage("login.html") && !isAuthPage("signup.html")) return;

  const user = getCurrentUser();
  if (!user) return;

  const card = document.querySelector(".auth-layout .card");
  if (!card || document.getElementById("logged-in-notice")) return;

  const notice = document.createElement("div");
  notice.id = "logged-in-notice";
  notice.className = "logged-in-notice";
  notice.innerHTML = `
    <p>You are already signed in as <strong>${escapeAuthHtml(user.name || user.email)}</strong>.</p>
    <div class="logged-in-notice-actions">
      <a class="btn btn-primary" href="aipage.html">Go to Dashboard</a>
      <button type="button" class="btn btn-secondary" id="auth-logout-btn">Log Out</button>
    </div>
  `;
  card.insertBefore(notice, card.firstChild.nextSibling);

  document.getElementById("auth-logout-btn")?.addEventListener("click", () => {
    logoutCurrentUser();
    window.location.reload();
  });
}

function escapeAuthHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getPasswordChecks(password) {
  return {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSymbol: /[^A-Za-z0-9]/.test(password),
  };
}

function getStrengthResult(password) {
  const checks = getPasswordChecks(password);
  const passed = Object.values(checks).filter(Boolean).length;

  if (passed <= 2) return { label: "Low security password", type: "error", checks };
  if (passed <= 4) return { label: "Medium security password", type: "warning", checks };
  return { label: "Strong password", type: "success", checks };
}

function setupPasswordToggles() {
  const toggles = document.querySelectorAll(".password-toggle");
  toggles.forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-target");
      const input = document.getElementById(targetId);
      if (!input) return;

      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      button.textContent = isHidden ? "🐵" : "🙈";
      button.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
    });
  });
}

function runSignup() {
  const form = document.getElementById("signup-form");
  if (!form || form.dataset.authBound === "true") return;
  form.dataset.authBound = "true";

  const nameInput = document.getElementById("signup-name");
  const emailInput = document.getElementById("signup-email");
  const passwordInput = document.getElementById("signup-password");
  const confirmInput = document.getElementById("signup-confirm-password");
  const strengthMessage = document.getElementById("password-strength");
  const formMessage = document.getElementById("signup-message");

  function setMessage(element, text, type) {
    element.textContent = text;
    element.className = `form-message ${type}`;
  }

  passwordInput.addEventListener("input", () => {
    const password = passwordInput.value.trim();
    if (!password) {
      setMessage(strengthMessage, "", "");
      return;
    }

    const strength = getStrengthResult(password);
    setMessage(strengthMessage, strength.label, strength.type);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;
    const strength = getStrengthResult(password);

    if (!name || !email || !password || !confirmPassword) {
      setMessage(formMessage, "Please fill all fields.", "error");
      return;
    }

    if (strength.type === "error") {
      setMessage(formMessage, "Password security is low. Use a stronger password.", "error");
      return;
    }

    if (password !== confirmPassword) {
      setMessage(formMessage, "Passwords do not match.", "error");
      return;
    }

    const users = readUsers();
    const userExists = users.some((user) => user.email === email);
    if (userExists) {
      setMessage(formMessage, "This email is already registered.", "error");
      return;
    }

    const newUser = {
      name,
      email,
      password,
      authProvider: "email",
      profilePhoto: "",
      createdAt: new Date().toISOString(),
    };

    try {
      users.push(newUser);
      saveUsers(users);
      setCurrentUser(newUser);
    } catch {
      setMessage(formMessage, "Could not save your account. Try a local server (not file://) or another browser.", "error");
      return;
    }

    setMessage(formMessage, "Account created! Opening dashboard…", "success");
    form.reset();
    setMessage(strengthMessage, "", "");
    window.setTimeout(() => {
      window.location.href = "aipage.html";
    }, 600);
  });
}

function parseGoogleJwt(token) {
  const payload = token.split(".")[1];
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

function loginOrRegisterWithGoogle(profile) {
  const email = String(profile.email || "").toLowerCase();
  const name = profile.name || profile.given_name || "Google User";
  const profilePhoto = profile.picture || "";
  const users = readUsers();
  let user = users.find((item) => item.email === email);

  if (!user) {
    user = {
      name,
      email,
      password: "",
      authProvider: "google",
      profilePhoto,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);
  } else {
    updateUserByEmail(email, (existing) => ({
      ...existing,
      name: existing.name || name,
      authProvider: "google",
      profilePhoto: profilePhoto || existing.profilePhoto || "",
    }));
    user = findUserByEmail(email);
  }

  localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
  try {
    setCurrentUser(user);
  } catch {
    const googleMessage = document.getElementById("google-auth-message");
    if (googleMessage) {
      googleMessage.textContent = "Could not save your session. Try a local server (not file://).";
      googleMessage.className = "form-message error";
    }
    return;
  }
  window.location.href = "aipage.html";
}

function handleGoogleCredential(response) {
  const googleMessage = document.getElementById("google-auth-message");
  try {
    const profile = parseGoogleJwt(response.credential);
    if (!profile.email) {
      throw new Error("Google account has no email.");
    }
    loginOrRegisterWithGoogle(profile);
  } catch (error) {
    if (googleMessage) {
      googleMessage.textContent = "Google sign-in failed. Try again.";
      googleMessage.className = "form-message error";
    }
  }
}

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google Sign-In."));
    document.head.appendChild(script);
  });
}

function setupGoogleAuth() {
  const buttonHost = document.getElementById("google-signin-btn");
  const googleMessage = document.getElementById("google-auth-message");
  if (!buttonHost) return;

  const clientId = typeof GOOGLE_CLIENT_ID === "string" ? GOOGLE_CLIENT_ID.trim() : "";
  if (!clientId) {
    buttonHost.innerHTML = '<p class="google-setup-hint">Add your Google Client ID in <code>config.js</code> to enable Sign in with Google.</p>';
    return;
  }

  if (window.location.protocol === "file:") {
    buttonHost.innerHTML = '<p class="google-setup-hint">Google Sign-In does not work when opening HTML files directly. Use a local server (for example <code>npx serve .</code>) and open the site at <code>http://localhost</code>.</p>';
    if (googleMessage) {
      googleMessage.textContent = "";
      googleMessage.className = "form-message";
    }
    return;
  }

  loadGoogleScript()
    .then(() => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
      });
      window.google.accounts.id.renderButton(buttonHost, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: Math.min(buttonHost.offsetWidth || 320, 400),
      });
    })
    .catch(() => {
      if (googleMessage) {
        googleMessage.textContent = "Could not load Google Sign-In.";
        googleMessage.className = "form-message error";
      }
    });
}

function runLogin() {
  const form = document.getElementById("login-form");
  if (!form || form.dataset.authBound === "true") return;
  form.dataset.authBound = "true";

  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  const rememberInput = document.getElementById("remember-me");
  const formMessage = document.getElementById("login-message");

  let rememberedEmail = "";
  try {
    rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY) || "";
  } catch {
    rememberedEmail = "";
  }
  if (rememberedEmail) {
    emailInput.value = rememberedEmail;
    rememberInput.checked = true;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const users = readUsers();
    const user = users.find((item) => item.email === email);

    if (!user) {
      formMessage.textContent = "No account found with this email.";
      formMessage.className = "form-message error";
      return;
    }

    if (user.authProvider === "google") {
      formMessage.textContent = "This account uses Google. Click Continue with Google.";
      formMessage.className = "form-message warning";
      return;
    }

    if (user.password !== password) {
      formMessage.textContent = "Wrong password.";
      formMessage.className = "form-message error";
      return;
    }

    if (rememberInput.checked) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }

    try {
      setCurrentUser(user);
    } catch {
      formMessage.textContent = "Could not save your session. Try a local server (not file://) or another browser.";
      formMessage.className = "form-message error";
      return;
    }

    formMessage.textContent = "Login successful.";
    formMessage.className = "form-message success";
    window.setTimeout(() => {
      window.location.href = "aipage.html";
    }, 500);
  });
}

function initAuth() {
  requireLoginForPage();
  showStorageWarning();
  showLoggedInNotice();
  runSignup();
  runLogin();
  setupPasswordToggles();
  setupGoogleAuth();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuth);
} else {
  initAuth();
}
