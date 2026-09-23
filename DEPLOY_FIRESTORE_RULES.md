# Deploy Firestore Rules

## Issue Fixed
The SecurityPage was showing a "Missing or insufficient permissions" error when trying to load security data. This is because the Firestore rules for `accountDeletionRequests` collection didn't allow query/list operations properly.

## What Changed
Updated `firestore.rules` to split `allow read` into:
- `allow list` - for querying/listing documents
- `allow get` - for reading specific documents by ID

This allows authenticated users to query their own deletion requests while maintaining security.

## Deploy to Firebase

### Option 1: Firebase CLI (Recommended)
```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy only Firestore rules
firebase deploy --only firestore:rules

# Or deploy all Firebase configs
firebase deploy
```

### Option 2: Firebase Console (Manual)
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **sreerasthusilvers-2d574**
3. Navigate to **Firestore Database** → **Rules** tab
4. Copy the entire content from `firestore.rules` file
5. Paste into the rules editor
6. Click **Publish**

### Option 3: Quick Deploy Command
From your project directory:
```bash
cd "c:\Users\Latitude\OneDrive\Attachments\Desktop\sree rasthu web\sree rasthu silvers web"
firebase deploy --only firestore:rules
```

## Verify Deployment
1. Open your app's Security page (`/security`)
2. The "Missing or insufficient permissions" error should be gone
3. Security data should load successfully:
   - Security Settings
   - Login History
   - Active Sessions
   - Trusted Devices
   - Account Deletion Status

## Temporary Fix
The SecurityPage has been updated to handle permission errors gracefully:
- If any data fails to load, it sets empty defaults
- Page still renders and functions normally
- No console errors break the UI

## What If I Can't Deploy?
The app will still work! The SecurityPage now handles missing permissions gracefully:
- Empty arrays for history, sessions, devices
- Null for settings and deletion status
- Page displays "0 active sessions", "0 trusted devices", etc.
- All features that don't require reading those collections will work fine

Once you deploy the updated rules, all security features will work fully.
