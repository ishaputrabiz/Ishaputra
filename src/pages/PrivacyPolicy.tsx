import {
  policyBodyClassName,
  policyCardClassName,
  policyHeadingClassName,
  policyLinkClassName,
  policyListClassName,
  policyNoteClassName,
  policySectionClassName,
} from "@/components/PolicyPageLayout";
import PolicyPageLayout from "@/components/PolicyPageLayout";
import { SITE_HOST, SITE_URL } from "@/lib/siteUrl";

const PrivacyPolicy = () => {
  return (
    <PolicyPageLayout title="Privacy Policy" effectiveDate="Effective Date: February 17, 2026">
      <>
            {/* Introduction */}
            <section className={policySectionClassName}>
              <p className={policyBodyClassName}>
                Sreerasthu Silvers ("we", "our", "us") operates the website <a href={SITE_URL} className={policyLinkClassName}>{SITE_HOST}</a>.
                We value your privacy and are committed to protecting your personal information.
              </p>
            </section>

            {/* Information We Collect */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>1. Information We Collect</h2>
              <p className={`${policyBodyClassName} mb-3`}>
                We may collect the following information when you use our website:
              </p>
              <ul className={policyListClassName}>
                <li>Full Name</li>
                <li>Email Address</li>
                <li>Phone Number</li>
                <li>Shipping Address</li>
                <li>Billing Address</li>
                <li>Order Details</li>
                <li>Device and browser information</li>
              </ul>
            </section>

            {/* How We Use Information */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>3. How We Use Your Information</h2>
              <p className={`${policyBodyClassName} mb-3`}>
                We use your information to:
              </p>
              <ul className={policyListClassName}>
                <li>Process and deliver your orders</li>
                <li>Provide customer support</li>
                <li>Send order confirmations and updates</li>
                <li>Improve our services</li>
                <li>Prevent fraud and misuse</li>
              </ul>
            </section>

            {/* Payment Information */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>2. Payment Information</h2>
              <div className={policyNoteClassName}>
                <p className={policyBodyClassName}>
                  <strong className="text-foreground">All online payments are processed securely through Razorpay.</strong> We do not store your credit/debit card details, UPI credentials, or banking information on our servers.
                </p>
              </div>
            </section>

            {/* Data Security */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>4. Data Security</h2>
              <p className={policyBodyClassName}>
                We implement reasonable security measures to protect your personal data. However, no method of transmission over the internet is 100% secure.
              </p>
            </section>

            {/* Sharing Information */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>5. Sharing of Information</h2>
              <p className={`${policyBodyClassName} mb-3`}>
                We do not sell, rent, or trade your personal information. We may share data with:
              </p>
              <ul className={policyListClassName}>
                <li>Payment gateways (Razorpay)</li>
                <li>Shipping partners</li>
                <li>Government authorities if legally required</li>
              </ul>
            </section>

            {/* Contact Information */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>6. Contact Us</h2>
              <p className={`${policyBodyClassName} mb-4`}>
                For any privacy-related concerns, contact:
              </p>
              <div className={policyCardClassName}>
                <p className={policyBodyClassName}><strong className="text-foreground">Email:</strong> <a href="mailto:sreerasthusilvers@gmail.com" className={policyLinkClassName}>sreerasthusilvers@gmail.com</a></p>
                <p className={`${policyBodyClassName} mt-2`}><strong className="text-foreground">Phone:</strong> +91 63049 60489</p>
                <div className="mt-4">
                  <p className="font-semibold text-foreground">Address:</p>
                  <p className={policyBodyClassName}>Sreerasthu Silvers</p>
                  <p className={policyBodyClassName}>Ramasomayajulu St,</p>
                  <p className={policyBodyClassName}>Rama Rao Peta, Kakinada,</p>
                  <p className={policyBodyClassName}>Andhra Pradesh – 533001, India</p>
                </div>
              </div>
            </section>
      </>
    </PolicyPageLayout>
  );
};

export default PrivacyPolicy;
