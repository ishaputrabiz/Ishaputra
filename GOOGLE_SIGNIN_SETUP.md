# Google Sign-In Setup Guide

## Problem
Google Sign-In is failing with error: "Failed to sign in with Google. Please try again."

## Solution

### 1. Enable Google Sign-In in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **sreerasthusilvers-2d574**
3. Navigate to **Authentication** → **Sign-in method**
4. Find **Google** in the providers list
5. Click on **Google** to configure it
6. Toggle **Enable** to ON
7. Enter a **Project support email** (your email address)
8. Click **Save**

### 2. Configure Authorized Domains

1. In Firebase Console, go to **Authentication** → **Settings** → **Authorized domains**
2. Make sure the following domains are authorized:
   - `localhost` (for local development)
   - `sreerasthusilvers-2d574.firebaseapp.com` (default Firebase domain)
   - Your production domain (e.g., `yourwebsite.com`)
   - Any Vercel preview domains if deploying to Vercel (e.g., `*.vercel.app`)

### 3. Configure OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (same as Firebase project)
3. Navigate to **APIs & Services** → **OAuth consent screen**
4. Fill in the required information:
   - App name: **Sree Rasthu Silvers**
   - User support email: Your email
   - Developer contact information: Your email
5. Click **Save and Continue**
6. Add scopes (optional): `email`, `profile`
7. Click **Save and Continue**

### 4. Verify OAuth Client Configuration

1. In Google Cloud Console, go to **APIs & Services** → **Credentials**
2. You should see an OAuth 2.0 Client ID created by Firebase
3. Click on it to edit
4. Add **Authorized JavaScript origins**:
   - `http://localhost` (for local dev)
   - `http://localhost:5173` (Vite default port)
   - `https://sreerasthusilvers-2d574.firebaseapp.com`
   - Your production URL
5. Add **Authorized redirect URIs**:
   - `http://localhost/__/auth/handler`
   - `http://localhost:5173/__/auth/handler`
   - `https://sreerasthusilvers-2d574.firebaseapp.com/__/auth/handler`
   - Your production URL + `/__/auth/handler`

### 5. Test the Configuration

1. Clear your browser cache and cookies
2. Try signing in with Google again
3. Check the browser console for any error messages
4. The improved error handling will now show more specific error messages

### Common Error Codes & Solutions

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `auth/popup-closed-by-user` | User closed the popup | User action - they need to complete sign-in |
| `auth/popup-blocked` | Browser blocked the popup | Allow popups in browser settings |
| `auth/unauthorized-domain` | Domain not authorized | Add domain to Firebase Authorized domains |
| `auth/operation-not-allowed` | Google sign-in not enabled | Enable Google provider in Firebase |
| `auth/network-request-failed` | Network issue | Check internet connection |
| `auth/cancelled-popup-request` | Multiple popups opened | Only one sign-in attempt at a time |

### 6. Browser Settings

**Chrome/Edge:**
1. Make sure popups are allowed for your site
2. Go to Settings → Privacy and security → Site Settings → Pop-ups and redirects
3. Add your site to the allowed list

**Firefox:**
1. Click the shield icon in the address bar
2. Allow pop-ups for your site

### 7. Local Development Tips

- Use `http://localhost:5173` consistently (not `127.0.0.1`)
- Make sure your dev server is running on the authorized port
- Clear browser cache if you make Firebase config changes
- Check browser console for detailed error messages

### 8. Verification Checklist

✅ Google provider is enabled in Firebase Authentication  
✅ Support email is configured  
✅ All domains are added to Authorized domains  
✅ OAuth consent screen is configured  
✅ OAuth client has correct origins and redirect URIs  
✅ Browser allows popups for the site  
✅ Using correct domain/port in browser  

## Changes Made to Code

### Enhanced Error Handling
- Added specific error messages for different failure scenarios
- Added better console logging for debugging
- Added custom parameters to Google provider for better UX

### Improved Google Sign-In Flow
- Added profile and email scopes explicitly
- Added account selection prompt
- Better error catching and reporting

## Testing Steps

1. Open browser console (F12)
2. Navigate to the login page
3. Click "Continue with Google"
4. Check console for any error messages
5. Look at the specific error message shown in the UI
6. Follow the corresponding solution from the table above

## Support

If you continue to experience issues:
1. Check the browser console for detailed error logs
2. Verify all Firebase configuration steps above
3. Ensure your Firebase project billing is active (Google sign-in requires Blaze plan for production)
4. Try in an incognito/private window to rule out cache issues
