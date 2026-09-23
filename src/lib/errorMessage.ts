/**
 * Turn a thrown value into something an admin can act on.
 *
 * Every write in the admin panel used to fail with a fixed string - "Failed to
 * update product", "Failed to save" - which is indistinguishable whether the
 * cause was a bad field, an expired session, a blocked security rule or the
 * daily Firestore quota. The underlying error almost always says exactly what
 * went wrong; this maps the common Firebase codes to plain English and falls
 * back to the raw message rather than swallowing it.
 */

const FIREBASE_CODE_MESSAGES: Record<string, string> = {
  'permission-denied':
    "You don't have permission for this change. Sign out and back in, or check the admin account.",
  unauthenticated: 'Your session expired. Sign in again and retry.',
  'resource-exhausted':
    'Firebase quota exceeded for today. It resets at midnight Pacific time.',
  unavailable: 'Could not reach the database. Check your internet connection and retry.',
  'deadline-exceeded': 'The database took too long to respond. Retry in a moment.',
  'not-found': 'That record no longer exists — it may have been deleted elsewhere.',
  'already-exists': 'A record with that id already exists.',
  cancelled: 'The request was cancelled before it finished.',
  'failed-precondition':
    'The database rejected this query (a Firestore index may be missing — the console link in the browser log creates it).',
};

/** Firebase errors carry a `code`; plain Errors do not. */
const codeOf = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown })?.code;
  if (typeof code !== 'string') return undefined;
  // Firestore reports "permission-denied"; Auth reports "auth/wrong-password".
  return code.includes('/') ? code.split('/')[1] : code;
};

export function describeError(error: unknown, fallback = 'Something went wrong.'): string {
  if (!error) return fallback;

  const code = codeOf(error);
  if (code && FIREBASE_CODE_MESSAGES[code]) return FIREBASE_CODE_MESSAGES[code];

  // "invalid-argument" messages name the offending field, so they are the most
  // useful thing we can show - keep them verbatim.
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;

  return fallback;
}
