# WhatsApp setup guide (for the store owner)

This guide connects your WhatsApp business number to the website admin. When you finish, you can:

- reply to customers from **Admin → WhatsApp**,
- create message templates from **Admin → Marketing → Templates**,
- send announcements to all or chosen customers from **Admin → Marketing → Announcement** (step 9b),
- send other WhatsApp campaigns from **Admin → Marketing → Custom**.

It takes about 45 minutes. Do it on a computer, not a phone. Meta changes its screens from time to time, so a button may be in a slightly different place. Look for the words in **bold**.

**Before you start, have these ready:**

- The Facebook account that manages the Ishaputra Botanicals business on Meta (business.facebook.com).
- A phone number for WhatsApp Business that can receive an SMS or a call. **Important:** a number connected here can no longer be used in the normal WhatsApp or WhatsApp Business phone app. Use a separate number if you want to keep the app.
- Your login for vercel.com (where the website runs).
- A notepad to paste IDs into. Never share the token from step 4 with anyone or paste it into chat.

The **Setup** button (gear icon) at the top of **Admin → WhatsApp** shows which steps are done. Its step numbers match this guide.

---

## Step 1. Create or choose the Meta app

1. Go to **developers.facebook.com** and log in with the Facebook account that manages the business.
2. Click **My Apps** at the top right.
3. If an app for the store already exists (for example "Ishaputra Botanicals"), click it and go to step 2.
4. If not, click **Create app**.
5. When asked what the app should do, choose **Other**, then app type **Business**. Click **Next**.
6. App name: `Ishaputra Botanicals Store`. Contact email: your business email.
7. For **Business portfolio**, pick **Ishaputra Botanicals**. Click **Create app** and enter your Facebook password if asked.

## Step 2. Add the WhatsApp product

1. In the app dashboard, scroll to **Add products to your app**.
2. Find **WhatsApp** and click **Set up**.
3. If asked, choose the Ishaputra Botanicals business portfolio and click **Continue**.
4. Meta creates a **WhatsApp Business Account** (Meta calls it a "WABA") and a free test number. The test number is fine for trying things out. Step 3 adds your real number.

## Step 3. Register the business phone number

1. In the left menu, click **WhatsApp → API Setup**.
2. Scroll to **Step 5: Add a phone number** (or the **Add phone number** button) and click it.
3. Fill in the business profile:
    - **Display name**: `Ishaputra Botanicals`. Meta checks that it matches your business. Customers see this name.
    - **Category**: Shopping and retail.
4. Enter the phone number and choose **Text message** or **Phone call** to get a code.
5. Type the 6-digit code and click **Next**.
6. Go to **business.facebook.com → WhatsApp Manager → Phone numbers**. If the number says **Pending**, wait. A display name can take a few hours to be approved.
7. In **WhatsApp Manager → Overview** (or **Payment methods**), add a payment method. Meta charges for marketing and some template messages. Replies to a customer inside 24 hours of their message are free.

## Step 4. Make a permanent access token

The website needs a token (a long password) to send messages for you. Tokens from the API Setup page expire after a day, so make a permanent one:

1. Go to **business.facebook.com → Settings** (gear icon) → **Users → System users**.
2. Click **Add**. Name: `website-whatsapp`. Role: **Admin**. Click **Create system user**.
3. With the new system user selected, click **Assign assets**:
    - Choose **Apps**, tick the app from step 1, turn on **Full control** (Manage app). Click **Save changes**.
    - Click **Assign assets** again, choose **WhatsApp accounts**, tick your WhatsApp Business Account, turn on **Full control**. Click **Save changes**.
4. Click **Generate new token**.
5. Choose the app from step 1. For **Token expiration**, choose **Never**.
6. Tick these two permissions:
    - `whatsapp_business_messaging`
    - `whatsapp_business_management`
7. Click **Generate token**. Copy it straight into Vercel in step 6. Meta shows it only once. If you lose it, generate a new one.

## Step 5. Find the Phone number ID and the WABA ID

