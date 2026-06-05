// ─── Configuration ─────────────────────────────────────────────────────────
// IMPORTANT: Never commit real secrets to this file.
// Copy .env.example to .env and fill in your values.
// This file holds only placeholder values safe to commit.
// For a static HTML project without a build step, replace the placeholder
// strings below with your real values locally and do NOT commit that change
// (add config.js to .gitignore, or use a build process to inject env vars).

// ─── Google Sign-In ────────────────────────────────────────────────────────
// Replace with your Google OAuth 2.0 Client ID from console.cloud.google.com
const GOOGLE_CLIENT_ID = "";

// ─── Password reset emails ─────────────────────────────────────────────────
const EMAIL_API_URL = "http://localhost:3001/api/send-reset";

// Optional EmailJS backup
const EMAILJS_PUBLIC_KEY = "";
const EMAILJS_SERVICE_ID = "";
const EMAILJS_TEMPLATE_ID = "";

// ─── Firebase (shared community posts) ────────────────────────────────────
// Replace with your Firebase project config from console.firebase.google.com
const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: "",
};
