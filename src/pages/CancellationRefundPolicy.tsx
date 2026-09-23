import {
  policyBodyClassName,
  policyHeadingClassName,
  policyLinkClassName,
  policyListClassName,
  policySectionClassName,
} from "@/components/PolicyPageLayout";
import PolicyPageLayout from "@/components/PolicyPageLayout";

const CancellationRefundPolicy = () => {
  return (
    <PolicyPageLayout title="Cancellation & Refund Policy" effectiveDate="Last Updated: February 17, 2026">
      <>
            {/* Introduction */}
            <section className={policySectionClassName}>
              <p className={policyBodyClassName}>
                At Sreerasthu Silvers, customer satisfaction is our priority.
              </p>
            </section>

            {/* Return Window */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>1. Return Window</h2>
              <p className={policyBodyClassName}>
                Customers may request a return within 7 days from the date of delivery.
              </p>
            </section>

            {/* Eligibility for Return */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>2. Eligibility for Return</h2>
              <p className={`${policyBodyClassName} mb-3`}>
                Products must:
              </p>
              <ul className={policyListClassName}>
                <li>Be unused</li>
                <li>Be in original packaging</li>
                <li>Include invoice and tags</li>
              </ul>
              <p className={`${policyBodyClassName} mt-4`}>
                Customized or damaged products are not eligible for return.
              </p>
            </section>

            {/* Cancellation */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>3. Cancellation</h2>
              <p className={policyBodyClassName}>
                Orders can be cancelled before dispatch. Once shipped, cancellation is not allowed.
              </p>
            </section>

            {/* Refund Process */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>4. Refund Process</h2>
              <p className={`${policyBodyClassName} mb-3`}>
                After we receive and inspect the returned product:
              </p>
              <ul className={policyListClassName}>
                <li>Refund will be processed within 7 business days.</li>
                <li>For prepaid orders, refund will be made to the original payment method.</li>
                <li>For Cash on Delivery (COD) orders, refund will be processed to the customer's bank account after verification.</li>
              </ul>
            </section>

            {/* Non-Refundable Cases */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>5. Non-Refundable Cases</h2>
              <ul className={policyListClassName}>
                <li>Used products</li>
                <li>Damaged items not due to shipping</li>
                <li>Requests after 7 days</li>
              </ul>
            </section>

            {/* Contact for Refund Assistance */}
            <section className={policySectionClassName}>
              <p className={`${policyBodyClassName} mb-2`}>
                <strong className="text-foreground">For refund assistance:</strong>
              </p>
              <p className={policyBodyClassName}>Email: <a href="mailto:sreerasthusilvers@gmail.com" className={policyLinkClassName}>sreerasthusilvers@gmail.com</a></p>
              <p className={policyBodyClassName}>Phone: +91 63049 60489</p>
            </section>
      </>
    </PolicyPageLayout>
  );
};

export default CancellationRefundPolicy;
