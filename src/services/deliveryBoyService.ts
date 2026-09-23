import { 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  getDocs, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
  QuerySnapshot,
  DocumentData
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  deleteUser as deleteAuthUser,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { auth, secondaryAuth, db } from '@/config/firebase';

export interface DeliveryBoy {
  id: string;
  name: string;
  email: string;
  phone: string;
  vehicleType: 'bike' | 'cycle' | 'van';
  address: string;
  profileImage?: string;
  isActive: boolean;
  currentOrdersCount: number;
  totalDeliveries: number;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryBoyFormData {
  name: string;
  email: string;
  phone: string;
  password: string;
  vehicleType: 'bike' | 'cycle' | 'van';
  address: string;
  profileImage?: string;
  isActive: boolean;
}

/**
 * Create a new delivery boy with Firebase Authentication and Firestore
 * Uses secondary auth instance to avoid logging out the admin
 */
export const createDeliveryBoy = async (data: DeliveryBoyFormData): Promise<string> => {
  try {
    // Create user in Firebase Authentication using secondary auth
    // This prevents the admin from being logged out
    const userCredential = await createUserWithEmailAndPassword(
      secondaryAuth,
      data.email,
      data.password
    );
    
    const uid = userCredential.user.uid;

    // Create user document in Firestore
    const deliveryBoyData: Omit<DeliveryBoy, 'id'> = {
      name: data.name,
      email: data.email,
      phone: data.phone,
      vehicleType: data.vehicleType,
      address: data.address,
      profileImage: data.profileImage || '',
      isActive: data.isActive,
      currentOrdersCount: 0,
      totalDeliveries: 0,
      rating: 5.0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await setDoc(doc(db, 'users', uid), {
      ...deliveryBoyData,
      role: 'delivery',
      uid,
      username: data.name, // Add username field for compatibility
    });

    // Sign out from secondary auth (doesn't affect main auth session)
    await signOut(secondaryAuth);

    console.log('✅ Delivery boy created successfully:', uid);
    return uid;
  } catch (error: any) {
    console.error('❌ Error creating delivery boy:', error);
    // Sign out from secondary auth in case of error
    try {
      await signOut(secondaryAuth);
    } catch (e) {
      // Ignore sign out errors
    }
    throw new Error(error.message || 'Failed to create delivery boy');
  }
};

/**
 * Get all delivery boys
 */
export const getAllDeliveryBoys = async (): Promise<DeliveryBoy[]> => {
  try {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'delivery'),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const deliveryBoys: DeliveryBoy[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      deliveryBoys.push({
        id: doc.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        vehicleType: data.vehicleType,
        address: data.address,
        profileImage: data.profileImage || '',
        isActive: data.isActive ?? true,
        currentOrdersCount: data.currentOrdersCount || 0,
        totalDeliveries: data.totalDeliveries || 0,
        rating: data.rating || 5.0,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      });
    });

    return deliveryBoys;
  } catch (error: any) {
    console.error('❌ Error fetching delivery boys:', error);
    throw new Error(error.message || 'Failed to fetch delivery boys');
  }
};

/**
 * Subscribe to delivery boys in real-time
 */
export const subscribeToDeliveryBoys = (
  onUpdate: (deliveryBoys: DeliveryBoy[]) => void,
  onError: (error: Error) => void
) => {
  try {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'delivery'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot: QuerySnapshot<DocumentData>) => {
        const deliveryBoys: DeliveryBoy[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          deliveryBoys.push({
            id: doc.id,
            name: data.name,
            email: data.email,
            phone: data.phone,
            vehicleType: data.vehicleType,
            address: data.address,
            profileImage: data.profileImage || '',
            isActive: data.isActive ?? true,
            currentOrdersCount: data.currentOrdersCount || 0,
            totalDeliveries: data.totalDeliveries || 0,
            rating: data.rating || 5.0,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
          });
        });

        onUpdate(deliveryBoys);
      },
      (error) => {
        console.error('❌ Error in delivery boys subscription:', error);
        onError(new Error(error.message || 'Failed to subscribe to delivery boys'));
      }
    );

    return unsubscribe;
  } catch (error: any) {
    console.error('❌ Error setting up delivery boys subscription:', error);
    onError(new Error(error.message || 'Failed to subscribe to delivery boys'));
    return () => {};
  }
};

/**
 * Get a single delivery boy by ID
 */
