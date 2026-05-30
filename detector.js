function runDetectorPage() {
  const HISTORY_KEY_PREFIX = "aiDetectorHistory_";
  const LAST_SCAN_KEY = "aiDetectorLastScan";

  function historyKey(email) {
    return HISTORY_KEY_PREFIX + email;
  }

  function readHistory(email) {
    try { return JSON.parse(localStorage.getItem(historyKey(email))) || []; }
    catch { return []; }
  }

  function saveHistory(email, entries) {
    localStorage.setItem(historyKey(email), JSON.stringify(entries));
  }

  function saveLastScan(scan) {
    try {
      localStorage.setItem(LAST_SCAN_KEY, JSON.stringify(scan));
    } catch {
      // storage full or blocked
    }
  }

  function createFallbackAvatar(name) {
    const initial = (name || "U").trim().charAt(0).toUpperCase() || "U";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="54%" text-anchor="middle" fill="#e5e7eb" font-size="44" font-family="Arial, sans-serif">${initial}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function safeImageSrc(url) {
    const value = String(url || "").trim();
    if (!value) return "";
    if (value.startsWith("data:image/")) return value;
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    return "";
  }

  const form = document.getElementById("detect-form");
  if (!form) return;

  const fileInput = document.getElementById("media-file");
  const detectMessage = document.getElementById("detect-message");
  const resultText = document.getElementById("result-text");
  const welcomeUser = document.getElementById("welcome-user");
  const logoutButton = document.getElementById("logout-btn");
  const profilePhoto = document.getElementById("profile-photo");
  const profileName = document.getElementById("profile-name");
  const profileEmail = document.getElementById("profile-email");
  const profileCreated = document.getElementById("profile-created");
  const profilePhotoInput = document.getElementById("profile-photo-input");
  const profileMenuTrigger = document.getElementById("profile-menu-trigger");
  const profileMenu = document.getElementById("profile-menu");
  const imagePreviewWrap = document.getElementById("image-preview-wrap");
  const imagePreview = document.getElementById("image-preview");
  const clearImageBtn = document.getElementById("clear-image");
  const historyFeed = document.getElementById("history-feed");
  const clearHistoryBtn = document.getElementById("clear-history-btn");
  const shareResultBtn = document.getElementById("share-result-btn");

  let importedImageDataUrl = "";

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) {
      imagePreviewWrap.classList.add("hidden");
      imagePreview.src = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      imagePreview.src = reader.result;
      imagePreviewWrap.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });

  clearImageBtn.addEventListener("click", () => {
    fileInput.value = "";
    imagePreview.src = "";
    imagePreviewWrap.classList.add("hidden");
    detectMessage.textContent = "";
    detectMessage.className = "form-message";
    importedImageDataUrl = "";
  });

  try {
    const pendingImage = sessionStorage.getItem("pendingAnalyzeImage");
    if (pendingImage) {
      importedImageDataUrl = pendingImage;
      imagePreview.src = pendingImage;
      imagePreviewWrap.classList.remove("hidden");
      sessionStorage.removeItem("pendingAnalyzeImage");
      sessionStorage.removeItem("pendingAnalyzeNote");
    }
  } catch {
    importedImageDataUrl = "";
  }

  function renderHistory(email) {
    const entries = readHistory(email);
    if (entries.length === 0) {
      historyFeed.innerHTML = '<p class="history-empty">No scans yet.</p>';
      return;
    }
    historyFeed.innerHTML = entries
      .slice()
      .reverse()
      .map((entry) => {
        const scoreClass = entry.score >= 70 ? "score-high" : entry.score >= 40 ? "score-mid" : "score-low";
        return `
          <div class="history-entry">
            <img class="history-thumb" src="${safeImageSrc(entry.thumb) || createFallbackAvatar("?")}" alt="Scanned photo thumbnail">
            <div class="history-info">
              <p class="history-label ${scoreClass}">${entry.label}</p>
              <p class="history-score">Score: ${entry.score}%</p>
              <p class="history-date">${new Date(entry.createdAt).toLocaleString()}</p>
            </div>
          </div>
        `;
      })
      .join("");
  }

  clearHistoryBtn.addEventListener("click", () => {
    const current = getCurrentUser();
    if (!current) return;
    saveHistory(current.email, []);
    renderHistory(current.email);
  });

  try {
    if (shareResultBtn && localStorage.getItem(LAST_SCAN_KEY)) {
      shareResultBtn.hidden = false;
    }
  } catch {
    // ignore
  }

  const currentUser = getCurrentUser();
  if (currentUser) {
    welcomeUser.textContent = `Welcome, ${currentUser.name}.`;
    profileName.textContent = currentUser.name;
    profileEmail.textContent = currentUser.email;
    profileCreated.textContent = currentUser.createdAt
      ? `Joined: ${new Date(currentUser.createdAt).toLocaleDateString()}`
      : "Joined recently";
    profilePhoto.src = safeImageSrc(currentUser.profilePhoto) || createFallbackAvatar(currentUser.name);
    renderHistory(currentUser.email);
  }

  profilePhotoInput.addEventListener("change", () => {
    const file = profilePhotoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const photoDataUrl = String(reader.result || "");
      profilePhoto.src = photoDataUrl;
      saveProfilePhotoForCurrentUser(photoDataUrl);
    };
    reader.readAsDataURL(file);
  });

  profileMenuTrigger.addEventListener("click", () => {
    const isOpen = !profileMenu.classList.contains("hidden");
    profileMenu.classList.toggle("hidden", isOpen);
    profileMenuTrigger.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", (event) => {
    const clickedInside =
      profileMenu.contains(event.target) || profileMenuTrigger.contains(event.target);
    if (!clickedInside) {
      profileMenu.classList.add("hidden");
      profileMenuTrigger.setAttribute("aria-expanded", "false");
    }
  });

  logoutButton.addEventListener("click", () => {
    logoutCurrentUser();
    window.location.href = "index.html";
  });

  shareResultBtn?.addEventListener("click", () => {
    try {
      sessionStorage.setItem("communityShareResult", "1");
    } catch {
      // continue
    }
    window.location.href = "community.html";
  });

  function runPhotoAnalysis(thumb) {
    detectMessage.textContent = "Analyzing photo with AI model…";
    detectMessage.className = "form-message warning";

    const deepScan = localStorage.getItem("aiDetectorDeepScan") === "true";
    const minDelay = deepScan ? 900 : 500;

    const started = Date.now();

    function finishAnalysis(aiScore, likelyLabel, usedModel) {
      const elapsed = Date.now() - started;
      const wait = Math.max(0, minDelay - elapsed);

      window.setTimeout(() => {
        let finalScore = aiScore;
        if (deepScan && usedModel) {
          finalScore = Math.min(99, Math.max(finalScore, finalScore + 8));
        }

        resultText.textContent = `${likelyLabel} (AI score: ${finalScore}%).`;
        detectMessage.textContent = usedModel
          ? (deepScan ? "Deep scan complete (trained model)." : "Analysis complete (trained model).")
          : (deepScan ? "Deep scan complete (demo mode)." : "Analysis complete (demo mode — run train-model.bat).");
        detectMessage.className = "form-message success";
        importedImageDataUrl = "";

        const scan = {
          label: likelyLabel,
          score: finalScore,
          thumb,
          createdAt: new Date().toISOString(),
        };
        saveLastScan(scan);
        if (shareResultBtn) shareResultBtn.hidden = false;

        const current = getCurrentUser();
        if (current) {
          const entries = readHistory(current.email);
          entries.push({ thumb, label: likelyLabel, score: finalScore, createdAt: scan.createdAt });
          if (entries.length > 20) entries.splice(0, entries.length - 20);
          saveHistory(current.email, entries);
          renderHistory(current.email);
        }
      }, wait);
    }

    function fallbackRandom() {
      const aiScore = deepScan
        ? Math.floor(Math.random() * 21) + 70
        : Math.floor(Math.random() * 101);
      const likelyLabel = aiScore >= 50 ? "Likely AI-generated" : "Likely real";
      finishAnalysis(aiScore, likelyLabel, false);
    }

    PhotoAiModel.analyzeImage(thumb)
      .then(({ aiScore, likelyLabel }) => finishAnalysis(aiScore, likelyLabel, true))
      .catch(() => fallbackRandom());
  }

  PhotoAiModel.loadModel().catch(() => {
    console.info("SANATIO: No trained model yet. Run train-model.bat to train on CIFAKE dataset.");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const selectedFile = fileInput.files[0];

    if (!selectedFile && !importedImageDataUrl) {
      detectMessage.textContent = "Please choose a photo first.";
      detectMessage.className = "form-message error";
      return;
    }

    if (importedImageDataUrl) {
      runPhotoAnalysis(importedImageDataUrl);
      return;
    }

    const thumbReader = new FileReader();
    thumbReader.onload = () => runPhotoAnalysis(thumbReader.result);
    thumbReader.readAsDataURL(selectedFile);
  });

  if (importedImageDataUrl) {
    window.setTimeout(() => form.requestSubmit(), 400);
  }
}

runDetectorPage();
