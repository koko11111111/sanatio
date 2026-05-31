/**
 * SANATIO profile.js - Facebook-style profile page
 */

function escHtml(t) {
  return String(t||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
function safeImg(url, name) {
  const v = String(url||"").trim();
  if (v.startsWith("data:image/")||v.startsWith("http://")||v.startsWith("https://")) return v;
  const i = (name||"U").trim().charAt(0).toUpperCase();
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="54%" text-anchor="middle" fill="#e5e7eb" font-size="44" font-family="Arial,sans-serif">${i}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;
}
function formatDate(ts) {
  if (!ts) return "";
  const d = typeof ts.toDate==="function" ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"});
}
function formatPostDate(ts) {
  if (!ts) return "Just now";
  const d = typeof ts.toDate==="function" ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "Just now";
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return Math.floor(diff/60000)+"m ago";
  if (diff < 86400000) return Math.floor(diff/3600000)+"h ago";
  if (diff < 604800000) return Math.floor(diff/86400000)+"d ago";
  return d.toLocaleDateString();
}

async function runProfilePage() {
  const params = new URLSearchParams(window.location.search);
  const targetEmail = params.get("user")?.trim().toLowerCase();
  const me = getCurrentUser();

  if (!targetEmail) { window.location.href = me ? `profile.html?user=${encodeURIComponent(me.email)}` : "index.html"; return; }
  if (!me) { window.location.href = "login.html"; return; }

  const isOwn = me.email === targetEmail;

  // Init Firebase
  let db = null;
  try {
    if (typeof FIREBASE_CONFIG==="object" && FIREBASE_CONFIG?.apiKey) {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
    }
  } catch(e) { console.warn("Firebase:",e); }

  // DOM refs
  const coverImg       = document.getElementById("fb-cover-img");
  const coverEditBtn   = document.getElementById("fb-cover-edit-btn");
  const coverInput     = document.getElementById("fb-cover-input");
  const avatarEl       = document.getElementById("fb-avatar");
  const avatarEdit     = document.getElementById("fb-avatar-edit");
  const avatarInput    = document.getElementById("fb-avatar-input");
  const profileName    = document.getElementById("fb-profile-name");
  const friendCount    = document.getElementById("fb-friend-count");
  const actionsEl      = document.getElementById("fb-profile-actions");
  const bioDisplay     = document.getElementById("fb-bio-display");
  const bioEditBtn     = document.getElementById("fb-edit-bio-btn");
  const bioForm        = document.getElementById("fb-bio-form");
  const bioInput       = document.getElementById("fb-bio-input");
  const bioCancel      = document.getElementById("fb-bio-cancel");
  const friendsGrid    = document.getElementById("fb-friends-grid");
  const friendsCount   = document.getElementById("fb-friends-count-label");
  const seeAllBtn      = document.getElementById("fb-see-all-friends");
  const postsFeed      = document.getElementById("fb-posts-feed");
  const friendsFullGrid= document.getElementById("fb-friends-full-grid");
  const aboutContent   = document.getElementById("fb-about-content");

  // ── Load user ──────────────────────────────────────────────────────────
  let user = null;
  if (db) {
    try {
      const key = targetEmail.replace(/[.#$[\]]/g,"_");
      const doc = await db.collection("users").doc(key).get();
      if (doc.exists) user = doc.data();
    } catch {}
  }
  if (!user) {
    const locals = JSON.parse(localStorage.getItem("aiDetectorUsers")||"[]");
    user = locals.find(u=>u.email===targetEmail)||null;
  }
  if (!user) {
    postsFeed.innerHTML = '<p class="fb-empty">User not found.</p>';
    profileName.textContent = "Unknown User";
    return;
  }

  // ── Render header ──────────────────────────────────────────────────────
  coverImg.src = safeImg(user.coverPhoto, user.name);
  if (!user.coverPhoto) coverImg.style.background = "linear-gradient(135deg,#1e2a1f,#0b0f0c)";
  avatarEl.src = safeImg(user.profilePhoto, user.name);
  profileName.textContent = user.name || user.email;
  document.title = `${user.name} | SANATIO`;

  // ── Friends count ──────────────────────────────────────────────────────
  let friendsList = [];
  try { friendsList = await FriendSystem.getFriends(targetEmail); } catch {}
  friendCount.textContent = `${friendsList.length} ${friendsList.length===1?"friend":"friends"}`;

  // ── Own profile controls ───────────────────────────────────────────────
  if (isOwn) {
    coverEditBtn.classList.remove("hidden");
    avatarEdit.classList.remove("hidden");
    bioEditBtn.classList.remove("hidden");

    // Cover photo upload
    coverInput.addEventListener("change", async () => {
      const file = coverInput.files[0];
      if (!file) return;
      if (file.size > 1500000) { alert("Cover photo must be under 1.5 MB."); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const url = String(reader.result||"");
        coverImg.src = url;
        coverImg.style.background = "";
        if (db) await db.collection("users").doc(targetEmail.replace(/[.#$[\]]/g,"_")).set({ coverPhoto: url },{ merge:true });
      };
      reader.readAsDataURL(file);
    });

    // Avatar upload
    avatarInput.addEventListener("change", async () => {
      const file = avatarInput.files[0];
      if (!file) return;
      if (file.size > 800000) { alert("Profile photo must be under 800 KB."); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const url = String(reader.result||"");
        avatarEl.src = url;
        if (typeof saveProfilePhotoForCurrentUser==="function") saveProfilePhotoForCurrentUser(url);
        if (db) await db.collection("users").doc(targetEmail.replace(/[.#$[\]]/g,"_")).set({ profilePhoto: url },{ merge:true });
      };
      reader.readAsDataURL(file);
    });

    // Bio
    bioEditBtn.addEventListener("click", () => {
      bioForm.classList.remove("hidden");
      bioEditBtn.classList.add("hidden");
      bioInput.value = user.bio || "";
      bioInput.focus();
    });
    bioCancel.addEventListener("click", () => {
      bioForm.classList.add("hidden");
      bioEditBtn.classList.remove("hidden");
    });
    bioForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const bio = bioInput.value.trim();
      user.bio = bio;
      bioDisplay.innerHTML = bio ? `<p class="fb-bio-text">${escHtml(bio)}</p>` : `<p class="fb-bio-placeholder">Add a bio…</p>`;
      bioForm.classList.add("hidden");
      bioEditBtn.classList.remove("hidden");
      if (db) await db.collection("users").doc(targetEmail.replace(/[.#$[\]]/g,"_")).set({ bio },{ merge:true });
    });

    // Edit profile button
    actionsEl.innerHTML = `<a href="settings.html" class="btn btn-secondary fb-action-btn">✏️ Edit Profile</a>`;
  } else {
    // ── Friend action button ──────────────────────────────────────────────
    renderFriendButton(targetEmail, me.email);
    // Message button
    const msgBtn = document.createElement("button");
    msgBtn.className = "btn btn-secondary fb-action-btn";
    msgBtn.textContent = "💬 Message";
    msgBtn.addEventListener("click", () => {
      try { sessionStorage.setItem("pendingMessageUser", JSON.stringify({ email: user.email, name: user.name, profilePhoto: user.profilePhoto||"" })); } catch {}
      window.location.href = "messages.html";
    });
    actionsEl.appendChild(msgBtn);
  }

  // ── Bio display ────────────────────────────────────────────────────────
  if (user.bio) {
    bioDisplay.innerHTML = `<p class="fb-bio-text">${escHtml(user.bio)}</p>`;
  } else {
    bioDisplay.innerHTML = isOwn ? `<p class="fb-bio-placeholder">Add a bio…</p>` : `<p class="fb-bio-placeholder">No bio yet.</p>`;
  }

  // ── About panel ────────────────────────────────────────────────────────
  aboutContent.innerHTML = `
    <div class="fb-about-row"><span class="fb-about-icon">📧</span><span>${escHtml(user.email)}</span></div>
    ${user.bio ? `<div class="fb-about-row"><span class="fb-about-icon">📝</span><span>${escHtml(user.bio)}</span></div>` : ""}
    <div class="fb-about-row"><span class="fb-about-icon">📅</span><span>Joined ${formatDate(user.createdAt)}</span></div>
  `;

  // ── Friends grid (sidebar) ─────────────────────────────────────────────
  await renderFriendsGrid(friendsList, friendsGrid, 9);
  friendsCount.textContent = friendsList.length > 0 ? `(${friendsList.length})` : "";
  seeAllBtn.addEventListener("click", () => switchTab("friends"));

  // ── Posts ──────────────────────────────────────────────────────────────
  await loadPosts(targetEmail);

  // ── Tabs ───────────────────────────────────────────────────────────────
  document.querySelectorAll(".fb-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
      if (btn.dataset.tab === "friends") renderFriendsGrid(friendsList, friendsFullGrid, 999);
    });
  });

  function switchTab(name) {
    document.querySelectorAll(".fb-tab").forEach(b => b.classList.toggle("active", b.dataset.tab===name));
    document.querySelectorAll(".fb-tab-panel").forEach(p => p.classList.toggle("active", p.id===`fb-${name}-tab`));
  }

  // ── Render friends grid ────────────────────────────────────────────────
  async function renderFriendsGrid(emails, container, limit) {
    if (!emails.length) {
      container.innerHTML = '<p class="fb-empty">No friends yet.</p>';
      return;
    }
    container.innerHTML = '<p class="fb-empty" style="font-size:.8rem">Loading…</p>';
    const shown = emails.slice(0, limit);
    let html = "";
    for (const email of shown) {
      let name = email, photo = "";
      if (db) {
        try {
          const d = await db.collection("users").doc(email.replace(/[.#$[\]]/g,"_")).get();
          if (d.exists) { name = d.data().name||email; photo = d.data().profilePhoto||""; }
        } catch {}
      }
      html += `
        <a class="fb-friend-card" href="profile.html?user=${encodeURIComponent(email)}">
          <img src="${safeImg(photo,name)}" alt="${escHtml(name)}">
          <p>${escHtml(name)}</p>
        </a>`;
    }
    container.innerHTML = html;
  }

  // ── Load posts ─────────────────────────────────────────────────────────
  async function loadPosts(email) {
    if (!db) { postsFeed.innerHTML='<p class="fb-empty">Firebase not connected.</p>'; return; }
    try {
      const snap = await db.collection("community_posts")
        .where("email","==",email)
        .orderBy("createdAt","desc")
        .limit(30)
        .get();
      if (snap.empty) { postsFeed.innerHTML='<p class="fb-empty">No posts yet.</p>'; return; }
      postsFeed.innerHTML = snap.docs.map(d => renderPost({id:d.id,...d.data()})).join("");
    } catch(e) {
      console.error(e);
      postsFeed.innerHTML = '<p class="fb-empty">Could not load posts.</p>';
    }
  }

  function renderPost(p) {
    const avatar = safeImg(p.photo||"", p.author);
    const img = p.attachment?.kind==="image" && p.attachment.dataUrl ? `<img class="fb-post-img" src="${p.attachment.dataUrl}" alt="Post image">` : "";
    const scan = p.scanResult ? `
      <div class="fb-post-scan">
        ${p.scanResult.thumb ? `<img class="fb-post-scan-thumb" src="${p.scanResult.thumb}" alt="">` : ""}
        <div>
          <p class="fb-post-scan-label">${escHtml(p.scanResult.label||"")}</p>
          <p class="fb-post-scan-score">AI Score: ${p.scanResult.score||0}%</p>
        </div>
      </div>` : "";
    return `
      <div class="fb-post-card">
        <div class="fb-post-head">
          <img class="fb-post-avatar" src="${avatar}" alt="">
          <div>
            <a class="fb-post-author" href="profile.html?user=${encodeURIComponent(p.email||"")}">${escHtml(p.author||"")}</a>
            <p class="fb-post-date">${formatPostDate(p.createdAt)}</p>
          </div>
        </div>
        ${p.text ? `<p class="fb-post-text">${escHtml(p.text)}</p>` : ""}
        ${img}
        ${scan}
      </div>`;
  }

  // ── Friend button ──────────────────────────────────────────────────────
  async function renderFriendButton(theirEmail, myEmail) {
    let status = "none";
    try { status = await FriendSystem.getStatus(myEmail, theirEmail); } catch {}

    let btn;
    if (status === "friends") {
      btn = document.createElement("button");
      btn.className = "btn btn-secondary fb-action-btn";
      btn.textContent = "✓ Friends";
      btn.addEventListener("click", async () => {
        if (!confirm("Unfriend this person?")) return;
        await FriendSystem.unfriend(myEmail, theirEmail);
        renderFriendButton(theirEmail, myEmail);
      });
    } else if (status === "request_sent") {
      btn = document.createElement("button");
      btn.className = "btn btn-secondary fb-action-btn";
      btn.textContent = "⏳ Request Sent";
      btn.disabled = true;
    } else if (status === "request_received") {
      btn = document.createElement("div");
      btn.className = "fb-action-btn-group";
      btn.innerHTML = `
        <button class="btn btn-primary fb-action-btn" id="fb-accept-btn">✓ Accept</button>
        <button class="btn btn-secondary fb-action-btn" id="fb-decline-btn">✕ Decline</button>`;
      setTimeout(() => {
        document.getElementById("fb-accept-btn")?.addEventListener("click", async () => {
          await FriendSystem.acceptRequest(theirEmail, myEmail);
          renderFriendButton(theirEmail, myEmail);
          friendsList = await FriendSystem.getFriends(targetEmail);
          friendCount.textContent = `${friendsList.length} ${friendsList.length===1?"friend":"friends"}`;
        });
        document.getElementById("fb-decline-btn")?.addEventListener("click", async () => {
          await FriendSystem.declineRequest(theirEmail, myEmail);
          renderFriendButton(theirEmail, myEmail);
        });
      }, 0);
    } else {
      btn = document.createElement("button");
      btn.className = "btn btn-primary fb-action-btn";
      btn.textContent = "＋ Add Friend";
      btn.addEventListener("click", async () => {
        try {
          await FriendSystem.sendRequest(myEmail, theirEmail);
          renderFriendButton(theirEmail, myEmail);
        } catch(e) {
          alert(e.message === "already_sent" ? "Request already sent." : e.message);
        }
      });
    }

    // Clear previous friend button
    actionsEl.querySelector(".fb-action-btn[data-role='friend'], .fb-action-btn-group")?.remove();
    if (btn.classList.contains("fb-action-btn")) btn.dataset.role = "friend";
    actionsEl.prepend(btn);
  }
}

if (document.readyState==="loading") {
  document.addEventListener("DOMContentLoaded", runProfilePage);
} else {
  runProfilePage();
}
