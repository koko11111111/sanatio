// Shared theme toggle — works on every page (runs in <head> before <body> exists)
(function () {
  const THEME_KEY = "aiDetectorTheme";

  function getSavedTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "dark";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    if (document.body) {
      document.body.setAttribute("data-theme", theme);
    }

    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.textContent = theme === "light" ? "🌙" : "☀️";
      btn.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
    }

    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // localStorage may be blocked in some contexts
    }
  }

  function getCurrentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function bindThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    if (!btn || btn.dataset.themeBound === "true") return;
    btn.dataset.themeBound = "true";
    btn.addEventListener("click", function () {
      applyTheme(getCurrentTheme() === "light" ? "dark" : "light");
    });
  }

  function initTheme() {
    applyTheme(getSavedTheme());
    bindThemeToggle();
  }

  // Apply immediately on <html> so theme works even when script is in <head>
  applyTheme(getSavedTheme());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
  } else {
    initTheme();
  }
})();
