// ============================================
// CLOUD FUNCTIONS: PASSWORD RESET SECURITY
// Production-grade server-side handlers
// For Firebase Cloud Functions v2
// ============================================

/**
 * DEPLOYMENT INSTRUCTIONS:
 * 
 * 1. Initialize Cloud Functions:
 *    npm install -g firebase-tools
 *    firebase init functions
 *    
 * 2. Install dependencies in functions/:
 *    cd functions
 *    npm install firebase-admin firebase-functions
 *    npm install @google-cloud/firestore
 *    npm install @sendgrid/mail  // For email notifications
 *    npm install axios  // For IP geolocation
 *    
 * 3. Deploy:
 *    firebase deploy --only functions
 * 
 * 4. Set environment variables:
 *    firebase functions:config:set sendgrid.key="YOUR_KEY"
 *    firebase functions:config:set ipstack.key="YOUR_KEY"
 */

// NOTE: These imports are for Cloud Functions deployment only.
// They are NOT installed in the frontend project.
// When deploying, move this file to functions/src/ and install these packages.
//
// import * as functions from 'firebase-functions';
// import * as admin from 'firebase-admin';
// import * as sgMail from '@sendgrid/mail';
// import axios from 'axios';

/* eslint-disable */
// @ts-nocheck
type functions = any;
type admin = any;
type sgMail = any;

admin.initializeApp();
const db = admin.firestore();

// ─── RATE LIMITING COLLECTION ────────────────

/**
 * Track password reset requests to prevent abuse
 */
const RESET_RATE_LIMITS = {
  MAX_REQUESTS_PER_HOUR: 3,
  MAX_REQUESTS_PER_DAY: 5,
  BLOCK_DURATION_HOURS: 24,
};

/**
 * Rate limit password reset requests
 * Triggered BEFORE Firebase sends reset email
 */
export const checkResetRateLimit = functions.https.onCall(async (data, context) => {
  const { email } = data;
  
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'Email is required');
  }

  const now = admin.firestore.Timestamp.now();
  const oneHourAgo = new Date(now.toDate().getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.toDate().getTime() - 24 * 60 * 60 * 1000);

  // Query rate limit collection
  const rateLimitDoc = await db.collection('passwordResetRateLimits').doc(email).get();
  
  if (rateLimitDoc.exists) {
    const data = rateLimitDoc.data()!;
    const requests = data.requests || [];
    
    // Check if blocked
    if (data.blockedUntil && data.blockedUntil.toDate() > now.toDate()) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Too many password reset attempts. Please try again later.'
      );
    }

    // Count recent requests
    const recentRequestsHour = requests.filter((r: any) => 
      r.timestamp.toDate() > oneHourAgo
    ).length;
    const recentRequestsDay = requests.filter((r: any) => 
      r.timestamp.toDate() > oneDayAgo
    ).length;

    if (recentRequestsHour >= RESET_RATE_LIMITS.MAX_REQUESTS_PER_HOUR) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Too many requests in the last hour. Please try again later.'
      );
    }

    if (recentRequestsDay >= RESET_RATE_LIMITS.MAX_REQUESTS_PER_DAY) {
      // Block for 24 hours
      await db.collection('passwordResetRateLimits').doc(email).update({
        blockedUntil: new Date(now.toDate().getTime() + RESET_RATE_LIMITS.BLOCK_DURATION_HOURS * 60 * 60 * 1000),
      });
      throw new functions.https.HttpsError(
        'permission-denied',
        'Too many password reset attempts. Account temporarily blocked.'
      );
    }
  }

  // Log this request
  await db.collection('passwordResetRateLimits').doc(email).set({
    requests: admin.firestore.FieldValue.arrayUnion({
      timestamp: now,
      ipAddress: context.rawRequest.ip,
      userAgent: context.rawRequest.headers['user-agent'],
    }),
    lastRequestAt: now,
  }, { merge: true });

  return { allowed: true };
});

// ─── LOG RESET REQUEST ───────────────────────

/**
 * Log password reset request (security audit)
 * Triggered when user requests password reset
 */
export const logPasswordResetRequest = functions.https.onCall(async (data, context) => {
  const { email } = data;
  
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'Email is required');
  }

  const ipAddress = context.rawRequest.ip || 'unknown';
  const userAgent = context.rawRequest.headers['user-agent'] || 'unknown';

  // Get IP geolocation
  let location = 'unknown';
  try {
    const ipstackKey = functions.config().ipstack?.key;
    if (ipstackKey) {
      const geoResponse = await axios.get(`http://api.ipstack.com/${ipAddress}?access_key=${ipstackKey}`);
      location = `${geoResponse.data.city}, ${geoResponse.data.country_name}`;
    }
  } catch (error) {
    console.error('Geolocation error:', error);
  }

  // Try to find user (but don't reveal if exists)
  let userId = null;
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    userId = userRecord.uid;
  } catch (error) {
    // User not found - don't reveal this in response
    console.log('Password reset requested for non-existent email:', email);
  }

  // Log to security collection
  await db.collection('securityLogs').add({
    type: 'password_reset_request',
    email,
    userId,
    ipAddress,
    userAgent,
    location,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    successful: userId !== null,
  });

  return { logged: true };
});

// ─── HANDLE PASSWORD RESET COMPLETE ──────────

/**
 * Triggered when user completes password reset
 * Firestore trigger on auth state change
 */
export const onPasswordResetComplete = functions.auth.user().onCreate(async (user) => {
  // Note: This is a simplified example
  // In production, use a custom event or admin SDK to detect password changes
  
  // Check if this is a password reset (not initial signup)
  const userDoc = await db.collection('users').doc(user.uid).get();
  
  if (userDoc.exists) {
    // Existing user - this is a password reset
    await handlePasswordResetCompleteForUser(user.uid, user.email!);
  }
});

