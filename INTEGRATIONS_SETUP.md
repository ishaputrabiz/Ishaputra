# Integrations setup — FCM, WhatsApp, Video Call

A single reference for the three serverless / browser integrations added in
this round.

## 1. Firebase Cloud Messaging (web push)

### Client env vars (`.env` and Vercel)
| Name | Purpose |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase web app API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project id |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender id |
| `VITE_FIREBASE_APP_ID` | Firebase web app id |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase analytics measurement id |
| `VITE_FIREBASE_VAPID_KEY` | VAPID public key from Firebase console → Cloud Messaging |

### Server env vars (Vercel)
| Name | Purpose |
|---|---|
| `FIREBASE_ADMIN_SDK_BASE64` | base64 of the Admin SDK service-account JSON |
| `ADMIN_NOTIFICATION_KEY`    | Shared secret required by `/api/send-notification` |

### Generate the base64 blob (PowerShell)
```powershell
$json = Get-Content -Raw .\sreerasthusilvers-33eb1-firebase-adminsdk-*.json
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)) | clip
```
Paste from clipboard into the Vercel dashboard → Environment Variables.

### Deploy Firestore rules
```bash
firebase login
firebase deploy --only firestore:rules
```
The new `userTokens`, `whatsappOtps`, and `videoCalls` rule blocks are at
the bottom of `firestore.rules`.

### Verify end-to-end
1. Sign in to the site → browser asks for notification permission → `userTokens/{token}` doc appears.
2. Open `/admin/notifications`, paste the admin key, send to "All users".
3. Background tab + locked screen should both surface the notification.

### Vercel dashboard steps
1. Open your Vercel project.
2. Go to **Settings → Environment Variables**.
3. Add every `VITE_FIREBASE_*` variable to `Production`, `Preview`, and `Development`.
4. Add `FIREBASE_ADMIN_SDK_BASE64` and `ADMIN_NOTIFICATION_KEY` to the same environments.
5. Redeploy after saving so both the client bundle and serverless functions pick up the new values.

---

## 2. WhatsApp Cloud API

### Provider setup
1. Create an app at <https://developers.facebook.com/> → product **WhatsApp**.
2. Note the **Phone number ID** and generate a **permanent system-user token**.
3. Submit a template named `otp_login` (category: Authentication, body
   placeholder for the OTP, optional URL button copying the OTP). Until
   approved the OTP function falls back to plain-text messages.

### Vercel env vars
| Name | Required | Purpose |
|---|---|---|
| `WHATSAPP_TOKEN`         | yes | Bearer token sent to Meta Graph API |
| `WHATSAPP_PHONE_ID`      | yes | Sender phone number ID |
| `WHATSAPP_OTP_TEMPLATE`  | no  | Template name (default `otp_login`) |
| `WHATSAPP_OTP_LANG`      | no  | Template language code (default `en_US`) |

These should be added in **Vercel → Settings → Environment Variables** for the environments you use.

### Endpoints
- `POST /api/whatsapp-send` `{ kind: 'text'    , to, text }`            (admin-gated)
- `POST /api/whatsapp-send` `{ kind: 'template', to, template, params }` (admin-gated)
- `POST /api/whatsapp-send` `{ kind: 'otp'     , to }`                  → returns `{ otpRef }`
- `POST /api/whatsapp-verify-otp` `{ otpRef, otp }` → `{ verified }`

Order-status alerts are dispatched automatically by `updateOrderStatus`
in `src/services/orderService.ts`. OTPs and other security messages
are intentionally **not** mirrored to web push.

---

## 3. Video call (WebRTC)

No external provider is required for signaling — Firestore acts as the
signaling channel. STUN servers are public Google ones.

### Recommended addition
Add TURN credentials through env vars for users on restrictive NATs:

| Name | Required | Purpose |
|---|---|---|
| `VITE_TURN_URLS` | no | TURN server URL(s), comma-separated if needed |
| `VITE_TURN_USERNAME` | no | TURN username |
| `VITE_TURN_CREDENTIAL` | no | TURN credential/password |

If unset, the app still works with the default Google STUN servers.

### Routes
- `/call?to=<calleeUid>` — caller starts a fresh call.
- `/call/:callId`        — callee answers an existing call (open this
  URL from the FCM "incoming call" push payload).

### Current incoming-call flow
1. Caller invokes `startCall({ callerUid, calleeUid })`.
2. Caller posts to `/api/send-call-notification` with their Firebase ID token.
3. The Vercel function validates the caller, loads the callee's saved FCM tokens, and sends the incoming-call push.
4. The service worker `notificationclick` handler opens `/call/<callId>` and the callee page answers automatically.

### Gemini prompt generation

The admin prompt generator now runs through a Vercel serverless endpoint instead of exposing the Gemini key in client code.

| Name | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | yes | Server-side Gemini API key used by `/api/gemini-generate` |
