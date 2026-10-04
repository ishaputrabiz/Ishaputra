import {
  policyBodyClassName,
  policyHeadingClassName,
  policySectionClassName,
} from "@/components/PolicyPageLayout";
import PolicyPageLayout from "@/components/PolicyPageLayout";
import { usePageMeta } from "@/hooks/usePageMeta";

const ShippingPolicy = () => {
  usePageMeta({ title: "Shipping policy", description: "Where Ishaputra Botanicals delivers, how long orders take and how tracking works." });

  return (
    <PolicyPageLayout title="Shipping policy" effectiveDate="Draft: pending review by Ishaputra Botanicals">
      <>
            {/* Introduction */}
            <section className={policySectionClassName}>
              <p className={policyBodyClassName}>
                At Ishaputra Botanicals, we aim to deliver your order safely and promptly.
              </p>
            </section>

            {/* Delivery Area */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>1. Delivery area</h2>
              <p className={policyBodyClassName}>
                We deliver across India only.
              </p>
            </section>

            {/* Processing Time */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>2. Processing time</h2>
              <p className={policyBodyClassName}>
                Orders are processed within 1 to 3 working days after confirmation.
              </p>
            </section>

            {/* Delivery Time */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>3. Delivery time</h2>
              <p className={policyBodyClassName}>
                Estimated delivery time is 3 to 7 business days, depending on location.
              </p>
            </section>

            {/* Shipping Charges */}
            <section className={policySectionClassName}>
              <h2 className={policyHeadingClassName}>4. Shipping charges</h2>
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
