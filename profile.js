/**
 * SANATIO profile.js
 * Firebase is already initialized in profile.html before this runs.
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
function fmtDate(ts) {
  if (!ts) return "";
  const d = typeof ts.toDate==="function" ? ts.toDate() : new Date(ts);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"});
}
function fmtAgo(ts) {
  if (!ts) return "Just now";
  const d = typeof ts.toDate==="function" ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "Just now";
  const diff = Date.now()-d.getTime();
  if (diff<60000) return "Just now";
  if (diff<3600000) return Math.floor(diff/60000)+"m ago";
  if (diff<86400000) return Math.floor(diff/3600000)+"h ago";
  if (diff<604800000) return Math.floor(diff/86400000)+"d ago";
  return d.toLocaleDateString();
}

async function runProfilePage() {
  const params = new URLSearchParams(window.location.search);
  const targetEmail = params.get("user")?.trim().toLowerCase();
  const me = getCurrentUser();

  if (!me) { window.location.href="login.html"; return; }
  if (!targetEmail) { window.location.href=`profile.html?user=${encodeURIComponent(me.email)}`; return; }

  const isOwn = me.email === targetEmail;

  // Firebase was already inited in the HTML — just grab the instance
  let db = null;
  try {
    if (firebase.apps.length) db = firebase.firestore();
  } catch(e) { console.warn("Firestore:", e); }

  // ── DOM refs ───────────────────────────────────────────────────────────
  const coverImg        = document.getElementById("fb-cover-img");
  const coverEditBtn    = document.getElementById("fb-cover-edit-btn");
  const coverInput      = document.getElementById("fb-cover-input");
  const avatarEl        = document.getElementById("fb-avatar");
  const avatarEdit      = document.getElementById("fb-avatar-edit");
  const avatarInput     = document.getElementById("fb-avatar-input");
  const profileNameEl   = document.getElementById("fb-profile-name");
  const friendCountEl   = document.getElementById("fb-friend-count");
  const actionsEl       = document.getElementById("fb-profile-actions");
  const bioDisplay      = document.getElementById("fb-bio-display");
  const bioEditBtn      = document.getElementById("fb-edit-bio-btn");
  const bioForm         = document.getElementById("fb-bio-form");
  const bioInput        = document.getElementById("fb-bio-input");
  const bioCancel       = document.getElementById("fb-bio-cancel");
  const friendsGrid     = document.getElementById("fb-friends-grid");
  const friendsCountLbl = document.getElementById("fb-friends-count-label");
  const seeAllBtn       = document.getElementById("fb-see-all-friends");
  const postsFeed       = document.getElementById("fb-posts-feed");
  const friendsFullGrid = document.getElementById("fb-friends-full-grid");
  const aboutContent    = document.getElementById("fb-about-content");

  // ── Load user profile ──────────────────────────────────────────────────
  let user = null;
  const userKey = targetEmail.replace(/[.#$[\]]/g,"_");

  if (db) {
    try {
      const doc = await db.collection("users").doc(userKey).get();
      if (doc.exists) user = doc.data();
    } catch(e) { console.warn("Load user:", e); }
  }
  // Fallback: localStorage (same device)
  if (!user) {
    const locals = JSON.parse(localStorage.getItem("aiDetectorUsers")||"[]");
    const found = locals.find(u=>u.email===targetEmail);
    if (found) user = found;
  }
  if (!user) {
    profileNameEl.textContent = "User not found";
    postsFeed.innerHTML = '<p class="fb-empty">This profile does not exist or has not been synced to Firebase yet.</p>';
    return;
  }

  // ── Render cover + avatar + name ───────────────────────────────────────
  document.title = `${user.name||user.email} | SANATIO`;
  profileNameEl.textContent = user.name || user.email;

  if (user.coverPhoto) {
    coverImg.src = user.coverPhoto;
  } else {
    coverImg.style.background = "linear-gradient(135deg,#1e2a1f,#0b0f0c)";
  }
  avatarEl.src = safeImg(user.profilePhoto, user.name);

  // ── Friends count ──────────────────────────────────────────────────────
  let friendsList = [];
  try { friendsList = await FriendSystem.getFriends(targetEmail); } catch(e) { console.warn("Friends:", e); }
  friendCountEl.textContent = `${friendsList.length} ${friendsList.length===1?"friend":"friends"}`;
  friendsCountLbl.textContent = friendsList.length ? `(${friendsList.length})` : "";

  // ── Action buttons ─────────────────────────────────────────────────────
  if (isOwn) {
    coverEditBtn.classList.remove("hidden");
    avatarEdit.classList.remove("hidden");
    bioEditBtn.classList.remove("hidden");
    actionsEl.innerHTML = `<a href="settings.html" class="btn btn-secondary fb-action-btn">✏️ Edit Profile</a>`;

    coverInput.addEventListener("change", async () => {
      const file = coverInput.files[0];
      if (!file || file.size>1500000) { alert("Max 1.5 MB"); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const url = String(reader.result||"");
        coverImg.src = url;
        coverImg.style.background = "";
        if (db) await db.collection("users").doc(userKey).set({coverPhoto:url},{merge:true});
      };
      reader.readAsDataURL(file);
    });

    avatarInput.addEventListener("change", async () => {
      const file = avatarInput.files[0];
      if (!file || file.size>800000) { alert("Max 800 KB"); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const url = String(reader.result||"");
        avatarEl.src = url;
        if (typeof saveProfilePhotoForCurrentUser==="function") saveProfilePhotoForCurrentUser(url);
        if (db) await db.collection("users").doc(userKey).set({profilePhoto:url},{merge:true});
      };
      reader.readAsDataURL(file);
    });

    bioEditBtn.addEventListener("click", () => {
      bioInput.value = user.bio||"";
      bioForm.classList.remove("hidden");
      bioEditBtn.classList.add("hidden");
      bioInput.focus();
    });
    bioCancel.addEventListener("click", () => {
      bioForm.classList.add("hidden");
      bioEditBtn.classList.remove("hidden");
    });
    bioForm.addEventListener("submit", async e => {
      e.preventDefault();
      const bio = bioInput.value.trim();
      user.bio = bio;
      renderBio();
      bioForm.classList.add("hidden");
      bioEditBtn.classList.remove("hidden");
      if (db) await db.collection("users").doc(userKey).set({bio},{merge:true});
    });
  } else {
    // Other user's profile — show friend + message buttons
    await renderFriendButton();

    const msgBtn = document.createElement("button");
    msgBtn.className = "btn btn-secondary fb-action-btn";
    msgBtn.textContent = "💬 Message";
    msgBtn.addEventListener("click", () => {
      try {
        sessionStorage.setItem("pendingMessageUser", JSON.stringify({
          email: user.email, name: user.name, profilePhoto: user.profilePhoto||""
        }));
      } catch {}
      window.location.href = "messages.html";
    });
    actionsEl.appendChild(msgBtn);
  }

  // ── Bio ────────────────────────────────────────────────────────────────
  function renderBio() {
    if (user.bio) {
      bioDisplay.innerHTML = `<p class="fb-bio-text">${escHtml(user.bio)}</p>`;
    } else {
      bioDisplay.innerHTML = isOwn
        ? `<p class="fb-bio-placeholder">Add a bio…</p>`
        : `<p class="fb-bio-placeholder">No bio yet.</p>`;
    }
  }
  renderBio();

  // ── About tab ──────────────────────────────────────────────────────────
  aboutContent.innerHTML = `
    <div class="fb-about-row"><span class="fb-about-icon">📧</span><span>${escHtml(user.email)}</span></div>
    ${user.bio ? `<div class="fb-about-row"><span class="fb-about-icon">📝</span><span>${escHtml(user.bio)}</span></div>` : ""}
    <div class="fb-about-row"><span class="fb-about-icon">📅</span><span>Joined ${fmtDate(user.createdAt)||"recently"}</span></div>
  `;

  // ── Friends grid (sidebar preview) ────────────────────────────────────
  await renderFriendsGrid(friendsList, friendsGrid, 9);
  seeAllBtn.addEventListener("click", () => switchTab("friends"));

  // ── Posts ──────────────────────────────────────────────────────────────
  await loadPosts(targetEmail);

  // ── Tabs ───────────────────────────────────────────────────────────────
  document.querySelectorAll(".fb-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
      if (btn.dataset.tab==="friends") renderFriendsGrid(friendsList, friendsFullGrid, 999);
    });
  });

  function switchTab(name) {
    document.querySelectorAll(".fb-tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
    document.querySelectorAll(".fb-tab-panel").forEach(p=>p.classList.toggle("active",p.id===`fb-${name}-tab`));
  }

  // ── Friends grid renderer ──────────────────────────────────────────────
  async function renderFriendsGrid(emails, container, limit) {
    if (!emails.length) { container.innerHTML='<p class="fb-empty">No friends yet.</p>'; return; }
    container.innerHTML='<p class="fb-empty" style="font-size:.8rem">Loading…</p>';
    const shown = emails.slice(0,limit);
    let html="";
    for (const email of shown) {
      let name=email, photo="";
      if (db) {
        try {
          const doc=await db.collection("users").doc(email.replace(/[.#$[\]]/g,"_")).get();
          if (doc.exists) { name=doc.data().name||email; photo=doc.data().profilePhoto||""; }
        } catch {}
      }
      html+=`<a class="fb-friend-card" href="profile.html?user=${encodeURIComponent(email)}">
        <img src="${safeImg(photo,name)}" alt="${escHtml(name)}">
        <p>${escHtml(name)}</p>
      </a>`;
    }
    container.innerHTML=html;
  }

  // ── Load posts ─────────────────────────────────────────────────────────
  async function loadPosts(email) {
    if (!db) { postsFeed.innerHTML='<p class="fb-empty">Firebase not connected.</p>'; return; }
    postsFeed.innerHTML='<p class="fb-empty">Loading posts…</p>';

    const runQuery = async (withOrder) => {
      let q = db.collection("community_posts").where("email","==",email).limit(30);
      if (withOrder) q = q.orderBy("createdAt","desc");
      const snap = await q.get();
      let docs = snap.docs.map(d=>({id:d.id,...d.data()}));
      if (!withOrder) docs.sort((a,b)=>{
        const ta=a.createdAt?.toDate?.()??new Date(a.createdAt||0);
        const tb=b.createdAt?.toDate?.()??new Date(b.createdAt||0);
        return tb-ta;
      });
      return docs;
    };

    try {
      let docs;
      try { docs=await runQuery(true); }
      catch(e) {
        if (e.code==="failed-precondition") {
          console.warn("Posts: index missing, using unordered fallback.");
          docs=await runQuery(false);
        } else throw e;
      }
      if (!docs.length) { postsFeed.innerHTML='<p class="fb-empty">No posts yet.</p>'; return; }
      postsFeed.innerHTML=docs.map(renderPost).join("");
    } catch(e) {
      console.error("loadPosts:",e);
      postsFeed.innerHTML=`<p class="fb-empty">Could not load posts: ${e.message||""}</p>`;
    }
  }

  function renderPost(p) {
    const avatar = safeImg(p.photo||"", p.author);
    const imgHtml = p.attachment?.kind==="image"&&p.attachment.dataUrl
      ? `<img class="fb-post-img" src="${p.attachment.dataUrl}" alt="">` : "";
    const scanHtml = p.scanResult ? `
      <div class="fb-post-scan">
        ${p.scanResult.thumb?`<img class="fb-post-scan-thumb" src="${p.scanResult.thumb}" alt="">`:""}
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
            <p class="fb-post-date">${fmtAgo(p.createdAt)}</p>
          </div>
        </div>
        ${p.text?`<p class="fb-post-text">${escHtml(p.text)}</p>`:""}
        ${imgHtml}${scanHtml}
      </div>`;
  }

  // ── Friend button ──────────────────────────────────────────────────────
  async function renderFriendButton() {
    // Remove any existing friend btn
    actionsEl.querySelector("[data-role='friend']")?.remove();

    let status = "none";
    try { status = await FriendSystem.getStatus(me.email, targetEmail); }
    catch(e) { console.warn("getStatus:", e); }

    let btn;
    if (status==="friends") {
      btn = document.createElement("button");
      btn.className = "btn btn-secondary fb-action-btn";
      btn.textContent = "✓ Friends";
      btn.addEventListener("click", async () => {
        if (!confirm("Unfriend this person?")) return;
        try {
          await FriendSystem.unfriend(me.email, targetEmail);
          friendsList = await FriendSystem.getFriends(targetEmail);
          friendCountEl.textContent = `${friendsList.length} ${friendsList.length===1?"friend":"friends"}`;
          await renderFriendButton();
        } catch(e) { alert("Could not unfriend: "+e.message); }
      });
    } else if (status==="request_sent") {
      btn = document.createElement("button");
      btn.className = "btn btn-secondary fb-action-btn";
      btn.textContent = "⏳ Request Sent";
      btn.disabled = true;
    } else if (status==="request_received") {
      btn = document.createElement("div");
      btn.className = "fb-action-btn-group";
      btn.innerHTML = `
        <button class="btn btn-primary fb-action-btn" id="fb-accept-btn">✓ Accept Request</button>
        <button class="btn btn-secondary fb-action-btn" id="fb-decline-btn">✕ Decline</button>`;
      setTimeout(() => {
        document.getElementById("fb-accept-btn")?.addEventListener("click", async () => {
          try {
            await FriendSystem.acceptRequest(targetEmail, me.email);
            friendsList = await FriendSystem.getFriends(targetEmail);
            friendCountEl.textContent = `${friendsList.length} ${friendsList.length===1?"friend":"friends"}`;
            await renderFriendButton();
          } catch(e) { alert("Error: "+e.message); }
        });
        document.getElementById("fb-decline-btn")?.addEventListener("click", async () => {
          try {
            await FriendSystem.declineRequest(targetEmail, me.email);
            await renderFriendButton();
          } catch(e) { alert("Error: "+e.message); }
        });
      }, 0);
    } else {
      btn = document.createElement("button");
      btn.className = "btn btn-primary fb-action-btn";
      btn.textContent = "＋ Add Friend";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Sending…";
        try {
          await FriendSystem.sendRequest(me.email, targetEmail);
          await renderFriendButton();
        } catch(e) {
          if (e.message==="already_sent") { btn.textContent="⏳ Request Sent"; }
          else if (e.message==="already_friends") { await renderFriendButton(); }
          else { btn.disabled=false; btn.textContent="＋ Add Friend"; alert("Error: "+e.message); }
        }
      });
    }

    btn.dataset.role = "friend";
    actionsEl.prepend(btn);
  }
}

if (document.readyState==="loading") {
  document.addEventListener("DOMContentLoaded", runProfilePage);
} else {
  runProfilePage();
}