/**
 * Alternative: HTTP trigger to be called from client after password reset
 */
export const confirmPasswordResetComplete = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  const email = context.auth.token.email!;

  await handlePasswordResetCompleteForUser(userId, email);

  return { success: true };
});

async function handlePasswordResetCompleteForUser(userId: string, email: string) {
  const ipAddress = 'server-side'; // Would get from context in real implementation

  // 1. Log audit event
  await db.collection('users').doc(userId).collection('auditLog').add({
    action: 'password_changed',
    description: 'Password reset via email link',
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    performedBy: userId,
    ipAddress,
    metadata: { method: 'email_reset' },
  });

  // 2. Log in login history
  await db.collection('users').doc(userId).collection('loginHistory').add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    method: 'email',
    status: 'success',
    ipAddress,
    deviceFingerprint: 'server-side',
    userAgent: 'Password Reset',
    location: 'unknown',
    isSuspicious: false,
    notes: 'Password reset completed',
  });

  // 3. Terminate all sessions
  const sessionsSnapshot = await db
    .collection('users')
    .doc(userId)
    .collection('sessions')
    .where('isActive', '==', true)
    .get();

  const batch = db.batch();
  sessionsSnapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
      isActive: false,
      terminatedAt: admin.firestore.FieldValue.serverTimestamp(),
      terminationReason: 'password_reset',
    });
  });
  await batch.commit();

  // 4. Reset failed login attempts
  await db.collection('users').doc(userId).update({
    'securitySettings.failedLoginAttempts': 0,
    'securitySettings.lastFailedLoginAt': null,
    'securitySettings.lockedUntil': null,
  });

  // 5. Send confirmation email
  await sendPasswordResetNotificationEmail(email);

  console.log('Password reset completed for user:', userId);
}

// ─── EMAIL NOTIFICATIONS ─────────────────────

/**
 * Send password reset confirmation email
 */
async function sendPasswordResetNotificationEmail(email: string) {
  const sendgridKey = functions.config().sendgrid?.key;
  
  if (!sendgridKey) {
    console.error('SendGrid API key not configured');
    return;
  }

  sgMail.setApiKey(sendgridKey);

  const msg = {
    to: email,
    from: 'security@sreerasthusilvers.com', // Your verified sender
    subject: '🔒 Your password has been changed - Sreerasthu Silvers',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; }
          .alert { background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; 
                   padding: 15px; margin: 20px 0; }
          .button { display: inline-block; background: #d97706; color: white; 
                    padding: 12px 30px; text-decoration: none; border-radius: 5px; 
                    font-weight: bold; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 Password Changed</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            
            <p>We're writing to confirm that your password for Sreerasthu Silvers was recently changed.</p>
            
            <div class="alert">
              <strong>⚠️ Security Notice:</strong>
              <ul>
                <li>Your password was successfully changed</li>
                <li>All active sessions have been logged out for security</li>
                <li>If you didn't make this change, contact us immediately</li>
              </ul>
            </div>
            
            <p><strong>Was this you?</strong></p>
            <p>If you made this change, no action is needed. You can now sign in with your new password.</p>
            
            <p><strong>This wasn't you?</strong></p>
            <p>If you didn't change your password, your account may be compromised. Please:</p>
            <ol>
              <li>Contact our support team immediately</li>
              <li>Reset your password again</li>
              <li>Enable two-factor authentication when available</li>
            </ol>
            
            <a href="https://yourapp.com/customer-support" class="button">Contact Support</a>
            
            <p>Stay safe,<br><strong>Sreerasthu Silvers Security Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated security notification.</p>
            <p>&copy; ${new Date().getFullYear()} Sreerasthu Silvers. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log('Password reset notification sent to:', email);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

// ─── FRAUD DETECTION ─────────────────────────

/**
 * Detect suspicious password reset patterns
 * Scheduled function runs every hour
 */
export const detectSuspiciousResetActivity = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Find IPs with excessive reset requests
    const recentLogs = await db
      .collection('securityLogs')
      .where('type', '==', 'password_reset_request')
      .where('timestamp', '>', oneHourAgo)
      .get();

    const ipCounts: Record<string, number> = {};
    recentLogs.docs.forEach((doc) => {
      const ip = doc.data().ipAddress;
      ipCounts[ip] = (ipCounts[ip] || 0) + 1;
    });

    // Flag suspicious IPs (>10 requests per hour)
    const suspiciousIPs = Object.entries(ipCounts)
      .filter(([_, count]) => count > 10)
      .map(([ip]) => ip);

    if (suspiciousIPs.length > 0) {
      console.warn('Suspicious password reset activity detected from IPs:', suspiciousIPs);
      
      // In production:
      // 1. Block these IPs
      // 2. Alert security team
      // 3. Require CAPTCHA for these IPs
      
      await db.collection('securityAlerts').add({
        type: 'suspicious_reset_activity',
        suspiciousIPs,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        resolved: false,
      });
    }

    return null;
  });

// ─── CLEANUP OLD RATE LIMIT DATA ────────────

/**
 * Clean up old rate limit data (runs daily)
 */
export const cleanupRateLimitData = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const oldDocs = await db
      .collection('passwordResetRateLimits')
      .where('lastRequestAt', '<', thirtyDaysAgo)
      .get();

    const batch = db.batch();
    oldDocs.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`Cleaned up ${oldDocs.size} old rate limit records`);

    return null;
  });

// ─── EXPORT FOR DEPLOYMENT ──────────────────

export const passwordResetSecurity = {
  checkResetRateLimit,
  logPasswordResetRequest,
  onPasswordResetComplete,
  confirmPasswordResetComplete,
  detectSuspiciousResetActivity,
  cleanupRateLimitData,
};