export const getDeliveryBoyById = async (id: string): Promise<DeliveryBoy | null> => {
  try {
    const docRef = doc(db, 'users', id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      
      // Verify it's a delivery user
      if (data.role !== 'delivery') {
        return null;
      }

      return {
        id: docSnap.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        vehicleType: data.vehicleType,
        address: data.address,
        profileImage: data.profileImage || '',
        isActive: data.isActive ?? true,
        currentOrdersCount: data.currentOrdersCount || 0,
        totalDeliveries: data.totalDeliveries || 0,
        rating: data.rating || 5.0,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      };
    }

    return null;
  } catch (error: any) {
    console.error('❌ Error fetching delivery boy:', error);
    throw new Error(error.message || 'Failed to fetch delivery boy');
  }
};

/**
 * Update delivery boy details
 */
export const updateDeliveryBoy = async (
  id: string,
  data: Partial<Omit<DeliveryBoy, 'id' | 'createdAt'>>
): Promise<void> => {
  try {
    const docRef = doc(db, 'users', id);
    
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date(),
    });

    console.log('✅ Delivery boy updated successfully:', id);
  } catch (error: any) {
    console.error('❌ Error updating delivery boy:', error);
    throw new Error(error.message || 'Failed to update delivery boy');
  }
};

/**
 * Toggle delivery boy active status
 */
export const toggleDeliveryBoyStatus = async (
  id: string,
  isActive: boolean
): Promise<void> => {
  try {
    await updateDeliveryBoy(id, { isActive });
    console.log(`✅ Delivery boy ${isActive ? 'activated' : 'deactivated'}:`, id);
  } catch (error: any) {
    console.error('❌ Error toggling delivery boy status:', error);
    throw new Error(error.message || 'Failed to toggle delivery boy status');
  }
};

/**
 * Delete delivery boy
 * Note: This only deletes from Firestore. 
 * To delete from Auth, admin needs special permissions.
 */
export const deleteDeliveryBoy = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, 'users', id);
    await deleteDoc(docRef);
    console.log('✅ Delivery boy deleted successfully:', id);
  } catch (error: any) {
    console.error('❌ Error deleting delivery boy:', error);
    throw new Error(error.message || 'Failed to delete delivery boy');
  }
};

/**
 * Get delivery boy statistics
 */
export const getDeliveryBoyStats = async () => {
  try {
    const deliveryBoys = await getAllDeliveryBoys();
    
    const stats = {
      total: deliveryBoys.length,
      active: deliveryBoys.filter(db => db.isActive).length,
      inactive: deliveryBoys.filter(db => !db.isActive).length,
      onDuty: deliveryBoys.filter(db => db.currentOrdersCount > 0).length,
      totalDeliveries: deliveryBoys.reduce((sum, db) => sum + db.totalDeliveries, 0),
      averageRating: deliveryBoys.length > 0 
        ? deliveryBoys.reduce((sum, db) => sum + db.rating, 0) / deliveryBoys.length 
        : 0,
    };

    return stats;
  } catch (error: any) {
    console.error('❌ Error fetching delivery boy stats:', error);
    throw new Error(error.message || 'Failed to fetch delivery boy stats');
  }
};

/**
 * Send password reset email to delivery boy
 */
export const sendDeliveryBoyPasswordReset = async (email: string): Promise<void> => {
  try {
    const actionCodeSettings = {
      url: `${window.location.origin}/`,
      handleCodeInApp: false,
    };
    await sendPasswordResetEmail(auth, email, actionCodeSettings);
    console.log('✅ Password reset email sent to:', email);
  } catch (error: any) {
    console.error('❌ Error sending password reset email:', error);
    throw new Error(error.message || 'Failed to send password reset email');
  }
};

/**
 * Update delivery boy's current order count
 */
export const updateDeliveryBoyOrderCount = async (
  id: string,
  increment: number
): Promise<void> => {
  try {
    const deliveryBoy = await getDeliveryBoyById(id);
    if (!deliveryBoy) {
      throw new Error('Delivery boy not found');
    }

    const newCount = Math.max(0, deliveryBoy.currentOrdersCount + increment);
    await updateDeliveryBoy(id, { currentOrdersCount: newCount });
    
    console.log('✅ Delivery boy order count updated:', id, newCount);
  } catch (error: any) {
    console.error('❌ Error updating delivery boy order count:', error);
    throw new Error(error.message || 'Failed to update order count');
  }
};
