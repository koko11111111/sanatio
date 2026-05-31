/**
 * SANATIO messages.js — Full Messenger-style private chat
 */

function escHtml(t) { return String(t||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }
function safeImg(url, name) {
  const v = String(url||"").trim();
  if (v.startsWith("data:image/")||v.startsWith("http://")||v.startsWith("https://")) return v;
  const i = (name||"U").trim().charAt(0).toUpperCase();
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="54%" text-anchor="middle" fill="#e5e7eb" font-size="28" font-family="Arial,sans-serif">${i}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;
}
function emailKey(e) { return String(e||"").replace(/[.#$[\]]/g,"_"); }
function convId(a, b) { return [emailKey(a),emailKey(b)].sort().join("__"); }
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

  let db = null;
  try {
    if (typeof FIREBASE_CONFIG==="object"&&FIREBASE_CONFIG?.apiKey) {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
    }
  } catch(e) { console.warn("Firebase:",e); }

  if (!db) {
    document.getElementById("msng-convs").innerHTML='<p class="msng-hint" style="color:var(--gold)">⚠ Firebase required for messages.</p>';
    return;
  }

  // ── State ──────────────────────────────────────────────────────────────
  let activeCid = null;
  let activePeer = null;
  let unsubMsgs = null;
  let unsubConvs = null;
  let pendingImg = null;
  const peerCache = {};

  // ── DOM ────────────────────────────────────────────────────────────────
  const msngLeft       = document.getElementById("msng-left");
  const msngRight      = document.getElementById("msng-right");
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
  const peerAvatar     = document.getElementById("msng-peer-avatar");
  const peerName       = document.getElementById("msng-peer-name");
  const peerSub        = document.getElementById("msng-peer-sub");
  const peerLink       = document.getElementById("msng-peer-link");
  const headProfile    = document.getElementById("msng-head-profile");
  const backBtn        = document.getElementById("msng-back");
  const newBtn         = document.getElementById("msng-new-btn");
  const emptyNewBtn    = document.getElementById("msng-empty-new");
  const searchInput    = document.getElementById("msng-search");
  const searchResults  = document.getElementById("msng-search-results");

  // ── Load peer profile ──────────────────────────────────────────────────
  async function getPeer(email) {
    if (peerCache[email]) return peerCache[email];
    let p = { email, name: email, photo: "" };
    try {
      const d = await db.collection("users").doc(emailKey(email)).get();
      if (d.exists) p = { email, name: d.data().name||email, photo: d.data().profilePhoto||"" };
    } catch {}
    peerCache[email] = p;
    return p;
  }

  // ── Search users ───────────────────────────────────────────────────────
  function setupSearch(inputEl, resultsEl) {
    let debounce = null;
    inputEl.addEventListener("input", () => {
      clearTimeout(debounce);
      const q = inputEl.value.trim().toLowerCase();
      if (!q) { resultsEl.classList.add("hidden"); resultsEl.innerHTML=""; return; }
      debounce = setTimeout(async () => {
        try {
          const snap = await db.collection("users").get();
          const hits = snap.docs.map(d=>d.data())
            .filter(u=>u.email!==me.email&&(u.name?.toLowerCase().includes(q)||u.email?.toLowerCase().includes(q)))
            .slice(0,8);
          if (!hits.length) {
            resultsEl.innerHTML='<p class="search-no-results">No users found.</p>';
          } else {
            resultsEl.innerHTML = hits.map(u=>`
              <div class="search-result-item msng-search-hit" data-email="${escHtml(u.email)}" data-name="${escHtml(u.name)}" data-photo="${escHtml(u.profilePhoto||"")}">
                <img class="search-result-avatar" src="${safeImg(u.profilePhoto,u.name)}" alt="${escHtml(u.name)}">
                <div>
                  <p class="search-result-name">${escHtml(u.name)}</p>
                  <p class="search-result-email">${escHtml(u.email)}</p>
                </div>
              </div>`).join("");
            resultsEl.querySelectorAll(".msng-search-hit").forEach(el=>{
              el.addEventListener("click",()=>{
                inputEl.value=""; resultsEl.classList.add("hidden"); resultsEl.innerHTML="";
                openChat({ email:el.dataset.email, name:el.dataset.name, photo:el.dataset.photo });
              });
            });
          }
          resultsEl.classList.remove("hidden");
        } catch(e) { console.error("Search:",e); }
      }, 300);
    });
    document.addEventListener("click",(e)=>{
      if (!inputEl.contains(e.target)&&!resultsEl.contains(e.target)) resultsEl.classList.add("hidden");
    });
  }

  setupSearch(searchInput, searchResults);
  newBtn?.addEventListener("click",()=>searchInput.focus());
  emptyNewBtn?.addEventListener("click",()=>searchInput.focus());

  // ── Conversations list ─────────────────────────────────────────────────
  function startConvsListener() {
    unsubConvs = db.collection("conversations")
      .where("participants","array-contains",me.email)
      .orderBy("lastAt","desc")
      .onSnapshot(async snap => {
        if (snap.empty) { convsList.innerHTML='<p class="msng-hint">No chats yet. Search for someone above.</p>'; return; }
        const items = await Promise.all(snap.docs.map(async doc => {
          const data = doc.data();
          const peerEmail = data.participants.find(p=>p!==me.email);
          if (!peerEmail) return null;
          const peer = await getPeer(peerEmail);
          const meKey = emailKey(me.email);
          const unread = data[`unread_${meKey}`]||0;
          return { id:doc.id, ...data, peer, unread };
        }));

        convsList.innerHTML = "";
        items.filter(Boolean).forEach(conv => {
          const isActive = activeCid===conv.id;
          const div = document.createElement("div");
          div.className = `msng-conv-item${isActive?" active":""}${conv.unread>0?" has-unread":""}`;
          div.dataset.cid = conv.id;
          div.innerHTML = `
            <div class="msng-conv-avatar-wrap">
              <img class="msng-conv-avatar" src="${safeImg(conv.peer.photo,conv.peer.name)}" alt="${escHtml(conv.peer.name)}">
            </div>
            <div class="msng-conv-info">
              <p class="msng-conv-name">${escHtml(conv.peer.name)}</p>
              <p class="msng-conv-last">${escHtml(conv.lastMessage||"")}</p>
            </div>
            <div class="msng-conv-meta">
              <p class="msng-conv-time">${timeAgo(conv.lastAt)}</p>
              ${conv.unread>0?`<span class="msng-unread-dot">${conv.unread}</span>`:""}
            </div>`;
          div.addEventListener("click",()=>openChat(conv.peer));
          convsList.appendChild(div);
        });
      }, err=>console.error("Convs listener:",err));
  }

  // ── Open a chat ────────────────────────────────────────────────────────
  async function openChat(peer) {
    activePeer = peer;
    activeCid = convId(me.email, peer.email);

    // Mobile: show right panel
    msngLeft.classList.add("msng-left-hidden");
    msngRight.classList.remove("msng-right-hidden");

    emptyState.classList.add("hidden");
    chatHead.classList.remove("hidden");
    msgsEl.classList.remove("hidden");
    composeForm.classList.remove("hidden");

    peerAvatar.src = safeImg(peer.photo||"", peer.name);
    peerName.textContent = peer.name;
    peerSub.textContent = "Active recently";
    const profileUrl = `profile.html?user=${encodeURIComponent(peer.email)}`;
    peerLink.href = profileUrl;
    if (headProfile) headProfile.href = profileUrl;

    // Highlight conv in list
    document.querySelectorAll(".msng-conv-item").forEach(el=>{
      el.classList.toggle("active", el.dataset.cid===activeCid);
    });

    // Unsub previous
    if (unsubMsgs) { unsubMsgs(); unsubMsgs=null; }
    msgsEl.innerHTML='<p class="msng-loading">Loading…</p>';

    await markRead();

    unsubMsgs = db.collection("conversations").doc(activeCid)
      .collection("messages")
      .orderBy("createdAt","asc")
      .onSnapshot(snap=>{
        renderMsgs(snap.docs.map(d=>({id:d.id,...d.data()})));
        markRead();
      }, err=>console.error("Msgs listener:",err));

    textInput.focus();
  }

  // ── Mark as read ───────────────────────────────────────────────────────
  async function markRead() {
    if (!activeCid) return;
    const meKey = emailKey(me.email);
    try {
      await db.collection("conversations").doc(activeCid).set({ [`unread_${meKey}`]:0 },{ merge:true });
      const snap = await db.collection("conversations").doc(activeCid).collection("messages")
        .where("sender","!=",me.email).get();
      const batch = db.batch();
      snap.docs.forEach(d=>{
        const rb = d.data().readBy||[];
        if (!rb.includes(me.email)) batch.update(d.ref,{ readBy:[...rb,me.email] });
      });
      await batch.commit();
    } catch {}
  }

  // ── Render messages ────────────────────────────────────────────────────
  function renderMsgs(msgs) {
    if (!msgs.length) { msgsEl.innerHTML='<div class="msng-msgs-empty"><p>No messages yet. Say hello! 👋</p></div>'; return; }
    const atBottom = msgsEl.scrollHeight-msgsEl.scrollTop-msgsEl.clientHeight < 100;

    msgsEl.innerHTML = "";
    let prevDate = null;
    msgs.forEach((msg, idx) => {
      const isMine = msg.sender===me.email;
      const isLast = idx===msgs.length-1;
      const ts = msg.createdAt;
      const d = ts ? (typeof ts.toDate==="function"?ts.toDate():new Date(ts)) : null;
      const dateStr = d ? d.toDateString() : null;

      // Date separator
      if (dateStr && dateStr!==prevDate) {
        prevDate = dateStr;
        const sep = document.createElement("div");
        sep.className = "msng-date-sep";
        sep.textContent = d.toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"});
        msgsEl.appendChild(sep);
      }

      const row = document.createElement("div");
      row.className = `msng-msg-row${isMine?" mine":" theirs"}`;

      const readBy = msg.readBy||[];
      const seenByPeer = activePeer && readBy.includes(activePeer.email);
      const seenHtml = isMine && isLast
        ? seenByPeer
          ? `<div class="msng-seen"><img src="${safeImg(activePeer?.photo||"",activePeer?.name)}" class="msng-seen-avatar" alt="">${escHtml(activePeer?.name||"")} saw this</div>`
          : `<div class="msng-seen sent">Sent ✓</div>`
        : "";

      row.innerHTML = `
        ${!isMine ? `<img class="msng-msg-avatar" src="${safeImg(activePeer?.photo||"",activePeer?.name)}" alt="">` : ""}
        <div class="msng-bubble-col${isMine?" mine":""}">
          <div class="msng-bubble${isMine?" mine":" theirs"}">
            ${msg.text ? `<p class="msng-bubble-text">${escHtml(msg.text)}</p>` : ""}
            ${msg.imageUrl && safeImg(msg.imageUrl,"") ? `<img class="msng-bubble-img" src="${safeImg(msg.imageUrl,"")}" alt="Image">` : ""}
          </div>
          <p class="msng-msg-time">${formatTime(msg.createdAt)}</p>
          ${seenHtml}
        </div>
        ${isMine ? `<img class="msng-msg-avatar mine" src="${safeImg(me.profilePhoto,me.name)}" alt="">` : ""}
      `;
      msgsEl.appendChild(row);
    });

    if (atBottom || msgs[msgs.length-1]?.sender===me.email) {
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }
  }

  // ── Send message ───────────────────────────────────────────────────────
  composeForm?.addEventListener("submit", async e => {
    e.preventDefault();
    const text = textInput.value.trim();
    if (!text && !pendingImg) return;
    if (!activePeer) return;

    const imageUrl = pendingImg||"";
    textInput.value = "";
    pendingImg = null;
    imgPreviewWrap.classList.add("hidden");
    imgPreview.src = "";

    const meKey = emailKey(me.email);
    const peerKey = emailKey(activePeer.email);
    const cid = activeCid;

    try {
      await db.collection("conversations").doc(cid).set({
        participants: [me.email, activePeer.email],
        lastMessage: imageUrl&&!text ? "📷 Photo" : text,
        lastAt: firebase.firestore.FieldValue.serverTimestamp(),
        [`unread_${peerKey}`]: firebase.firestore.FieldValue.increment(1),
        [`unread_${meKey}`]: 0,
      },{ merge:true });
      await db.collection("conversations").doc(cid).collection("messages").add({
        sender: me.email,
        text: text||"",
        imageUrl,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        readBy: [me.email],
      });

      // Notification
      await db.collection("notifications").add({
        to: activePeer.email,
        from: me.email,
        type: "message",
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch(err) { console.error("Send failed:",err); }
    textInput.focus();
  });

  // ── Image attach ───────────────────────────────────────────────────────
  imgInput?.addEventListener("change", async () => {
    const file = imgInput.files[0];
    if (!file) return;
    if (file.size>700000) { alert("Image must be under ~500 KB."); imgInput.value=""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      pendingImg = String(reader.result||"");
      imgPreview.src = pendingImg;
      imgPreviewWrap.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
    imgInput.value = "";
  });
  imgClearBtn?.addEventListener("click",()=>{
    pendingImg=null; imgPreview.src=""; imgPreviewWrap.classList.add("hidden");
  });

  // ── Back button (mobile) ───────────────────────────────────────────────
  backBtn?.addEventListener("click",()=>{
    msngLeft.classList.remove("msng-left-hidden");
    msngRight.classList.add("msng-right-hidden");
    emptyState.classList.remove("hidden");
    chatHead.classList.add("hidden");
    msgsEl.classList.add("hidden");
    composeForm.classList.add("hidden");
    if (unsubMsgs) { unsubMsgs(); unsubMsgs=null; }
    activeCid=null; activePeer=null;
  });

  // ── Check for pending chat from profile page ───────────────────────────
  try {
    const pending = sessionStorage.getItem("pendingMessageUser");
    if (pending) {
      sessionStorage.removeItem("pendingMessageUser");
      const peer = JSON.parse(pending);
      if (peer?.email) setTimeout(()=>openChat({ email:peer.email, name:peer.name||peer.email, photo:peer.profilePhoto||"" }),500);
    }
  } catch {}

  startConvsListener();
}

if (document.readyState==="loading") {
  document.addEventListener("DOMContentLoaded", runMessagesPage);
} else {
  runMessagesPage();
}
