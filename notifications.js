/**
 * SANATIO notifications.js
 * Fixed: don't mark as read immediately on load, show all notifications properly
 */

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

async function runNotificationsPage() {
  const me = getCurrentUser();
  if (!me) { window.location.href = "login.html"; return; }

  // Init Firebase
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

  feed.innerHTML = '<p class="fb-empty">Loading notificationsΓÇª</p>';

  // Load notifications first ΓÇö DON'T mark as read yet
  let notifs = [];
  try {
    notifs = await FriendSystem.getNotifications(me.email);
  } catch(e) {
    console.error("getNotifications error:", e);
    feed.innerHTML = '<p class="fb-empty">Could not load notifications. Please try again.</p>';
    return;
  }

  if (!notifs.length) {
    feed.innerHTML = '<p class="fb-empty">No notifications yet.</p>';
    return;
  }

  // Load sender profiles
  const senderCache = {};
  if (db) {
    for (const n of notifs) {
      if (n.from && !senderCache[n.from]) {
        senderCache[n.from] = { name: n.from, photo: "" };
        try {
          const doc = await db.collection("users").doc(n.from.replace(/[.#$[\]]/g,"_")).get();
          if (doc.exists) {
            senderCache[n.from] = { name: doc.data().name||n.from, photo: doc.data().profilePhoto||"" };
          }
        } catch {}
      }
    }
  }

  // Render
  feed.innerHTML = notifs.map(n => {
    const sender = senderCache[n.from] || { name: n.from||"Someone", photo: "" };
    let icon = "≡ƒöö", text = "";

    if (n.type === "friend_request") {
      icon = "≡ƒæñ";
      text = `<strong>${escHtml(sender.name)}</strong> sent you a friend request.`;
    } else if (n.type === "friend_accepted") {
      icon = "Γ£à";
      text = `<strong>${escHtml(sender.name)}</strong> accepted your friend request. You are now friends!`;
    } else if (n.type === "message") {
      icon = "≡ƒÆ¼";
      text = `<strong>${escHtml(sender.name)}</strong> sent you a message.`;
    } else {
      text = `<strong>${escHtml(sender.name)}</strong> interacted with you.`;
    }

    const actionHtml = n.type === "friend_request" ? `
      <div class="notif-actions" id="notif-actions-${escHtml(n.id)}">
        <button class="btn btn-primary btn-small notif-accept" data-from="${escHtml(n.from)}" data-notif="${escHtml(n.id)}">Γ£ô Accept</button>
        <button class="btn btn-secondary btn-small notif-decline" data-from="${escHtml(n.from)}" data-notif="${escHtml(n.id)}">Γ£ò Decline</button>
      </div>` : "";

    const linkHref = n.type === "message"
      ? "messages.html"
      : `profile.html?user=${encodeURIComponent(n.from||"")}`;

    return `
      <div class="notif-item${n.read ? "" : " unread"}" id="notif-${escHtml(n.id)}">
        <a href="${linkHref}" class="notif-avatar-link">
          <img class="notif-avatar" src="${safeImg(sender.photo, sender.name)}" alt="${escHtml(sender.name)}">
          <span class="notif-icon">${icon}</span>
        </a>
        <div class="notif-body">
          <p class="notif-text">${text}</p>
          <p class="notif-time">${timeAgo(n.createdAt)}</p>
          ${actionHtml}
        </div>
      </div>`;
  }).join("");

  // NOW mark as read after showing them
  try { await FriendSystem.markNotificationsRead(me.email); } catch {}
  // Update visual state
  feed.querySelectorAll(".notif-item.unread").forEach(el => {
    setTimeout(() => el.classList.remove("unread"), 1000);
  });

  // Mark all button
  markAllBtn?.addEventListener("click", async () => {
    try { await FriendSystem.markNotificationsRead(me.email); } catch {}
    feed.querySelectorAll(".notif-item.unread").forEach(el => el.classList.remove("unread"));
  });

  // Accept friend request
  feed.querySelectorAll(".notif-accept").forEach(btn => {
    btn.addEventListener("click", async () => {
      const from = btn.dataset.from;
      const notifId = btn.dataset.notif;
      btn.disabled = true;
      btn.textContent = "AcceptingΓÇª";
      try {
        await FriendSystem.acceptRequest(from, me.email);
        const actionsEl = document.getElementById(`notif-actions-${notifId}`);
        if (actionsEl) actionsEl.innerHTML = '<span class="notif-done">Γ£à You are now friends!</span>';
      } catch(e) {
        btn.disabled = false;
        btn.textContent = "Γ£ô Accept";
        alert("Could not accept: " + e.message);
      }
    });
  });

  // Decline friend request
  feed.querySelectorAll(".notif-decline").forEach(btn => {
    btn.addEventListener("click", async () => {
      const from = btn.dataset.from;
      const notifId = btn.dataset.notif;
      btn.disabled = true;
      try {
        await FriendSystem.declineRequest(from, me.email);
        const actionsEl = document.getElementById(`notif-actions-${notifId}`);
        if (actionsEl) actionsEl.innerHTML = '<span class="notif-done">Declined.</span>';
      } catch(e) {
        btn.disabled = false;
        alert("Could not decline: " + e.message);
      }
    });
  });
}

if (document.readyState==="loading") {
  document.addEventListener("DOMContentLoaded", runNotificationsPage);
} else {
  runNotificationsPage();
}
