/**
 * Feature flags — single source of truth for toggling large product areas
 * on/off without deleting the underlying code.
 *
 * DELIVERY_PARTNERS_ENABLED
 * -------------------------
 * Controls the in-house delivery-partner ("delivery boy") system:
 *   - Delivery partner login / dashboard / order / map routes
 *   - The "Delivery" tab on the customer login screen
 *   - The "Delivery Boys" section in the admin panel
 *   - The "Assign delivery partner" + OTP panels in admin order details
 *
 * When `false`, the store runs in **admin-managed fulfilment** mode: the admin
 * updates order progress directly (Processing → Packed → Out for Delivery →
 * Delivered, plus returns) and customers see those updates in real time.
 *
 * We are currently collaborating with external delivery partners and do not
 * operate our own delivery staff, so this is `false`. Flip it to `true` to
 * bring the full delivery-partner workflow back online — no code needs to be
 * rewritten, only re-enabled.
 */
export const DELIVERY_PARTNERS_ENABLED = false;
