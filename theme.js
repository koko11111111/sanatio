/**
 * SANATIO theme.js
 * Applies dark/light mode across ALL pages consistently.
 * Include in every HTML page's <head>.
 */
(function () {
  const THEME_KEY = "sanatioTheme";

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    // Update any theme toggle buttons on the page
    document.querySelectorAll(".theme-toggle").forEach(btn => {
      btn.textContent = theme === "light" ? "🌙" : "☀️";
      btn.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
    });
  }

  function getTheme() {
    return localStorage.getItem(THEME_KEY) || "dark";
  }

  function toggleTheme() {
    const current = getTheme();
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  // Apply immediately before page renders (prevents flash)
  applyTheme(getTheme());

  // Wire up toggle buttons after DOM loads
  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(getTheme());
    document.querySelectorAll(".theme-toggle").forEach(btn => {
      btn.addEventListener("click", toggleTheme);
    });
  });
})();
