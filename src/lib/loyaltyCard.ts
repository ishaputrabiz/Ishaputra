/**
 * The loyalty card's member number: 12 digits derived from the account id
 * (64-bit FNV-1a of the uid, mod 10^12). Nothing is stored and the customer
 * cannot change it. Two accounts sharing a number is possible in theory and
 * harmless: it is a support reference, not a key.
 */
const FNV_OFFSET = BigInt('0xcbf29ce484222325');
const FNV_PRIME = BigInt('0x100000001b3');
const MASK_64 = BigInt('0xffffffffffffffff');
const MOD_12 = BigInt('1000000000000');

export function memberDigits(uid: string): string {
  let h = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(uid)) {
    h ^= BigInt(byte);
    h = (h * FNV_PRIME) & MASK_64;
  }
  return (h % MOD_12).toString().padStart(12, '0');
}

/** "IB 2005 5564 1996" (the prefix is BRAND.memberPrefix). */
export function formatMemberNumber(digits: string, prefix: string): string {
  return [prefix, digits.slice(0, 4), digits.slice(4, 8), digits.slice(8, 12)].filter(Boolean).join(' ');
}
