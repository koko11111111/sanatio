/**
 * SANATIO navbar.js
 * Injects a Facebook-style top navigation bar into every page.
 * Include this script on every page that needs the nav.
 *
 * Requires: config.js, auth.js, friends.js loaded before this.
 */

(function () {
  function safeImg(url, name) {
    const v = String(url || "").trim();
    if (v.startsWith("data:image/") || v.startsWith("http://") || v.startsWith("https://")) return v;
    const init = (name || "U").trim().charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="54%" text-anchor="middle" fill="#e5e7eb" font-size="32" font-family="Arial,sans-serif">${init}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function escHtml(t) {
    return String(t || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  function buildNav() {
    const me = getCurrentUser ? getCurrentUser() : null;
    if (!me) return;

    // Remove old nav if any
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
          <a class="snav-tab" href="community.html" title="Community">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </a>
          <a class="snav-tab" href="messages.html" title="Messages">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span class="snav-badge hidden" id="snav-msg-badge"></span>
          </a>
        </div>

        <div class="snav-right">
          <a class="snav-icon-btn" href="notifications.html" title="Notifications" id="snav-notif-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span class="snav-badge hidden" id="snav-notif-badge"></span>
          </a>
          <div class="snav-avatar-wrap" id="snav-avatar-wrap">
            <img class="snav-avatar" id="snav-avatar" src="${safeImg(me.profilePhoto, me.name)}" alt="${escHtml(me.name)}">
            <div class="snav-dropdown hidden" id="snav-dropdown">
              <a class="snav-drop-item" href="profile.html?user=${encodeURIComponent(me.email)}">
                <img class="snav-drop-avatar" src="${safeImg(me.profilePhoto, me.name)}" alt="">
                <div>
                  <p class="snav-drop-name">${escHtml(me.name)}</p>
                  <p class="snav-drop-sub">See your profile</p>
                </div>
              </a>
              <div class="snav-drop-divider"></div>
              <a class="snav-drop-item" href="settings.html">⚙ Settings</a>
              <button class="snav-drop-item snav-drop-btn" id="snav-logout">🚪 Log Out</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.prepend(nav);

    // Highlight active tab
    const path = window.location.pathname.toLowerCase();
    nav.querySelectorAll(".snav-tab").forEach(a => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      if (path.endsWith(href) || (href === "aipage.html" && path.endsWith("aipage.html"))) {
        a.classList.add("active");
      }
    });

    // Avatar dropdown
    const avatarWrap = document.getElementById("snav-avatar-wrap");
    const dropdown = document.getElementById("snav-dropdown");
    avatarWrap?.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("hidden");
    });
    document.addEventListener("click", () => dropdown?.classList.add("hidden"));

    // Logout
    document.getElementById("snav-logout")?.addEventListener("click", () => {
      if (typeof logoutCurrentUser === "function") logoutCurrentUser();
      window.location.href = "index.html";
    });

    // Load badges
    loadBadges(me);
  }

  async function loadBadges(me) {
    try {
      // Notification badge
      const unread = await FriendSystem.getUnreadCount(me.email);
      const notifBadge = document.getElementById("snav-notif-badge");
      if (notifBadge && unread > 0) {
        notifBadge.textContent = unread > 9 ? "9+" : String(unread);
        notifBadge.classList.remove("hidden");
      }

      // Message badge — count convos with unread_myKey > 0
      if (typeof firebase !== "undefined" && firebase.apps?.length) {
        const db = firebase.firestore();
        const meKey = me.email.replace(/[.#$[\]]/g, "_");
        const snap = await db.collection("conversations")
          .where("participants", "array-contains", me.email)
          .get();
        let msgUnread = 0;
        snap.docs.forEach(d => {
          const val = d.data()[`unread_${meKey}`] || 0;
          if (val > 0) msgUnread++;
        });
        const msgBadge = document.getElementById("snav-msg-badge");
        if (msgBadge && msgUnread > 0) {
          msgBadge.textContent = msgUnread > 9 ? "9+" : String(msgUnread);
          msgBadge.classList.remove("hidden");
        }
      }
    } catch (e) {
      // Silently ignore badge errors
    }
  }

  function init() {
    if (typeof getCurrentUser !== "function") return;
    const me = getCurrentUser();
    if (!me) return;
    buildNav();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
