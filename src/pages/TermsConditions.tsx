import {
  policyBodyClassName,
  policyHeadingClassName,
  policyLinkClassName,
  policyListClassName,
  policySectionClassName,
} from "@/components/PolicyPageLayout";
import PolicyPageLayout from "@/components/PolicyPageLayout";
import { SITE_HOST, SITE_URL } from "@/lib/siteUrl";

const TermsConditions = () => {
  return (
    <PolicyPageLayout title="Terms & Conditions" effectiveDate="Effective Date: February 17, 2026">
      <>
            {/* Introduction */}
            <section className={policySectionClassName}>
              <p className={policyBodyClassName}>
                By accessing <a href={SITE_URL} className={policyLinkClassName}>{SITE_HOST}</a>, you agree to be bound by these terms.
              </p>
            </section>

            {/* Products & Pricing */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>1. Products & Pricing</h2>
              <ul className={policyListClassName}>
                <li>All prices are listed in INR (₹). We reserve the right to change prices at any time without prior notice.</li>
                <li>Product images are for representation purposes. Slight variations may occur due to lighting and photography.</li>
              </ul>
            </section>

            {/* Orders */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>2. Orders</h2>
              <p className={`${policyBodyClassName} mb-3`}>
                We reserve the right to cancel any order due to:
              </p>
              <ul className={policyListClassName}>
                <li>Pricing errors</li>
                <li>Product unavailability</li>
                <li>Suspicious or fraudulent activity</li>
              </ul>
            </section>

            {/* Payments */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>3. Payments</h2>
              <p className={policyBodyClassName}>
                We accept online payments securely through Razorpay. We also offer Cash on Delivery (if applicable).
              </p>
            </section>

            {/* Shipping */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>4. Shipping</h2>
              <p className={policyBodyClassName}>
                We deliver across India only. Delivery timelines are mentioned in our Shipping Policy.
              </p>
            </section>

            {/* Returns */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>5. Returns</h2>
              <p className={policyBodyClassName}>
                Product returns are governed by our Return & Replacement Policy. We offer product replacements for eligible items.
              </p>
            </section>

            {/* Governing Law */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>6. Governing Law</h2>
              <p className={policyBodyClassName}>
                These terms shall be governed by the laws of India.
              </p>
            </section>
      </>
    </PolicyPageLayout>
  );
};

export default TermsConditions;
