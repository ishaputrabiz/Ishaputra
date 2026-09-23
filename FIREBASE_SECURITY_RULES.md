# Firebase Security Rules

## Firestore Rules

Add these rules to your Firestore console (Firebase Console > Firestore Database > Rules):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is admin
    function isAdmin() {
      return request.auth != null && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Banner collection
    match /banners/{bannerId} {
      // Anyone can read active banners
      allow read: if true;
      
      // Only admins can create, update, or delete banners
      allow create, update, delete: if isAdmin();
      
      // Validate banner data structure on write
      allow write: if request.resource.data.keys().hasAll(['imageUrl', 'redirectLink', 'order', 'status']) &&
                      request.resource.data.imageUrl is string &&
                      request.resource.data.redirectLink is string &&
                      request.resource.data.order is number &&
                      request.resource.data.status in ['active', 'inactive'];
    }
    
    // Other collections...
    // Add your existing rules here
  }
}
```

## Storage Rules

Add these rules to your Firebase Storage console (Firebase Console > Storage > Rules):

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    
    // Helper function to check if user is admin
    function isAdmin() {
      return request.auth != null && 
             firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Homepage banners folder
    match /homepage-banners/{imageId} {
      // Anyone can read banner images
      allow read: if true;
      
      // Only admins can upload/delete banner images
      allow create, update, delete: if isAdmin();
      
      // Validate file size (max 5MB) and type on upload
      allow write: if request.resource.size < 5 * 1024 * 1024 &&
                      request.resource.contentType.matches('image/.*');
    }
    
    // Other storage paths...
    // Add your existing storage rules here
  }
}
```

## Important Notes

1. **Admin Role Setup**: Make sure you have a `users` collection in Firestore where each user document has a `role` field. Set `role: 'admin'` for admin users.

2. **Testing**: After deploying these rules, test them by:
   - Trying to view banners as a non-authenticated user (should work)
   - Trying to upload/delete as a non-admin user (should fail)
   - Logging in as admin and uploading/deleting (should work)

3. **Security Best Practices**:
   - Never expose admin credentials in client-side code
   - Use Firebase Admin SDK for server-side operations
   - Regularly audit your security rules
   - Monitor Firebase Console for unusual activity

4. **Deployment**:
   - Copy the Firestore rules to Firebase Console > Firestore Database > Rules
   - Copy the Storage rules to Firebase Console > Storage > Rules
   - Click "Publish" to deploy the rules

## Example Admin User Setup

To create an admin user, you can run this in Firebase Console > Firestore Database:

1. Go to `users` collection
2. Create/edit a document with the user's UID
3. Add field: `role` = `admin`

Or use Firebase Admin SDK server-side:

```typescript
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();
await db.collection('users').doc(userId).set({
  role: 'admin',
  email: 'admin@example.com',
  // other user fields...
}, { merge: true });
```
