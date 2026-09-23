# Web Push Notifications (FCM) — Setup Guide

This project now has a complete Firebase Cloud Messaging web push stack.
Front-end registers tokens automatically on login. Admins broadcast from
**Admin → Notifications**. Delivery happens via a Vercel serverless function
that authenticates with the Firebase Admin SDK.

---

## 1. Install new dependencies

Two new packages were added to `package.json`:

- `firebase-admin` — used by the serverless function
- `@vercel/node` (dev) — types for the Vercel function

```bash
npm install
# or
bun install
```

---

## 2. Files added

| File | Purpose |
| --- | --- |
| `public/firebase-messaging-sw.js` | Background push service worker (must live at site root) |
| `src/services/pushNotificationService.ts` | Browser-side: permission, token, foreground listener, save to Firestore |
| `api/send-notification.ts` | Vercel function — broadcasts push to tokens/topic |
| `src/pages/admin/AdminNotifications.tsx` | Admin broadcast UI (`/admin/notifications`) |

`AuthContext` was updated to register the FCM token in Firestore the moment a
user signs in. Tokens are stored at `userTokens/{token}` with `{ uid, token,
platform: 'web', userAgent, createdAt, updatedAt }`.

---

## 3. Required Vercel environment variables

In the Vercel project dashboard → **Settings → Environment Variables** add:

### Client Firebase config

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_FIREBASE_VAPID_KEY`

These should be added for `Production`, `Preview`, and `Development` because the browser bundle reads them at build time.

### `FIREBASE_ADMIN_SDK_BASE64`
Base64-encoded contents of the Firebase Admin service account JSON
(`sreerasthusilvers-33eb1-firebase-adminsdk-fbsvc-4aeefad887.json`).

Generate locally:

**PowerShell**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("sreerasthusilvers-33eb1-firebase-adminsdk-fbsvc-4aeefad887.json"))
```

**bash / WSL**
```bash
base64 -w0 sreerasthusilvers-33eb1-firebase-adminsdk-fbsvc-4aeefad887.json
```

Paste the entire single-line output as the env var value.

### `ADMIN_NOTIFICATION_KEY`
Any random string (e.g. `srs-push-2025-7K9fQ`). The admin UI must send this in
the `x-admin-key` header. Without it, *anyone* who finds the API URL can spam
push notifications. **Set this.**

### `VITE_FIREBASE_VAPID_KEY`
The VAPID public key from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates.

After saving env vars, redeploy.

---

## 4. Firestore security rules — `userTokens` collection

Add this rule block to `firestore.rules`:

```
match /userTokens/{token} {
  // A user can create or update only their own token document
  allow create, update: if request.auth != null
                        && request.resource.data.uid == request.auth.uid;
  // Owner can delete their own token
  allow delete: if request.auth != null
                && resource.data.uid == request.auth.uid;
  // Admin can read all tokens (for the broadcast UI)
  allow read: if request.auth != null
              && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```

Then deploy:
```bash
firebase deploy --only firestore:rules
```

---

## 5. Local testing

1. `npm run dev` and open the site over **HTTPS or `localhost`** (FCM
   requires a secure context).
2. Sign in as a normal user — the browser will prompt for notification
   permission. Accept it.
3. Confirm a doc shows up at `userTokens/{...}` in Firestore.
4. Sign in as an admin and visit `/admin/notifications`.
5. Paste your `ADMIN_NOTIFICATION_KEY`, fill in title/body, click Send.
6. The serverless function only runs in `vercel dev` or production. For
   local testing, run:
   ```bash
   npx vercel dev
   ```
   so the `/api/send-notification` route is mounted.

---

## 6. Security notes

- `*firebase-adminsdk*.json` is now in `.gitignore` — never commit it.
- The admin SDK JSON should only ever live in Vercel env (base64) and on
  your local machine.
- The service worker no longer hardcodes Firebase values; the app passes the
  Firebase web config to `/firebase-messaging-sw.js` at registration time so
  browser messaging stays aligned with your env-backed client config.
- `ADMIN_NOTIFICATION_KEY` is the only thing standing between an attacker
  and broadcasting push notifications to your users — keep it strong and
  do not commit it to client code.
- Cleanup of stale tokens: when a send returns `invalidTokens`, the admin
  UI logs them; you can extend it to auto-delete those docs from Firestore.

---

## 7. Future hooks (not yet wired)

- Auto-send "order shipped" / "order delivered" notifications from order
  status change handlers — call `/api/send-notification` from a Cloud
  Function or from the admin app when status flips.
- WhatsApp-equivalent broadcasts: per the project plan, all WhatsApp
  messages (except OTP / security) should also fire a web notification.
  Hook into wherever WhatsApp sends happen and POST to
  `/api/send-notification` with the same title/body.
