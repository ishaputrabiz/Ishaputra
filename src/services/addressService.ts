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
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export interface Address {
  id: string;
  userId: string;
  fullName: string;
  phoneNumber: string;
  pinCode: string;
  locality: string;
  address: string;
  googleMapsUrl?: string;
  city: string;
  state: string;
  isDefault: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AddressFormData {
  fullName: string;
  phoneNumber: string;
  pinCode: string;
  locality: string;
  address: string;
  googleMapsUrl?: string;
  city: string;
  state: string;
  isDefault?: boolean;
}

/**
 * Add a new address for a user
 */
export const addAddress = async (
  userId: string,
  addressData: AddressFormData
): Promise<string> => {
  try {
    // If this is set as default, unset all other defaults first
    if (addressData.isDefault) {
      await unsetAllDefaults(userId);
    }

    const addressRef = doc(collection(db, 'users', userId, 'addresses'));
    const newAddress = {
      ...addressData,
      userId,
      isDefault: addressData.isDefault || false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(addressRef, newAddress);
    return addressRef.id;
  } catch (error) {
    console.error('Error adding address:', error);
    throw new Error('Failed to add address');
  }
};

/**
 * Get all addresses for a user
 */
export const getUserAddresses = async (userId: string): Promise<Address[]> => {
  try {
    const addressesRef = collection(db, 'users', userId, 'addresses');
    const q = query(addressesRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Address[];
  } catch (error) {
    console.error('Error fetching addresses:', error);
    throw new Error('Failed to fetch addresses');
  }
};

/**
 * Get a single address by ID
 */
export const getAddress = async (
  userId: string,
  addressId: string
): Promise<Address | null> => {
  try {
    const addressRef = doc(db, 'users', userId, 'addresses', addressId);
    const addressDoc = await getDoc(addressRef);

    if (addressDoc.exists()) {
      return {
        id: addressDoc.id,
        ...addressDoc.data(),
      } as Address;
    }
    return null;
  } catch (error) {
    console.error('Error fetching address:', error);
    throw new Error('Failed to fetch address');
  }
};

/**
 * Update an existing address
 */
export const updateAddress = async (
  userId: string,
  addressId: string,
  updates: Partial<AddressFormData>
): Promise<void> => {
  try {
    // If setting this as default, unset all other defaults first
    if (updates.isDefault) {
      await unsetAllDefaults(userId);
    }

    const addressRef = doc(db, 'users', userId, 'addresses', addressId);
    await updateDoc(addressRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating address:', error);
    throw new Error('Failed to update address');
  }
};

/**
 * Delete an address
 */
export const deleteAddress = async (
  userId: string,
  addressId: string
): Promise<void> => {
  try {
    const addressRef = doc(db, 'users', userId, 'addresses', addressId);
    await deleteDoc(addressRef);
  } catch (error) {
    console.error('Error deleting address:', error);
    throw new Error('Failed to delete address');
  }
};

/**
 * Set an address as default
 */
export const setDefaultAddress = async (
  userId: string,
  addressId: string
): Promise<void> => {
  try {
    // First, unset all defaults
    await unsetAllDefaults(userId);

    // Then set this one as default
    const addressRef = doc(db, 'users', userId, 'addresses', addressId);
    await updateDoc(addressRef, {
      isDefault: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error setting default address:', error);
    throw new Error('Failed to set default address');
  }
};

/**
 * Get the default address for a user
 */
export const getDefaultAddress = async (userId: string): Promise<Address | null> => {
  try {
    const addressesRef = collection(db, 'users', userId, 'addresses');
    const q = query(addressesRef, where('isDefault', '==', true));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    } as Address;
  } catch (error) {
    console.error('Error fetching default address:', error);
    throw new Error('Failed to fetch default address');
  }
};

/**
 * Helper: Unset all default addresses for a user
 */
const unsetAllDefaults = async (userId: string): Promise<void> => {
  const addressesRef = collection(db, 'users', userId, 'addresses');
  const q = query(addressesRef, where('isDefault', '==', true));
  const snapshot = await getDocs(q);

  const updatePromises = snapshot.docs.map((doc) =>
    updateDoc(doc.ref, { isDefault: false })
  );

  await Promise.all(updatePromises);
};
