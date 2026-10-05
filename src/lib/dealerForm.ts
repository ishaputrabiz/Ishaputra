/**
 * The dealer application form: business types, field rules and cleaning.
 * firestore.rules (match /dealers/{uid}) enforces the same limits.
 */
export const BUSINESS_TYPES = [
  { value: 'retail', label: 'Retail store' },
  { value: 'ayurvedic', label: 'Ayurvedic or medical store' },
  { value: 'salon', label: 'Salon or spa' },
  { value: 'gym', label: 'Gym or fitness centre' },
  { value: 'online', label: 'Online seller' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'other', label: 'Other' },
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]['value'];

export interface DealerApplicationInput {
  businessName: string;
  businessType: string;
  contactName: string;
  phone: string;
  city: string;
  state: string;
  /** '' or a 15-character GSTIN. */
  gstin: string;
  message: string;
}

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PHONE_PATTERN = /^\+?[0-9 ]{10,15}$/;

export const businessTypeLabel = (value: string) =>
  BUSINESS_TYPES.find((t) => t.value === value)?.label ?? 'Other';

export function cleanDealerApplication(input: Partial<Record<keyof DealerApplicationInput, unknown>>): DealerApplicationInput {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    businessName: s(input.businessName),
    businessType: s(input.businessType),
    contactName: s(input.contactName),
    phone: s(input.phone).replace(/\s+/g, ' '),
    city: s(input.city),
    state: s(input.state),
    gstin: s(input.gstin).replace(/\s+/g, '').toUpperCase(),
    message: s(input.message),
  };
}

/** Field → message for every problem; an empty object means the application can be sent. */
export function validateDealerApplication(a: DealerApplicationInput): Partial<Record<keyof DealerApplicationInput, string>> {
  const e: Partial<Record<keyof DealerApplicationInput, string>> = {};
  const len = (v: string, min: number, max: number) => v.length >= min && v.length <= max;
  if (!len(a.businessName, 2, 80)) e.businessName = 'Enter your business name (2 to 80 characters).';
  if (!BUSINESS_TYPES.some((t) => t.value === a.businessType)) e.businessType = 'Choose a business type.';
  if (!len(a.contactName, 2, 60)) e.contactName = 'Enter your name.';
  if (!PHONE_PATTERN.test(a.phone)) e.phone = 'Enter a 10-digit phone number.';
  if (!len(a.city, 2, 60)) e.city = 'Enter your city.';
  if (!len(a.state, 2, 40)) e.state = 'Choose your state.';
  if (a.gstin !== '' && !GSTIN_PATTERN.test(a.gstin)) e.gstin = 'Check the GSTIN: it has 15 characters, like 29ABCDE1234F1Z5.';
  if (a.message.length > 500) e.message = 'Keep the message under 500 characters.';
  return e;
}
