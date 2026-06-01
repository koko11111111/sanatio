/**
 * SANATIO theme.js — must be loaded in <head> BEFORE styles.css
 * Applies saved theme instantly to prevent flash, wires toggle buttons.
 */
(function () {
  const KEY = "sanatioTheme";

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelectorAll(".theme-toggle").forEach(btn => {
      btn.textContent = theme === "light" ? "🌙" : "☀️";
      btn.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
    });
  }

  function saved() { return localStorage.getItem(KEY) || "dark"; }

  function toggle() {
    const next = saved() === "dark" ? "light" : "dark";
    localStorage.setItem(KEY, next);
    apply(next);
  }

  // Apply IMMEDIATELY — before any CSS paints — to prevent flash
  apply(saved());

  document.addEventListener("DOMContentLoaded", function () {
    apply(saved()); // re-apply after DOM so buttons update too
    document.querySelectorAll(".theme-toggle").forEach(btn => {
      btn.removeEventListener("click", toggle); // avoid double binding
      btn.addEventListener("click", toggle);
    });
  });
})();
