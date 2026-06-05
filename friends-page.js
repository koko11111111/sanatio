/**
 * SANATIO friends-page.js
 * People discovery, friend requests, search.
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

async function runFriendsPage() {
  const me = getCurrentUser();
  if (!me) { window.location.href="login.html"; return; }

  let db = null;
  try { if (firebase.apps.length) db=firebase.firestore(); } catch {}

  if (!db) {
    document.getElementById("suggestions-grid").innerHTML =
      '<p class="fb-empty" style="color:var(--gold)">⚠ Firebase required. Check config.js.</p>';
    return;
  }

  const requestsGrid    = document.getElementById("requests-grid");
  const requestsCount   = document.getElementById("requests-count");
  const requestsSection = document.getElementById("requests-section");
  const suggestionsGrid = document.getElementById("suggestions-grid");
  const searchSection   = document.getElementById("search-section");
  const searchGrid      = document.getElementById("search-grid");
  const searchInput     = document.getElementById("friends-search");

  // ── Render a person card ───────────────────────────────────────────────
  function makeCard(user, actionHtml) {
    return `
      <div class="friends-person-card" id="card-${escHtml(user.email.replace(/[^a-z0-9]/gi,'_'))}">
        <a href="profile.html?user=${encodeURIComponent(user.email)}" class="friends-card-avatar-link">
          <img class="friends-card-avatar" src="${safeImg(user.profilePhoto||'', user.name)}" alt="${escHtml(user.name)}">
        </a>
        <a href="profile.html?user=${encodeURIComponent(user.email)}" class="friends-card-name">${escHtml(user.name||user.email)}</a>
        <p class="friends-card-email">${escHtml(user.email)}</p>
        <div class="friends-card-actions">${actionHtml}</div>
      </div>`;
  }

  function addFriendBtn(email) {
    return `<button class="btn btn-primary btn-small friends-add-btn" data-email="${escHtml(email)}">＋ Add Friend</button>`;
  }
  function pendingBtn() {
    return `<button class="btn btn-secondary btn-small" disabled>⏳ Sent</button>`;
  }
  function acceptDeclineBtns(fromEmail) {
    return `
      <button class="btn btn-primary btn-small friends-accept-btn" data-from="${escHtml(fromEmail)}">✓ Accept</button>
      <button class="btn btn-secondary btn-small friends-decline-btn" data-from="${escHtml(fromEmail)}">✕ Decline</button>`;
  }

  // ── Wire up action buttons inside a container ──────────────────────────
  function wireButtons(container) {
    container.querySelectorAll(".friends-add-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const email = btn.dataset.email;
        btn.disabled = true; btn.textContent = "Sending…";
        try {
          await FriendSystem.sendRequest(me.email, email);
          btn.textContent = "⏳ Sent";
        } catch(e) {
          if (e.message==="already_sent") { btn.textContent="⏳ Sent"; }
          else if (e.message==="already_friends") { btn.textContent="✓ Friends"; }
          else { btn.disabled=false; btn.textContent="＋ Add Friend"; alert(e.message); }
        }
      });
    });
    container.querySelectorAll(".friends-accept-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const from = btn.dataset.from;
        btn.disabled = true; btn.textContent = "Accepting…";
        try {
          await FriendSystem.acceptRequest(from, me.email);
          const card = btn.closest(".friends-person-card");
          if (card) card.querySelector(".friends-card-actions").innerHTML =
            '<span class="friends-done">✓ Friends now!</span>';
          // Refresh requests count
          loadRequests();
        } catch(e) { btn.disabled=false; btn.textContent="✓ Accept"; alert(e.message); }
      });
    });
    container.querySelectorAll(".friends-decline-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const from = btn.dataset.from;
        try {
          await FriendSystem.declineRequest(from, me.email);
          btn.closest(".friends-person-card")?.remove();
          loadRequests();
        } catch(e) { alert(e.message); }
      });
    });
  }

  // ── Load pending friend requests ───────────────────────────────────────
  async function loadRequests() {
    try {
      const reqs = await FriendSystem.getPendingRequests(me.email);
      requestsCount.textContent = reqs.length ? `(${reqs.length})` : "";

      if (!reqs.length) {
        requestsGrid.innerHTML = '<p class="fb-empty">No pending requests.</p>';
        return;
      }

      // Fetch sender profiles
      let html = "";
      for (const req of reqs) {
        let sender = { email: req.from, name: req.from, profilePhoto: "" };
        try {
          const doc = await db.collection("users").doc(req.from.replace(/[.#$[\]]/g,"_")).get();
          if (doc.exists) sender = { email:req.from, ...doc.data() };
        } catch {}
        html += makeCard(sender, acceptDeclineBtns(req.from));
      }
      requestsGrid.innerHTML = html;
      wireButtons(requestsGrid);
    } catch(e) {
      console.error("loadRequests:", e);
      requestsGrid.innerHTML = '<p class="fb-empty">Could not load requests.</p>';
    }
  }

  // ── Load people suggestions ────────────────────────────────────────────
  async function loadSuggestions() {
    try {
      const myFriends = await FriendSystem.getFriends(me.email);
      const myFriendsSet = new Set([...myFriends, me.email]);

      const snap = await db.collection("users").limit(40).get();
      const people = snap.docs
        .map(d => d.data())
        .filter(u => u.email && !myFriendsSet.has(u.email));

      if (!people.length) {
        suggestionsGrid.innerHTML = '<p class="fb-empty">No suggestions yet. Invite people to join!</p>';
        return;
      }

      // Check pending status for each
      let html = "";
      for (const u of people.slice(0, 20)) {
        let status = "none";
        try { status = await FriendSystem.getStatus(me.email, u.email); } catch {}
        let actionHtml;
        if (status==="request_sent") actionHtml = pendingBtn();
        else if (status==="friends") actionHtml = '<span class="friends-done">✓ Friends</span>';
        else if (status==="request_received") actionHtml = acceptDeclineBtns(u.email);
        else actionHtml = addFriendBtn(u.email);
        html += makeCard(u, actionHtml);
      }
      suggestionsGrid.innerHTML = html;
      wireButtons(suggestionsGrid);
    } catch(e) {
      console.error("loadSuggestions:", e);
      suggestionsGrid.innerHTML = `<p class="fb-empty">Could not load suggestions: ${e.message}</p>`;
    }
  }

  // ── Search ─────────────────────────────────────────────────────────────
  // NOTE: This fetches the entire users collection client-side because
  // Firestore doesn't support full-text search natively. For production with
  // a large user base, replace this with Algolia, Typesense, or a Firebase
  // Extension for full-text search, or use Firestore range queries on a
  // normalized field (e.g. nameLower >= q && nameLower < q + '\uf8ff').
  let searchDebounce = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      searchSection.classList.add("hidden");
      suggestionsGrid.closest(".friends-section")?.classList.remove("hidden");
      return;
    }
    searchDebounce = setTimeout(async () => {
      searchSection.classList.remove("hidden");
      suggestionsGrid.closest(".friends-section")?.classList.add("hidden");
      searchGrid.innerHTML = '<p class="fb-empty">Searching…</p>';
      try {
        const snap = await db.collection("users").get();
        const hits = snap.docs.map(d=>d.data())
          .filter(u => u.email && u.email!==me.email &&
            (u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)));

        if (!hits.length) { searchGrid.innerHTML='<p class="fb-empty">No users found.</p>'; return; }

        let html = "";
        for (const u of hits.slice(0,20)) {
          let status="none";
          try { status=await FriendSystem.getStatus(me.email, u.email); } catch {}
          let actionHtml;
          if (status==="friends") actionHtml='<span class="friends-done">✓ Friends</span>';
          else if (status==="request_sent") actionHtml=pendingBtn();
          else if (status==="request_received") actionHtml=acceptDeclineBtns(u.email);
          else actionHtml=addFriendBtn(u.email);
          html+=makeCard(u, actionHtml);
        }
        searchGrid.innerHTML=html;
        wireButtons(searchGrid);
      } catch(e) {
        searchGrid.innerHTML=`<p class="fb-empty">Search error: ${e.message}</p>`;
      }
    }, 400);
  });

  // ── Boot ───────────────────────────────────────────────────────────────
  await loadRequests();
  loadSuggestions();
}

if (document.readyState==="loading") {
  document.addEventListener("DOMContentLoaded", runFriendsPage);
} else {
  runFriendsPage();
}
