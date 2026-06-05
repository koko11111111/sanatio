/**
 * navbar.js — Injects the shared top navigation bar on every authenticated page.
 * Requires auth.js to be loaded first (uses getCurrentUser, logoutCurrentUser,
 * saveProfilePhotoForCurrentUser).
 */
(function () {
  const NAV_ID = "sanatio-navbar";

  function escHtml(t) {
    return String(t || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function safeImgSrc(url) {
    const v = String(url || "").trim();
    if (v.startsWith("data:image/") || v.startsWith("http://") || v.startsWith("https://")) return v;
    return "";
  }

  function fallbackAvatar(name) {
    const initial = (name || "U").trim().charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="54%" text-anchor="middle" fill="#e5e7eb" font-size="16" font-family="Arial,sans-serif">${initial}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function currentPage() {
    const p = window.location.pathname.toLowerCase();
    const parts = p.split("/");
    return parts[parts.length - 1] || "index.html";
  }

  function navLink(href, label, page) {
    const active = currentPage() === href ? ' class="nav-link active" aria-current="page"' : ' class="nav-link"';
    return `<a href="${href}"${active}>${escHtml(label)}</a>`;
  }

  function buildNav(user) {
    const photoSrc = safeImgSrc(user.profilePhoto) || fallbackAvatar(user.name);

    return `
      <nav id="${NAV_ID}" class="sanatio-navbar" role="navigation" aria-label="Main navigation">
        <div class="navbar-inner">
          <a class="navbar-brand" href="aipage.html" aria-label="SANATIO home">
            <img src="assets/snake-logo.png" alt="" width="28" height="28"
              onerror="this.onerror=null;this.src='assets/snake-logo.svg'">
            <span>SANATIO</span>
          </a>

          <div class="navbar-links">
            ${navLink("aipage.html", "Dashboard", "aipage.html")}
            ${navLink("community.html", "Community", "community.html")}
            ${navLink("friends.html", "Friends", "friends.html")}
            ${navLink("messages.html", "Messages", "messages.html")}
          </div>

          <div class="navbar-profile">
            <button type="button" class="navbar-profile-btn" id="navbar-profile-btn"
              aria-haspopup="true" aria-expanded="false" aria-controls="navbar-profile-menu">
              <img id="navbar-avatar" src="${escHtml(photoSrc)}" alt="${escHtml(user.name)} avatar"
                class="navbar-avatar">
              <span class="navbar-username">${escHtml(user.name || user.email)}</span>
              <span aria-hidden="true">▾</span>
            </button>

            <div id="navbar-profile-menu" class="navbar-profile-menu hidden" role="menu">
              <div class="navbar-profile-info">
                <p class="navbar-profile-name">${escHtml(user.name || "")}</p>
                <p class="navbar-profile-email">${escHtml(user.email || "")}</p>
                <p class="navbar-profile-joined">${user.createdAt ? "Joined " + new Date(user.createdAt).toLocaleDateString() : ""}</p>
              </div>
              <label class="navbar-menu-item" for="navbar-photo-input" role="menuitem" tabindex="0">
                📷 Change Photo
                <input id="navbar-photo-input" type="file" accept="image/*" hidden>
              </label>
              <button type="button" class="navbar-menu-item" id="navbar-logout-btn" role="menuitem">
                🚪 Log Out
              </button>
            </div>
          </div>

          <button type="button" id="theme-toggle" class="theme-toggle navbar-theme-btn" aria-label="Toggle theme">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          </button>
        </div>
      </nav>`;
  }

  function wireNav(user) {
    const btn = document.getElementById("navbar-profile-btn");
    const menu = document.getElementById("navbar-profile-menu");
    const logoutBtn = document.getElementById("navbar-logout-btn");
    const photoInput = document.getElementById("navbar-photo-input");
    const avatarImg = document.getElementById("navbar-avatar");

    if (!btn || !menu) return;

    btn.addEventListener("click", () => {
      const isOpen = !menu.classList.contains("hidden");
      menu.classList.toggle("hidden", isOpen);
      btn.setAttribute("aria-expanded", String(!isOpen));
    });

    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && !btn.contains(e.target)) {
        menu.classList.add("hidden");
        btn.setAttribute("aria-expanded", "false");
      }
    });

    logoutBtn?.addEventListener("click", () => {
      if (typeof logoutCurrentUser === "function") logoutCurrentUser();
      window.location.href = "index.html";
    });

    photoInput?.addEventListener("change", () => {
      const file = photoInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (avatarImg) avatarImg.src = dataUrl;
        if (typeof saveProfilePhotoForCurrentUser === "function") {
          saveProfilePhotoForCurrentUser(dataUrl);
        }
      };
      reader.readAsDataURL(file);
    });

    // Re-wire theme toggle (theme.js may have run before navbar was injected)
    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
      const STORAGE_KEY = "sanatioTheme";
      themeBtn.addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      });
    }
  }

  function init() {
    if (document.getElementById(NAV_ID)) return; // already injected

    const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    if (!user) return; // not logged in — no navbar needed

    const navHtml = buildNav(user);
    const placeholder = document.createElement("div");
    placeholder.innerHTML = navHtml;
    const navEl = placeholder.firstElementChild;
    document.body.insertBefore(navEl, document.body.firstChild);

    wireNav(user);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
