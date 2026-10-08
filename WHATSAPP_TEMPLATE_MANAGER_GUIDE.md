# WhatsApp Template Manager Guide

**Setting up WhatsApp for the first time?** Follow the click-by-click guide in [docs/WHATSAPP_SETUP.md](docs/WHATSAPP_SETUP.md). It covers the Meta app, the phone number, the permanent token, the Vercel settings, the webhook, the first template and testing the inbox.

## Create templates from the admin

You no longer need WhatsApp Manager to create templates.

1. Open **Admin → Marketing → Templates → Create new**.
2. Enter the name, language and category (Utility, Marketing or Authentication).
3. Write the message. Use **Add variable**, or one of the shortcut buttons, to insert `{{1}}`, `{{2}}` and so on, then give each variable an example.
4. Optionally add a header, a footer and buttons (quick reply, website link, call).
5. Check the WhatsApp-style preview and click **Submit to Meta for review**.
6. In **Library**, click **Sync from Meta** to refresh the status badges (In review, Approved, Rejected). Rejected templates show Meta's reason.
7. Delete a template with the bin icon. You will be asked to confirm. A deleted name cannot be reused for 30 days.

Synced templates are saved to the `whatsappTemplates` list that the inbox and campaigns use. Only **Approved** templates (and ones added by hand) can be sent.

**Add manually** is a fallback for a template that is already approved in Meta but does not appear after syncing. Type the exact name, language, category and variable names.

## Recommended templates

| Template name | Category | Language | Variables | Example body |
| --- | --- | --- | --- | --- |
| `order_update_v1` | Utility | `en_US` | customer name, order id, status, link | Hi `{{1}}`, your Ishaputra Botanicals order `{{2}}` is now `{{3}}`. View details: `{{4}}` today. |
| `delivery_window_v1` | Utility | `en_US` | customer name, order id, date, time window | Hi `{{1}}`, delivery for order `{{2}}` is scheduled on `{{3}}` between `{{4}}`. Reply here if you need to change it. |
| `return_pickup_window_v1` | Utility | `en_US` | customer name, order id, date, time window | Hi `{{1}}`, return pickup for order `{{2}}` is scheduled on `{{3}}` between `{{4}}`. Please keep the item packed. |
| `support_followup_v1` | Utility | `en_US` | customer name, support message | Hi `{{1}}`, our support team has an update: `{{2}}`. Reply here with any questions. |
| `promotion_offer_v1` | Marketing | `en_US` | customer name, offer title, coupon code, expiry date | Hi `{{1}}`, `{{2}}` is live. Use code `{{3}}` before `{{4}}`. Reply STOP to opt out. |
| `back_in_stock_v1` | Marketing | `en_US` | customer name, product name, product link | Hi `{{1}}`, `{{2}}` is back in stock. View it here: `{{3}}` on our website. |

Meta rejects a message that starts or ends with a variable, so each example has words before `{{1}}` and after the last variable.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `FIREBASE_ADMIN_SDK_BASE64` | Firebase Admin SDK credentials for API routes. |
| `WHATSAPP_TOKEN` | Permanent System User token (whatsapp_business_messaging + whatsapp_business_management). |
| `WHATSAPP_PHONE_ID` | Phone number ID used to send messages. |
| `WHATSAPP_WABA_ID` | WhatsApp Business Account ID, used to create, list and delete templates. |
| `WHATSAPP_VERIFY_TOKEN` | Text you choose, typed into Meta's webhook configuration. |
| `WHATSAPP_APP_SECRET` | Meta app secret, used to verify the webhook signature. |

Admin → WhatsApp → Setup (gear icon) shows which of these are set, without ever showing their values.
