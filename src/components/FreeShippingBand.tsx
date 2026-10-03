const phrases = [
  "Earn loyalty points on every order",
  "Delivery across India",
  "Secure Razorpay checkout",
  "Pure wellness for a stronger you",
];

/**
 * Service promises on a paper strip (tablet and desktop only, as before).
 * Static and centred: the marquee band higher up is the page's one moving strip.
 */
const FreeShippingBand = () => (
  <section className="tx-sheet hidden border-y border-foreground/[0.08] py-3.5 md:block">
    <ul className="container-custom flex flex-wrap items-center justify-center gap-x-10 gap-y-2">
      {phrases.map((phrase, index) => (
        <li key={phrase} className="flex items-center gap-10">
          {index > 0 && <span aria-hidden="true" className="sep-diamond !bg-primary/70" />}
          <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/75">
            {phrase}
          </span>
        </li>
      ))}
    </ul>
  </section>
);

export default FreeShippingBand;
