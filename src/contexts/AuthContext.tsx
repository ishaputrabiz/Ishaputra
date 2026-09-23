import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { PushNotifications } from '@/services/pushNotificationService';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { recordLoginAttempt } from '@/services/securityService';
import { isManagedImageUrl } from '@/lib/mediaUrl';

// Types
export interface UserProfile {
  uid: string;
  email: string | null;
  username: string;
  role: 'user' | 'admin' | 'delivery';
  createdAt: Date;
  updatedAt: Date;
  phone?: string;
  whatsappNumber?: string;
  avatar?: string;
  // Delivery boy specific fields
  name?: string;
  vehicleType?: 'bike' | 'cycle' | 'van';
  address?: string;
  isActive?: boolean;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isDelivery: boolean;
  signup: (email: string, password: string, username: string, phone?: string, sameForWhatsApp?: boolean) => Promise<void>;
  login: (email: string, password: string) => Promise<UserProfile>;
  loginWithGoogle: () => Promise<UserProfile>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const lastSessionKeyRef = useRef<string | null>(null);

  const getLoginMethod = (firebaseUser: User): 'email' | 'google' => {
    const providerIds = firebaseUser.providerData.map((provider) => provider.providerId);
    return providerIds.includes('google.com') ? 'google' : 'email';
  };

  const recordSessionLogin = (firebaseUser: User) => {
    if (typeof window === 'undefined') return;

    const sessionKey = `auth-session-login:${firebaseUser.uid}`;
    lastSessionKeyRef.current = sessionKey;
    if (sessionStorage.getItem(sessionKey)) return;

    sessionStorage.setItem(sessionKey, '1');
    recordLoginAttempt(firebaseUser.uid, getLoginMethod(firebaseUser), 'success').catch(() => {
      sessionStorage.removeItem(sessionKey);
    });
  };

