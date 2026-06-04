// ─── Configuration loaded from environment variables ──────────────────────
// IMPORTANT: Never commit secrets to this file. Use .env instead.
// See .env.example for setup instructions.

// ─── Google Sign-In ────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = "1074937897394-t25qprjhculhc7n84rfd5a2viars7ajc.apps.googleusercontent.com";

// ─── Password reset emails ─────────────────────────────────────────────────
const EMAIL_API_URL = "http://localhost:3001/api/send-reset";

// Optional EmailJS backup
const EMAILJS_PUBLIC_KEY = "";
const EMAILJS_SERVICE_ID = "";
const EMAILJS_TEMPLATE_ID = "";

// ─── Firebase (shared community posts) ────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDscfjRQyBNDhAKMBhCCmdj8OTFeb_L3Yo",
  authDomain: "sanatio-c4122.firebaseapp.com",
  projectId: "sanatio-c4122",
  storageBucket: "sanatio-c4122.firebasestorage.app",
  messagingSenderId: "580426949606",
  appId: "1:580426949606:web:4519fbccfb0e21db4cec27",
  measurementId: "G-CKG9HE5QXG",
};
