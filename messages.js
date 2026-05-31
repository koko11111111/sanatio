/**
 * SANATIO messages.js
 * Real-time private messaging via Firestore.
 *
 * Firestore structure:
 *   conversations/{convId}
 *     participants: [emailA, emailB]
 *     lastMessage: string
 *     lastAt: timestamp
 *     unread_{emailKey}: number   ← unread count per user
 *
 *   conversations/{convId}/messages/{msgId}
 *     sender: email
 *     text: string
 *     imageUrl: string (base64 data url)
 *     createdAt: serverTimestamp
 *     readBy: [email, ...]
 */

// ── Utilities ─────────────────────────────────────────────────────────────

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

function emailToKey(email) {
  return email.replace(/[.#$[\]]/g, "_");
}

function convId(emailA, emailB) {
  return [emailA, emailB].map(emailToKey).sort().join("__");
}

function formatTime(ts) {
  if (!ts) return "";
  const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

function runMessagesPage() {
  const me = getCurrentUser();
  if (!me) return;

  // ── Init Firebase ──────────────────────────────────────────────────────
  let db = null;
  try {
    if (typeof FIREBASE_CONFIG === "object" && FIREBASE_CONFIG?.apiKey) {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
    }
  } catch (e) {
    console.warn("Firebase init failed:", e);
  }

  if (!db) {
    document.getElementById("conversations-list").innerHTML =
      '<p class="messenger-empty" style="color:var(--gold)">⚠ Firebase not configured. Messages require Firebase to work across devices.</p>';
    return;
  }

  // ── Profile menu setup ─────────────────────────────────────────────────
  const profilePhotoEl = document.getElementById("profile-photo");
  const profileNameEl = document.getElementById("profile-name");
  const profileEmailEl = document.getElementById("profile-email");
  const profileCreatedEl = document.getElementById("profile-created");
  const profilePhotoInput = document.getElementById("profile-photo-input");
  const profileMenuTrigger = document.getElementById("profile-menu-trigger");
  const profileMenu = document.getElementById("profile-menu");
  const logoutBtn = document.getElementById("logout-btn");
  const welcomeUser = document.getElementById("welcome-user");

  if (profilePhotoEl) profilePhotoEl.src = safeImageSrc(me.profilePhoto) || createFallbackAvatar(me.name);
  if (profileNameEl) profileNameEl.textContent = me.name;
  if (profileEmailEl) profileEmailEl.textContent = me.email;
  if (profileCreatedEl) profileCreatedEl.textContent = me.createdAt ? `Joined: ${new Date(me.createdAt).toLocaleDateString()}` : "Joined recently";
  if (welcomeUser) welcomeUser.textContent = `Welcome, ${me.name}.`;

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
      if (profilePhotoEl) profilePhotoEl.src = String(reader.result || "");
      saveProfilePhotoForCurrentUser(String(reader.result || ""));
    };
    reader.readAsDataURL(file);
  });
  logoutBtn?.addEventListener("click", () => {
    logoutCurrentUser();
    window.location.href = "index.html";
  });

  // ── State ──────────────────────────────────────────────────────────────
  let activeConvId = null;
  let activePeer = null;
  let unsubMessages = null;
  let unsubConvs = null;
  let pendingImageDataUrl = null;

  // ── DOM refs ───────────────────────────────────────────────────────────
  const sidebar = document.getElementById("messenger-sidebar");
  const convsList = document.getElementById("conversations-list");
  const chatEmpty = document.getElementById("messenger-chat-empty");
  const chatHeader = document.getElementById("messenger-chat-header");
  const chatPeerAvatar = document.getElementById("chat-peer-avatar");
  const chatPeerName = document.getElementById("chat-peer-name");
  const chatPeerStatus = document.getElementById("chat-peer-status");
  const messagesEl = document.getElementById("messenger-messages");
  const composeForm = document.getElementById("messenger-compose");
  const msgTextInput = document.getElementById("msg-text");
  const msgImageInput = document.getElementById("msg-image-input");
  const backBtn = document.getElementById("messenger-back-btn");
  const searchInput = document.getElementById("messenger-search");
  const searchResults = document.getElementById("messenger-search-results");

  // ── Search users ───────────────────────────────────────────────────────
  let searchDebounce = null;

  searchInput?.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      searchResults.classList.add("hidden");
      searchResults.innerHTML = "";
      return;
    }
    searchDebounce = setTimeout(async () => {
      try {
        const snapshot = await db.collection("users").get();
        const matches = snapshot.docs
          .map(d => d.data())
          .filter(u => u.email !== me.email && (
            u.name?.toLowerCase().includes(query) ||
            u.email?.toLowerCase().includes(query)
          ))
          .slice(0, 8);

        if (matches.length === 0) {
          searchResults.innerHTML = '<p class="search-no-results">No users found.</p>';
        } else {
          searchResults.innerHTML = matches.map(u => `
            <div class="search-result-item messenger-search-result" data-email="${escapeHtml(u.email)}" data-name="${escapeHtml(u.name)}" data-photo="${escapeHtml(u.profilePhoto || "")}">
              <img class="search-result-avatar" src="${safeImageSrc(u.profilePhoto) || createFallbackAvatar(u.name)}" alt="${escapeHtml(u.name)}">
              <div>
                <p class="search-result-name">${escapeHtml(u.name)}</p>
                <p class="search-result-email">${escapeHtml(u.email)}</p>
              </div>
            </div>
          `).join("");
          searchResults.querySelectorAll(".messenger-search-result").forEach(el => {
            el.addEventListener("click", () => {
              const peer = {
                email: el.dataset.email,
                name: el.dataset.name,
                profilePhoto: el.dataset.photo,
              };
              searchInput.value = "";
              searchResults.classList.add("hidden");
              searchResults.innerHTML = "";
              openConversation(peer);
            });
          });
        }
        searchResults.classList.remove("hidden");
      } catch (e) {
        console.error("Search failed:", e);
      }
    }, 300);
  });

  document.addEventListener("click", (e) => {
    if (!searchInput?.contains(e.target) && !searchResults?.contains(e.target)) {
      searchResults?.classList.add("hidden");
    }
  });

  // ── Conversations list ─────────────────────────────────────────────────
  function startConversationsListener() {
    const meKey = emailToKey(me.email);
    unsubConvs = db.collection("conversations")
      .where("participants", "array-contains", me.email)
      .orderBy("lastAt", "desc")
      .onSnapshot(async (snapshot) => {
        if (snapshot.empty) {
          convsList.innerHTML = '<p class="messenger-empty">No conversations yet. Search for someone above.</p>';
          return;
        }

        // Load peer profiles
        const convDatas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        convsList.innerHTML = "";
        for (const conv of convDatas) {
          const peerEmail = conv.participants.find(p => p !== me.email);
          if (!peerEmail) continue;

          const peerKey = emailToKey(peerEmail);
          let peerName = peerEmail;
          let peerPhoto = "";

          try {
            const peerDoc = await db.collection("users").doc(peerKey).get();
            if (peerDoc.exists) {
              peerName = peerDoc.data().name || peerEmail;
              peerPhoto = peerDoc.data().profilePhoto || "";
            }
          } catch {}

          const unreadKey = `unread_${meKey}`;
          const unreadCount = conv[unreadKey] || 0;
          const isActive = activeConvId === conv.id;

          const item = document.createElement("div");
          item.className = `conversation-item${isActive ? " active" : ""}`;
          item.dataset.convId = conv.id;
          item.dataset.peerEmail = peerEmail;
          item.dataset.peerName = peerName;
          item.dataset.peerPhoto = peerPhoto;

          item.innerHTML = `
            <img class="conversation-avatar" src="${safeImageSrc(peerPhoto) || createFallbackAvatar(peerName)}" alt="${escapeHtml(peerName)}">
            <div class="conversation-info">
              <p class="conversation-name">${escapeHtml(peerName)}</p>
              <p class="conversation-last">${escapeHtml(conv.lastMessage || "")}</p>
            </div>
            ${unreadCount > 0 ? `<span class="conversation-unread">${unreadCount}</span>` : ""}
          `;

          item.addEventListener("click", () => {
            openConversation({ email: peerEmail, name: peerName, profilePhoto: peerPhoto });
          });

          convsList.appendChild(item);
        }
      }, err => {
        console.error("Conversations listener error:", err);
      });
  }

  // ── Open a conversation ────────────────────────────────────────────────
  function openConversation(peer) {
    activePeer = peer;
    activeConvId = convId(me.email, peer.email);

    // Mobile: hide sidebar, show chat
    sidebar.classList.add("messenger-sidebar-hidden");

    // Update header
    chatEmpty.classList.add("hidden");
    chatHeader.classList.remove("hidden");
    messagesEl.classList.remove("hidden");
    composeForm.classList.remove("hidden");

    chatPeerAvatar.src = safeImageSrc(peer.profilePhoto) || createFallbackAvatar(peer.name);
    chatPeerName.textContent = peer.name;
    chatPeerStatus.textContent = "";

    // Highlight active convo in sidebar
    document.querySelectorAll(".conversation-item").forEach(el => {
      el.classList.toggle("active", el.dataset.convId === activeConvId);
    });

    // Unsubscribe previous messages listener
    if (unsubMessages) {
      unsubMessages();
      unsubMessages = null;
    }

    messagesEl.innerHTML = '<p class="messenger-empty" style="padding:1rem">Loading messages…</p>';

    // Mark messages as read
    markAsRead();

    // Listen to messages
    unsubMessages = db.collection("conversations").doc(activeConvId)
      .collection("messages")
      .orderBy("createdAt", "asc")
      .onSnapshot((snapshot) => {
        renderMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        markAsRead();
      }, err => {
        console.error("Messages listener error:", err);
      });

    msgTextInput.focus();
  }

  // ── Mark as read ───────────────────────────────────────────────────────
  async function markAsRead() {
    if (!activeConvId) return;
    const meKey = emailToKey(me.email);
    const unreadKey = `unread_${meKey}`;
    try {
      await db.collection("conversations").doc(activeConvId).set(
        { [unreadKey]: 0 },
        { merge: true }
      );
      // Mark all messages as read
      const unread = await db.collection("conversations").doc(activeConvId)
        .collection("messages")
        .where("sender", "!=", me.email)
        .get();
      const batch = db.batch();
      unread.docs.forEach(doc => {
        const readBy = doc.data().readBy || [];
        if (!readBy.includes(me.email)) {
          batch.update(doc.ref, { readBy: [...readBy, me.email] });
        }
      });
      await batch.commit();
    } catch {}
  }

  // ── Render messages ────────────────────────────────────────────────────
  function renderMessages(messages) {
    if (messages.length === 0) {
      messagesEl.innerHTML = '<p class="messenger-empty" style="padding:1.5rem;text-align:center">No messages yet. Say hello! 👋</p>';
      return;
    }

    const wasAtBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;

    messagesEl.innerHTML = messages.map((msg, idx) => {
      const isMine = msg.sender === me.email;
      const isLast = idx === messages.length - 1;
      const readBy = msg.readBy || [];
      const seenByPeer = activePeer && readBy.includes(activePeer.email);

      let receiptHtml = "";
      if (isMine && isLast) {
        receiptHtml = seenByPeer
          ? `<span class="msg-receipt seen">✓✓ Seen</span>`
          : `<span class="msg-receipt sent">✓ Sent</span>`;
      }

      return `
        <div class="msg-row ${isMine ? "msg-mine" : "msg-theirs"}">
          ${!isMine ? `<img class="msg-avatar" src="${safeImageSrc(activePeer?.profilePhoto) || createFallbackAvatar(activePeer?.name)}" alt="">` : ""}
          <div class="msg-bubble-wrap">
            <div class="msg-bubble ${isMine ? "msg-bubble-mine" : "msg-bubble-theirs"}">
              ${msg.text ? `<p class="msg-text">${escapeHtml(msg.text)}</p>` : ""}
              ${msg.imageUrl && safeImageSrc(msg.imageUrl) ? `<img class="msg-image" src="${safeImageSrc(msg.imageUrl)}" alt="Image">` : ""}
            </div>
            <p class="msg-time">${formatTime(msg.createdAt)}</p>
            ${receiptHtml}
          </div>
        </div>
      `;
    }).join("");

    if (wasAtBottom || messages[messages.length - 1]?.sender === me.email) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  // ── Send message ───────────────────────────────────────────────────────
  composeForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = msgTextInput.value.trim();
    if (!text && !pendingImageDataUrl) return;
    if (!activePeer) return;

    const imageUrl = pendingImageDataUrl || "";
    msgTextInput.value = "";
    pendingImageDataUrl = null;

    // Clear image preview
    const preview = document.getElementById("msg-image-preview");
    if (preview) preview.remove();

    const meKey = emailToKey(me.email);
    const peerKey = emailToKey(activePeer.email);
    const cid = activeConvId;

    const msgData = {
      sender: me.email,
      text: text || "",
      imageUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      readBy: [me.email],
    };

    const convData = {
      participants: [me.email, activePeer.email],
      lastMessage: imageUrl && !text ? "📷 Image" : text,
      lastAt: firebase.firestore.FieldValue.serverTimestamp(),
      [`unread_${peerKey}`]: firebase.firestore.FieldValue.increment(1),
      [`unread_${meKey}`]: 0,
    };

    try {
      await db.collection("conversations").doc(cid).set(convData, { merge: true });
      await db.collection("conversations").doc(cid).collection("messages").add(msgData);
      msgTextInput.focus();
    } catch (err) {
      console.error("Send failed:", err);
    }
  });

  // ── Image attachment ───────────────────────────────────────────────────
  msgImageInput?.addEventListener("change", async () => {
    const file = msgImageInput.files[0];
    if (!file) return;

    // Remove existing preview
    document.getElementById("msg-image-preview")?.remove();

    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > 700000) {
        alert("Image too large. Please choose an image under ~500 KB.");
        msgImageInput.value = "";
        return;
      }
      pendingImageDataUrl = dataUrl;

      // Show preview above compose bar
      const preview = document.createElement("div");
      preview.id = "msg-image-preview";
      preview.className = "msg-image-preview";
      preview.innerHTML = `
        <img src="${dataUrl}" alt="Image to send">
        <button type="button" class="msg-image-preview-clear" aria-label="Remove image">✕</button>
      `;
      preview.querySelector(".msg-image-preview-clear").addEventListener("click", () => {
        pendingImageDataUrl = null;
        msgImageInput.value = "";
        preview.remove();
      });
      composeForm.parentElement.insertBefore(preview, composeForm);
    } catch {
      alert("Could not read that image.");
    }
    msgImageInput.value = "";
  });

  // ── Back button (mobile) ───────────────────────────────────────────────
  backBtn?.addEventListener("click", () => {
    sidebar.classList.remove("messenger-sidebar-hidden");
    chatEmpty.classList.remove("hidden");
    chatHeader.classList.add("hidden");
    messagesEl.classList.add("hidden");
    composeForm.classList.add("hidden");
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }
    activeConvId = null;
    activePeer = null;
  });

  // ── Start ──────────────────────────────────────────────────────────────

  // Check if opened from profile page with a target user
  try {
    const pendingMsg = sessionStorage.getItem("pendingMessageUser");
    if (pendingMsg) {
      sessionStorage.removeItem("pendingMessageUser");
      const peer = JSON.parse(pendingMsg);
      if (peer?.email) {
        // Small delay so Firebase is ready
        setTimeout(() => openConversation(peer), 400);
      }
    }
  } catch {}

  startConversationsListener();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runMessagesPage);
} else {
  runMessagesPage();
}
