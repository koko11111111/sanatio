function runCommunityPage() {
  const COMMUNITY_POSTS_KEY = "aiDetectorCommunityPosts";
  const HISTORY_KEY_PREFIX = "aiDetectorHistory_";
  const LAST_SCAN_KEY = "aiDetectorLastScan";
  const MAX_ATTACHMENT_CHARS = 700000;

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

  function readCommunityPosts() {
    try { return JSON.parse(localStorage.getItem(COMMUNITY_POSTS_KEY)) || []; }
    catch { return []; }
  }

  function saveCommunityPosts(posts) {
    localStorage.setItem(COMMUNITY_POSTS_KEY, JSON.stringify(posts));
  }

  function historyKey(email) {
    return HISTORY_KEY_PREFIX + email;
  }

  function readHistory(email) {
    try { return JSON.parse(localStorage.getItem(historyKey(email))) || []; }
    catch { return []; }
  }

  function readLastScan() {
    try {
      const raw = localStorage.getItem(LAST_SCAN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function createFallbackAvatar(name) {
    const initial = (name || "U").trim().charAt(0).toUpperCase() || "U";
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
    const value = String(url || "").trim();
    if (!value) return "";
    if (value.startsWith("data:image/")) return value;
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    return "";
  }

  function getPostTypeLabel(type) {
    if (type === "media") return "Photo / File";
    if (type === "result") return "Test Result";
    return "Discussion";
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsDataURL(file);
    });
  }

  function buildAttachmentFromFile(file, dataUrl) {
    const isImage = (file.type || "").startsWith("image/");
    return {
      name: file.name || "attachment",
      mime: file.type || "application/octet-stream",
      kind: isImage ? "image" : "file",
      dataUrl,
    };
  }

  function renderAttachmentHtml(attachment) {
    if (!attachment || !attachment.dataUrl) return "";
    const name = escapeHtml(attachment.name || "attachment");
    if (attachment.kind === "image" && safeImageSrc(attachment.dataUrl)) {
      return `
        <div class="community-post-attachment">
          <img class="community-post-image" src="${safeImageSrc(attachment.dataUrl)}" alt="${name}">
        </div>`;
    }
    return `
      <div class="community-post-attachment">
        <a class="community-post-file" href="${attachment.dataUrl}" download="${name}">📎 ${name}</a>
      </div>`;
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

  function renderCommunityPosts(currentUserEmail) {
    const posts = readCommunityPosts();

    if (posts.length === 0) {
      communityFeed.innerHTML = '<p class="community-empty">No posts yet. Be the first to post.</p>';
      return;
    }

    communityFeed.innerHTML = posts
      .slice()
      .reverse()
      .map((post, reversedIndex) => {
        const originalIndex = posts.length - 1 - reversedIndex;
        const avatar = safeImageSrc(post.photo) || createFallbackAvatar(post.author);
        const likes = post.likes || [];
        const dislikes = post.dislikes || [];
        const liked = likes.includes(currentUserEmail);
        const disliked = dislikes.includes(currentUserEmail);
        const isOwn = post.email === currentUserEmail;
        const replies = post.replies || [];
        const postType = post.postType || (post.scanResult ? "result" : post.attachment ? "media" : "general");
        const postText = post.text ? `<p class="community-post-text">${escapeHtml(post.text)}</p>` : "";
        const attachmentHtml = renderAttachmentHtml(post.attachment);
        const scanHtml = renderScanResultHtml(post.scanResult);

        const repliesHtml = replies.length > 0
          ? `<div class="replies-list">${replies.map((r) => `
              <div class="reply">
                <img class="reply-avatar" src="${safeImageSrc(r.photo) || createFallbackAvatar(r.author)}" alt="${escapeHtml(r.author)}">
                <div>
                  <p class="reply-author">${escapeHtml(r.author)}</p>
                  <p class="reply-text">${escapeHtml(r.text)}</p>
                </div>
              </div>`).join("")}</div>`
          : "";

        return `
          <article class="community-post" data-index="${originalIndex}">
            <img class="community-post-avatar" src="${avatar}" alt="${escapeHtml(post.author)} avatar">
            <div class="post-body">
              <p class="community-post-author">${escapeHtml(post.author)}</p>
              <p class="community-post-date">${new Date(post.createdAt).toLocaleString()}</p>
              <span class="post-type-badge post-type-${postType}">${getPostTypeLabel(postType)}</span>
              ${postText}
              ${scanHtml}
              ${attachmentHtml}
              <div class="post-actions">
                <button class="post-action-btn like-btn ${liked ? "liked" : ""}" data-index="${originalIndex}" type="button" aria-pressed="${liked}">
                  👍 Like <span>${likes.length}</span>
                </button>
                <button class="post-action-btn dislike-btn ${disliked ? "disliked" : ""}" data-index="${originalIndex}" type="button" aria-pressed="${disliked}">
                  👎 Dislike <span>${dislikes.length}</span>
                </button>
                <button class="post-action-btn reply-toggle-btn" data-index="${originalIndex}" type="button">
                  💬 Reply
                </button>
                ${isOwn ? `<button class="post-action-btn delete-btn" data-index="${originalIndex}" type="button">🗑 Delete</button>` : ""}
              </div>
              ${repliesHtml}
              <div class="reply-form hidden" id="reply-form-${originalIndex}">
                <input class="reply-input" type="text" placeholder="Write a reply…" maxlength="140">
                <button class="btn btn-secondary reply-submit-btn" data-index="${originalIndex}" type="button">Send</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    function togglePostReaction(idx, reaction) {
      const allPosts = readCommunityPosts();
      const post = allPosts[idx];
      if (!post) return;

      const likes = post.likes || [];
      const dislikes = post.dislikes || [];
      const alreadyLiked = likes.includes(currentUserEmail);
      const alreadyDisliked = dislikes.includes(currentUserEmail);

      if (reaction === "like") {
        if (alreadyLiked) {
          allPosts[idx].likes = likes.filter((e) => e !== currentUserEmail);
        } else {
          allPosts[idx].likes = [...likes, currentUserEmail];
          allPosts[idx].dislikes = dislikes.filter((e) => e !== currentUserEmail);
        }
      } else {
        if (alreadyDisliked) {
          allPosts[idx].dislikes = dislikes.filter((e) => e !== currentUserEmail);
        } else {
          allPosts[idx].dislikes = [...dislikes, currentUserEmail];
          allPosts[idx].likes = likes.filter((e) => e !== currentUserEmail);
        }
      }

      saveCommunityPosts(allPosts);
      renderCommunityPosts(currentUserEmail);
    }

    communityFeed.querySelectorAll(".like-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        togglePostReaction(parseInt(btn.getAttribute("data-index"), 10), "like");
      });
    });

    communityFeed.querySelectorAll(".dislike-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        togglePostReaction(parseInt(btn.getAttribute("data-index"), 10), "dislike");
      });
    });

    communityFeed.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-index"), 10);
        const allPosts = readCommunityPosts();
        allPosts.splice(idx, 1);
        saveCommunityPosts(allPosts);
        renderCommunityPosts(currentUserEmail);
      });
    });

    communityFeed.querySelectorAll(".reply-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = btn.getAttribute("data-index");
        const replyForm = document.getElementById(`reply-form-${idx}`);
        if (replyForm) replyForm.classList.toggle("hidden");
      });
    });

    function submitReply(idx) {
      const replyForm = document.getElementById(`reply-form-${idx}`);
      const input = replyForm ? replyForm.querySelector(".reply-input") : null;
      if (!input || !input.value.trim()) return;
      const current = getCurrentUser();
      if (!current) return;
      const allPosts = readCommunityPosts();
      if (!allPosts[idx]) return;
      if (!allPosts[idx].replies) allPosts[idx].replies = [];
      allPosts[idx].replies.push({
        author: current.name,
        email: current.email,
        photo: current.profilePhoto || "",
        text: input.value.trim(),
        createdAt: new Date().toISOString(),
      });
      saveCommunityPosts(allPosts);
      renderCommunityPosts(currentUserEmail);
    }

    communityFeed.querySelectorAll(".reply-submit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        submitReply(parseInt(btn.getAttribute("data-index"), 10));
      });
    });

    communityFeed.querySelectorAll(".reply-input").forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const replyForm = input.closest(".reply-form");
        const submitBtn = replyForm ? replyForm.querySelector(".reply-submit-btn") : null;
        if (!submitBtn) return;
        submitReply(parseInt(submitBtn.getAttribute("data-index"), 10));
      });
    });
  }

  function setCommunityPostType(type) {
    communityPostType = type;
    communityTypeBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-post-type") === type);
    });
    communityMediaPanel?.classList.toggle("hidden", type !== "media");
    communityResultPanel?.classList.toggle("hidden", type !== "result");
    if (type !== "media") {
      pendingAttachment = null;
      if (communityFileInput) communityFileInput.value = "";
      if (communityAttachmentPreview) {
        communityAttachmentPreview.classList.add("hidden");
        communityAttachmentPreview.innerHTML = "";
      }
    }
    if (type !== "result") {
      pendingScanResult = null;
      updateCommunityResultPreview();
    }
  }

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
    if (!scan) return;
    pendingScanResult = {
      label: scan.label,
      score: scan.score,
      thumb: scan.thumb || "",
      createdAt: scan.createdAt || new Date().toISOString(),
    };
    updateCommunityResultPreview();
  }

  function fillHistoryPicker(email) {
    if (!communityHistoryPick) return;
    const entries = readHistory(email).slice().reverse().slice(0, 10);
    communityHistoryPick.innerHTML = '<option value="">Or pick from history…</option>';
    entries.forEach((entry) => {
      const option = document.createElement("option");
      option.value = "history";
      option.textContent = `${entry.label} (${entry.score}%) — ${new Date(entry.createdAt).toLocaleString()}`;
      option.dataset.entry = JSON.stringify(entry);
      communityHistoryPick.appendChild(option);
    });
  }

  function showAttachmentPreview(attachment) {
    if (!communityAttachmentPreview || !attachment) return;
    communityAttachmentPreview.classList.remove("hidden");
    if (attachment.kind === "image" && safeImageSrc(attachment.dataUrl)) {
      communityAttachmentPreview.innerHTML = `
        <img class="community-attachment-thumb" src="${safeImageSrc(attachment.dataUrl)}" alt="${escapeHtml(attachment.name)}">
        <button type="button" class="community-clear-attachment" aria-label="Remove attachment">✕</button>`;
    } else {
      communityAttachmentPreview.innerHTML = `
        <p class="community-attachment-name">📎 ${escapeHtml(attachment.name)}</p>
        <button type="button" class="community-clear-attachment" aria-label="Remove attachment">✕</button>`;
    }
    communityAttachmentPreview.querySelector(".community-clear-attachment")?.addEventListener("click", () => {
      pendingAttachment = null;
      if (communityFileInput) communityFileInput.value = "";
      communityAttachmentPreview.classList.add("hidden");
      communityAttachmentPreview.innerHTML = "";
    });
  }

  function resetCommunityComposer() {
    communityText.value = "";
    pendingAttachment = null;
    pendingScanResult = null;
    if (communityFileInput) communityFileInput.value = "";
    if (communityAttachmentPreview) {
      communityAttachmentPreview.classList.add("hidden");
      communityAttachmentPreview.innerHTML = "";
    }
    if (communityHistoryPick) communityHistoryPick.value = "";
    setCommunityPostType("general");
  }

  function applyShareFromDashboard() {
    const shouldShare = sessionStorage.getItem("communityShareResult") === "1";
    if (!shouldShare) return;
    sessionStorage.removeItem("communityShareResult");
    setCommunityPostType("result");
    const lastScan = readLastScan();
    if (lastScan) selectScanForPost(lastScan);
  }

  communityTypeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      setCommunityPostType(btn.getAttribute("data-post-type") || "general");
    });
  });

  communityFileInput?.addEventListener("change", async () => {
    const file = communityFileInput.files[0];
    if (!file) return;
    communityMessage.textContent = "";
    communityMessage.className = "form-message";
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > MAX_ATTACHMENT_CHARS) {
        communityMessage.textContent = "File is too large. Use a smaller file (under ~500 KB).";
        communityMessage.className = "form-message error";
        communityFileInput.value = "";
        return;
      }
      pendingAttachment = buildAttachmentFromFile(file, dataUrl);
      showAttachmentPreview(pendingAttachment);
    } catch {
      communityMessage.textContent = "Could not read that file.";
      communityMessage.className = "form-message error";
    }
  });

  communityUseLatestScan?.addEventListener("click", () => {
    const lastScan = readLastScan();
    if (!lastScan) {
      communityMessage.textContent = "No scan found. Run Analyze Photo on the Dashboard first.";
      communityMessage.className = "form-message warning";
      return;
    }
    selectScanForPost(lastScan);
    communityMessage.textContent = "";
    communityMessage.className = "form-message";
  });

  communityHistoryPick?.addEventListener("change", () => {
    const option = communityHistoryPick.selectedOptions[0];
    if (!option || !option.dataset.entry) return;
    try {
      selectScanForPost(JSON.parse(option.dataset.entry));
    } catch {
      // ignore
    }
  });

  communityForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const current = getCurrentUser();
    const text = communityText.value.trim();

    if (!current) {
      communityMessage.textContent = "Please log in again.";
      communityMessage.className = "form-message error";
      return;
    }

    if (communityPostType === "media" && !pendingAttachment) {
      communityMessage.textContent = "Choose a photo or file to post.";
      communityMessage.className = "form-message error";
      return;
    }

    if (communityPostType === "result" && !pendingScanResult) {
      communityMessage.textContent = "Select a test result (latest scan or from history).";
      communityMessage.className = "form-message error";
      return;
    }

    if (communityPostType === "general" && !text) {
      communityMessage.textContent = "Write something before posting.";
      communityMessage.className = "form-message error";
      return;
    }

    const newPost = {
      author: current.name,
      email: current.email,
      photo: current.profilePhoto || "",
      text,
      postType: communityPostType,
      attachment: communityPostType === "media" ? pendingAttachment : null,
      scanResult: communityPostType === "result" ? pendingScanResult : null,
      likes: [],
      dislikes: [],
      replies: [],
      createdAt: new Date().toISOString(),
    };

    try {
      const posts = readCommunityPosts();
      posts.push(newPost);
      saveCommunityPosts(posts);
    } catch {
      communityMessage.textContent = "Could not save post (storage full?). Try a smaller file.";
      communityMessage.className = "form-message error";
      return;
    }

    resetCommunityComposer();
    fillHistoryPicker(current.email);
    communityMessage.textContent = "Post published.";
    communityMessage.className = "form-message success";
    renderCommunityPosts(current.email);
  });

  const currentUser = getCurrentUser();
  if (currentUser) {
    welcomeUser.textContent = `Welcome, ${currentUser.name}.`;
    profileName.textContent = currentUser.name;
    profileEmail.textContent = currentUser.email;
    profileCreated.textContent = currentUser.createdAt
      ? `Joined: ${new Date(currentUser.createdAt).toLocaleDateString()}`
      : "Joined recently";
    profilePhoto.src = safeImageSrc(currentUser.profilePhoto) || createFallbackAvatar(currentUser.name);
    fillHistoryPicker(currentUser.email);
    renderCommunityPosts(currentUser.email);
    applyShareFromDashboard();
  }

  profilePhotoInput?.addEventListener("change", () => {
    const file = profilePhotoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const photoDataUrl = String(reader.result || "");
      profilePhoto.src = photoDataUrl;
      saveProfilePhotoForCurrentUser(photoDataUrl);
      const refreshed = getCurrentUser();
      if (refreshed) renderCommunityPosts(refreshed.email);
    };
    reader.readAsDataURL(file);
  });

  profileMenuTrigger?.addEventListener("click", () => {
    const isOpen = !profileMenu.classList.contains("hidden");
    profileMenu.classList.toggle("hidden", isOpen);
    profileMenuTrigger.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", (event) => {
    const clickedInside =
      profileMenu?.contains(event.target) || profileMenuTrigger?.contains(event.target);
    if (!clickedInside && profileMenu) {
      profileMenu.classList.add("hidden");
      profileMenuTrigger?.setAttribute("aria-expanded", "false");
    }
  });

  logoutButton?.addEventListener("click", () => {
    logoutCurrentUser();
    window.location.href = "index.html";
  });
}

runCommunityPage();