1. Go back to **developers.facebook.com → your app → WhatsApp → API Setup**.
2. In the **From** box, pick your real business number (not the test number).
3. Under it you will see two numbers:
    - **Phone number ID**: copy it. It goes into `WHATSAPP_PHONE_ID`.
    - **WhatsApp Business Account ID**: copy it. It goes into `WHATSAPP_WABA_ID`.

These are long numbers like `123456789012345`. They are not your phone number.

## Step 6. Add the values in Vercel, then redeploy

1. Find your **App secret**: in the Meta app dashboard, click **App settings → Basic**. Next to **App secret**, click **Show**, enter your password and copy it.
2. Choose a **verify token**. It is a password you make up, for example `ishaputra-webhook-` followed by a few random words. Write it down for step 7.
3. Go to **vercel.com**, open the website project, then click **Settings → Environment Variables**.
4. Add each of these. For each one, type the **Key**, paste the **Value**, keep **Production** ticked, and click **Save**.

| Key | Value |
| --- | --- |
| `WHATSAPP_TOKEN` | The permanent token from step 4 |
| `WHATSAPP_PHONE_ID` | The Phone number ID from step 5 |
| `WHATSAPP_WABA_ID` | The WhatsApp Business Account ID from step 5 |
| `WHATSAPP_VERIFY_TOKEN` | The password you made up in point 2 above |
| `WHATSAPP_APP_SECRET` | The App secret from point 1 above |
| `FIREBASE_ADMIN_SDK_BASE64` | Probably already there (other features use it). If it is missing, ask your developer. |
| `WHATSAPP_APP_ID` | Optional. Only needed if creating a template **with a picture** fails with "Could not work out the Meta app ID". It is the **App ID** at the top of **App settings → Basic**. |

5. If a key already exists with an old value, click the three dots next to it → **Edit**, and replace the value.
6. Click **Deployments** at the top. On the newest deployment, click the three dots → **Redeploy** → **Redeploy**. New values only work after a redeploy. Wait until it says **Ready**.

## Step 7. Connect the webhook (so customer messages reach the admin)

1. Go to **developers.facebook.com → your app → WhatsApp → Configuration**.
2. Under **Webhook**, click **Edit**.
3. **Callback URL**: your website address followed by `/api/whatsapp-webhook`, for example:

    ```text
    https://www.ishaputra.in/api/whatsapp-webhook
    ```

4. **Verify token**: type exactly the same verify token you saved in Vercel (`WHATSAPP_VERIFY_TOKEN`).
5. Click **Verify and save**. If it fails, see "Common problems" below.
6. Under **Webhook fields**, click **Manage**. Find **messages** and click **Subscribe**. This one field brings in customer messages and the delivered and read ticks.
7. At the top of the app dashboard, switch **App mode** from **Development** to **Live**. Meta may ask for a privacy policy link; use your website's privacy policy page. In Development mode, real customer messages are not sent to the website.

## Step 8. Create your first template and wait for approval

You need an approved template to message a customer who has not written to you in the last 24 hours.

1. Log in to the website admin and open **Marketing → Templates → Create new**.
2. **Template name**: for example `order_update_v1` (small letters, numbers and underscores only).
3. **Category**:
    - **Utility** for order updates, delivery slots and returns (cheapest, fastest approval);
    - **Marketing** for offers and new collections;
    - **Authentication** only for login codes.
4. Type the **Message text**. Click **Customer name**, **Order number** or **Add variable** to put in blanks like `{{1}}` that you fill when sending.
5. For each variable, type a short name and a realistic **example** (Meta needs one per variable).
6. Check the preview on the right, then click **Submit to Meta for review**.
7. Open the **Library** tab and click **Sync from Meta** now and then. The badge changes from **In review** to **Approved**, usually within minutes and sometimes up to 24 hours.
8. If it says **Rejected**, read the reason under the name, fix the text, and create it again with a new name (for example `_v2`).

Templates you made earlier directly in WhatsApp Manager appear after **Sync from Meta**. The **Add manually** tab is still there as a backup.

## Step 9. Test the inbox

