import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { subscribeToFirestoreSilverRate, getCachedSilverRate } from '@/services/silverRateService';

interface SilverRateContextValue {
  /** Live silver rate per gram in INR. 0 if not yet loaded. */
  ratePerGram: number;
}

const SilverRateContext = createContext<SilverRateContextValue>({ ratePerGram: 0 });

export function SilverRateProvider({ children }: { children: ReactNode }) {
  const [ratePerGram, setRatePerGram] = useState<number>(
    () => getCachedSilverRate()?.pricePerGramInr ?? 0
  );

  useEffect(() => {
    const unsub = subscribeToFirestoreSilverRate((rate) => {
      setRatePerGram(rate.pricePerGramInr);
    });
    return unsub;
  }, []);

  return (
    <SilverRateContext.Provider value={{ ratePerGram }}>
      {children}
    </SilverRateContext.Provider>
  );
}

/** Returns the live silver rate per gram from Firestore. */
export function useSilverRate(): SilverRateContextValue {
  return useContext(SilverRateContext);
}

/**
 * Compute the live original/MRP price for a silver product.
 * formula: originalPrice = Math.ceil(grams * rate * (1 + wastage%) + makingCharges)
 */
export function computeSilverOriginalPrice(
  silverPricing: { weightGrams: number; wastagePercent: number; makingCharges: number },
  ratePerGram: number
): number {
  const x = silverPricing.weightGrams * ratePerGram;
  const y = x * (silverPricing.wastagePercent / 100);
  const z = silverPricing.makingCharges;
  return Math.ceil(x + y + z);
}
