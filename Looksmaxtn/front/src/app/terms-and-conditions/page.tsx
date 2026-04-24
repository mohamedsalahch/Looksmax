export default function TermsAndConditionsPage() {
  return (
    <div className="pt-[72px] min-h-screen">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-16">
        <p className="text-xs uppercase tracking-[0.3em] text-text-secondary mb-3">
          Legal
        </p>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-wide uppercase mb-6">
          Terms & Conditions
        </h1>
        <div className="space-y-8 text-sm leading-relaxed text-text-secondary">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
              Orders
            </h2>
            <p>
              By placing an order, you confirm that the information you provide is accurate and that you are authorized to use the selected payment method. Orders are subject to product availability and confirmation.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
              Pricing & Payment
            </h2>
            <p>
              Prices are shown in Tunisian dinar unless stated otherwise. If Cash on Delivery is available for your order, payment is due when the order is delivered.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
              Delivery
            </h2>
            <p>
              Delivery timelines are estimates and may vary based on location, courier capacity, and order volume. Please ensure your phone number and shipping address are correct before submitting an order.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
              Returns
            </h2>
            <p>
              Return eligibility depends on item condition, category, and timing. Items must be returned in the same condition in which they were received, unless otherwise required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
              Account & Services
            </h2>
            <p>
              You are responsible for keeping your account access secure. Features such as Outfit Studio depend on uploaded content and generated outputs, which may vary in quality and availability.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">
              Contact
            </h2>
            <p>
              For questions about these terms or your order, contact us through the Contact Us page.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
