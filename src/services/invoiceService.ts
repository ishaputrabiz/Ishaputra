/**
 * Invoice generation service.
 *
 * Centralises PDF invoice generation for customer order downloads.
 * Consumes the pricing snapshot stored on each Order document
 * (subtotal, taxAmount, gstRate, gstInclusive, deliveryCharge, codCharge,
 * couponDiscount, total) so the generated invoice always reflects what the
 * customer actually paid — even if product prices, GST rates, or coupon
 * definitions change after the order was placed.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Order } from '@/services/orderService';

// ---------------------------------------------------------------------------
// Seller details — single source of truth for the invoice header.
// ---------------------------------------------------------------------------
const SELLER = {
  name: 'Sreerasthu Silvers',
  addressLines: [
    'Ramasomayajulu St, Rama Rao Peta',
    'Kakinada, Andhra Pradesh 533001',
    'India',
  ],
  state: 'Andhra Pradesh',
  stateCode: '37',
  phone: '+91 63049 60489',
  email: 'support@sreerasthusilvers.com',
  // GSTIN can be filled in once the business registers — kept blank to avoid
  // printing placeholder values on a real invoice.
  gstin: '',
} as const;

const LOGO_URL = '/logo-new.png';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const formatINR = (n: number): string => `Rs. ${n.toFixed(2)}`;
const formatNum = (n: number): string => n.toFixed(2);

type DateInput = Date | string | number | { seconds?: number } | null | undefined;

const formatDate = (input: DateInput): string => {
  if (!input) return '';
  const d: Date = input instanceof Date
    ? input
    : input?.seconds
      ? new Date(input.seconds * 1000)
      : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Convert a numeric amount to Indian-English words (e.g. "Two Thousand Five
 * Hundred Rupees and Fifty Paise Only"). Handles up to 99 crore.
 */
export const amountInWords = (amount: number): string => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const lessThanThousand = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) {
      const t = Math.floor(n / 10);
      const r = n % 10;
      return tens[t] + (r ? ' ' + ones[r] : '');
    }
    const h = Math.floor(n / 100);
    const r = n % 100;
    return ones[h] + ' Hundred' + (r ? ' ' + lessThanThousand(r) : '');
  };

  const inWords = (n: number): string => {
    if (n === 0) return 'Zero';
    let words = '';
    if (n >= 10_000_000) {
      words += lessThanThousand(Math.floor(n / 10_000_000)) + ' Crore ';
      n %= 10_000_000;
    }
    if (n >= 100_000) {
      words += lessThanThousand(Math.floor(n / 100_000)) + ' Lakh ';
      n %= 100_000;
    }
    if (n >= 1_000) {
      words += lessThanThousand(Math.floor(n / 1_000)) + ' Thousand ';
      n %= 1_000;
    }
    if (n > 0) words += lessThanThousand(n);
    return words.trim();
  };

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  let result = inWords(rupees) + ' Rupees';
  if (paise > 0) result += ' and ' + inWords(paise) + ' Paise';
  result += ' Only';
  return result;
};

