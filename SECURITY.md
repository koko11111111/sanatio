# Security Best Practices for SANATIO

## 🔐 Password Security

### Changes Made
- **Removed:** Plaintext password storage
- **Added:** PBKDF2 password hashing with 100,000 iterations
- **Files:** `password-utils.js` provides secure hashing utilities

### How It Works
1. When a user signs up, their password is hashed using `securePasswordStore(password)`
2. The hash and salt are stored together (never the plaintext password)
3. On login, the entered password is verified against the stored hash using `verifyStoredPassword()`
4. Even if localStorage is compromised, attackers cannot recover the original password

## 🔑 API Keys & Credentials

### Changes Made
- **Removed:** Hardcoded API keys from `config.js`
- **Added:** Environment variable support (`.env` file)
- **Updated:** `.env.example` with all required variables

### Setup Instructions

1. **Copy the template:**
   ```bash
   cp .env.example .env
   ```

2. **Fill in your credentials:**
   ```bash
   # Google OAuth
   REACT_APP_GOOGLE_CLIENT_ID=your-client-id-here

   # Firebase
   REACT_APP_FIREBASE_API_KEY=your-key
   REACT_APP_FIREBASE_AUTH_DOMAIN=your-domain
   REACT_APP_FIREBASE_PROJECT_ID=your-project
   # ... other Firebase settings

   # SMTP (for password reset emails)
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   ```

3. **Ensure `.env` is in `.gitignore`:**
   ```bash
   # .gitignore should contain:
   .env
   .env.local
   .env.*.local
   ```

## 🛡️ Firebase Security Rules

After adding your Firebase credentials, configure security rules in Firebase Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users can only read/write their own profile
    match /users/{email} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.email == email || request.auth.uid == email;
    }
    
    // Community posts are public but creation is restricted
    match /community_posts/{postId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.token.email == resource.data.email;
    }
    
    // Default: deny all
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## ⚠️ Before Deployment

- [ ] Regenerate Google OAuth Client ID
- [ ] Regenerate Firebase API Key
- [ ] Update SMTP credentials
- [ ] Verify `.env` is in `.gitignore`
- [ ] Set up Firebase Security Rules
- [ ] Test authentication with actual credentials
- [ ] Review all environment variables are loaded correctly

## 📋 Checklist for Production

1. **Google OAuth:**
   - [ ] Create new Client ID in Google Cloud Console
   - [ ] Update authorized redirect URIs
   - [ ] Add to `.env` as `REACT_APP_GOOGLE_CLIENT_ID`

2. **Firebase:**
   - [ ] Regenerate API Key or create a new one
   - [ ] Enable Firestore with restrictive rules
   - [ ] Add all Firebase config to `.env`

3. **Email Service:**
   - [ ] Create Gmail App Password (not regular password)
   - [ ] Add SMTP credentials to `.env`
   - [ ] Verify email sending works

4. **Repository:**
   - [ ] Commit `.env.example` (no secrets)
   - [ ] Never commit `.env` file
   - [ ] Verify `.gitignore` includes `.env`

## 🔍 Regular Security Audits

- [ ] Check for hardcoded credentials monthly
- [ ] Rotate API keys every 90 days
- [ ] Review Firebase security rules quarterly
- [ ] Update password hashing algorithm if newer standards emerge
- [ ] Monitor Firebase console for unusual activity

## 📚 Additional Resources

- [OWASP: Storing Passwords](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Firebase Security Rules](https://firebase.google.com/docs/firestore/security/start)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)

---

**Last Updated:** 2026-06-04
**Status:** Secured with PBKDF2 hashing and environment variables
