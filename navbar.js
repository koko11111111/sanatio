/**
 * SANATIO navbar.js
 * Fixed: Firebase already initialized before this runs on pages that pre-init it.
 * On pages that don't pre-init, it will try to init here.
 */

(function () {
  function safeImg(url, name) {
    const v = String(url||"").trim();
    if (v.startsWith("data:image/")||v.startsWith("http://")||v.startsWith("https://")) return v;
    const i = (name||"U").trim().charAt(0).toUpperCase();
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="54%" text-anchor="middle" fill="#e5e7eb" font-size="32" font-family="Arial,sans-serif">${i}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;
  }
  function escHtml(t) {
    return String(t||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  }

  function ensureFirebase() {
    try {
      if (typeof firebase==="undefined") return;
      if (firebase.apps && firebase.apps.length) return; // already init
      if (typeof FIREBASE_CONFIG==="object" && FIREBASE_CONFIG?.apiKey) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
    } catch {}
  }

  function buildNav() {
    const me = typeof getCurrentUser==="function" ? getCurrentUser() : null;
    if (!me) return;

    document.getElementById("sanatio-navbar")?.remove();

    const nav = document.createElement("nav");
    nav.id = "sanatio-navbar";
    nav.className = "snav";
    nav.innerHTML = `
      <div class="snav-inner">
        <a class="snav-brand" href="aipage.html">SANATIO</a>

        <div class="snav-center">
          <a class="snav-tab" href="aipage.html" title="Dashboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </a>
          <a class="snav-tab" href="friends.html" title="Find Friends">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </a>
          <a class="snav-tab" href="community.html" title="Community">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </a>
          <a class="snav-tab" href="messages.html" title="Messages">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
            <span class="snav-badge hidden" id="snav-msg-badge"></span>
          </a>
        </div>

        <div class="snav-right">
          <a class="snav-icon-btn" href="notifications.html" title="Notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span class="snav-badge hidden" id="snav-notif-badge"></span>
          </a>
          <div class="snav-avatar-wrap" id="snav-avatar-wrap">
            <img class="snav-avatar" id="snav-avatar" src="${safeImg(me.profilePhoto,me.name)}" alt="${escHtml(me.name)}">
            <div class="snav-dropdown hidden" id="snav-dropdown">
              <a class="snav-drop-item" href="profile.html?user=${encodeURIComponent(me.email)}">
                <img class="snav-drop-avatar" src="${safeImg(me.profilePhoto,me.name)}" alt="">
                <div>
                  <p class="snav-drop-name">${escHtml(me.name)}</p>
                  <p class="snav-drop-sub">See your profile</p>
                </div>
              </a>
              <div class="snav-drop-divider"></div>
              <a class="snav-drop-item" href="friends.html">👥 Find Friends</a>
              <a class="snav-drop-item" href="settings.html">⚙ Settings</a>
              <button class="snav-drop-item snav-drop-btn" id="snav-logout">🚪 Log Out</button>
            </div>
          </div>
        </div>
      </div>`;

    document.body.prepend(nav);

    // Highlight active tab
    const path = window.location.pathname.toLowerCase();
    nav.querySelectorAll(".snav-tab").forEach(a => {
      const href = (a.getAttribute("href")||"").toLowerCase();
      if (path.endsWith(href)) a.classList.add("active");
    });

    // Avatar dropdown toggle
    const avatarWrap = document.getElementById("snav-avatar-wrap");
    const dropdown   = document.getElementById("snav-dropdown");
    avatarWrap?.addEventListener("click", e => { e.stopPropagation(); dropdown.classList.toggle("hidden"); });
    document.addEventListener("click", () => dropdown?.classList.add("hidden"));

    // Logout
    document.getElementById("snav-logout")?.addEventListener("click", () => {
      if (typeof logoutCurrentUser==="function") logoutCurrentUser();
      window.location.href = "index.html";
    });

    // Badges
    loadBadges(me);
  }

  async function loadBadges(me) {
    try {
      ensureFirebase();
      if (typeof FriendSystem!=="undefined") {
        const unread = await FriendSystem.getUnreadCount(me.email);
        const nb = document.getElementById("snav-notif-badge");
        if (nb && unread>0) { nb.textContent=unread>9?"9+":String(unread); nb.classList.remove("hidden"); }
      }
      if (typeof firebase!=="undefined" && firebase.apps?.length) {
        const db = firebase.firestore();
        const meKey = me.email.replace(/[.#$[\]]/g,"_");
        const snap = await db.collection("conversations").where("participants","array-contains",me.email).get();
        let msgUnread = 0;
        snap.docs.forEach(d => { if ((d.data()[`unread_${meKey}`]||0)>0) msgUnread++; });
        const mb = document.getElementById("snav-msg-badge");
        if (mb && msgUnread>0) { mb.textContent=msgUnread>9?"9+":String(msgUnread); mb.classList.remove("hidden"); }
      }
    } catch {}
  }

  function init() {
    ensureFirebase();
    if (typeof getCurrentUser!=="function") return;
    if (!getCurrentUser()) return;
    buildNav();
  }

  if (document.readyState==="loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
