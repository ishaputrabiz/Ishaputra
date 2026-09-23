import { 
  collection, 
  addDoc, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  updateDoc, 
  deleteDoc,
  Timestamp,
  onSnapshot,
  QuerySnapshot,
  limit,
  increment,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { uploadImage } from '@/services/mediaStorage';
import { requestCatalogRefresh } from '@/services/catalogPublisher';

export interface Review {
  id: string;
  productId: string;
  productName: string;
  userId: string;
  userName: string;
  userEmail: string;
  rating: number; // 1-5
  reviewText: string;
  images: string[]; // URLs of uploaded images
  videoUrl?: string; // URL of uploaded video
  isVerifiedPurchase: boolean; // True if user has ordered this product
  status: 'pending' | 'approved' | 'rejected'; // For admin moderation
  helpfulUp?: number;   // Count of helpful upvotes
  helpfulDown?: number; // Count of helpful downvotes
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ReviewFormData = Omit<Review, 'id' | 'createdAt' | 'updatedAt'>;

const REVIEWS_COLLECTION = 'reviews';

/**
 * Check if user has purchased a specific product
 */
export const hasUserPurchasedProduct = async (
  userId: string,
  productId: string
): Promise<boolean> => {
  try {
    const ordersRef = collection(db, 'orders');
    const q = query(
      ordersRef,
      where('userId', '==', userId),
      where('status', '==', 'delivered')
    );
    
    const snapshot = await getDocs(q);
    
    // Check if any delivered order contains this product
    for (const doc of snapshot.docs) {
      const order = doc.data();
      const hasProduct = order.items?.some((item: any) => item.productId === productId);
      if (hasProduct) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking user purchase:', error);
    return false;
  }
};

/**
 * Check if user has already reviewed a product
 */
export const hasUserReviewedProduct = async (
  userId: string,
  productId: string
): Promise<boolean> => {
  try {
    const reviewsRef = collection(db, REVIEWS_COLLECTION);
    const q = query(
      reviewsRef,
      where('userId', '==', userId),
      where('productId', '==', productId),
      limit(1)
    );
    
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking user review:', error);
    return false;
  }
};

/**
 * Get the user's own review for a product (returns the review object including status)
 */
export const getUserProductReview = async (
  userId: string,
  productId: string
): Promise<Review | null> => {
  try {
    const reviewsRef = collection(db, REVIEWS_COLLECTION);
    const q = query(
      reviewsRef,
      where('userId', '==', userId),
      where('productId', '==', productId),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const d = snapshot.docs[0];
    return { id: d.id, ...d.data() } as Review;
  } catch (error) {
    console.error('Error getting user review:', error);
    return null;
  }
};

/**
 * Increment the helpful up/down count for a review (called once per user per review)
 */
export const voteReviewHelpful = async (
  reviewId: string,
  type: 'up' | 'down'
): Promise<void> => {
  const reviewRef = doc(db, REVIEWS_COLLECTION, reviewId);
  await updateDoc(reviewRef, {
    [type === 'up' ? 'helpfulUp' : 'helpfulDown']: increment(1),
  });
};

/**
 * Upload review photos. Customer photos are shrunk in the browser to fit the
 * 500 KB limit; files are stored under the signed-in user's own folder.
 */
export const uploadReviewImages = async (files: File[]): Promise<string[]> => {
  const results = await Promise.all(
    files.map((file) => uploadImage(file, { category: 'reviews', autoCompress: true })),
  );
  return results.map((r) => r.url);
};

// Review *videos* are switched off: a single phone clip can be 50-200 MB, and a
// handful would use up the 10 GB free storage. Re-enable by adding a video
// upload path to /api/media (direct-to-bucket presigned uploads) with a firm cap.

/**
 * Create a new review
 */
export const createReview = async (reviewData: ReviewFormData): Promise<string> => {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, REVIEWS_COLLECTION), {
    ...reviewData,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
};

/**
 * Get reviews for a specific product
 */
export const getProductReviews = async (
  productId: string,
  status: 'approved' | 'all' = 'approved'
): Promise<Review[]> => {
  try {
    const reviewsRef = collection(db, REVIEWS_COLLECTION);
    let q;
    
    if (status === 'approved') {
      q = query(
        reviewsRef,
        where('productId', '==', productId),
        where('status', '==', 'approved'),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(
        reviewsRef,
        where('productId', '==', productId),
        orderBy('createdAt', 'desc')
      );
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => {
      const data = d.data() as Record<string, any>;
      return { ...data, id: d.id } as Review;
    });
  } catch (error) {
    console.error('Error fetching product reviews:', error);
    return [];
  }
};

/**
 * Get all reviews (for admin)
 */
export const getAllReviews = async (): Promise<Review[]> => {
  try {
    const reviewsRef = collection(db, REVIEWS_COLLECTION);
    const q = query(reviewsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(d => {
      const data = d.data() as Record<string, any>;
      return { ...data, id: d.id } as Review;
    });
  } catch (error) {
    console.error('Error fetching all reviews:', error);
    return [];
  }
};

/**
 * Subscribe to reviews (real-time updates for admin)
 */
export const subscribeToReviews = (
  callback: (reviews: Review[]) => void
): (() => void) => {
  const reviewsRef = collection(db, REVIEWS_COLLECTION);
  const q = query(reviewsRef, orderBy('createdAt', 'desc'));
  
  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot) => {
    const reviews = snapshot.docs.map(d => {
      const data = d.data() as Record<string, any>;
      return { ...data, id: d.id } as Review;
    });
    callback(reviews);
  });
  
  return unsubscribe;
};

/**
 * Update review status (for admin) and recalculate product rating/reviewCount
 */
export const updateReviewStatus = async (
  reviewId: string,
  status: 'approved' | 'rejected'
): Promise<void> => {
  const reviewRef = doc(db, REVIEWS_COLLECTION, reviewId);
  
  // Get the review to know the productId for recalculation
  const reviewSnap = await getDoc(reviewRef);
  const reviewData = reviewSnap.data();
  
  await updateDoc(reviewRef, {
    status,
    updatedAt: Timestamp.now(),
  });
  
  // Recalculate product rating and reviewCount from all approved reviews
  if (reviewData?.productId) {
    try {
      const stats = await getProductReviewStats(reviewData.productId);
      const productRef = doc(db, 'products', reviewData.productId);
      await updateDoc(productRef, {
        rating: stats.averageRating,
        reviewCount: stats.totalReviews,
        reviews: stats.totalReviews,
      });
      requestCatalogRefresh([reviewData.productId]);
    } catch (e) {
      console.error('Error updating product rating after review status change:', e);
    }
  }
};

/**
 * Delete a review (for admin) and recalculate product rating/reviewCount
 */
export const deleteReview = async (reviewId: string): Promise<void> => {
  const reviewRef = doc(db, REVIEWS_COLLECTION, reviewId);
  const reviewSnap = await getDoc(reviewRef);
  const reviewData = reviewSnap.data();
  await deleteDoc(reviewRef);
  if (reviewData?.productId) {
    try {
      const stats = await getProductReviewStats(reviewData.productId);
      const productRef = doc(db, 'products', reviewData.productId);
      await updateDoc(productRef, {
        rating: stats.averageRating,
        reviewCount: stats.totalReviews,
        reviews: stats.totalReviews,
      });
      requestCatalogRefresh([reviewData.productId]);
    } catch (e) {
      console.error('Error updating product rating after review deletion:', e);
    }
  }
};

/**
 * Get review statistics for a product
 */
export const getProductReviewStats = async (
  productId: string
): Promise<{
  averageRating: number;
  totalReviews: number;
  ratingDistribution: Record<number, number>;
}> => {
  try {
    const reviews = await getProductReviews(productId, 'approved');
    
    if (reviews.length === 0) {
      return {
        averageRating: 0,
        totalReviews: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    }
    
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = totalRating / reviews.length;
    
    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(review => {
      ratingDistribution[review.rating] = (ratingDistribution[review.rating] || 0) + 1;
    });
    
    return {
      averageRating: Math.round(averageRating * 10) / 10,
      totalReviews: reviews.length,
      ratingDistribution,
    };
  } catch (error) {
    console.error('Error calculating review stats:', error);
    return {
      averageRating: 0,
      totalReviews: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }
};
