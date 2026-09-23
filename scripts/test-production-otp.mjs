/**
 * Production WhatsApp OTP end-to-end test
 *
 * Hits the LIVE Vercel deployment's /api/* endpoints — NOT local functions.
 * This proves the serverless functions are reachable (vercel.json rewrite fix)
 * and that the full OTP flow works in production.
 *
 * Tests:
 *  1. Health-check: GET production /api/whatsapp-send returns 405 (not 200 HTML)
 *  2. Send OTP via production → receives { ok: true, otpRef }
 *  3. Verify correct OTP      → receives { ok: true, verified: true }
 *  4. Replay guard            → second verify rejects with "Already used" / "Incorrect"
 *
 * Usage:
 *   node scripts/test-production-otp.mjs [phone] [prod-url]
 *   e.g. node scripts/test-production-otp.mjs 98XXXXXXXX https://your-store.vercel.app
 *
 * The script intercepts the OTP by reading the Firestore doc it created.
 * Local .env credentials are only used to READ Firestore — the actual
 * OTP SEND and VERIFY go through the production serverless functions.
 */
import { config } from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

config();

// ─── colours ───────────────────────────────────────────────────────────────
const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const B = (s) => `\x1b[1m${s}\x1b[0m`;
const C = (s) => `\x1b[36m${s}\x1b[0m`;

let passed = 0, failed = 0;
function ok(label, detail = '') {
  passed++;
  console.log(`  ${G('✓')} ${label}${detail ? '  ' + Y(detail) : ''}`);
}
function fail(label, err) {
  failed++;
  console.log(`  ${R('✗')} ${label}`);
  console.log(`    ${R(String(err?.message || err))}`);
  if (err?.hint) console.log(`    ${Y('hint:')} ${err.hint}`);
}
function info(msg) {
  console.log(`  ${C('ℹ')} ${msg}`);
}

// ─── config ────────────────────────────────────────────────────────────────
const rawPhone = process.argv[2];
const PROD_URL = (process.argv[3] || process.env.VITE_SITE_URL || '').replace(/\/$/, '');
if (!rawPhone || !PROD_URL) {
  console.error('Usage: node scripts/test-production-otp.mjs <phone> [site-url]  (site-url defaults to VITE_SITE_URL)');
  process.exit(1);
}
const SDK_B64  = process.env.FIREBASE_ADMIN_SDK_BASE64;

if (!SDK_B64) {
  console.error(R('Missing env var: FIREBASE_ADMIN_SDK_BASE64'));
  process.exit(1);
}

// Normalize phone for API (no + for the API, it normalizes internally)
const phoneDigits = rawPhone.replace(/\D/g, '');
// API's normalizePhoneNumber: 10-digit → add 91 prefix
const normalizedFor_api = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;

// Firestore subscription (local admin SDK — just to read the OTP hash)
const sdk = JSON.parse(Buffer.from(SDK_B64, 'base64').toString());
const app = initializeApp({ credential: cert(sdk) });
const db  = getFirestore(app);

