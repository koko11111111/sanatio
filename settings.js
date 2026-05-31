/**
 * SANATIO settings.js
 */

function safeImg(url, name) {
  const v = String(url||"").trim();
  if (v.startsWith("data:image/")||v.startsWith("http://")||v.startsWith("https://")) return v;
  const i = (name||"U").trim().charAt(0).toUpperCase();
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="54%" text-anchor="middle" fill="#e5e7eb" font-size="44" font-family="Arial,sans-serif">${i}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;
}
function setMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `form-message ${type||""}`;
}

async function runSettingsPage() {
  const me = getCurrentUser();
  if (!me) { window.location.href = "login.html"; return; }

  let db = null;
  try {
    if (typeof FIREBASE_CONFIG==="object" && FIREBASE_CONFIG?.apiKey) {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
    }
  } catch {}

  const userKey = me.email.replace(/[.#$[\]]/g,"_");

  // Load current user data from Firestore
  let userData = { ...me };
  if (db) {
    try {
      const doc = await db.collection("users").doc(userKey).get();
      if (doc.exists) userData = { ...userData, ...doc.data() };
    } catch {}
  }

  // Profile photo
  const avatarEl = document.getElementById("settings-avatar");
  const avatarInput = document.getElementById("settings-avatar-input");
  avatarEl.src = safeImg(userData.profilePhoto, userData.name);

  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files[0];
    if (!file) return;
    if (file.size > 800000) { setMsg("settings-avatar-msg","Image must be under 800 KB.","error"); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const url = String(reader.result||"");
      avatarEl.src = url;
      if (typeof saveProfilePhotoForCurrentUser==="function") saveProfilePhotoForCurrentUser(url);
      if (db) await db.collection("users").doc(userKey).set({ profilePhoto: url },{ merge:true });
      setMsg("settings-avatar-msg","Profile photo updated!","success");
    };
    reader.readAsDataURL(file);
  });

  // Cover photo
  const coverImg = document.getElementById("settings-cover-img");
  const coverInput = document.getElementById("settings-cover-input");
  coverImg.src = safeImg(userData.coverPhoto, userData.name);
  if (!userData.coverPhoto) coverImg.style.background = "linear-gradient(135deg,#1e2a1f,#0b0f0c)";

  coverInput.addEventListener("change", async () => {
    const file = coverInput.files[0];
    if (!file) return;
    if (file.size > 1500000) { setMsg("settings-cover-msg","Cover must be under 1.5 MB.","error"); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const url = String(reader.result||"");
      coverImg.src = url;
      coverImg.style.background = "";
      if (db) await db.collection("users").doc(userKey).set({ coverPhoto: url },{ merge:true });
      setMsg("settings-cover-msg","Cover photo updated!","success");
    };
    reader.readAsDataURL(file);
  });

  // Bio
  const bioInput = document.getElementById("settings-bio");
  bioInput.value = userData.bio || "";
  document.getElementById("settings-bio-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const bio = bioInput.value.trim();
    if (db) await db.collection("users").doc(userKey).set({ bio },{ merge:true });
    setMsg("settings-bio-msg","Bio saved!","success");
  });

  // Display name
  const nameInput = document.getElementById("settings-name");
  nameInput.value = userData.name || "";
  document.getElementById("settings-name-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) { setMsg("settings-name-msg","Name cannot be empty.","error"); return; }
    if (db) await db.collection("users").doc(userKey).set({ name },{ merge:true });
    // Update localStorage
    if (typeof updateUserByEmail==="function") updateUserByEmail(me.email, u => ({...u, name}));
    if (typeof setCurrentUser==="function") {
      const fresh = typeof findUserByEmail==="function" ? findUserByEmail(me.email) : {...me, name};
      if (fresh) setCurrentUser(fresh);
    }
    setMsg("settings-name-msg","Name updated!","success");
  });

  // View profile link
  document.getElementById("settings-view-profile").href = `profile.html?user=${encodeURIComponent(me.email)}`;
}

if (document.readyState==="loading") {
  document.addEventListener("DOMContentLoaded", runSettingsPage);
} else {
  runSettingsPage();
}