  // Fetch user profile from Firestore
  const fetchUserProfile = async (uid: string): Promise<UserProfile | null> => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        // Handle delivery boy profiles that might use 'name' instead of 'username'
        return {
          ...data,
          uid: data.uid || uid,
          username: data.username || data.name || data.email?.split('@')[0] || 'User',
          // Convert Firestore Timestamp to Date
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        } as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  };

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Reload user to get fresh emailVerified status
        try {
          await firebaseUser.reload();
          // Get the updated user after reload
          const updatedUser = auth.currentUser;
          setUser(updatedUser);
          
          if (updatedUser) {
            const profile = await fetchUserProfile(updatedUser.uid);
            recordSessionLogin(updatedUser);

            if (profile?.role !== 'admin') {
              // Register for FCM push notifications (best-effort, non-blocking)
              PushNotifications.requestPermissionAndRegisterToken(updatedUser.uid).catch(() => {});
              PushNotifications.subscribeForegroundMessages(({ title, body, data }) => {
                if (typeof window === 'undefined' || !title) return;
                if (data?.type === 'order-placed') return;
                if (document.visibilityState === 'visible') {
                  // User is actively on the page — show in-app toast
                  toast(title, { description: body });
                } else {
                  // Page is backgrounded — use native Notification API
                  if ('Notification' in window && Notification.permission === 'granted') {
                    try { new Notification(title, { body }); } catch { /* ignore */ }
                  }
                }
              }).catch(() => {});
            }
            
            // Only sync Google photoURL if user doesn't have a custom avatar
            // (uploaded to our storage, or a legacy Cloudinary URL). This
            // prevents overwriting custom uploaded avatars.
            const hasCustomAvatar =
              !!profile?.avatar && (profile.avatar.includes('cloudinary') || isManagedImageUrl(profile.avatar));
            
            if (updatedUser.photoURL && profile && !hasCustomAvatar && profile.avatar !== updatedUser.photoURL) {
              try {
                await setDoc(doc(db, 'users', updatedUser.uid), {
                  avatar: updatedUser.photoURL,
                  updatedAt: serverTimestamp(),
                }, { merge: true });
                
                setUserProfile({ ...profile, avatar: updatedUser.photoURL });
              } catch (syncError) {
                console.error('Error syncing avatar:', syncError);
                setUserProfile(profile);
              }
            } else {
              setUserProfile(profile);
            }
          }
        } catch (error) {
          console.error('Error reloading user:', error);
          setUser(firebaseUser);
          const profile = await fetchUserProfile(firebaseUser.uid);
          setUserProfile(profile);
        }
      } else {
        if (typeof window !== 'undefined' && lastSessionKeyRef.current) {
          sessionStorage.removeItem(lastSessionKeyRef.current);
          lastSessionKeyRef.current = null;
        }
        setUser(null);
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Signup function
  const signup = async (email: string, password: string, username: string, phone?: string, sameForWhatsApp?: boolean) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const { uid } = userCredential.user;

    // Update display name
    await updateProfile(userCredential.user, { displayName: username });

    // Create user document in Firestore
    const userProfileData: UserProfile = {
      uid,
      email,
      username,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(phone && { phone }),
      ...(phone && sameForWhatsApp && { whatsappNumber: phone }),
    };

    await setDoc(doc(db, 'users', uid), {
      ...userProfileData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setUserProfile(userProfileData);
  };

  // Login function
  const login = async (email: string, password: string): Promise<UserProfile> => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const { uid } = userCredential.user;
    let profile = await fetchUserProfile(uid);

    if (!profile) {
      // No Firestore document yet - create an ordinary CUSTOMER profile.
      //
      // This used to create an ADMIN profile, "for admins added in the Firebase
      // console". But anyone can create a bare Firebase Auth account with the
      // site's public API key in a single request, and this login is shared by
      // the storefront and the admin panel - so signing in with such an account
      // handed out full admin rights. Admin is now granted only by setting
      // `role: 'admin'` on the user's document, which the security rules
      // restrict to existing admins.
      const newProfile: UserProfile = {
        uid,
        email: userCredential.user.email,
        username: userCredential.user.displayName || email.split('@')[0],
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await setDoc(doc(db, 'users', uid), {
        ...newProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      profile = newProfile;
    }

    setUserProfile(profile);
    return profile;
  };
  const loginWithGoogle = async (): Promise<UserProfile> => {
    try {
      const provider = new GoogleAuthProvider();
      // Add additional scopes if needed
      provider.addScope('profile');
      provider.addScope('email');
      
      // Set custom parameters to ensure the account selection prompt
      provider.setCustomParameters({
        prompt: 'select_account'
      });

      const userCredential = await signInWithPopup(auth, provider);
      const { uid, email, displayName, photoURL } = userCredential.user;

      // Check if user profile exists
      let profile = await fetchUserProfile(uid);

      if (!profile) {
        // Create new profile for first-time Google users
        const userProfileData: UserProfile = {
          uid,
          email,
          username: displayName || email?.split('@')[0] || 'User',
          role: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
          avatar: photoURL || undefined,
        };

        await setDoc(doc(db, 'users', uid), {
          ...userProfileData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        profile = userProfileData;
      } else {
        // Update avatar for existing Google users to ensure photoURL is synced
        if (photoURL && profile.avatar !== photoURL) {
          await setDoc(doc(db, 'users', uid), {
            avatar: photoURL,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          
          profile = { ...profile, avatar: photoURL };
        }
      }

      setUserProfile(profile);
      return profile;
    } catch (error: unknown) {
      console.error('Google Sign-In Error:', error);
      if (error && typeof error === 'object') {
        const firebaseError = error as { code?: unknown; message?: unknown };
        console.error('Error code:', firebaseError.code);
        console.error('Error message:', firebaseError.message);
      }
      throw error; // Re-throw to be handled by the UI
    }
  };

  // Logout function
  const logout = async () => {
    if (typeof window !== 'undefined' && lastSessionKeyRef.current) {
      sessionStorage.removeItem(lastSessionKeyRef.current);
      lastSessionKeyRef.current = null;
    }
    await signOut(auth);
    setUser(null);
    setUserProfile(null);
  };

  // Reset password
  const resetPassword = async (email: string) => {
    const actionCodeSettings = {
      url: `${window.location.origin}/`,
      handleCodeInApp: false,
    };
    await sendPasswordResetEmail(auth, email, actionCodeSettings);
  };

  // Update user profile
  const updateUserProfile = async (data: Partial<UserProfile>) => {
    if (!user) throw new Error('No user logged in');

    await setDoc(doc(db, 'users', user.uid), {
      ...data,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    const updatedProfile = await fetchUserProfile(user.uid);
    setUserProfile(updatedProfile);
  };

  const value: AuthContextType = {
    user,
    userProfile,
    loading,
    isAdmin: userProfile?.role === 'admin',
    isDelivery: userProfile?.role === 'delivery',
    signup,
    login,
    loginWithGoogle,
    logout,
    resetPassword,
    updateUserProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