console.log(B('\n══════════════════════════════════════════════════════'));
console.log(B('  WhatsApp OTP — PRODUCTION End-to-End Test'));
console.log(B('══════════════════════════════════════════════════════'));
console.log(`  Production URL : ${Y(PROD_URL)}`);
console.log(`  Test phone     : ${Y(normalizedFor_api)}`);
console.log('');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST 1 — Health check: vercel.json rewrite fix
//           GET /api/whatsapp-send should return 405 (Method Not Allowed),
//           NOT 200 with HTML (which would mean the SPA rewrite swallowed it)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log(B('Test 1 › vercel.json rewrite — /api/* not swallowed by SPA'));
try {
  const resp = await fetch(`${PROD_URL}/api/whatsapp-send`, { method: 'GET' });
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('text/html')) {
    const snippet = (await resp.text()).slice(0, 80);
    throw Object.assign(
      new Error(`Got HTML back (status ${resp.status}) — vercel.json rewrite has NOT deployed yet!`),
      { hint: `Wait for Vercel deployment to finish, then re-run. Body: ${snippet}` }
    );
  }
  if (resp.status === 405) {
    ok('API endpoint reachable (returned 405 Not Allowed, not HTML)', `status=${resp.status}`);
  } else if (resp.status === 200 || resp.status === 400) {
    ok('API endpoint reachable and running', `status=${resp.status} content-type=${ct}`);
  } else {
    throw new Error(`Unexpected status ${resp.status} (content-type: ${ct})`);
  }
} catch (err) {
  fail('API health check', err);
  console.log(R('\n  ⛔ API not reachable. Cannot continue — all other tests would fail.'));
  process.exit(1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST 2 — Send OTP via production endpoint
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('');
console.log(B('Test 2 › Send OTP via production /api/whatsapp-send'));

let otpRef = null;
let sentAt = null;

try {
  const sendBody = { kind: 'otp', to: normalizedFor_api };
  info(`POST ${PROD_URL}/api/whatsapp-send  body=${JSON.stringify(sendBody)}`);

  const resp = await fetch(`${PROD_URL}/api/whatsapp-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sendBody),
  });
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok || !data.ok) {
    const msg = data?.error || data?.message || `HTTP ${resp.status}`;
    const hint = data?.hint || data?.templateError || '';
    throw Object.assign(new Error(msg), { hint });
  }

  otpRef = data.otpRef;
  sentAt = Date.now();
  ok(`OTP sent successfully`, `otpRef=${otpRef}  mode=${data.mode || 'n/a'}`);
  if (data._debug) {
    info(`Server used template="${data._debug.templateName}"  lang="${data._debug.templateLang}"`);
  }
  if (data.templateError) {
    info(`Template error (fell back to text): ${Y(data.templateError)}`);
  }
  if (data.metaErrorDetails) {
    info(`Meta error details: ${Y(JSON.stringify(data.metaErrorDetails, null, 2))}`);
  }
  info(`WhatsApp message should have been delivered to +${normalizedFor_api}`);
} catch (err) {
  fail('Send OTP (production)', err);
  console.log(R('\n  ⛔ Send failed. Cannot run verify tests.'));
  process.exit(1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Read actual OTP from Firestore (so we can verify without knowing the code)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('');
info('Reading Firestore to extract OTP hash for automated verify test...');

let realOtp = null;
try {
  // The docId is the otpRef. Read the hash + salt; then brute-force 000000–999999
  // (6-digit space is only 1M — trivial for testing).
  const snap = await db.collection('whatsappOtps').doc(otpRef).get();
  if (!snap.exists) throw new Error(`Document whatsappOtps/${otpRef} not found in Firestore`);
  const { hash, salt } = snap.data();

  // Brute-force the OTP (testing only — client-side brute force is fine for 6 digits)
  const { createHash } = await import('crypto');
  for (let i = 0; i <= 999999; i++) {
    const candidate = String(i).padStart(6, '0');
    const h = createHash('sha256').update(`${salt}:${candidate}`).digest('hex');
    if (h === hash) {
      realOtp = candidate;
      break;
    }
  }

  if (!realOtp) throw new Error('Could not derive OTP from Firestore hash (unexpected)');
  ok(`Derived OTP from Firestore hash`, `OTP=${Y(realOtp)}`);
} catch (err) {
  fail('Read OTP from Firestore', err);
  process.exit(1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST 3 — Verify correct OTP via production endpoint
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('');
console.log(B('Test 3 › Verify correct OTP via production /api/whatsapp-verify-otp'));

try {
  info(`POST ${PROD_URL}/api/whatsapp-verify-otp  otpRef=${otpRef}  otp=${realOtp}`);
  const resp = await fetch(`${PROD_URL}/api/whatsapp-verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otpRef, otp: realOtp }),
  });
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok || !data.ok || !data.verified) {
    throw new Error(data?.error || `HTTP ${resp.status} — verified=${data?.verified}`);
  }
  ok('Correct OTP accepted → verified=true', `to=${data.to || normalizedFor_api}`);
} catch (err) {
  fail('Verify correct OTP (production)', err);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST 4 — Replay guard: same OTP should now be rejected
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('');
console.log(B('Test 4 › Replay guard — already-used OTP rejected'));

try {
  const resp = await fetch(`${PROD_URL}/api/whatsapp-verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otpRef, otp: realOtp }),
  });
  const data = await resp.json().catch(() => ({}));

  // Should be rejected — either already-used or wrong-code error
  if (data?.verified === true) {
    throw new Error('Replay was accepted! OTP should have been marked used after Test 3.');
  }
  ok('Replay correctly rejected', `error="${data?.error || '(non-ok response)'}"`);
} catch (err) {
  fail('Replay guard (production)', err);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Summary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('');
console.log(B('══════════════════════════════════════════════════════'));
const total = passed + failed;
if (failed === 0) {
  console.log(G(`  ✓ All ${total}/${total} tests passed — production OTP is working!`));
} else {
  console.log(R(`  ✗ ${failed}/${total} test(s) failed`));
  console.log('');
  console.log(Y('  Checklist:'));
  console.log(Y('  1. Vercel env vars set: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, FIREBASE_ADMIN_SDK_BASE64'));
  console.log(Y('  2. WHATSAPP_OTP_LANG = en_US  (must match template language in Meta dashboard)'));
  console.log(Y('  3. Template "otp_login" approved in Meta Business Manager'));
  console.log(Y('  4. Wait ~1 min for latest Vercel deployment to finish, then retry'));
}
console.log(B('══════════════════════════════════════════════════════'));
console.log('');
process.exit(failed > 0 ? 1 : 0);
