/**
 * theme.js — Light/dark theme toggle.
 * Loaded as the first script on every page so the correct theme is applied
 * before any content paints (avoids flash of wrong theme).
 */
(function () {
  const STORAGE_KEY = "sanatioTheme";

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    // Keep the toggle button icon in sync if it already exists in the DOM.
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }

  function getSavedTheme() {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  function getPreferredTheme() {
    const saved = getSavedTheme();
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  // Apply immediately so there's no flash.
  applyTheme(getPreferredTheme());

  // Wire the toggle button once the DOM is ready.
  function setupToggle() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;

    const current = document.documentElement.getAttribute("data-theme") || "dark";
    btn.setAttribute("aria-label", current === "dark" ? "Switch to light theme" : "Switch to dark theme");

    btn.addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupToggle);
  } else {
    setupToggle();
  }
})();
