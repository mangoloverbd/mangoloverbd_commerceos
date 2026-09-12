import { motion } from "framer-motion";
import { OrderProtectionReviewQueue } from "@/components/OrderProtectionReviewQueue";

export default function OrderProtection() {
  return (
    <div className="min-h-full space-y-6 bg-white p-1 max-md:p-2 lg:p-2">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative space-y-4"
      >
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">Order Protection</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-black/45">
              Review held storefront orders before stock, SMS, or courier actions are allowed.
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="overflow-hidden rounded-2xl bg-white"
        aria-label="Held storefront orders"
      >
        <OrderProtectionReviewQueue />
      </motion.div>
    </div>
  );
}
