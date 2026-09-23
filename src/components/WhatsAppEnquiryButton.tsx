import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { DEFAULT_SUPPORT, getCustomerSupportSettings } from "@/services/siteSettingsService";

/**
 * "Enquire on WhatsApp" for a product.
 *
 * Opens a chat with the store's WhatsApp number (Admin > Commerce settings >
 * Customer support, default +91 6304960489) with a message naming the product
 * and linking to its page. WhatsApp turns that link into a preview card with the
 * product photo because /product/:id serves real Open Graph tags to link-preview
 * crawlers - see the `og` handler in api/media.ts and the rewrite in vercel.json.
 */

interface EnquiryProduct {
  id: string;
  title: string;
  price: number;
}

/** The number is admin-editable; read it once per visit, not once per product page. */
let storeNumber: Promise<string> | null = null;
const loadStoreNumber = () =>
  (storeNumber ??= getCustomerSupportSettings().then((s) => s.whatsapp || DEFAULT_SUPPORT.whatsapp));

/** wa.me needs the full international number as digits; Indian numbers are often saved without 91. */
const toWhatsAppDigits = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
};

const buildEnquiryUrl = (phone: string, product: EnquiryProduct, origin: string) => {
  const pageUrl = `${origin}/product/${encodeURIComponent(product.id)}`;
  const message = [
    "Hello Sreerasthu Silvers,",
    "I'm interested in this product. Could you please share more details?",
    "",
    `*${product.title}*`,
    `Price: ₹${product.price.toLocaleString("en-IN")}`,
    "",
    // Last, on its own line: WhatsApp builds the preview card from this link.
    pageUrl,
  ].join("\n");
  return `https://wa.me/${toWhatsAppDigits(phone)}?text=${encodeURIComponent(message)}`;
};

export const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

interface Props {
  product: EnquiryProduct;
  /** Layout is the caller's: pass `flex-1` in a row, or `w-full` on its own. */
  className?: string;
}

const WhatsAppEnquiryButton = ({ product, className = "" }: Props) => {
  const [phone, setPhone] = useState(DEFAULT_SUPPORT.whatsapp);

  useEffect(() => {
    let active = true;
    loadStoreNumber()
      .then((n) => active && setPhone(n))
      .catch(() => {
        /* keep the default number */
      });
    return () => {
      active = false;
    };
  }, []);

  const href = buildEnquiryUrl(phone, product, window.location.origin);

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      whileTap={{ scale: 0.97 }}
      className={`px-3 sm:px-5 py-3 font-medium text-xs sm:text-sm rounded-full border-2 border-[#25D366] text-[#128C7E] dark:text-[#25D366] hover:bg-[#25D366]/10 transition-all flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap ${className}`}
    >
      <WhatsAppIcon className="w-4 h-4 shrink-0" />
      <span className="hidden sm:inline">Enquire on WhatsApp</span>
      <span className="sm:hidden">WhatsApp</span>
    </motion.a>
  );
};

export default WhatsAppEnquiryButton;
