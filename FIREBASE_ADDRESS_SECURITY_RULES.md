# Firebase Security Rules Update - Address Management

## Overview
This guide provides the necessary Firebase Firestore security rules to secure the newly implemented address management system in Sree Rasthu Silvers.

## New Collection Structure
- **Path**: `/users/{userId}/addresses/{addressId}`
- **Purpose**: Store user delivery addresses for checkout

## Required Security Rules

Add the following rules to your `firestore.rules` file:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Existing user rules
    match /users/{userId} {
      // Users can read their own profile
      allow read: if request.auth != null && request.auth.uid == userId;
      
      // Users can update their own profile
      allow update: if request.auth != null && request.auth.uid == userId;
      
      // Only authenticated users can create their profile
      allow create: if request.auth != null && request.auth.uid == userId;
      
      // ═══════════════════════════════════════════════
      // NEW: Address Sub-collection Rules
      // ═══════════════════════════════════════════════
      match /addresses/{addressId} {
        // Users can read their own addresses
        allow read: if request.auth != null && request.auth.uid == userId;
        
        // Users can create their own addresses
        allow create: if request.auth != null && 
                        request.auth.uid == userId &&
                        request.resource.data.userId == userId &&
                        request.resource.data.keys().hasAll([
                          'fullName', 'phoneNumber', 'pinCode', 
                          'address', 'city', 'state', 'isDefault',
                          'createdAt', 'updatedAt'
                        ]);
        
        // Users can update their own addresses
        allow update: if request.auth != null && 
                        request.auth.uid == userId &&
                        resource.data.userId == userId;
        
        // Users can delete their own addresses
        allow delete: if request.auth != null && 
                        request.auth.uid == userId &&
                        resource.data.userId == userId;
      }
    }
    
    // Existing product rules (keep as is)
    match /products/{productId} {
      allow read: if true;
      allow write: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Add more rules as needed...
  }
}
```

## Rule Explanation

### Address Read Access
```javascript
allow read: if request.auth != null && request.auth.uid == userId;
```
- **Purpose**: Users can only read their own addresses
- **Security**: Prevents unauthorized access to other users' addresses

### Address Create Access
```javascript
allow create: if request.auth != null && 
                request.auth.uid == userId &&
                request.resource.data.userId == userId &&
                request.resource.data.keys().hasAll([...]);
```
- **Purpose**: Users can create addresses under their own user document
- **Validation**: Ensures all required fields are present
- **Security**: Prevents creating addresses for other users

### Address Update Access
```javascript
allow update: if request.auth != null && 
                request.auth.uid == userId &&
                resource.data.userId == userId;
```
- **Purpose**: Users can update their own addresses
- **Security**: Double-checks ownership via both path and data

### Address Delete Access
```javascript
allow delete: if request.auth != null && 
                request.auth.uid == userId &&
                resource.data.userId == userId;
```
- **Purpose**: Users can delete their own addresses
- **Security**: Ensures only the owner can delete

## Testing Security Rules

### 1. Test Read Access
```javascript
// Should succeed - reading own address
firebase.firestore()
  .collection('users')
  .doc(currentUserId)
  .collection('addresses')
  .get();

// Should fail - reading another user's address
firebase.firestore()
  .collection('users')
  .doc(otherUserId)
  .collection('addresses')
  .get();
```

### 2. Test Create Access
```javascript
// Should succeed - creating own address
firebase.firestore()
  .collection('users')
  .doc(currentUserId)
  .collection('addresses')
  .add({
    userId: currentUserId,
    fullName: "John Doe",
    phoneNumber: "1234567890",
    pinCode: "123456",
    address: "123 Street",
    city: "City",
    state: "State",
    isDefault: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
```

## Deployment Steps

1. **Backup Current Rules**
   ```bash
   # Download current rules first
   firebase firestore:indexes > firestore.backup.rules
   ```

2. **Update Rules File**
   - Open `firestore.rules` in your project
   - Add the address sub-collection rules as shown above
   - Keep all existing rules intact

3. **Deploy to Firebase**
   ```bash
   # Test in Firebase emulator first (recommended)
   firebase emulators:start --only firestore

   # Deploy to production
   firebase deploy --only firestore:rules
   ```

4. **Verify Rules**
   - Go to Firebase Console → Firestore Database → Rules
   - Check that rules are deployed
   - Review the Rules Playground to test scenarios

## Common Issues & Solutions

### Issue 1: "Missing or insufficient permissions"
**Cause**: User not authenticated or trying to access another user's data
**Solution**: Ensure user is signed in and accessing their own addresses

### Issue 2: "Document creation failed"
**Cause**: Missing required fields in address document
**Solution**: Ensure all required fields are present (fullName, phoneNumber, pinCode, address, city, state, isDefault, createdAt, updatedAt)

### Issue 3: "Cannot set default address"
**Cause**: Trying to update isDefault field without proper permissions
**Solution**: Rules allow updates - check that userId matches in both path and document

## Best Practices

1. **Always Authenticate**
   - Ensure users are signed in before accessing addresses
   - Check `request.auth != null` in all rules

2. **Validate Data**
   - Use `hasAll()` to ensure required fields exist
   - Add custom validation for phone numbers, pin codes if needed

3. **Minimize Permissions**
   - Only grant necessary access
   - Never use `allow read, write: if true` for user data

4. **Test Thoroughly**
   - Use Firebase emulator for local testing
   - Test both success and failure scenarios
   - Verify cross-user access is blocked

## Production Checklist

- [ ] Backup existing Firestore rules
- [ ] Add address sub-collection rules
- [ ] Test rules in Firebase emulator
- [ ] Verify all required fields are validated
- [ ] Test user authentication requirements
- [ ] Deploy to Firebase production
- [ ] Monitor Firestore logs for rule violations
- [ ] Verify checkout flow works with new addresses

## Support

If you encounter issues with the security rules:
1. Check Firebase Console → Firestore → Rules → Logs
2. Use Rules Playground to test specific scenarios
3. Verify user authentication is working correctly
4. Ensure all required fields are being sent in requests

---

**Last Updated**: February 9, 2026
**Version**: 1.0
**Author**: Sree Rasthu Silvers Development Team
