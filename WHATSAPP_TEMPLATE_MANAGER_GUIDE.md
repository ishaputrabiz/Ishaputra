# WhatsApp Template Manager Guide

Use this guide to create the approved WhatsApp templates in Meta WhatsApp Manager and connect inbound messages to the admin WhatsApp Inbox.

## Create Templates in WhatsApp Manager

1. Open Meta Business Suite, then go to WhatsApp Manager.
2. Select the phone number used by this store.
3. Open Message templates and click Create template.
4. Use the exact template name from the table below.
5. Choose the category and language shown below.
6. Add the body text with numbered variables like `{{1}}`, `{{2}}`, and `{{3}}`.
7. Add sample values for every variable.
8. Submit the template for Meta approval.
9. After approval, open Admin -> Marketing Center -> Templates and add the same template name, language, category, and parameter labels.

## Recommended Templates

| Template name | Category | Language | Parameters | Example body |
| --- | --- | --- | --- | --- |
| `order_update_v1` | Utility | `en_US` | `customer_name`, `order_id`, `status`, `tracking_or_order_link` | Hi `{{1}}`, your Sreerasthu Silvers order `{{2}}` is now `{{3}}`. View details: `{{4}}` |
| `delivery_window_v1` | Utility | `en_US` | `customer_name`, `order_id`, `date`, `time_window` | Hi `{{1}}`, delivery for order `{{2}}` is scheduled on `{{3}}` between `{{4}}`. |
| `return_pickup_window_v1` | Utility | `en_US` | `customer_name`, `order_id`, `date`, `time_window` | Hi `{{1}}`, return pickup for order `{{2}}` is scheduled on `{{3}}` between `{{4}}`. |
| `support_followup_v1` | Utility | `en_US` | `customer_name`, `support_message` | Hi `{{1}}`, our support team has an update: `{{2}}` |
| `promotion_offer_v1` | Marketing | `en_US` | `customer_name`, `offer_title`, `coupon_code`, `expiry_date` | Hi `{{1}}`, `{{2}}` is live. Use code `{{3}}` before `{{4}}`. |
| `back_in_stock_v1` | Marketing | `en_US` | `customer_name`, `product_name`, `product_link` | Hi `{{1}}`, `{{2}}` is back in stock. View it here: `{{3}}` |

## Add Template Metadata in Admin

For every approved Meta template:

1. Go to Admin -> Marketing Center -> Templates.
2. Add the exact Meta template name, for example `order_update_v1`.
3. Set language to `en_US` unless you created a different language in Meta.
4. Set category to Utility or Marketing to match Meta.
5. Add parameter labels in the same order as Meta variables.
6. Save the template metadata.

The admin panel does not create Meta templates. It stores approved template metadata so campaigns and WhatsApp replies can send the right variables to Meta.

## Meta Webhook Setup

Use the webhook so customer replies appear in Admin -> WhatsApp Inbox.

1. Open Meta Developers and select the app connected to the WhatsApp Business account.
2. Go to WhatsApp -> Configuration.
3. In Callback URL, enter your production domain plus the webhook path:

   ```text
   https://your-domain.com/api/whatsapp-webhook
   ```

4. In Verify token, enter the same value configured in your deployment environment as `WHATSAPP_VERIFY_TOKEN`.
5. Click Verify and save.
6. Subscribe to the `messages` webhook field.
7. Set `WHATSAPP_APP_SECRET` in your deployment environment. The webhook uses it to verify Meta's `x-hub-signature-256` header.
8. Redeploy after changing environment variables.

## Required Environment Variables

| Variable | Purpose |
| --- | --- |
| `FIREBASE_ADMIN_SDK_BASE64` | Firebase Admin SDK credentials for API routes. |
| `WHATSAPP_TOKEN` | Permanent or long-lived Meta WhatsApp Cloud API token. |
| `WHATSAPP_PHONE_ID` | Meta WhatsApp phone number ID used for sending messages. |
| `WHATSAPP_VERIFY_TOKEN` | Token typed into Meta webhook configuration. |
| `WHATSAPP_APP_SECRET` | Meta app secret used to verify inbound webhook signatures. |

## Quick Test

1. Send a WhatsApp message from a customer phone to the business number.
2. Open Admin -> WhatsApp Inbox.
3. Confirm the thread appears with the latest message.
4. Reply within 24 hours using Text mode.
5. After 24 hours, use Template mode with an approved template.