// Get your Client ID: Google Cloud Console → APIs & Services → Credentials
// Create "OAuth 2.0 Client ID" → Web application
// Add your site URL under "Authorized JavaScript origins" (e.g. http://localhost or your GitHub Pages URL)
const GOOGLE_CLIENT_ID = "1074937897394-6324b3m9h20n9btip4n87715q769bepa.apps.googleusercontent.com";

// Password reset emails — run start-email.bat (or start-all.bat) on your PC.
// Uses the local server below. For real Gmail delivery, copy .env.example to .env.
const EMAIL_API_URL = "http://localhost:3001/api/send-reset";

// Optional EmailJS backup (only if you prefer cloud email instead of start-email.bat)
const EMAILJS_PUBLIC_KEY = "";
const EMAILJS_SERVICE_ID = "";
const EMAILJS_TEMPLATE_ID = "";