/** Load the seller logo as a base64 data URL for embedding in jsPDF. */
const loadLogo = async (): Promise<string | null> => {
  try {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = LOGO_URL;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('logo load failed'));
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[invoice] logo unavailable, falling back to text header', err);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Pricing breakdown derived from the order snapshot
// ---------------------------------------------------------------------------
interface PricingBreakdown {
  subtotal: number;          // cart/order item total snapshot
  taxableValue: number;      // value that GST is applied to
  taxAmount: number;         // total GST amount
  gstRate: number;           // % rate used
  gstInclusive: boolean;     // whether MRPs already included GST
  deliveryCharge: number;
  codCharge: number;
  couponDiscount: number;
  total: number;             // grand total payable
  isIntraState: boolean;
}

const buildPricing = (order: Order): PricingBreakdown => {
  const gstRate = typeof order.gstRate === 'number' ? order.gstRate : 3;
  const gstInclusive = !!order.gstInclusive;
  const deliveryCharge = order.deliveryCharge || 0;
  const codCharge = order.codCharge || 0;
  const couponDiscount = order.couponDiscount || 0;
  const total = order.total;

  // The order document already stores taxAmount and subtotal as a snapshot —
  // trust them rather than recomputing, so the invoice always matches what
  // the customer paid even if pricing logic changes later.
  const subtotal = order.subtotal;
  const taxAmount = order.taxAmount || 0;
  const taxableValue = gstInclusive
    ? Math.max(0, total - deliveryCharge - codCharge - taxAmount)
    : Math.max(0, subtotal - couponDiscount);

  const isIntraState =
    (order.shippingAddress?.state || '').trim().toLowerCase() ===
    SELLER.state.toLowerCase();

  return {
    subtotal,
    taxableValue,
    taxAmount,
    gstRate,
    gstInclusive,
    deliveryCharge,
    codCharge,
    couponDiscount,
    total,
    isIntraState,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate and trigger download of a tax invoice PDF for the given order.
 * Filename: `Invoice-<orderId>.pdf`.
 */
export const generateInvoicePDF = async (order: Order): Promise<void> => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  const logo = await loadLogo();

  // ---------------- Header band -------------------------------------------
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, 36, 'F');
  doc.setDrawColor(225, 225, 225);
  doc.line(margin, 34, pageWidth - margin, 34);

  if (logo) {
    try { doc.addImage(logo, 'PNG', margin, 8, 55, 16); } catch { /* ignore */ }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    doc.text(SELLER.name, margin, 18);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text('TAX INVOICE', pageWidth - margin, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text('Original for Recipient', pageWidth - margin, 21, { align: 'right' });

  y = 40;

  // ---------------- Seller / Customer columns -----------------------------
  const colW = (pageWidth - margin * 2 - 6) / 2;
  const sellerX = margin;
  const buyerX = margin + colW + 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text('Sold By', sellerX, y);
  doc.text('Billed / Shipped To', buyerX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);

  const sellerLines = [
    SELLER.name,
    ...SELLER.addressLines,
    `Phone: ${SELLER.phone}`,
    `Email: ${SELLER.email}`,
    `State Code: ${SELLER.stateCode}`,
    ...(SELLER.gstin ? [`GSTIN: ${SELLER.gstin}`] : []),
  ];
  sellerLines.forEach((line, idx) => doc.text(line, sellerX, y + 5 + idx * 4));

  const ship = order.shippingAddress;
  const buyerLines = [
    ship?.fullName || order.userName || '',
    ship?.address || '',
    ship?.locality ? `${ship.locality}` : '',
    `${ship?.city || ''}, ${ship?.state || ''}`,
    `PIN: ${ship?.pincode || ''}`,
    `Phone: ${ship?.mobile || ''}`,
    `Place of Supply: ${ship?.state || ''}`,
  ].filter(Boolean);
  buyerLines.forEach((line, idx) => doc.text(line, buyerX, y + 5 + idx * 4));

  y += 5 + Math.max(sellerLines.length, buyerLines.length) * 4 + 6;

  // ---------------- Invoice meta strip ------------------------------------
  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(250, 250, 250);
  doc.rect(margin, y, pageWidth - margin * 2, 14, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('Invoice No.', margin + 3, y + 5);
  doc.text('Invoice Date', margin + 55, y + 5);
  doc.text('Order ID', margin + 100, y + 5);
  doc.text('Payment', margin + 145, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text(`INV-${order.orderId}`, margin + 3, y + 11);
  doc.text(formatDate(order.createdAt), margin + 55, y + 11);
  doc.text(order.orderId, margin + 100, y + 11);
  doc.text(String(order.paymentMethod || '').toUpperCase(), margin + 145, y + 11);

  y += 20;

  // ---------------- Items table -------------------------------------------
  const pricing = buildPricing(order);
  const itemsBody = order.items.map((item, idx) => {
    const lineTotal = item.price * item.quantity;
    return [
      String(idx + 1),
      item.name,
      String(item.quantity),
      formatNum(item.price),
      formatNum(lineTotal),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Item', 'Qty', 'Unit Price', 'Line Amount']],
    body: itemsBody,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 30, 30],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    bodyStyles: { fontSize: 8, textColor: [40, 40, 40] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 'auto' },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'right', cellWidth: 28 },
      4: { halign: 'right', cellWidth: 30 },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y + 50;
  y += 4;

  // ---------------- Totals breakdown --------------------------------------
  const halfTax = pricing.taxAmount / 2;
  const totalsLines: Array<[string, string]> = [];
  totalsLines.push(['Item total', formatINR(pricing.subtotal)]);
  if (pricing.couponDiscount > 0) {
    const code = order.couponCode ? ` (${order.couponCode})` : '';
    totalsLines.push([`Coupon Discount${code}`, `- ${formatINR(pricing.couponDiscount)}`]);
  }
  if (pricing.gstInclusive && pricing.taxAmount > 0) {
    totalsLines.push(['Taxable value', formatINR(pricing.taxableValue)]);
  }
  if (pricing.deliveryCharge > 0) totalsLines.push(['Delivery Charges', formatINR(pricing.deliveryCharge)]);
  if (pricing.codCharge > 0) totalsLines.push(['COD Handling', formatINR(pricing.codCharge)]);
  if (pricing.taxAmount > 0) {
    if (pricing.isIntraState) {
      totalsLines.push([`CGST @ ${(pricing.gstRate / 2).toFixed(2)}%${pricing.gstInclusive ? ' (included)' : ''}`, formatINR(halfTax)]);
      totalsLines.push([`SGST @ ${(pricing.gstRate / 2).toFixed(2)}%${pricing.gstInclusive ? ' (included)' : ''}`, formatINR(halfTax)]);
    } else {
      totalsLines.push([`IGST @ ${pricing.gstRate.toFixed(2)}%${pricing.gstInclusive ? ' (included)' : ''}`, formatINR(pricing.taxAmount)]);
    }
  }

  const totalsX = pageWidth - margin - 80;
  const totalsW = 80;
  doc.setFontSize(9);
  totalsLines.forEach(([label, value], idx) => {
    const ry = y + idx * 6;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(70, 70, 70);
    doc.text(label, totalsX, ry);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text(value, totalsX + totalsW, ry, { align: 'right' });
  });

  y += totalsLines.length * 6 + 2;

  // Grand total band
  doc.setFillColor(30, 30, 30);
  doc.rect(totalsX - 2, y, totalsW + 2, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('Grand Total', totalsX, y + 6.5);
  doc.text(formatINR(pricing.total), totalsX + totalsW, y + 6.5, { align: 'right' });
  y += 16;

  // ---------------- Amount in words ---------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text('Amount in Words:', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  const words = amountInWords(pricing.total);
  const wordsLines = doc.splitTextToSize(words, pageWidth - margin * 2);
  doc.text(wordsLines, margin, y);
  y += wordsLines.length * 4 + 8;

  // ---------------- Signature box -----------------------------------------
  const sigW = 70;
  const sigH = 25;
  const sigX = pageWidth - margin - sigW;
  doc.setDrawColor(180, 180, 180);
  doc.rect(sigX, y, sigW, sigH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);
  doc.text(`For ${SELLER.name}`, sigX + 4, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Authorised Signatory', sigX + sigW / 2, y + sigH - 4, { align: 'center' });

  // ---------------- Footer ------------------------------------------------
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, pageHeight - 18, pageWidth - margin, pageHeight - 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  const footer = `This is a computer-generated invoice and does not require a physical signature. For queries, contact ${SELLER.phone} or ${SELLER.email}. Whether tax is payable under reverse charge: No.`;
  doc.text(footer, pageWidth / 2, pageHeight - 12, {
    align: 'center',
    maxWidth: pageWidth - margin * 2,
  });

  doc.save(`Invoice-${order.orderId}.pdf`);
};
