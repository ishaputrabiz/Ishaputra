import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_DEALER_PRICING,
  DEFAULT_DEALER_SETTINGS,
  normaliseDealerPricing,
  normaliseDealerSettings,
  type DealerPricing,
  type DealerSettings,
} from '@/lib/dealer';
import type { DealerApplicationInput } from '@/lib/dealerForm';

/*
 * Dealer Membership data. dealers/<uid> holds one application per customer;
 * only an admin changes its status (firestore.rules). siteSettings/dealer is
 * public (switch, minimum); dealerPricing/current is private (admins and
 * approved dealers). api/create-order.ts charges the prices; this file only
 * shows and edits them.
 */

export type DealerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface DealerRecord extends DealerApplicationInput {
  uid: string;
  status: DealerStatus;
  appliedAtMs: number;
  reviewNote: string;
  reviewedAtMs: number;
  approvedAtMs: number;
}

const ms = (v: unknown) =>
  typeof (v as { toMillis?: () => number })?.toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : 0;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const STATUSES: DealerStatus[] = ['pending', 'approved', 'rejected', 'suspended'];

function toRecord(id: string, d: DocumentData): DealerRecord {
  return {
    uid: id,
    status: STATUSES.includes(d.status) ? d.status : 'pending',
    businessName: str(d.businessName),
    businessType: str(d.businessType),
    contactName: str(d.contactName),
    phone: str(d.phone),
    city: str(d.city),
    state: str(d.state),
    gstin: str(d.gstin),
    message: str(d.message),
    appliedAtMs: ms(d.appliedAt),
    reviewNote: str(d.reviewNote),
    reviewedAtMs: ms(d.reviewedAt),
    approvedAtMs: ms(d.approvedAt),
  };
}

const dealerRef = (uid: string) => doc(db, 'dealers', uid);
const settingsRef = doc(db, 'siteSettings', 'dealer');
const pricingRef = doc(db, 'dealerPricing', 'current');

export function subscribeOwnDealer(uid: string, onNext: (r: DealerRecord | null) => void, onError: (e: Error) => void) {
  return onSnapshot(dealerRef(uid), (s) => onNext(s.exists() ? toRecord(s.id, s.data()) : null), onError);
}

/** A new application, or a fresh one after a rejection (the rules allow exactly these writes). */
export async function applyAsDealer(uid: string, input: DealerApplicationInput, reapply: boolean) {
  const fields = { ...input, status: 'pending', appliedAt: serverTimestamp(), updatedAt: serverTimestamp() };
  if (reapply) await updateDoc(dealerRef(uid), fields);
  else await setDoc(dealerRef(uid), { uid, ...fields });
}

export const withdrawDealerApplication = (uid: string) => deleteDoc(dealerRef(uid));

export function subscribeDealerSettings(onNext: (s: DealerSettings) => void, onError: (e: Error) => void) {
  return onSnapshot(settingsRef, (s) => onNext(normaliseDealerSettings(s.exists() ? s.data() : null)), onError);
}

export function subscribeDealerPricing(onNext: (p: DealerPricing) => void, onError: (e: Error) => void) {
  return onSnapshot(pricingRef, (s) => onNext(normaliseDealerPricing(s.exists() ? s.data() : null)), onError);
}

export async function loadDealerAdminSettings(): Promise<{ settings: DealerSettings; pricing: DealerPricing }> {
  const [s, p] = await Promise.all([getDoc(settingsRef), getDoc(pricingRef)]);
  return {
    settings: s.exists() ? normaliseDealerSettings(s.data()) : { ...DEFAULT_DEALER_SETTINGS },
    pricing: p.exists() ? normaliseDealerPricing(p.data()) : { ...DEFAULT_DEALER_PRICING },
  };
}

/** One batch: the public switch and minimum, and the private discount. */
export async function saveDealerAdminSettings(settings: DealerSettings, discountPercent: number, wasEnabled: boolean) {
  const clean = normaliseDealerSettings(settings);
  const batch = writeBatch(db);
  batch.set(
    settingsRef,
    { ...clean, ...(clean.enabled && !wasEnabled ? { enabledAt: serverTimestamp() } : {}), updatedAt: serverTimestamp() },
    { merge: true },
  );
  batch.set(
    pricingRef,
    { discountPercent: normaliseDealerPricing({ discountPercent }).discountPercent, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await batch.commit();
}

export async function getProductDealerPrice(productId: string): Promise<{ price: number | null; discountPercent: number }> {
  const p = await getDoc(pricingRef);
  const pricing = normaliseDealerPricing(p.exists() ? p.data() : null);
  return { price: pricing.productPrices[productId] ?? null, discountPercent: pricing.discountPercent };
}

/** Set or clear (null) one product's fixed dealer price. */
export async function setProductDealerPrice(productId: string, price: number | null) {
  await setDoc(
    pricingRef,
    { productPrices: { [productId]: price === null ? deleteField() : Math.round(price * 100) / 100 }, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function subscribeDealerApplications(onNext: (rows: DealerRecord[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'dealers'),
    (snap) => onNext(snap.docs.map((d) => toRecord(d.id, d.data())).sort((a, b) => b.appliedAtMs - a.appliedAtMs)),
    onError,
  );
}

export function subscribePendingDealerCount(onNext: (n: number) => void, onError: (e: Error) => void) {
  return onSnapshot(query(collection(db, 'dealers'), where('status', '==', 'pending')), (s) => onNext(s.size), onError);
}

export async function getDealerRecord(uid: string): Promise<DealerRecord | null> {
  const s = await getDoc(dealerRef(uid));
  return s.exists() ? toRecord(s.id, s.data()) : null;
}

const NEXT: Record<'approve' | 'reject' | 'suspend' | 'reinstate', DealerStatus> = {
  approve: 'approved',
  reject: 'rejected',
  suspend: 'suspended',
  reinstate: 'approved',
};

/** An admin decision. The note (up to 300 characters) is shown to the applicant when rejected or suspended. */
export async function reviewDealer(
  uid: string,
  action: keyof typeof NEXT,
  adminUid: string,
  note = '',
  firstApproval = false,
) {
  await updateDoc(dealerRef(uid), {
    status: NEXT[action],
    reviewNote: note.trim().slice(0, 300),
    reviewedAt: serverTimestamp(),
    reviewedBy: adminUid,
    updatedAt: serverTimestamp(),
    ...(action === 'approve' && firstApproval ? { approvedAt: serverTimestamp() } : {}),
  });
}
