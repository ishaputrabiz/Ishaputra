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
import { usePageMeta } from "@/hooks/usePageMeta";
import { SITE_HOST, SITE_URL } from "@/lib/siteUrl";
import { BRAND } from "@/config/brand";

const PrivacyPolicy = () => {
  usePageMeta({ title: "Privacy policy", description: "What Ishaputra Botanicals collects, how it is used and who it is shared with." });

  return (
    <PolicyPageLayout title="Privacy policy" effectiveDate="Draft: pending review by Ishaputra Botanicals">
      <>
            {/* Introduction */}
            <section className={policySectionClassName}>
              <p className={policyBodyClassName}>
                Ishaputra Botanicals (“we”, “our”, “us”) operates the website <a href={SITE_URL} className={policyLinkClassName}>{SITE_HOST}</a>.
                We value your privacy and are committed to protecting your personal information.
              </p>
            </section>

            {/* Information We Collect */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>1. Information we collect</h2>
              <p className={`${policyBodyClassName} mb-3`}>
                We may collect the following information when you use our website:
              </p>
              <ul className={policyListClassName}>
                <li>Full name</li>
                <li>Email address</li>
                <li>Phone number</li>
                <li>Shipping address</li>
                <li>Billing address</li>
                <li>Order details</li>
                <li>Device and browser information</li>
              </ul>
            </section>

            {/* How We Use Information */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>2. How we use your information</h2>
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
              <h2 className={policyHeadingClassName}>3. Payment information</h2>
              <div className={policyNoteClassName}>
                <p className={policyBodyClassName}>
                  <strong className="text-foreground">All online payments are processed securely through Razorpay.</strong> We do not store your credit/debit card details, UPI credentials, or banking information on our servers.
                </p>
              </div>
            </section>

            {/* Data Security */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>4. Data security</h2>
              <p className={policyBodyClassName}>
                We implement reasonable security measures to protect your personal data. However, no method of transmission over the internet is 100% secure.
              </p>
            </section>

            {/* Sharing Information */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>5. Sharing of information</h2>
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
              <h2 className={policyHeadingClassName}>6. Contact us</h2>
              <p className={`${policyBodyClassName} mb-4`}>
                For any privacy-related concerns, contact:
              </p>
              <div className={policyCardClassName}>
                <p className={policyBodyClassName}><strong className="text-foreground">Email:</strong> <a href={`mailto:${BRAND.email}`} className={policyLinkClassName}>{BRAND.email}</a></p>
                {BRAND.phones[0] && (
                  <p className={`${policyBodyClassName} mt-2`}><strong className="text-foreground">Phone:</strong> {BRAND.phones[0]}</p>
                )}
                <div className="mt-4">
                  <p className="font-semibold text-foreground">Address</p>
                  <p className={policyBodyClassName}>{BRAND.legalName}</p>
                  {BRAND.addressLines.map((line) => (
                    <p key={line} className={policyBodyClassName}>{line}</p>
                  ))}
                </div>
              </div>
            </section>
      </>
    </PolicyPageLayout>
  );
};

export default PrivacyPolicy;
