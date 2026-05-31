/**
 * SANATIO profile.js
 * Loads a user's public profile and their community posts.
 * URL: profile.html?user=email@example.com
 */

function formatPostDate(createdAt) {
  if (!createdAt) return "Just now";
  if (typeof createdAt?.toDate === "function") {
    return createdAt.toDate().toLocaleString();
  }
  const d = new Date(createdAt);
  return isNaN(d.getTime()) ? "Just now" : d.toLocaleString();
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

function createFallbackAvatar(name) {
  const initial = (name || "U").trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="54%" text-anchor="middle" fill="#e5e7eb" font-size="44" font-family="Arial, sans-serif">${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getPostTypeLabel(type) {
  if (type === "media") return "Photo / File";
  if (type === "result") return "Test Result";
  return "Discussion";
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

function renderAttachmentHtml(attachment) {
  if (!attachment || !attachment.dataUrl) return "";
  const name = escapeHtml(attachment.name || "attachment");
  if (attachment.kind === "image" && safeImageSrc(attachment.dataUrl)) {
    return `<div class="community-post-attachment"><img class="community-post-image" src="${safeImageSrc(attachment.dataUrl)}" alt="${name}"></div>`;
  }
  return `<div class="community-post-attachment"><a class="community-post-file" href="${attachment.dataUrl}" download="${name}">📎 ${name}</a></div>`;
}

function renderPostCard(post) {
  const postType = post.postType || (post.scanResult ? "result" : post.attachment ? "media" : "general");
  const avatar = safeImageSrc(post.photo) || createFallbackAvatar(post.author);
  return `
    <article class="community-post">
      <img class="community-post-avatar" src="${avatar}" alt="${escapeHtml(post.author)} avatar">
      <div class="post-body">
        <p class="community-post-author">${escapeHtml(post.author)}</p>
        <p class="community-post-date">${formatPostDate(post.createdAt)}</p>
        <span class="post-type-badge post-type-${postType}">${getPostTypeLabel(postType)}</span>
        ${post.text ? `<p class="community-post-text">${escapeHtml(post.text)}</p>` : ""}
        ${renderScanResultHtml(post.scanResult)}
        ${renderAttachmentHtml(post.attachment)}
      </div>
    </article>`;
}

function setupCurrentUserMenu() {
  const me = getCurrentUser();
  if (!me) return;

  const profilePhoto = document.getElementById("profile-photo");
  const profileName = document.getElementById("profile-name");
  const profileEmailEl = document.getElementById("profile-email");
  const profileCreated = document.getElementById("profile-created");
  const profilePhotoInput = document.getElementById("profile-photo-input");
  const profileMenuTrigger = document.getElementById("profile-menu-trigger");
  const profileMenu = document.getElementById("profile-menu");
  const logoutBtn = document.getElementById("logout-btn");

  if (profilePhoto) profilePhoto.src = safeImageSrc(me.profilePhoto) || createFallbackAvatar(me.name);
  if (profileName) profileName.textContent = me.name;
  if (profileEmailEl) profileEmailEl.textContent = me.email;
  if (profileCreated) profileCreated.textContent = me.createdAt ? `Joined: ${new Date(me.createdAt).toLocaleDateString()}` : "Joined recently";

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

  profilePhotoInput?.addEventListener("change", () => {
    const file = profilePhotoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (profilePhoto) profilePhoto.src = String(reader.result || "");
      saveProfilePhotoForCurrentUser(String(reader.result || ""));
    };
    reader.readAsDataURL(file);
  });

  logoutBtn?.addEventListener("click", () => {
    logoutCurrentUser();
    window.location.href = "index.html";
  });
}

async function runProfilePage() {
  setupCurrentUserMenu();

  const params = new URLSearchParams(window.location.search);
  const targetEmail = params.get("user")?.trim().toLowerCase();
  const profileView = document.getElementById("profile-view");
  const userPostsSection = document.getElementById("user-posts-section");
  const userPostsFeed = document.getElementById("user-posts-feed");
  const userPostsTitle = document.getElementById("user-posts-title");

  if (!targetEmail) {
    profileView.innerHTML = '<p class="community-empty">No user specified.</p>';
    return;
  }

  // Init Firebase
  let db = null;
  try {
    if (typeof FIREBASE_CONFIG === "object" && FIREBASE_CONFIG?.apiKey) {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
    }
  } catch (e) {
    console.warn("Firebase init failed:", e);
  }

  // ── Load user profile ──────────────────────────────────────────────────────

  let userProfile = null;

  if (db) {
    try {
      const emailKey = targetEmail.replace(/[.#$[\]]/g, "_");
      const doc = await db.collection("users").doc(emailKey).get();
      if (doc.exists) {
        userProfile = doc.data();
      }
    } catch (e) {
      console.warn("Could not load user from Firebase:", e);
    }
  }

  // Fallback: check localStorage (same device)
  if (!userProfile) {
    const users = JSON.parse(localStorage.getItem("aiDetectorUsers") || "[]");
    userProfile = users.find(u => u.email === targetEmail) || null;
  }

  if (!userProfile) {
    profileView.innerHTML = '<p class="community-empty">User not found.</p>';
    return;
  }

  // Check if this is the logged-in user's own profile
  const me = getCurrentUser();
  const isOwnProfile = me?.email === targetEmail;

  const avatar = safeImageSrc(userProfile.profilePhoto) || createFallbackAvatar(userProfile.name);
  const joinDate = userProfile.createdAt
    ? new Date(userProfile.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "Unknown";

  profileView.innerHTML = `
    <div class="profile-card">
      <img class="profile-card-avatar" src="${avatar}" alt="${escapeHtml(userProfile.name)}">
      <div class="profile-card-info">
        <h2 class="profile-card-name">${escapeHtml(userProfile.name)}${isOwnProfile ? ' <span class="profile-you-badge">You</span>' : ""}</h2>
        <p class="profile-card-email">${escapeHtml(userProfile.email)}</p>
        <p class="profile-card-joined">Joined ${joinDate}</p>
        ${!isOwnProfile ? `<button class="btn btn-primary profile-msg-btn" id="profile-msg-btn" type="button">💬 Message</button>` : ""}
      </div>
    </div>
  `;

  document.getElementById("profile-msg-btn")?.addEventListener("click", () => {
    try {
      sessionStorage.setItem("pendingMessageUser", JSON.stringify({
        email: userProfile.email,
        name: userProfile.name,
        profilePhoto: userProfile.profilePhoto || "",
      }));
    } catch {}
    window.location.href = "messages.html";
  });

  // ── Load their posts ───────────────────────────────────────────────────────

  if (!db) {
    // Fallback: local posts
    try {
      const localPosts = JSON.parse(localStorage.getItem("aiDetectorCommunityPosts") || "[]");
      const theirPosts = localPosts.filter(p => p.email === targetEmail).reverse();
      userPostsSection.style.display = "";
      userPostsTitle.textContent = `${escapeHtml(userProfile.name)}'s Posts (${theirPosts.length})`;
      if (theirPosts.length === 0) {
        userPostsFeed.innerHTML = '<p class="community-empty">No posts yet.</p>';
      } else {
        userPostsFeed.innerHTML = theirPosts.map(renderPostCard).join("");
      }
    } catch {
      userPostsFeed.innerHTML = '<p class="community-empty">Could not load posts.</p>';
    }
    return;
  }

  try {
    userPostsFeed.innerHTML = '<p class="community-empty">Loading posts…</p>';
    userPostsSection.style.display = "";

    const snapshot = await db.collection("community_posts")
      .where("email", "==", targetEmail)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    userPostsTitle.textContent = `${escapeHtml(userProfile.name)}'s Posts (${posts.length})`;

    if (posts.length === 0) {
      userPostsFeed.innerHTML = '<p class="community-empty">No posts yet.</p>';
    } else {
      userPostsFeed.innerHTML = posts.map(renderPostCard).join("");
    }
  } catch (e) {
    console.error("Could not load posts:", e);
    userPostsFeed.innerHTML = '<p class="community-empty">Could not load posts.</p>';
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runProfilePage);
} else {
  runProfilePage();
}
