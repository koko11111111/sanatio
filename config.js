// ─── Configuration loaded from environment variables ──────────────────────
// IMPORTANT: Never commit secrets to this file. Use .env instead.
// See .env.example for setup instructions.

// ─── Google Sign-In ────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = (typeof process !== "undefined" && process.env.REACT_APP_GOOGLE_CLIENT_ID)
  ? process.env.REACT_APP_GOOGLE_CLIENT_ID
  : "";

// ─── Password reset emails ─────────────────────────────────────────────────
const EMAIL_API_URL = "http://localhost:3001/api/send-reset";

// Optional EmailJS backup
const EMAILJS_PUBLIC_KEY = (typeof process !== "undefined" && process.env.REACT_APP_EMAILJS_PUBLIC_KEY)
  ? process.env.REACT_APP_EMAILJS_PUBLIC_KEY
  : "";
const EMAILJS_SERVICE_ID = (typeof process !== "undefined" && process.env.REACT_APP_EMAILJS_SERVICE_ID)
  ? process.env.REACT_APP_EMAILJS_SERVICE_ID
  : "";
const EMAILJS_TEMPLATE_ID = (typeof process !== "undefined" && process.env.REACT_APP_EMAILJS_TEMPLATE_ID)
  ? process.env.REACT_APP_EMAILJS_TEMPLATE_ID
  : "";

// ─── Firebase (shared community posts) ────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: (typeof process !== "undefined" && process.env.REACT_APP_FIREBASE_API_KEY)
    ? process.env.REACT_APP_FIREBASE_API_KEY
    : "",
  authDomain: (typeof process !== "undefined" && process.env.REACT_APP_FIREBASE_AUTH_DOMAIN)
    ? process.env.REACT_APP_FIREBASE_AUTH_DOMAIN
    : "",
  projectId: (typeof process !== "undefined" && process.env.REACT_APP_FIREBASE_PROJECT_ID)
    ? process.env.REACT_APP_FIREBASE_PROJECT_ID
    : "",
  storageBucket: (typeof process !== "undefined" && process.env.REACT_APP_FIREBASE_STORAGE_BUCKET)
    ? process.env.REACT_APP_FIREBASE_STORAGE_BUCKET
    : "",
  messagingSenderId: (typeof process !== "undefined" && process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID)
    ? process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID
    : "",
  appId: (typeof process !== "undefined" && process.env.REACT_APP_FIREBASE_APP_ID)
    ? process.env.REACT_APP_FIREBASE_APP_ID
    : "",
  measurementId: (typeof process !== "undefined" && process.env.REACT_APP_FIREBASE_MEASUREMENT_ID)
    ? process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
    : "",
};
