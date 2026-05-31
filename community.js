/**
 * SANATIO community.js v2 — Firebase edition
 * Posts are now stored in Firestore and visible to ALL users in real time.
 * Likes, dislikes, replies, deletes all sync live.
 *
 * Setup: add your Firebase config to config.js (see instructions in that file).
 */

// ── Firebase initialisation ──────────────────────────────────────────────────
// Loaded from CDN in community.html. Falls back to localStorage demo if not configured.

const FIREBASE_AVAILABLE = typeof FIREBASE_CONFIG === "object" && FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey;

let db = null; // Firestore instance, set below if Firebase is configured

if (FIREBASE_AVAILABLE) {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.firestore();
  } catch (e) {
    console.warn("SANATIO: Firebase init failed —", e.message);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createFallbackAvatar(name) {
  const initial = (name || "U").trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="54%" text-anchor="middle" fill="#e5e7eb" font-size="44" font-family="Arial, sans-serif">${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeImageSrc(url) {
  const v = String(url || "").trim();
  if (!v) return "";
  if (v.startsWith("data:image/") || v.startsWith("http://") || v.startsWith("https://")) return v;
  return "";
}

function getPostTypeLabel(type) {
  if (type === "media") return "Photo / File";
  if (type === "result") return "Test Result";
  return "Discussion";
}

function formatPostDate(createdAt) {
  if (!createdAt) return "Just now";
  if (typeof createdAt?.toDate === "function") return createdAt.toDate().toLocaleString();
  const d = new Date(createdAt);
  return isNaN(d.getTime()) ? "Just now" : d.toLocaleString();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

// ── Render helpers ────────────────────────────────────────────────────────────

function renderAttachmentHtml(attachment) {
  if (!attachment || !attachment.dataUrl) return "";
  const name = escapeHtml(attachment.name || "attachment");
  if (attachment.kind === "image" && safeImageSrc(attachment.dataUrl)) {
    return `<div class="community-post-attachment"><img class="community-post-image" src="${safeImageSrc(attachment.dataUrl)}" alt="${name}"></div>`;
  }
  return `<div class="community-post-attachment"><a class="community-post-file" href="${attachment.dataUrl}" download="${name}">📎 ${name}</a></div>`;
}

function renderScanResultHtml(scan) {
  if (!scan) return "";
  const thumb = safeImageSrc(scan.thumb) || createFallbackAvatar("?");
  const scoreClass = scan.score >= 70 ? "score-high" : scan.score >= 40 ? "score-mid" : "score-low";
  return `
    <div class="community-scan-result">
      <img class="community-scan-thumb" src="${thumb}" alt="Scanned photo">
      <div class="community-scan-info">
        <p class="community-scan-label ${scoreClass}">${escapeHtml(scan.label || "Scan result")}</p>
        <p class="community-scan-score">AI score: <strong>${Number(scan.score) || 0}%</strong></p>
      </div>
    </div>`;
}

function renderRepliesHtml(replies) {
  if (!replies || replies.length === 0) return "";
  return `<div class="replies-list">${replies.map(r => `
    <div class="reply">
      <img class="reply-avatar" src="${safeImageSrc(r.photo) || createFallbackAvatar(r.author)}" alt="${escapeHtml(r.author)}">
      <div>
        <p class="reply-author">${escapeHtml(r.author)}</p>
        <p class="reply-text">${escapeHtml(r.text)}</p>
      </div>
    </div>`).join("")}</div>`;
}

function renderPostCard(post, currentUserEmail) {
  const docId = post.id;
  const likes = post.likes || [];
  const dislikes = post.dislikes || [];
  const liked = likes.includes(currentUserEmail);
  const disliked = dislikes.includes(currentUserEmail);
  const isOwn = post.email === currentUserEmail;
  const postType = post.postType || (post.scanResult ? "result" : post.attachment ? "media" : "general");
  const avatar = safeImageSrc(post.photo) || createFallbackAvatar(post.author);

  return `
    <article class="community-post" data-id="${escapeHtml(docId)}">
      <img class="community-post-avatar" src="${avatar}" alt="${escapeHtml(post.author)} avatar">
      <div class="post-body">
        <a class="community-post-author" href="profile.html?user=${encodeURIComponent(post.email||"")}">${escapeHtml(post.author)}</a>
        <p class="community-post-date">${formatPostDate(post.createdAt)}</p>
        <span class="post-type-badge post-type-${postType}">${getPostTypeLabel(postType)}</span>
        ${post.text ? `<p class="community-post-text">${escapeHtml(post.text)}</p>` : ""}
        ${renderScanResultHtml(post.scanResult)}
        ${renderAttachmentHtml(post.attachment)}
        <div class="post-actions">
          <button class="post-action-btn like-btn ${liked ? "liked" : ""}" data-id="${docId}" type="button">👍 Like <span>${likes.length}</span></button>
          <button class="post-action-btn dislike-btn ${disliked ? "disliked" : ""}" data-id="${docId}" type="button">👎 Dislike <span>${dislikes.length}</span></button>
          <button class="post-action-btn reply-toggle-btn" data-id="${docId}" type="button">💬 Reply</button>
          ${isOwn ? `<button class="post-action-btn delete-btn" data-id="${docId}" type="button">🗑 Delete</button>` : ""}
        </div>
        ${renderRepliesHtml(post.replies)}
        <div class="reply-form hidden" id="reply-form-${docId}">
          <input class="reply-input" type="text" placeholder="Write a reply…" maxlength="140">
          <button class="btn btn-secondary reply-submit-btn" data-id="${docId}" type="button">Send</button>
        </div>
      </div>
    </article>`;
}

// ── Main page logic ───────────────────────────────────────────────────────────

function runCommunityPage() {
  const HISTORY_KEY_PREFIX = "aiDetectorHistory_";
  const LAST_SCAN_KEY = "aiDetectorLastScan";
  const MAX_ATTACHMENT_CHARS = 700000;
  const LOCAL_POSTS_KEY = "aiDetectorCommunityPosts"; // fallback only

  const communityForm = document.getElementById("community-form");
  if (!communityForm) return;

  const communityText = document.getElementById("community-text");
  const communityMessage = document.getElementById("community-message");
  const communityFeed = document.getElementById("community-feed");
  const communityTypeBtns = document.querySelectorAll(".community-type-btn");
  const communityMediaPanel = document.getElementById("community-media-panel");
  const communityResultPanel = document.getElementById("community-result-panel");
  const communityFileInput = document.getElementById("community-file-input");
  const communityAttachmentPreview = document.getElementById("community-attachment-preview");
  const communityResultPreview = document.getElementById("community-result-preview");
  const communityUseLatestScan = document.getElementById("community-use-latest-scan");
  const communityHistoryPick = document.getElementById("community-history-pick");
  const welcomeUser = document.getElementById("welcome-user");
  const logoutButton = document.getElementById("logout-btn");
  const profilePhoto = document.getElementById("profile-photo");
  const profileName = document.getElementById("profile-name");
  const profileEmail = document.getElementById("profile-email");
  const profileCreated = document.getElementById("profile-created");
  const profilePhotoInput = document.getElementById("profile-photo-input");
  const profileMenuTrigger = document.getElementById("profile-menu-trigger");
  const profileMenu = document.getElementById("profile-menu");

  let communityPostType = "general";
  let pendingAttachment = null;
  let pendingScanResult = null;
  let unsubscribeFeed = null; // Firestore real-time listener teardown

  // ── Profile UI ─────────────────────────────────────────────────────────────

  const currentUser = getCurrentUser();
  if (!currentUser) return;

  welcomeUser.textContent = `Welcome, ${currentUser.name}.`;
  profileName.textContent = currentUser.name;
  profileEmail.textContent = currentUser.email;
  profileCreated.textContent = currentUser.createdAt
    ? `Joined: ${new Date(currentUser.createdAt).toLocaleDateString()}`
    : "Joined recently";
  profilePhoto.src = safeImageSrc(currentUser.profilePhoto) || createFallbackAvatar(currentUser.name);

  profilePhotoInput?.addEventListener("change", () => {
    const file = profilePhotoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      profilePhoto.src = String(reader.result || "");
      saveProfilePhotoForCurrentUser(String(reader.result || ""));
    };
    reader.readAsDataURL(file);
  });

  profileMenuTrigger?.addEventListener("click", () => {
    const isOpen = !profileMenu.classList.contains("hidden");
    profileMenu.classList.toggle("hidden", isOpen);
    profileMenuTrigger.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", (e) => {
    if (!profileMenu?.contains(e.target) && !profileMenuTrigger?.contains(e.target)) {
      profileMenu?.classList.add("hidden");
      profileMenuTrigger?.setAttribute("aria-expanded", "false");
    }
  });

  logoutButton?.addEventListener("click", () => {
    if (unsubscribeFeed) unsubscribeFeed();
    logoutCurrentUser();
    window.location.href = "index.html";
  });

  // ── History picker ─────────────────────────────────────────────────────────

  function readHistory(email) {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY_PREFIX + email)) || []; }
    catch { return []; }
  }

  function readLastScan() {
    try { return JSON.parse(localStorage.getItem(LAST_SCAN_KEY)); }
    catch { return null; }
  }

  function fillHistoryPicker(email) {
    if (!communityHistoryPick) return;
    const entries = readHistory(email).slice().reverse().slice(0, 10);
    communityHistoryPick.innerHTML = '<option value="">Or pick from history…</option>';
    entries.forEach((entry) => {
      const opt = document.createElement("option");
      opt.value = "history";
      opt.textContent = `${entry.label} (${entry.score}%) — ${new Date(entry.createdAt).toLocaleString()}`;
      opt.dataset.entry = JSON.stringify(entry);
      communityHistoryPick.appendChild(opt);
    });
  }

  fillHistoryPicker(currentUser.email);

  // ── Feed rendering ─────────────────────────────────────────────────────────

  function renderFeed(posts) {
    if (!communityFeed) return;
    if (posts.length === 0) {
      communityFeed.innerHTML = '<p class="community-empty">No posts yet. Be the first to post!</p>';
      return;
    }
    communityFeed.innerHTML = posts.map(p => renderPostCard(p, currentUser.email)).join("");
    bindFeedEvents();
  }

  function bindFeedEvents() {
    communityFeed.querySelectorAll(".like-btn").forEach(btn => {
      btn.addEventListener("click", () => toggleReaction(btn.dataset.id, "like"));
    });
    communityFeed.querySelectorAll(".dislike-btn").forEach(btn => {
      btn.addEventListener("click", () => toggleReaction(btn.dataset.id, "dislike"));
    });
    communityFeed.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", () => deletePost(btn.dataset.id));
    });
    communityFeed.querySelectorAll(".reply-toggle-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const form = document.getElementById(`reply-form-${btn.dataset.id}`);
        if (form) form.classList.toggle("hidden");
      });
    });
    communityFeed.querySelectorAll(".reply-submit-btn").forEach(btn => {
      btn.addEventListener("click", () => submitReply(btn.dataset.id));
    });
    communityFeed.querySelectorAll(".reply-input").forEach(input => {
      input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const btn = input.closest(".reply-form")?.querySelector(".reply-submit-btn");
        if (btn) submitReply(btn.dataset.id);
      });
    });
  }

  // ── Firebase feed ──────────────────────────────────────────────────────────

  function startFirebaseFeed() {
    communityFeed.innerHTML = '<p class="community-empty">Loading posts…</p>';
    unsubscribeFeed = db.collection("community_posts")
      .orderBy("createdAt", "desc")
      .limit(100)
      .onSnapshot((snapshot) => {
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderFeed(posts);
      }, (err) => {
        console.error("SANATIO: Firestore error —", err);
        communityFeed.innerHTML = '<p class="community-empty">Could not load posts. Check your Firebase setup.</p>';
      });
  }

  // ── LocalStorage fallback feed ─────────────────────────────────────────────

  function startLocalFeed() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_POSTS_KEY)) || [];
      // Add fake IDs for local posts so the same render function works
      const posts = raw.slice().reverse().map((p, i) => ({ id: String(i), ...p }));
      renderFeed(posts);
    } catch {
      communityFeed.innerHTML = '<p class="community-empty">No posts yet.</p>';
    }
  }

  function saveLocalPost(post) {
    const raw = (() => { try { return JSON.parse(localStorage.getItem(LOCAL_POSTS_KEY)) || []; } catch { return []; } })();
    raw.push(post);
    localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(raw));
    startLocalFeed();
  }

  function getLocalPosts() {
    try { return JSON.parse(localStorage.getItem(LOCAL_POSTS_KEY)) || []; } catch { return []; }
  }

  // ── Reactions ──────────────────────────────────────────────────────────────

  async function toggleReaction(docId, reaction) {
    if (!db) {
      // local fallback
      const posts = getLocalPosts();
      const idx = posts.findIndex((_, i) => String(posts.length - 1 - i) === docId);
      // crude: just re-render without persisting (local mode limitation)
      startLocalFeed();
      return;
    }
    const ref = db.collection("community_posts").doc(docId);
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data();
        let likes = data.likes || [];
        let dislikes = data.dislikes || [];
        const email = currentUser.email;
        if (reaction === "like") {
          likes = likes.includes(email) ? likes.filter(e => e !== email) : [...likes.filter(e => e !== email), email];
          dislikes = dislikes.filter(e => e !== email);
        } else {
          dislikes = dislikes.includes(email) ? dislikes.filter(e => e !== email) : [...dislikes.filter(e => e !== email), email];
          likes = likes.filter(e => e !== email);
        }
        tx.update(ref, { likes, dislikes });
      });
    } catch (e) {
      console.error("Reaction failed:", e);
    }
  }

  // ── Replies ────────────────────────────────────────────────────────────────

  async function submitReply(docId) {
    const form = document.getElementById(`reply-form-${docId}`);
    const input = form?.querySelector(".reply-input");
    if (!input || !input.value.trim()) return;

    const reply = {
      author: currentUser.name,
      email: currentUser.email,
      photo: currentUser.profilePhoto || "",
      text: input.value.trim(),
      createdAt: new Date().toISOString(),
    };
    input.value = "";
    form.classList.add("hidden");

    if (!db) {
      startLocalFeed();
      return;
    }

    const ref = db.collection("community_posts").doc(docId);
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const replies = snap.data().replies || [];
        tx.update(ref, { replies: [...replies, reply] });
      });
    } catch (e) {
      console.error("Reply failed:", e);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function deletePost(docId) {
    if (!confirm("Delete this post?")) return;
    if (!db) {
      const posts = getLocalPosts();
      // Remove by reverse index
      const idx = posts.length - 1 - parseInt(docId, 10);
      if (idx >= 0) posts.splice(idx, 1);
      localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(posts));
      startLocalFeed();
      return;
    }
    try {
      await db.collection("community_posts").doc(docId).delete();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  }

  // ── Post composer ──────────────────────────────────────────────────────────

  function updateCommunityResultPreview() {
    if (!communityResultPreview) return;
    if (!pendingScanResult) {
      communityResultPreview.className = "community-result-preview empty";
      communityResultPreview.innerHTML = '<p>No scan selected yet. Run a scan on the <a href="aipage.html">Dashboard</a> or pick from history below.</p>';
      return;
    }
    communityResultPreview.className = "community-result-preview";
    communityResultPreview.innerHTML = renderScanResultHtml(pendingScanResult);
  }

  function selectScanForPost(scan) {
    pendingScanResult = { label: scan.label, score: scan.score, thumb: scan.thumb || "", createdAt: scan.createdAt || new Date().toISOString() };
    updateCommunityResultPreview();
  }

  function showAttachmentPreview(attachment) {
    if (!communityAttachmentPreview || !attachment) return;
    communityAttachmentPreview.classList.remove("hidden");
    if (attachment.kind === "image" && safeImageSrc(attachment.dataUrl)) {
      communityAttachmentPreview.innerHTML = `<img class="community-attachment-thumb" src="${safeImageSrc(attachment.dataUrl)}" alt="${escapeHtml(attachment.name)}"><button type="button" class="community-clear-attachment">✕</button>`;
    } else {
      communityAttachmentPreview.innerHTML = `<p class="community-attachment-name">📎 ${escapeHtml(attachment.name)}</p><button type="button" class="community-clear-attachment">✕</button>`;
    }
    communityAttachmentPreview.querySelector(".community-clear-attachment")?.addEventListener("click", () => {
      pendingAttachment = null;
      if (communityFileInput) communityFileInput.value = "";
      communityAttachmentPreview.classList.add("hidden");
      communityAttachmentPreview.innerHTML = "";
    });
  }

  function setCommunityPostType(type) {
    communityPostType = type;
    communityTypeBtns.forEach(btn => btn.classList.toggle("active", btn.getAttribute("data-post-type") === type));
    communityMediaPanel?.classList.toggle("hidden", type !== "media");
    communityResultPanel?.classList.toggle("hidden", type !== "result");
    if (type !== "media") {
      pendingAttachment = null;
      if (communityFileInput) communityFileInput.value = "";
      if (communityAttachmentPreview) { communityAttachmentPreview.classList.add("hidden"); communityAttachmentPreview.innerHTML = ""; }
    }
    if (type !== "result") { pendingScanResult = null; updateCommunityResultPreview(); }
  }

  function resetComposer() {
    communityText.value = "";
    pendingAttachment = null;
    pendingScanResult = null;
    if (communityFileInput) communityFileInput.value = "";
    if (communityAttachmentPreview) { communityAttachmentPreview.classList.add("hidden"); communityAttachmentPreview.innerHTML = ""; }
    if (communityHistoryPick) communityHistoryPick.value = "";
    setCommunityPostType("general");
  }

  communityTypeBtns.forEach(btn => btn.addEventListener("click", () => setCommunityPostType(btn.getAttribute("data-post-type") || "general")));

  communityFileInput?.addEventListener("change", async () => {
    const file = communityFileInput.files[0];
    if (!file) return;
    communityMessage.textContent = "";
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > MAX_ATTACHMENT_CHARS) {
        communityMessage.textContent = "File too large. Keep it under ~500 KB.";
        communityMessage.className = "form-message error";
        communityFileInput.value = "";
        return;
      }
      pendingAttachment = { name: file.name || "attachment", mime: file.type || "application/octet-stream", kind: (file.type || "").startsWith("image/") ? "image" : "file", dataUrl };
      showAttachmentPreview(pendingAttachment);
    } catch {
      communityMessage.textContent = "Could not read that file.";
      communityMessage.className = "form-message error";
    }
  });

  communityUseLatestScan?.addEventListener("click", () => {
    const lastScan = readLastScan();
    if (!lastScan) { communityMessage.textContent = "No scan found. Run Analyze Photo on the Dashboard first."; communityMessage.className = "form-message warning"; return; }
    selectScanForPost(lastScan);
  });

  communityHistoryPick?.addEventListener("change", () => {
    const opt = communityHistoryPick.selectedOptions[0];
    if (!opt?.dataset.entry) return;
    try { selectScanForPost(JSON.parse(opt.dataset.entry)); } catch { }
  });

  communityForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = communityText.value.trim();

    if (communityPostType === "media" && !pendingAttachment) { communityMessage.textContent = "Choose a photo or file to post."; communityMessage.className = "form-message error"; return; }
    if (communityPostType === "result" && !pendingScanResult) { communityMessage.textContent = "Select a test result first."; communityMessage.className = "form-message error"; return; }
    if (communityPostType === "general" && !text) { communityMessage.textContent = "Write something before posting."; communityMessage.className = "form-message error"; return; }

    const newPost = {
      author: currentUser.name,
      email: currentUser.email,
      photo: currentUser.profilePhoto || "",
      text,
      postType: communityPostType,
      attachment: communityPostType === "media" ? pendingAttachment : null,
      scanResult: communityPostType === "result" ? pendingScanResult : null,
      likes: [],
      dislikes: [],
      replies: [],
      createdAt: new Date().toISOString(),
    };

    communityMessage.textContent = "Publishing…";
    communityMessage.className = "form-message warning";

    if (db) {
      try {
        await db.collection("community_posts").add({
          ...newPost,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdAtISO: newPost.createdAt,
        });
        resetComposer();
        communityMessage.textContent = "Post published! Everyone can see it now. ✓";
        communityMessage.className = "form-message success";
      } catch (e) {
        communityMessage.textContent = "Could not publish post: " + e.message;
        communityMessage.className = "form-message error";
      }
    } else {
      // localStorage fallback (single-device mode)
      try {
        saveLocalPost(newPost);
        resetComposer();
        communityMessage.textContent = "Post saved locally (Firebase not configured — only visible on this device).";
        communityMessage.className = "form-message warning";
      } catch {
        communityMessage.textContent = "Could not save post (storage full?).";
        communityMessage.className = "form-message error";
      }
    }
  });

  // ── Share from dashboard ───────────────────────────────────────────────────

  const shouldShare = sessionStorage.getItem("communityShareResult") === "1";
  if (shouldShare) {
    sessionStorage.removeItem("communityShareResult");
    setCommunityPostType("result");
    const lastScan = readLastScan();
    if (lastScan) selectScanForPost(lastScan);
  }

  // ── Start feed ─────────────────────────────────────────────────────────────

  if (db) {
    startFirebaseFeed();
    // Show online indicator
    const hint = document.createElement("p");
    hint.className = "form-message success";
    hint.style.marginBottom = "12px";
    hint.textContent = "🟢 Live — posts sync in real time for all users.";
    communityFeed.parentElement?.insertBefore(hint, communityFeed);
  } else {
    // Show setup instructions
    const hint = document.createElement("div");
    hint.className = "form-message warning";
    hint.style.cssText = "margin-bottom:12px;line-height:1.7";
    hint.innerHTML = `
      ⚠ <strong>Firebase not configured</strong> — posts are only visible on this device.<br>
      To enable shared posts for all users, add your Firebase config to <code>config.js</code>.<br>
      <a href="https://console.firebase.google.com/" target="_blank" rel="noopener">Open Firebase Console →</a>
    `;
    communityFeed.parentElement?.insertBefore(hint, communityFeed);
    startLocalFeed();
  }
}

runCommunityPage();
