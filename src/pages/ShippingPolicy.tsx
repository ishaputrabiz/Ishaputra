import {
  policyBodyClassName,
  policyHeadingClassName,
  policySectionClassName,
} from "@/components/PolicyPageLayout";
import PolicyPageLayout from "@/components/PolicyPageLayout";

const ShippingPolicy = () => {
  return (
    <PolicyPageLayout title="Shipping Policy" effectiveDate="Last Updated: February 17, 2026">
      <>
            {/* Introduction */}
            <section className={policySectionClassName}>
              <p className={policyBodyClassName}>
                At Sreerasthu Silvers, we aim to deliver your jewellery safely and promptly.
              </p>
            </section>

            {/* Delivery Area */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>1. Delivery Area</h2>
              <p className={policyBodyClassName}>
                We deliver across India only.
              </p>
            </section>

            {/* Processing Time */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>2. Processing Time</h2>
              <p className={policyBodyClassName}>
                Orders are processed within 1–3 working days after confirmation.
              </p>
            </section>

            {/* Delivery Time */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>3. Delivery Time</h2>
              <p className={policyBodyClassName}>
                Estimated delivery time is 3–7 business days depending on location.
              </p>
            </section>

            {/* Shipping Charges */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>4. Shipping Charges</h2>
              <p className={policyBodyClassName}>
                Shipping charges (if any) will be displayed at checkout before payment.
              </p>
            </section>

            {/* Tracking */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>5. Tracking</h2>
              <p className={policyBodyClassName}>
                Tracking details will be shared via email or SMS once the order is dispatched.
              </p>
            </section>

            {/* Delays */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>6. Delays</h2>
              <p className={policyBodyClassName}>
                Delivery may be delayed due to unforeseen circumstances such as natural disasters, courier delays, or government restrictions.
              </p>
            </section>
      </>
    </PolicyPageLayout>
  );
};

export default ShippingPolicy;
