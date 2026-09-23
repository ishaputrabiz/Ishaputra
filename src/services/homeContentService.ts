import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { uploadImage } from '@/services/mediaStorage';

// ─────────────────────────────────────────────────────────────────────────
// Home Banners — promo tiles + wide collection banner managed by admin.
// `slot` differentiates them so the same admin page can edit all.
// ─────────────────────────────────────────────────────────────────────────

export type HomeBannerSlot = 'promo-left' | 'promo-right' | 'collection-wide';

export interface HomeBanner {
  id?: string;
  slot: HomeBannerSlot;
  imageUrl: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  ctaLabel: string;
  ctaLink: string;
  active: boolean;
  order: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const HOME_BANNERS = 'homeBanners';

/** Home banner / collection image (JPG/PNG/WebP, max 500 KB - see mediaStorage). */
export async function uploadHomeMedia(file: File): Promise<string> {
  const result = await uploadImage(file, { category: 'home' });
  return result.url;
}

export async function getHomeBanners(slot?: HomeBannerSlot): Promise<HomeBanner[]> {
  const ref = collection(db, HOME_BANNERS);
  const q = slot ? query(ref, where('slot', '==', slot), orderBy('order', 'asc')) : query(ref, orderBy('order', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as HomeBanner) }));
}

export function subscribeHomeBanners(cb: (banners: HomeBanner[]) => void, slot?: HomeBannerSlot) {
  const ref = collection(db, HOME_BANNERS);
  const q = slot ? query(ref, where('slot', '==', slot), orderBy('order', 'asc')) : query(ref, orderBy('order', 'asc'));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as HomeBanner) }))),
    (err) => {
      console.error('subscribeHomeBanners error', err);
      cb([]);
    }
  );
}

export async function createHomeBanner(banner: Omit<HomeBanner, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, HOME_BANNERS), {
    ...banner,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateHomeBanner(id: string, patch: Partial<HomeBanner>): Promise<void> {
  await updateDoc(doc(db, HOME_BANNERS, id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteHomeBanner(id: string): Promise<void> {
  await deleteDoc(doc(db, HOME_BANNERS, id));
}

// ─────────────────────────────────────────────────────────────────────────
// Home YouTube Videos — admin-managed playlist for the showcase section.
// ─────────────────────────────────────────────────────────────────────────

export interface HomeVideo {
  id?: string;
  title: string;
  description?: string;
  youtubeUrl: string; // full URL or video ID
  videoId: string;   // canonical 11-char id
  thumbnailUrl?: string; // optional override
  active: boolean;
  /** Marks this video for the premium "Featured" hero slot. Only featured videos appear in the spotlight area. */
  featured?: boolean;
  /** Player aspect ratio chosen at upload time. Defaults to 16:9 if not set. */
  aspectRatio?: '16:9' | '9:16';
  order: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const HOME_VIDEOS = 'homeVideos';

export function extractYouTubeId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // Already an 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return m[1];
  }
  return null;
}

export function youtubeThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export async function getHomeVideos(): Promise<HomeVideo[]> {
  const snap = await getDocs(query(collection(db, HOME_VIDEOS), orderBy('order', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as HomeVideo) }));
}

export function subscribeHomeVideos(cb: (videos: HomeVideo[]) => void) {
  return onSnapshot(
    query(collection(db, HOME_VIDEOS), orderBy('order', 'asc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as HomeVideo) }))),
    (err) => {
      console.error('subscribeHomeVideos error', err);
      cb([]);
    }
  );
}

export async function createHomeVideo(video: Omit<HomeVideo, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, HOME_VIDEOS), {
    ...video,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateHomeVideo(id: string, patch: Partial<HomeVideo>): Promise<void> {
  await updateDoc(doc(db, HOME_VIDEOS, id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteHomeVideo(id: string): Promise<void> {
  await deleteDoc(doc(db, HOME_VIDEOS, id));
}

// ─────────────────────────────────────────────────────────────────────────
// Home Collections — "Our Collections" CMS cards (PromoSection).
// ─────────────────────────────────────────────────────────────────────────

export interface HomeCollection {
  id?: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaLink: string;
  imageUrl: string;
  /** Tailwind gradient classes for the overlay tint (optional). */
  tint?: string;
  active: boolean;
  order: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const HOME_COLLECTIONS = 'homeCollections';

export async function getHomeCollections(): Promise<HomeCollection[]> {
  const snap = await getDocs(query(collection(db, HOME_COLLECTIONS), orderBy('order', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as HomeCollection) }));
}

export function subscribeHomeCollections(cb: (items: HomeCollection[]) => void) {
  return onSnapshot(
    query(collection(db, HOME_COLLECTIONS), orderBy('order', 'asc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as HomeCollection) }))),
    (err) => {
      console.error('subscribeHomeCollections error', err);
      cb([]);
    }
  );
}

export async function createHomeCollection(item: Omit<HomeCollection, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, HOME_COLLECTIONS), {
    ...item,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateHomeCollection(id: string, patch: Partial<HomeCollection>): Promise<void> {
  await updateDoc(doc(db, HOME_COLLECTIONS, id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteHomeCollection(id: string): Promise<void> {
  await deleteDoc(doc(db, HOME_COLLECTIONS, id));
}
