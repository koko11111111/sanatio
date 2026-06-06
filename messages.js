
function escHtml(t) { return String(t||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }
function safeImg(url, name) {
  const v = String(url||"").trim();
  if (v.startsWith("data:image/")||v.startsWith("http://")||v.startsWith("https://")) return v;
  const i = (name||"U").trim().charAt(0).toUpperCase();
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="54%" text-anchor="middle" fill="#e5e7eb" font-size="28" font-family="Arial,sans-serif">${i}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;
}
function emailKey(e) { return String(e||"").replace(/[.#$[\]]/g,"_"); }
function makeConvId(a, b) { return [emailKey(a),emailKey(b)].sort().join("__"); }
function formatTime(ts) {
  if (!ts) return "";
  const d = typeof ts.toDate==="function" ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const isToday = d.toDateString()===now.toDateString();
  return isToday
    ? d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
    : d.toLocaleDateString([],{month:"short",day:"numeric"})+" "+d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
}
function timeAgo(ts) {
  if (!ts) return "";
  const d = typeof ts.toDate==="function" ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now()-d.getTime();
  if (diff<60000) return "now";
  if (diff<3600000) return Math.floor(diff/60000)+"m";
  if (diff<86400000) return Math.floor(diff/3600000)+"h";
  return d.toLocaleDateString([],{month:"short",day:"numeric"});
}

async function runMessagesPage() {
  const me = getCurrentUser();
  if (!me) { window.location.href="login.html"; return; }

  // ── Init Firebase ──────────────────────────────────────────────────────
  let db = null;
  try {
    if (typeof FIREBASE_CONFIG==="object" && FIREBASE_CONFIG?.apiKey) {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      else firebase.app(); // reuse existing
      db = firebase.firestore();
    }
  } catch(e) { console.warn("Firebase init:", e); }

  if (!db) {
    document.getElementById("msng-convs").innerHTML =
      '<p class="msng-hint" style="color:var(--gold)">⚠ Firebase required for messages. Check your config.js.</p>';
    return;
  }

  // ── State ──────────────────────────────────────────────────────────────
  let activeCid  = null;
  let activePeer = null;
  let unsubMsgs  = null;
  let unsubConvs = null;
  let pendingImg = null;
  const peerCache = {};

  // ── DOM refs ───────────────────────────────────────────────────────────
  const msngLeft       = document.getElementById("msng-left");
  const convsList      = document.getElementById("msng-convs");
  const emptyState     = document.getElementById("msng-empty-state");
  const chatHead       = document.getElementById("msng-chat-head");
  const msgsEl         = document.getElementById("msng-msgs");
  const composeForm    = document.getElementById("msng-compose");
  const textInput      = document.getElementById("msng-text");
  const imgInput       = document.getElementById("msng-img-input");
  const imgPreviewWrap = document.getElementById("msng-img-preview-wrap");
  const imgPreview     = document.getElementById("msng-img-preview");
  const imgClearBtn    = document.getElementById("msng-img-preview-clear");
  const peerAvatarEl   = document.getElementById("msng-peer-avatar");
  const peerNameEl     = document.getElementById("msng-peer-name");
  const peerSubEl      = document.getElementById("msng-peer-sub");
  const peerLinkEl     = document.getElementById("msng-peer-link");
  const headProfile    = document.getElementById("msng-head-profile");
  const backBtn        = document.getElementById("msng-back");
  const newBtn         = document.getElementById("msng-new-btn");
  const emptyNewBtn    = document.getElementById("msng-empty-new");
  const searchInput    = document.getElementById("msng-search");
  const searchResults  = document.getElementById("msng-search-results");

  // ── Fetch peer profile (cached) ────────────────────────────────────────
  async function getPeer(email) {
    if (peerCache[email]) return peerCache[email];
    let p = { email, name: email, photo: "" };
    try {
      const doc = await db.collection("users").doc(emailKey(email)).get();
      if (doc.exists) {
        const data = doc.data();
        p = { email, name: data.name||email, photo: data.profilePhoto||"" };
      }
    } catch(e) { console.warn("getPeer:", e); }
    peerCache[email] = p;
    return p;
  }

  // ── User search ────────────────────────────────────────────────────────
  function setupSearch(inputEl, resultsEl) {
    let debounce = null;
    inputEl.addEventListener("input", () => {
      clearTimeout(debounce);
      const q = inputEl.value.trim().toLowerCase();
      if (!q) { resultsEl.classList.add("hidden"); resultsEl.innerHTML=""; return; }
      debounce = setTimeout(async () => {
        try {
          const snap = await db.collection("users").get();
          const hits = snap.docs
            .map(d => d.data())
            .filter(u => u.email && u.email !== me.email &&
              (u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)))
            .slice(0, 8);
          if (!hits.length) {
            resultsEl.innerHTML = '<p class="search-no-results">No users found.</p>';
          } else {
            resultsEl.innerHTML = hits.map(u => `
              <div class="search-result-item msng-search-hit"
                data-email="${escHtml(u.email)}"
                data-name="${escHtml(u.name||u.email)}"
                data-photo="${escHtml(u.profilePhoto||"")}">
                <img class="search-result-avatar" src="${safeImg(u.profilePhoto, u.name)}" alt="${escHtml(u.name||u.email)}">
                <div>
                  <p class="search-result-name">${escHtml(u.name||u.email)}</p>
                  <p class="search-result-email">${escHtml(u.email)}</p>
                </div>
              </div>`).join("");
            resultsEl.querySelectorAll(".msng-search-hit").forEach(el => {
              el.addEventListener("click", () => {
                inputEl.value = "";
                resultsEl.classList.add("hidden");
                resultsEl.innerHTML = "";
                openChat({ email: el.dataset.email, name: el.dataset.name, photo: el.dataset.photo });
              });
            });
          }
          resultsEl.classList.remove("hidden");
        } catch(e) { console.error("Search error:", e); }
      }, 300);
    });
    document.addEventListener("click", e => {
      if (!inputEl.contains(e.target) && !resultsEl.contains(e.target))
        resultsEl.classList.add("hidden");
    });
  }

  setupSearch(searchInput, searchResults);
  newBtn?.addEventListener("click", () => searchInput.focus());
  emptyNewBtn?.addEventListener("click", () => searchInput.focus());

  // ── Render conversations list ──────────────────────────────────────────
  function renderConvsList(convs) {
    if (!convs.length) {
      convsList.innerHTML = '<p class="msng-hint">No chats yet. Search for someone above.</p>';
      return;
    }
    convsList.innerHTML = "";
    convs.forEach(conv => {
      const isActive = activeCid === conv.id;
      const div = document.createElement("div");
      div.className = `msng-conv-item${isActive?" active":""}${conv.unread>0?" has-unread":""}`;
      div.dataset.cid = conv.id;
      div.innerHTML = `
        <div class="msng-conv-avatar-wrap">
          <img class="msng-conv-avatar" src="${safeImg(conv.peer.photo, conv.peer.name)}" alt="${escHtml(conv.peer.name)}">
        </div>
        <div class="msng-conv-info">
          <p class="msng-conv-name">${escHtml(conv.peer.name)}</p>
          <p class="msng-conv-last">${escHtml(conv.lastMessage||"")}</p>
        </div>
        <div class="msng-conv-meta">
          <p class="msng-conv-time">${timeAgo(conv.lastAt)}</p>
          ${conv.unread>0 ? `<span class="msng-unread-dot">${conv.unread}</span>` : ""}
        </div>`;
      div.addEventListener("click", () => openChat(conv.peer));
      convsList.appendChild(div);
    });
  }

  // ── Conversations real-time listener ───────────────────────────────────
  function startConvsListener() {
    convsList.innerHTML = '<p class="msng-hint">Loading chats…</p>';

    // Try with orderBy first; if index missing fall back to unordered
    const tryListen = (ordered) => {
      let query = db.collection("conversations").where("participants","array-contains", me.email);
      if (ordered) query = query.orderBy("lastAt","desc");

      unsubConvs = query.onSnapshot(async snap => {
        const meKey = emailKey(me.email);
        const rows = await Promise.all(snap.docs.map(async doc => {
          const data = doc.data();
          const peerEmail = (data.participants||[]).find(p => p !== me.email);
          if (!peerEmail) return null;
          const peer = await getPeer(peerEmail);
          const unread = data[`unread_${meKey}`] || 0;
          return { id: doc.id, ...data, peer, unread };
        }));

        let convs = rows.filter(Boolean);
        if (!ordered) {
          // manual sort when index not available
          convs.sort((a,b) => {
            const ta = a.lastAt?.toDate?.() || new Date(a.lastAt||0);
            const tb = b.lastAt?.toDate?.() || new Date(b.lastAt||0);
            return tb - ta;
          });
        }
        renderConvsList(convs);
      }, err => {
        if (ordered && err.code === "failed-precondition") {
          // Index not ready — retry without orderBy
          console.warn("Conversations index missing, falling back to unordered query. Create the index via the Firebase console link in the error above.");
          if (unsubConvs) { unsubConvs(); unsubConvs = null; }
          tryListen(false);
        } else {
          console.error("Conversations listener error:", err);
          convsList.innerHTML = `<p class="msng-hint" style="color:var(--gold)">⚠ Could not load chats: ${err.message}</p>`;
        }
      });
    };

    tryListen(true);
  }

  // ── Open a conversation ────────────────────────────────────────────────
  async function openChat(peer) {
    // Resolve fresh peer data if only partial info passed
    if (!peer.name || peer.name === peer.email) {
      const fresh = await getPeer(peer.email);
      peer = fresh;
    }

    activePeer = peer;
    activeCid  = makeConvId(me.email, peer.email);

    // On mobile: hide sidebar, show chat. On desktop: both visible
    if (window.innerWidth <= 640) {
      msngLeft.classList.add("msng-left-hidden");
    }
    document.getElementById("msng-right")?.classList.remove("msng-right-hidden");

    // Hide empty state, show full chat
    emptyState.style.display = "none";
    chatHead.classList.remove("hidden");
    msgsEl.classList.remove("hidden");
    composeForm.classList.remove("hidden");

    peerAvatarEl.src = safeImg(peer.photo, peer.name);
    peerNameEl.textContent = peer.name;
    peerSubEl.textContent = "Active recently";

    const profileUrl = `profile.html?user=${encodeURIComponent(peer.email)}`;
    if (peerLinkEl) peerLinkEl.href = profileUrl;
    if (headProfile) headProfile.href = profileUrl;

    // Highlight active conv
    document.querySelectorAll(".msng-conv-item").forEach(el => {
      el.classList.toggle("active", el.dataset.cid === activeCid);
    });

    // Unsubscribe old messages listener
    if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
    msgsEl.innerHTML = '<p class="msng-loading">Loading…</p>';

    await markRead();

    // Messages listener — also with index fallback
    const tryMsgsListen = (ordered) => {
      let q = db.collection("conversations").doc(activeCid).collection("messages");
      if (ordered) q = q.orderBy("createdAt","asc");

      unsubMsgs = q.onSnapshot(snap => {
        let msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!ordered) msgs.sort((a,b) => {
          const ta = a.createdAt?.toDate?.() || new Date(a.createdAt||0);
          const tb = b.createdAt?.toDate?.() || new Date(b.createdAt||0);
          return ta - tb;
        });
        renderMsgs(msgs);
        markRead();
      }, err => {
        if (ordered && err.code === "failed-precondition") {
          console.warn("Messages index missing, falling back.");
          if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
          tryMsgsListen(false);
        } else {
          console.error("Messages listener error:", err);
        }
      });
    };

    tryMsgsListen(true);
    textInput.focus();
  }

  // ── Mark messages as read ──────────────────────────────────────────────
  async function markRead() {
    if (!activeCid) return;
    const meKey = emailKey(me.email);
    try {
      await db.collection("conversations").doc(activeCid).set(
        { [`unread_${meKey}`]: 0 }, { merge: true }
      );
      const snap = await db.collection("conversations").doc(activeCid)
        .collection("messages")
        .where("sender","!=", me.email)
        .get();
      if (snap.empty) return;
      const batch = db.batch();
      snap.docs.forEach(d => {
        const rb = d.data().readBy || [];
        if (!rb.includes(me.email)) batch.update(d.ref, { readBy: [...rb, me.email] });
      });
      await batch.commit();
    } catch(e) { /* silent — read receipts are best-effort */ }
  }

  // ── Render messages ────────────────────────────────────────────────────
  function renderMsgs(msgs) {
    if (!msgs.length) {
      msgsEl.innerHTML = '<div class="msng-msgs-empty"><p>No messages yet. Say hello! 👋</p></div>';
      return;
    }

    const atBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 120;
    msgsEl.innerHTML = "";
    let prevDate = null;

    msgs.forEach((msg, idx) => {
      const isMine  = msg.sender === me.email;
      const isLast  = idx === msgs.length - 1;
      const ts      = msg.createdAt;
      const d       = ts ? (typeof ts.toDate==="function" ? ts.toDate() : new Date(ts)) : null;
      const dateStr = d ? d.toDateString() : null;

      // Date separator
      if (dateStr && dateStr !== prevDate) {
        prevDate = dateStr;
        const sep = document.createElement("div");
        sep.className = "msng-date-sep";
        sep.textContent = d.toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"});
        msgsEl.appendChild(sep);
      }

      const readBy     = msg.readBy || [];
      const seenByPeer = activePeer && readBy.includes(activePeer.email);
      const seenHtml   = isMine && isLast
        ? seenByPeer
          ? `<div class="msng-seen"><img src="${safeImg(activePeer?.photo||"", activePeer?.name)}" class="msng-seen-avatar" alt="">${escHtml(activePeer?.name||"")} saw this</div>`
          : `<div class="msng-seen sent">Sent ✓</div>`
        : "";

      const row = document.createElement("div");
      row.className = `msng-msg-row${isMine?" mine":" theirs"}`;
      const reactions = msg.reactions || {};
      const reactionHtml = Object.entries(reactions).length
        ? `<div class="msng-reactions">${Object.entries(reactions).map(([emoji,users])=>
            `<span class="msng-reaction${users.includes(me.email)?" mine":""}" data-msgid="${escHtml(msg.id)}" data-emoji="${escHtml(emoji)}">${emoji} ${users.length}</span>`
          ).join("")}</div>` : "";

      row.innerHTML = `
        ${!isMine ? `<img class="msng-msg-avatar" src="${safeImg(activePeer?.photo||"", activePeer?.name)}" alt="">` : ""}
        <div class="msng-bubble-col${isMine?" mine":""}">
          <div class="msng-bubble-wrap-inner" data-msgid="${escHtml(msg.id)}">
            <div class="msng-bubble${isMine?" mine":" theirs"}">
              ${msg.text  ? `<p class="msng-bubble-text">${escHtml(msg.text)}</p>` : ""}
              ${msg.imageUrl && safeImg(msg.imageUrl,"") ? `<img class="msng-bubble-img" src="${safeImg(msg.imageUrl,"")}" alt="Image">` : ""}
            </div>
            <div class="msng-msg-toolbar">
              <button class="msng-react-btn" data-msgid="${escHtml(msg.id)}" title="React">😊</button>
              ${isMine ? `<button class="msng-delete-btn" data-msgid="${escHtml(msg.id)}" title="Delete">🗑</button>` : ""}
            </div>
          </div>
          ${reactionHtml}
          <p class="msng-msg-time">${formatTime(ts)}</p>
          ${seenHtml}
        </div>
        ${isMine ? `<img class="msng-msg-avatar mine" src="${safeImg(me.profilePhoto, me.name)}" alt="">` : ""}`;
      msgsEl.appendChild(row);
    });

    if (atBottom || msgs[msgs.length-1]?.sender === me.email) {
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    // Wire react buttons
    msgsEl.querySelectorAll(".msng-react-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showEmojiPicker(btn.dataset.msgid, btn);
      });
    });
    // Wire delete buttons
    msgsEl.querySelectorAll(".msng-delete-btn").forEach(btn => {
      btn.addEventListener("click", () => deleteMessage(btn.dataset.msgid));
    });
    // Wire existing reaction clicks (toggle off)
    msgsEl.querySelectorAll(".msng-reaction").forEach(span => {
      span.addEventListener("click", () => toggleReaction(span.dataset.msgid, span.dataset.emoji));
    });
  }

  // ── Send message ───────────────────────────────────────────────────────
  composeForm?.addEventListener("submit", async e => {
    e.preventDefault();
    const text = textInput.value.trim();
    if (!text && !pendingImg) return;
    if (!activePeer || !activeCid) return;

    const imageUrl = pendingImg || "";
    textInput.value = "";
    pendingImg = null;
    imgPreviewWrap.classList.add("hidden");
    imgPreview.src = "";

    const peerKey = emailKey(activePeer.email);
    const meKey   = emailKey(me.email);

    try {
      // Ensure conversation doc exists first
      await db.collection("conversations").doc(activeCid).set({
        participants: [me.email, activePeer.email],
        lastMessage: imageUrl && !text ? "📷 Photo" : text,
        lastAt: firebase.firestore.FieldValue.serverTimestamp(),
        [`unread_${peerKey}`]: firebase.firestore.FieldValue.increment(1),
        [`unread_${meKey}`]: 0,
      }, { merge: true });

      // Add the message
      await db.collection("conversations").doc(activeCid)
        .collection("messages").add({
          sender:    me.email,
          text:      text || "",
          imageUrl:  imageUrl,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          readBy:    [me.email],
        });

      // Notification for recipient
      await db.collection("notifications").add({
        to:        activePeer.email,
        from:      me.email,
        type:      "message",
        read:      false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch(err) {
      console.error("Send failed:", err);
    }
    textInput.focus();
  });

  // ── Image attachment ───────────────────────────────────────────────────
  imgInput?.addEventListener("change", () => {
    const file = imgInput.files[0];
    if (!file) return;
    if (file.size > 700000) { alert("Image must be under ~500 KB."); imgInput.value=""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      pendingImg = String(reader.result || "");
      imgPreview.src = pendingImg;
      imgPreviewWrap.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
    imgInput.value = "";
  });

  imgClearBtn?.addEventListener("click", () => {
    pendingImg = null;
    imgPreview.src = "";
    imgPreviewWrap.classList.add("hidden");
  });

  // ── Emoji picker ───────────────────────────────────────────────────────
  const EMOJIS = ["❤️","😂","😮","😢","😡","👍"];
  let pickerEl = null;

  function showEmojiPicker(msgId, anchor) {
    pickerEl?.remove();
    const picker = document.createElement("div");
    picker.className = "msng-emoji-picker";
    picker.innerHTML = EMOJIS.map(e =>
      `<button class="msng-emoji-opt" data-msgid="${msgId}" data-emoji="${e}" type="button">${e}</button>`
    ).join("");
    anchor.parentElement.appendChild(picker);
    pickerEl = picker;

    picker.querySelectorAll(".msng-emoji-opt").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleReaction(btn.dataset.msgid, btn.dataset.emoji);
        picker.remove(); pickerEl = null;
      });
    });
    setTimeout(() => {
      document.addEventListener("click", () => { picker.remove(); pickerEl = null; }, { once: true });
    }, 0);
  }

  async function toggleReaction(msgId, emoji) {
    if (!activeCid || !msgId) return;
    try {
      const ref = db.collection("conversations").doc(activeCid).collection("messages").doc(msgId);
      await db.runTransaction(async tx => {
        const doc = await tx.get(ref);
        if (!doc.exists) return;
        const reactions = doc.data().reactions || {};
        const users = reactions[emoji] || [];
        if (users.includes(me.email)) {
          reactions[emoji] = users.filter(u => u !== me.email);
          if (!reactions[emoji].length) delete reactions[emoji];
        } else {
          reactions[emoji] = [...users, me.email];
        }
        tx.update(ref, { reactions });
      });
    } catch(e) { console.error("Reaction failed:", e); }
  }

  async function deleteMessage(msgId) {
    if (!activeCid || !msgId) return;
    if (!confirm("Delete this message?")) return;
    try {
      await db.collection("conversations").doc(activeCid)
        .collection("messages").doc(msgId).delete();
    } catch(e) { console.error("Delete message failed:", e); }
  }

  // ── Back button (mobile) ───────────────────────────────────────────────
  backBtn?.addEventListener("click", () => {
    if (window.innerWidth <= 640) {
      msngLeft.classList.remove("msng-left-hidden");
    }
    emptyState.style.display = "";
    chatHead.classList.add("hidden");
    msgsEl.classList.add("hidden");
    composeForm.classList.add("hidden");
    if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
    activeCid  = null;
    activePeer = null;
    document.querySelectorAll(".msng-conv-item").forEach(el => el.classList.remove("active"));
  });

  // ── Check for deep-link from profile page ──────────────────────────────
  try {
    const pending = sessionStorage.getItem("pendingMessageUser");
    if (pending) {
      sessionStorage.removeItem("pendingMessageUser");
      const peer = JSON.parse(pending);
      if (peer?.email) {
        // Small delay so Firebase listeners are ready
        setTimeout(() => openChat({
          email: peer.email,
          name:  peer.name  || peer.email,
          photo: peer.profilePhoto || ""
        }), 600);
      }
    }
  } catch {}

  startConvsListener();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runMessagesPage);
} else {
  runMessagesPage();
}
