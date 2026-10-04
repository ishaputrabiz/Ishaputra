/**
 * One display map for order and product statuses, shared by the customer
 * order pages, the admin lists and the admin detail pages, so every surface
 * agrees on the label, colour tone and icon.
 *
 * Display only. Workflow rules (which status may follow which) stay in
 * src/services/orderService.ts.
 */
import {
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  EyeOff,
  Package,
  PackageX,
  RotateCcw,
  TriangleAlert,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { returnRequestTiming } from '@/lib/returnWindow';

export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'returns' | 'neutral';

export interface StatusDisplay {
  label: string;
  tone: StatusTone;
  icon: LucideIcon;
}

/** The fields of an order this map can use. Every field is optional. */
export interface OrderStatusContext {
  paymentMethod?: string | null;
  needsManualReview?: boolean;
  deliveredAt?: unknown;
  returnRequestedAt?: unknown;
  returnStatus?: string | null;
  returnReason?: string | null;
}

const isCod = (paymentMethod?: string | null) => {
  const v = String(paymentMethod || '').toLowerCase();
  return v.includes('cash on delivery') || v === 'cod' || v.includes('cash');
};

/** True when the order has entered the return path (so 'picked' means the return pickup). */
const isInReturn = (order?: OrderStatusContext) =>
  !!order && !!(order.returnRequestedAt || order.returnStatus || order.returnReason);

const BASE: Record<string, StatusDisplay> = {
  pending: { label: 'Pending', tone: 'warning', icon: Clock },
  processing: { label: 'Processing', tone: 'info', icon: Package },
  packed: { label: 'Packed', tone: 'info', icon: Package },
  assigned: { label: 'Packed', tone: 'info', icon: Package },
  shipped: { label: 'Shipped', tone: 'info', icon: Truck },
  outForDelivery: { label: 'Out for delivery', tone: 'info', icon: Truck },
  delivered: { label: 'Delivered', tone: 'success', icon: CircleCheck },
  refunded: { label: 'Refunded', tone: 'success', icon: CircleCheck },
  cancelled: { label: 'Cancelled', tone: 'danger', icon: CircleX },
  // One label for shopper and shop: plain about what happened, no blame.
  deliveryFailed: { label: 'Delivery failed', tone: 'danger', icon: TriangleAlert },
  returnRequested: { label: 'Return requested', tone: 'returns', icon: RotateCcw },
  returnScheduled: { label: 'Return scheduled', tone: 'returns', icon: RotateCcw },
  picked: { label: 'Return picked up', tone: 'returns', icon: RotateCcw },
  returned: { label: 'Returned', tone: 'returns', icon: RotateCcw },
};

/** Every status value the Order type allows, in workflow order (for filters and legends). */
export const ORDER_STATUSES = [
  'pending',
  'processing',
  'packed',
  'outForDelivery',
  'delivered',
  'deliveryFailed',
  'cancelled',
  'returnRequested',
  'returnScheduled',
  'picked',
  'returned',
  'refunded',
] as const;

/**
 * Label, tone and icon for an order status.
 *
 * Pass the order when you have it: it turns a pending cash-on-delivery order
 * into 'Pending, COD', a flagged paid order into 'Needs review', an outbound
 * 'picked' into 'Out for delivery', and a return requested after the 7-day
 * window into a neutral 'Late return'.
 */
export function getOrderStatus(status: string | null | undefined, order?: OrderStatusContext): StatusDisplay {
  const key = status || 'pending';

  if (order?.needsManualReview && key !== 'cancelled' && key !== 'refunded') {
    return { label: 'Needs review', tone: 'danger', icon: TriangleAlert };
  }
  if (key === 'pending' && order && isCod(order.paymentMethod)) {
    return { label: 'Pending, COD', tone: 'warning', icon: Clock };
  }
  if (key === 'picked' && order && !isInReturn(order)) {
    return BASE.outForDelivery;
  }
  if (key === 'returnRequested' && order && returnRequestTiming(order.deliveredAt, order.returnRequestedAt) === 'late') {
    return { label: 'Late return', tone: 'neutral', icon: RotateCcw };
  }

  return BASE[key] ?? { label: humanize(key), tone: 'neutral', icon: Clock };
}

/**
 * Product availability on admin lists, in the same order admin Products
 * decides it: no stock is 'Sold out' (the shop hides it), otherwise the
 * product's flags.isActive gives 'Live' or 'Hidden'.
 */
export function getProductStatus(product: { isActive?: boolean; stock?: number | null }): StatusDisplay {
  if (typeof product.stock === 'number' && product.stock <= 0) return { label: 'Sold out', tone: 'danger', icon: PackageX };
  if (product.isActive) return { label: 'Live', tone: 'success', icon: Eye };
  return { label: 'Hidden', tone: 'neutral', icon: EyeOff };
}

/**
 * The one way admin screens print an order number: 'ORD-48273723'. The list,
 * the order page, its confirmations and customer order history all use it,
 * so the owner can match an order at a glance and search for what they see.
 * Accepts the number with or without the prefix or a leading '#'.
 */
export function orderLabel(orderNumber: string | number | null | undefined): string {
  const raw = String(orderNumber ?? '').trim().replace(/^#/, '');
  if (!raw) return 'Order';
  return /^ORD-/i.test(raw) ? raw.toUpperCase() : `ORD-${raw}`;
}

/** 'outForDelivery' -> 'Out for delivery' (sentence case) for any status this map does not know. */
function humanize(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
