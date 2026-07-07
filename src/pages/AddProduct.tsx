import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Globe2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { RichButton } from "@/components/ui/rich-button";

const INPUT_CLS = "h-9 w-full rounded-[12px] border border-black/[0.1] bg-black/[0.04] px-3 font-mono text-[13px] text-black outline-none tabular-nums transition-colors focus-visible:ring-1 focus-visible:ring-black/20 focus:bg-white placeholder:text-black/25";
const SYS = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif";

export default function AddProduct() {
  const navigate = useNavigate();
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlStatus, setCrawlStatus] = useState<"idle" | "crawling" | "done" | "error">("idle");
  const [crawlMsg, setCrawlMsg] = useState("");

  async function saveProducts(products: any[], sourceUrl: string) {
    const res = await apiFetch("/api/products/save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products, source_url: sourceUrl }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    const varMsg = json.variants_saved > 0 ? ` with ${json.variants_saved} variant${json.variants_saved !== 1 ? "s" : ""}` : "";
    setCrawlMsg(`${json.saved} product${json.saved !== 1 ? "s" : ""}${varMsg} imported.`);
    toast.success(`${json.saved} products imported${varMsg}`);
  }

  async function handleCrawl() {
    if (!crawlUrl.trim()) return;
    setCrawlStatus("crawling"); setCrawlMsg("");
    try {
      const res = await apiFetch("/api/products/crawl", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: crawlUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Crawl failed");
      if (json.products?.length) {
        await saveProducts(json.products, crawlUrl.trim());
        setCrawlStatus("done");
      }
      else { setCrawlStatus("done"); setCrawlMsg("No products found."); }
    } catch (e: unknown) {
      setCrawlStatus("error");
      setCrawlMsg(e instanceof Error ? e.message : "Crawl failed");
    }
  }

  return (
    <div className="min-h-full p-4 lg:p-8" style={{ fontFamily: SYS }}>
      <div className="mx-auto max-w-4xl space-y-6">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate("/products")} className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.08] bg-white text-black/60 shadow-sm transition-colors hover:bg-black/[0.04]">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-xl font-semibold text-black tracking-tight">Add product</h1>
        </div>

        {/* Import Card */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-xl border border-black/[0.08] bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-black/60" />
            <h2 className="text-[15px] font-semibold text-black">Import from Website</h2>
          </div>
          <p className="mb-4 text-[13px] text-black/60">
            Paste a product URL from your website and AI will automatically extract the title, pricing, variants, and cost.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="url"
              placeholder="https://yourstore.com/products/example"
              value={crawlUrl}
              onChange={e => setCrawlUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && crawlStatus !== "crawling" && handleCrawl()}
              className={cn(INPUT_CLS, "h-10 flex-1 font-sans text-[14px]")}
            />
            <RichButton
              color="default"
              size="default"
              onClick={handleCrawl}
              disabled={crawlStatus === "crawling" || !crawlUrl.trim()}
              className="h-10 px-6"
            >
              {crawlStatus === "crawling" ? <Spinner size="sm" className="mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {crawlStatus === "crawling" ? "Extracting…" : "Extract"}
            </RichButton>
          </div>
          <AnimatePresence>
            {crawlMsg && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn("mt-4 text-[13px] font-medium",
                  crawlStatus === "error" ? "text-red-500" : "text-emerald-600"
                )}
              >
                {crawlMsg}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Manual Entry Card (Placeholder) */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="rounded-xl border border-black/[0.08] bg-white p-6 shadow-sm opacity-50 pointer-events-none"
        >
          <h2 className="text-[15px] font-semibold text-black mb-4">Manual Entry</h2>
          <p className="text-[13px] text-black/60">
            Manual product creation is currently disabled. Please use the automated import tool above.
          </p>
        </motion.div>

      </div>
    </div>
  );
}
