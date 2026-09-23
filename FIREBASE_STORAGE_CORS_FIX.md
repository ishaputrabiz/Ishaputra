# Firebase Storage CORS Error - Fix Guide

## Problem
You're getting a CORS error when trying to upload images to Firebase Storage:
```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/...' has been blocked by CORS policy
```

## Solution

### ✅ Quick Fix (Recommended)

**Option 1: Update Storage Rules via Firebase Console**

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: **sreerasthusilvers-2d574**
3. Click on **Storage** in the left menu
4. Click on **Rules** tab
5. Replace the existing rules with:

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    
    // Homepage banners - Public read, authenticated write
    match /homepage-banners/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
      allow delete: if request.auth != null;
    }
    
    // All other paths - Public read, authenticated write
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

6. Click **Publish**

---

### 🔐 Make Storage Bucket Public (Required)

**Important:** You must also make the storage bucket publicly readable.

**Method A: Via Firebase Console**

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: **sreerasthusilvers-2d574**
3. Click on **Storage** → **Files** tab
4. Click on the **three dots menu** (⋮) at the top right
5. Select **Permissions**
6. Click **Add Principal**
7. Enter: `allUsers`
8. Select role: **Storage Object Viewer**
9. Click **Save**

**Method B: Via Google Cloud Console**

1. Go to [Google Cloud Storage](https://console.cloud.google.com/storage/browser)
2. Select your bucket: `sreerasthusilvers-2d574.firebasestorage.app`
3. Click on **Permissions** tab
4. Click **Grant Access**
5. Add principal: `allUsers`
6. Role: **Storage Object Viewer**
7. Click **Save**

---

### 🛠️ Alternative: Deploy via Firebase CLI

If you prefer using the command line:

1. **Login to Firebase:**
   ```powershell
   firebase login
   ```

2. **Initialize Firebase (if not already done):**
   ```powershell
   firebase init storage
   ```
   - Select your project
   - Choose the default file: `storage.rules`

3. **Deploy Storage Rules:**
   ```powershell
   firebase deploy --only storage
   ```

---

### 🌐 Configure CORS (Optional but Recommended)

If you still face CORS issues after the above steps:

**Using Google Cloud SDK:**

1. Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)

2. Authenticate:
   ```powershell
   gcloud auth login
   ```

3. Set CORS configuration:
   ```powershell
   gsutil cors set cors.json gs://sreerasthusilvers-2d574.firebasestorage.app
   ```

---

## Verify the Fix

After completing the above steps:

1. Clear your browser cache
2. Refresh the page (`Ctrl + Shift + R` or `Cmd + Shift + R`)
3. Try uploading a banner image again

---

## Files Created

- ✅ `storage.rules` - Firebase Storage security rules
- ✅ `cors.json` - CORS configuration for Firebase Storage
- ✅ `firebase.json` - Updated with storage configuration
- ✅ `fix-storage-cors.ps1` - PowerShell script to help with deployment

---

## Current Storage Rules Configuration

The `storage.rules` file has been created with the following configuration:

- **Homepage Banners**: Public read, authenticated users can upload/delete
- **Product Images**: Public read, authenticated users can upload/delete
- **User Avatars**: Public read, authenticated users can upload/delete
- **Blog/Gallery/Showcase**: Public read, authenticated users can upload/delete

---

## Still Having Issues?

If the error persists:

1. **Check Firebase Authentication:**
   - Make sure you're logged in to the admin panel
   - Check browser console for authentication errors

2. **Check Storage Rules:**
   - Go to Firebase Console → Storage → Rules
   - Verify the rules are published

3. **Check Bucket Permissions:**
   - Ensure `allUsers` has `Storage Object Viewer` role

4. **Contact Support:**
   - Check [Firebase Status](https://status.firebase.google.com/)
   - Visit [Firebase Support](https://firebase.google.com/support)

---

**Note:** After making changes in Firebase Console, wait 1-2 minutes for changes to propagate, then refresh your browser.