1. From your personal phone, send "Hi" on WhatsApp to the business number.
2. Open **Admin → WhatsApp**. The message should appear within a few seconds with a green unread badge. The **WhatsApp** item in the admin menu also shows the unread count.
3. Open the conversation and type a reply. It should arrive on your phone. Under your reply in the admin you will see one grey tick (sent), two grey ticks (delivered) and two blue ticks (read).
4. Try the other tools:
    - **Note**: an internal note. Only your team sees it; it is never sent.
    - **Assign** (person icon): give the conversation to a team member. Any admin user can be picked.
    - **Resolve**: mark the conversation done. It reopens by itself when the customer writes again.
    - **Quick replies** (lightning icon): save answers you type often.
    - **Filters and search**: All, Unread, Open, Resolved, Assigned to me; search by name or phone.
5. The clock at the bottom shows how long you can still reply freely. After 24 hours without a customer message, only **Template** works. The admin switches to it by itself.

## Step 9b. Send an announcement

1. Open **Admin → Marketing → Announcement**.
2. The first time only: click **Create announcement template**. Meta reviews it (usually minutes, up to 24 hours). Click **Check status with Meta** until the box turns green.
3. Type your message. The preview on the right shows what customers get, with their own first name.
4. Pick **All customers**, or **Choose customers** and tick the people you want.
5. Leave **WhatsApp** ticked (and tick **Website notification** too if you like), click **Send announcement**, check the summary and click **Send now**.

Customers who reply **STOP** are skipped from then on; **START** turns announcements back on. Meta charges a small fee for each marketing message.

## Step 10. Common problems and fixes

| What you see | What it means | Fix |
| --- | --- | --- |
| **Setup incomplete** banner in Admin → WhatsApp | One or more Vercel values are missing | Click **View**; red marks show which. Add them (step 6) and redeploy. |
| Meta says **"The callback URL or verify token couldn't be validated"** | The verify token does not match, or the site was not redeployed | Make the token in Meta exactly the same as `WHATSAPP_VERIFY_TOKEN` (no spaces), redeploy, and try again. Check the URL ends with `/api/whatsapp-webhook`. |
| Customer messages never appear in the inbox | Webhook not subscribed, app in Development mode, or wrong app secret | Step 7 points 6 and 7. Check `WHATSAPP_APP_SECRET` is the secret of the **same** app. In Vercel → Logs, "Invalid signature" means the secret is wrong. |
| "The WhatsApp token is invalid or has expired" | The token was temporary or was deleted | Make a permanent token (step 4), update `WHATSAPP_TOKEN`, redeploy. |
| "The token is missing a permission" | The system user lacks a permission or asset | Step 4: assign both the app and the WhatsApp account, and tick both permissions. Generate a new token. |
| "Meta cannot find that ID" | The Phone number ID or WABA ID is wrong | Copy them again from step 5. Do not use the phone number itself. |
| "Free-form reply window has closed" or a red "more than 24 hours" note under your reply | The customer last wrote over 24 hours ago | Use **Template** mode with an approved template. |
| Red "this number may not use WhatsApp" under a reply | The number is not on WhatsApp, or has a very old app | Contact the customer another way. |
| "Content in this language already exists" when creating a template | A template with that name and language exists | Use a new name, for example add `_v2`. |
| "Name can't be reused" after deleting a template | Meta blocks deleted names for 30 days | Use a different name. |
| Template stuck on **In review** | Meta is still reviewing | Wait up to 24 hours, then click **Sync from Meta**. |
| Template **Rejected** | Usually wording: looks promotional in Utility, variables at the very start or end, or unclear examples | Read the reason, fix it, create again with a new name. |
| Templates fail with a payment error | No payment method on the WhatsApp account | Step 3 point 7. |
| "This file is larger than 25 MB" when opening a file | The inbox opens files up to 25 MB | Open it in the WhatsApp Business app, or ask the customer for a smaller file. |
| "Files sent from here can be up to 3 MB" | The paperclip in the inbox sends photos (shrunk automatically) and documents up to 3 MB | Send a smaller document, or share a link. |
| "This template has a picture at the top but none is saved" | A picture template made in WhatsApp Manager has no picture on the website yet | **Marketing → Templates → Library**, click **Set picture** on that template. |
| "The WhatsApp API is not available here" | You are on a local test copy, not the live site | Use the live website address. |

If something still does not work, send your developer a screenshot of the error. Never send the token or the app secret.
