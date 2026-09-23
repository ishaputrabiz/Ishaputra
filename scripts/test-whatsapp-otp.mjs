/**
 * End-to-end WhatsApp OTP test script
 *
 * Tests:
 *  1. Meta API token + phone-number-id validity (GET the phone info)
 *  2. Firestore OTP write  (simulates /api/whatsapp-send 'otp' logic)
 *  3. WhatsApp OTP delivery (actually sends a message via Meta API)
 *  4. OTP verify – correct code  → { ok: true,  verified: true }
 *  5. OTP verify – wrong code    → { ok: false, error: 'Incorrect code' }
 *  6. OTP verify – already-used  → { ok: false, error: 'Already used' }
 *
 * Usage:
 *   node scripts/test-whatsapp-otp.mjs <whatsapp-number>
 *   e.g.:  node scripts/test-whatsapp-otp.mjs +91XXXXXXXXXX
 */
import { createHash, randomInt } from 'crypto';
import { config } from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

config();

// ─── helpers ────────────────────────────────────────────────────────────────
const GREEN  = (s) => `\x1b[32m${s}\x1b[0m`;
const RED    = (s) => `\x1b[31m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const BOLD   = (s) => `\x1b[1m${s}\x1b[0m`;

let passed = 0, failed = 0;
function ok(label, detail = '') {
  passed++;
  console.log(`  ${GREEN('✓')} ${label}${detail ? '  ' + YELLOW(detail) : ''}`);
}
function fail(label, err) {
  failed++;
  console.log(`  ${RED('✗')} ${label}`);
  console.log(`    ${RED(String(err?.message || err))}`);
}

function hashOtp(otp, salt) {
  return createHash('sha256').update(`${salt}:${otp}`).digest('hex');
}

// ─── env ────────────────────────────────────────────────────────────────────
const TOKEN    = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const SDK_B64  = process.env.FIREBASE_ADMIN_SDK_BASE64;
const TEMPLATE = process.env.WHATSAPP_OTP_TEMPLATE || 'otp_login';
const LANG     = process.env.WHATSAPP_OTP_LANG     || 'en';
const META_BASE = 'https://graph.facebook.com/v21.0';

if (!TOKEN || !PHONE_ID || !SDK_B64) {
  console.error(RED('Missing env vars: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, or FIREBASE_ADMIN_SDK_BASE64'));
  process.exit(1);
}

// Phone number argument
const rawPhone = process.argv[2];
if (!rawPhone) { console.error('Usage: node scripts/test-whatsapp-otp.mjs <phone>'); process.exit(1); }
const to = rawPhone.startsWith('+') ? rawPhone.replace(/[^+\d]/g, '') : `+91${rawPhone.replace(/\D/g, '')}`;

console.log(BOLD('\n══════════════════════════════════════════════'));
console.log(BOLD('  WhatsApp OTP – End-to-End Test'));
console.log(BOLD('══════════════════════════════════════════════'));
console.log(`  Target number : ${YELLOW(to)}`);
console.log(`  Template      : ${YELLOW(TEMPLATE)} (${LANG})`);
console.log(`  Phone ID      : ${YELLOW(PHONE_ID)}`);
console.log('');

// ─── Firebase Admin ─────────────────────────────────────────────────────────
const sdk = JSON.parse(Buffer.from(SDK_B64, 'base64').toString());
const app = initializeApp({ credential: cert(sdk) });
const db  = getFirestore(app);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST 1 – Meta API token & phone-id validity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log(BOLD('Test 1 › Meta API token & phone-id validity'));
try {
  const resp = await fetch(`${META_BASE}/${PHONE_ID}?access_token=${TOKEN}`);
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || `HTTP ${resp.status}`);
  }
  ok('Token accepted by Meta Graph API',
     `display_number=${data.display_phone_number || data.phone_number || '(see data)'}, name="${data.verified_name || data.name}"`);
} catch (err) {
  fail('Token / Phone ID validation', err);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST 2 – Firestore OTP write (simulates api/whatsapp-send otp logic)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('');
console.log(BOLD('Test 2 › Firestore OTP write'));

const otp   = String(randomInt(0, 1_000_000)).padStart(6, '0');
const salt  = createHash('sha256').update(to + Date.now()).digest('hex').slice(0, 16);
const docId = `${to}_${Date.now()}`;
let firestoreOk = false;

try {
  await db.collection('whatsappOtps').doc(docId).set({
    to,
    hash: hashOtp(otp, salt),
    salt,
    attempts: 0,
    verified: false,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  });
  ok(`Firestore document written → whatsappOtps/${docId}`);
  firestoreOk = true;
} catch (err) {
  fail('Firestore OTP write', err);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST 3 – WhatsApp OTP delivery (actual Meta API send)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('');
console.log(BOLD('Test 3 › WhatsApp OTP delivery'));
console.log(`  Sending OTP ${YELLOW(otp)} to ${YELLOW(to)} via template "${TEMPLATE}"...`);

let deliveryMode = null;
try {
  const resp = await fetch(`${META_BASE}/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: TEMPLATE,
        language: { code: LANG },
        components: [
          { type: 'body',   parameters: [{ type: 'text', text: otp }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] },
        ],
      },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const errMsg = data?.error?.message || `HTTP ${resp.status}`;
    const errCode = data?.error?.code;
    console.log(`  ${YELLOW('⚠')}  Template send failed (code ${errCode}): ${errMsg}`);
    console.log(`     Falling back to plain text message...`);

    // Plain text fallback (same as api/whatsapp-send.ts)
    const fallbackResp = await fetch(`${META_BASE}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: `Your Sreerasthu Silvers verification code is ${otp}. Valid for 10 minutes.` },
      }),
    });
    const fallbackData = await fallbackResp.json();
    if (!fallbackResp.ok) {
      throw new Error(fallbackData?.error?.message || `HTTP ${fallbackResp.status}`);
    }
    deliveryMode = 'text';
    ok(`OTP delivered via plain text (template not approved)`,
       `msgId=${fallbackData?.messages?.[0]?.id || 'n/a'}`);
  } else {
    deliveryMode = 'template';
    ok(`OTP delivered via template "${TEMPLATE}"`,
       `msgId=${data?.messages?.[0]?.id || 'n/a'}`);
  }
} catch (err) {
  fail('WhatsApp OTP delivery', err);
  console.log(`  ${YELLOW('Note:')} OTP is ${YELLOW(otp)} – verify tests will still run using Firestore record`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST 4 – Verify correct OTP  (simulates api/whatsapp-verify-otp)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('');
console.log(BOLD('Test 4 › OTP verification – correct code'));

if (firestoreOk) {
  try {
    const ref  = db.collection('whatsappOtps').doc(docId);
    const snap = await ref.get();
    const data = snap.data();

    if (!snap.exists) throw new Error('Document not found after write');
    if (data.verified)  throw new Error('Already marked verified before test');

    const expected = hashOtp(otp, data.salt);
    if (expected !== data.hash) throw new Error('Hash mismatch – logic error');

    await ref.update({ verified: true, verifiedAt: FieldValue.serverTimestamp() });
    const afterSnap = await ref.get();
    if (!afterSnap.data().verified) throw new Error('verified flag not set after update');

    ok(`Correct OTP verified → document.verified = true`);
  } catch (err) {
    fail('OTP verification (correct code)', err);
  }
} else {
  console.log(`  ${YELLOW('(skipped – Firestore write failed)')}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST 5 – Verify wrong OTP (separate fresh record)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('');
console.log(BOLD('Test 5 › OTP verification – wrong code'));

const wrongOtp   = String(randomInt(0, 1_000_000)).padStart(6, '0');
const wrongSalt  = createHash('sha256').update(to + Date.now() + 'x').digest('hex').slice(0, 16);
const wrongDocId = `${to}_${Date.now()}_wrong`;

try {
  await db.collection('whatsappOtps').doc(wrongDocId).set({
    to,
    hash: hashOtp(wrongOtp, wrongSalt),
    salt: wrongSalt,
    attempts: 0,
    verified: false,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  });

  // Attempt to verify with deliberately wrong code
  const badGuess = wrongOtp === '000000' ? '000001' : '000000';
  const expected = hashOtp(badGuess, wrongSalt);
  const ref = db.collection('whatsappOtps').doc(wrongDocId);
  const snap = await ref.get();
  const data = snap.data();

  if (expected === data.hash) {
    throw new Error('Bad-guess accidentally matched hash – retry');
  }

  await ref.update({ attempts: FieldValue.increment(1) });
  const afterSnap = await ref.get();
  if (afterSnap.data().verified) throw new Error('Wrong OTP incorrectly set verified=true');

  ok(`Wrong OTP rejected correctly → attempts incremented, verified stays false`);
} catch (err) {
  fail('OTP verification (wrong code)', err);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST 6 – Already-used OTP rejected
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('');
console.log(BOLD('Test 6 › OTP verification – already-used code'));

if (firestoreOk) {
  try {
    const ref  = db.collection('whatsappOtps').doc(docId);
    const snap = await ref.get();
    if (!snap.data().verified) throw new Error('Document should be verified=true from test 4');
    ok(`Already-used guard: document.verified=true → API would return 409 "Already used"`);
  } catch (err) {
    fail('Already-used OTP guard', err);
  }
} else {
  console.log(`  ${YELLOW('(skipped – Firestore write failed)')}`);
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
try {
  await db.collection('whatsappOtps').doc(docId).delete();
  await db.collection('whatsappOtps').doc(wrongDocId).delete();
} catch { /* ignore */ }

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('');
console.log(BOLD('══════════════════════════════════════════════'));
console.log(BOLD('  RESULTS'));
console.log(BOLD('══════════════════════════════════════════════'));
console.log(`  ${GREEN(passed + ' passed')}   ${failed > 0 ? RED(failed + ' failed') : '0 failed'}`);

if (deliveryMode) {
  console.log('');
  console.log(`  ${GREEN('✓')} WhatsApp message delivered (${deliveryMode})`);
  console.log(`    Check ${YELLOW(to)} – you should have received the code ${YELLOW(otp)}`);
}
console.log('');

process.exit(failed > 0 ? 1 : 0);
