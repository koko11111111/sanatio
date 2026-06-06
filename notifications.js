function escHtml(t) {
  return String(t||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
function safeImg(url, name) {
  const v = String(url||"").trim();
  if (v.startsWith("data:image/")||v.startsWith("http://")||v.startsWith("https://")) return v;
  const i = (name||"U").trim().charAt(0).toUpperCase();
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="54%" text-anchor="middle" fill="#e5e7eb" font-size="28" font-family="Arial,sans-serif">${i}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;
}
function timeAgo(ts) {
  if (!ts) return "";
  const d = typeof ts.toDate==="function" ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return Math.floor(diff/60000)+"m ago";
  if (diff < 86400000) return Math.floor(diff/3600000)+"h ago";
  return Math.floor(diff/86400000)+"d ago";
}

const PAGE_SIZE = 10;

async function runNotificationsPage() {
  const me = getCurrentUser();
  if (!me) { window.location.href = "login.html"; return; }

  let db = null;
  try {
    if (typeof FIREBASE_CONFIG==="object" && FIREBASE_CONFIG?.apiKey) {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      else firebase.app();
      db = firebase.firestore();
    }
  } catch(e) { console.warn("Firebase:", e); }

  const feed       = document.getElementById("notif-feed");
  const markAllBtn = document.getElementById("notif-mark-all");

  feed.innerHTML = '<p class="fb-empty">Loading notifications…</p>';

  let allNotifs = [];
  try {
    allNotifs = await FriendSystem.getNotifications(me.email);
  } catch(e) {
    feed.innerHTML = '<p class="fb-empty">Could not load notifications. Please try again.</p>';
    return;
  }

  if (!allNotifs.length) {
    feed.innerHTML = '<p class="fb-empty">No notifications yet.</p>';
    return;
  }

  // Load sender profiles for first page only
  const senderCache = {};

  async function loadSender(email) {
    if (!email || senderCache[email]) return;
    senderCache[email] = { name: email, photo: "" };
    if (!db) return;
    try {
      const doc = await db.collection("users").doc(email.replace(/[.#$[\]]/g,"_")).get();
      if (doc.exists) {
        senderCache[email] = { name: doc.data().name||email, photo: doc.data().profilePhoto||"" };
      }
    } catch {}
  }

  let currentPage = 0;
  feed.innerHTML = "";

  function renderNotif(n) {
    const sender = senderCache[n.from] || { name: n.from||"Someone", photo: "" };
    let icon = "🔔", text = "";

    if (n.type === "friend_request") {
      icon = "👤";
      text = `<strong>${escHtml(sender.name)}</strong> sent you a friend request.`;
    } else if (n.type === "friend_accepted") {
      icon = "✅";
      text = `<strong>${escHtml(sender.name)}</strong> accepted your friend request. You are now friends!`;
    } else if (n.type === "message") {
      icon = "💬";
      text = `<strong>${escHtml(sender.name)}</strong> sent you a message.`;
    } else {
      text = `<strong>${escHtml(sender.name)}</strong> interacted with you.`;
    }

    const linkHref = n.type === "message"
      ? "messages.html"
      : `profile.html?user=${encodeURIComponent(n.from||"")}`;

    const actionHtml = n.type === "friend_request" ? `
      <div class="notif-actions" id="notif-actions-${escHtml(n.id)}">
        <button class="btn btn-primary btn-small notif-accept" data-from="${escHtml(n.from)}" data-notif="${escHtml(n.id)}">✓ Accept</button>
        <button class="btn btn-secondary btn-small notif-decline" data-from="${escHtml(n.from)}" data-notif="${escHtml(n.id)}">✕ Decline</button>
      </div>` : "";

    const div = document.createElement("div");
    div.className = `notif-item${n.read ? "" : " unread"}`;
    div.id = `notif-${n.id}`;
    div.style.cursor = "pointer";
    div.dataset.href = linkHref;
    div.innerHTML = `
      <div class="notif-avatar-link">
        <img class="notif-avatar" src="${safeImg(sender.photo, sender.name)}" alt="${escHtml(sender.name)}">
        <span class="notif-icon">${icon}</span>
      </div>
      <div class="notif-body">
        <p class="notif-text">${text}</p>
        <p class="notif-time">${timeAgo(n.createdAt)}</p>
        ${actionHtml}
      </div>`;

    // Whole row clickable
    div.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      window.location.href = linkHref;
    });

    // Accept
    div.querySelector(".notif-accept")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      const from = btn.dataset.from;
      const notifId = btn.dataset.notif;
      btn.disabled = true; btn.textContent = "Accepting…";
      try {
        await FriendSystem.acceptRequest(from, me.email);
        document.getElementById(`notif-actions-${notifId}`).innerHTML =
          '<span class="notif-done">✅ You are now friends!</span>';
      } catch(err) {
        btn.disabled = false; btn.textContent = "✓ Accept";
        alert("Could not accept: " + err.message);
      }
    });

    // Decline
    div.querySelector(".notif-decline")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      const from = btn.dataset.from;
      const notifId = btn.dataset.notif;
      btn.disabled = true;
      try {
        await FriendSystem.declineRequest(from, me.email);
        document.getElementById(`notif-actions-${notifId}`).innerHTML =
          '<span class="notif-done">Declined.</span>';
      } catch(err) {
        btn.disabled = false;
        alert("Could not decline: " + err.message);
      }
    });

    return div;
  }

  async function loadPage() {
    const start = currentPage * PAGE_SIZE;
    const end   = start + PAGE_SIZE;
    const page  = allNotifs.slice(start, end);

    // Remove old load more button
    document.getElementById("load-more-btn")?.remove();

    // Load senders for this page
    for (const n of page) await loadSender(n.from);

    // Render
    for (const n of page) {
      feed.appendChild(renderNotif(n));
    }

    currentPage++;

    // Add load more button if there are more
    if (currentPage * PAGE_SIZE < allNotifs.length) {
      const btn = document.createElement("button");
      btn.id = "load-more-btn";
      btn.textContent = `Load more (${allNotifs.length - currentPage * PAGE_SIZE} remaining)`;
      btn.style.cssText = "display:block;margin:1.25rem auto;padding:.6rem 1.5rem;background:var(--secondary);border:1px solid var(--border);border-radius:8px;color:var(--gold);font-size:.88rem;font-weight:600;cursor:pointer;font-family:inherit;";
      btn.addEventListener("click", loadPage);
      feed.appendChild(btn);
    }

    // Mark as read after first page
    if (currentPage === 1) {
      try { await FriendSystem.markNotificationsRead(me.email); } catch {}
      feed.querySelectorAll(".notif-item.unread").forEach(el => {
        setTimeout(() => el.classList.remove("unread"), 1500);
      });
    }
  }

  // Mark all button
  markAllBtn?.addEventListener("click", async () => {
    try { await FriendSystem.markNotificationsRead(me.email); } catch {}
    feed.querySelectorAll(".notif-item.unread").forEach(el => el.classList.remove("unread"));
  });

  // Load first page
  await loadPage();
}

if (document.readyState==="loading") {
  document.addEventListener("DOMContentLoaded", runNotificationsPage);
} else {
  runNotificationsPage();
}
