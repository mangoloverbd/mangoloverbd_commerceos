import { OrderProtectionReviewQueue } from "@/components/OrderProtectionReviewQueue";

export default function OrderProtection() {
  return (
    <main className="min-h-screen bg-[#FAFAF8] px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="border-b border-black/10 pb-6">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-muted-foreground">Storefront safety</p>
          <h1 className="mt-2 text-3xl font-light tracking-tight">Order protection</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review held storefront orders before stock, SMS, or courier actions are allowed.</p>
        </div>
        <section className="mt-8" aria-label="Held storefront orders">
          <OrderProtectionReviewQueue />
        </section>
      </div>
    </main>
  );
}

