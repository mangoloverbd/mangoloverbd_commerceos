import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Copy, Check, RefreshCw, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { AnimatedText } from "@/components/ui/animated-text";
import { toast } from "@/components/ui/sonner";

const FRAMEWORKS = [
  {
    id: "aida",
    name: "AIDA",
    label: "Attention → Interest → Desire → Action",
    desc: "Best for ads, landing pages, sales pages.",
  },
  {
    id: "pas",
    name: "PAS",
    label: "Problem → Agitate → Solution",
    desc: "Best for pain-point marketing.",
  },
  {
    id: "bab",
    name: "BAB",
    label: "Before → After → Bridge",
    desc: "Show where they are, where they want to be, and your solution.",
  },
  {
    id: "4ps",
    name: "4Ps",
    label: "Picture → Promise → Prove → Push",
    desc: "Good for persuasive product copy.",
  },
  {
    id: "fab",
    name: "FAB",
    label: "Features → Advantages → Benefits",
    desc: "Turns product details into customer value.",
  },
  {
    id: "quest",
    name: "QUEST",
    label: "Qualify → Understand → Educate → Stimulate → Transition",
    desc: "Best for long-form sales content.",
  },
  {
    id: "pastor",
    name: "PASTOR",
    label: "Problem → Amplify → Story → Transformation → Offer → Response",
    desc: "Great for storytelling sales pages.",
  },
  {
    id: "slap",
    name: "SLAP",
    label: "Stop → Look → Act → Purchase",
    desc: "Useful for short ads and social media.",
  },
  {
    id: "acca",
    name: "ACCA",
    label: "Awareness → Comprehension → Conviction → Action",
    desc: "Good for educational selling.",
  },
  {
    id: "4us",
    name: "4 U's",
    label: "Urgent · Unique · Useful · Ultra-specific",
    desc: "Make copy that hits all four dimensions.",
  },
];

type Product = {
  id: string;
  name: string;
  description?: string;
  selling_price?: number;
};

type StudioSceneAnalysis = {
  time: string;
  title: string;
  line: string;
  psychology: string;
  retention: string;
};

type StudioScene = {
  number: number;
  time: string;
  title: string;
  dialogue: string;
  visual: string;
  textOverlay: string;
  transition: string;
  psychology: string;
  retention: string;
};

type StudioScript = {
  hook: {
    time: string;
    script: string;
    templateName: string;
    templateLine: string;
    templateViews: string;
    tags: string[];
    score: number;
    whyItWorks: string;
    retentionMechanism: string;
  };
  sceneAnalysis: StudioSceneAnalysis[];
  scenes: StudioScene[];
  cameraLighting: {
    mainShots: string;
    broll: string;
    lighting: string;
    colorGrade: string;
  };
  editingPatterns: {
    cutFrequency: string;
    transitions: string;
    textOverlays: string;
    music: string;
  };
  cta: {
    time: string;
    dialogue: string;
    textOverlay: string;
    visual: string;
  };
  viralProbability: number;
  scoreBreakdown: {
    hookStrength: number;
    scriptStructure: number;
    trendAlignment: number;
    engagementPotential: number;
  };
  productionSpecs: {
    cutFrequency: string;
    shotType: string;
    lighting: string;
    textOverlay: string;
  };
};

function formatStudioScript(script: StudioScript) {
  const sceneLines = script.scenes
    .map((scene) => [
      `SCENE ${scene.number} (${scene.time}) - ${scene.title}`,
      `Dialogue: ${scene.dialogue}`,
      `Visual: ${scene.visual}`,
      `Text Overlay: ${scene.textOverlay}`,
      `Transition: ${scene.transition}`,
    ].join("\n"))
    .join("\n\n");

  return [
    `HOOK (${script.hook.time})`,
    script.hook.script,
    `Template: ${script.hook.templateName} - ${script.hook.templateLine}`,
    `Why it works: ${script.hook.whyItWorks}`,
    `Retention: ${script.hook.retentionMechanism}`,
    "",
    sceneLines,
    "",
    `CTA (${script.cta.time})`,
    `Dialogue: ${script.cta.dialogue}`,
    `Text Overlay: ${script.cta.textOverlay}`,
    `Visual: ${script.cta.visual}`,
    "",
    `Viral Probability: ${script.viralProbability}/100`,
  ].join("\n");
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-black/[0.06] bg-black/[0.025] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}<span className="text-xs text-muted-foreground">/100</span></p>
    </div>
  );
}

export default function Studio() {
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"paste" | "select">("paste");
  const [pastedDetails, setPastedDetails] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedFramework, setSelectedFramework] = useState<string>("aida");
  const [selectedLanguage, setSelectedLanguage] = useState<"english" | "bangla">("english");
  const [generating, setGenerating] = useState(false);
  const [regeneratingHook, setRegeneratingHook] = useState(false);
  const [result, setResult] = useState<StudioScript | null>(null);
  const [copied, setCopied] = useState(false);
  const [outputPanelHeight, setOutputPanelHeight] = useState<number | null>(null);

  useEffect(() => {
    const leftPanel = leftPanelRef.current;
    if (!leftPanel) return;

    const measure = () => {
      if (window.innerWidth < 1024) {
        setOutputPanelHeight(null);
        return;
      }
      setOutputPanelHeight(Math.ceil(leftPanel.getBoundingClientRect().height));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(leftPanel);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const { data: productsData, isLoading: productsLoading, error: productsError } = useQuery<{ products: Product[] }>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await apiFetch("/api/products");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to load products");
      }
      return res.json();
    },
  });

  const products = productsData?.products ?? [];
  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const framework = FRAMEWORKS.find((f) => f.id === selectedFramework)!;

  const productDetails =
    mode === "paste"
      ? pastedDetails
      : selectedProduct
      ? `Product: ${selectedProduct.name}\n${selectedProduct.description ? `Description: ${selectedProduct.description}` : ""}\n${selectedProduct.selling_price ? `Price: ৳${selectedProduct.selling_price}` : ""}`
      : "";

  const canGenerate = productDetails.trim().length > 0 && selectedFramework;

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    setResult(null);
    try {
      const res = await apiFetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productDetails, framework: selectedFramework, frameworkName: framework.name, frameworkLabel: framework.label, language: selectedLanguage }),
      });
      let json: { script?: StudioScript; error?: string } = {};
      try {
        const text = await res.text();
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error("Invalid response from server");
      }
      if (!res.ok) throw new Error(json.error || "Failed to generate");
      if (!json.script) throw new Error("AI returned an empty script");
      setResult(json.script);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenerateHook() {
    if (!canGenerate || !result || regeneratingHook) return;
    setRegeneratingHook(true);
    try {
      const res = await apiFetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productDetails,
          framework: selectedFramework,
          frameworkName: framework.name,
          frameworkLabel: framework.label,
          language: selectedLanguage,
          regenerationTarget: "hook",
          existingScript: result,
        }),
      });
      const json: { script?: StudioScript; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to regenerate hook");
      if (!json.script?.hook) throw new Error("AI returned an empty hook");
      setResult((prev) => (prev ? { ...json.script!, scenes: json.script?.scenes?.length ? json.script.scenes : prev.scenes } : json.script!));
      toast.success("Hook regenerated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hook regeneration failed");
    } finally {
      setRegeneratingHook(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(formatStudioScript(result));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-[1400px] space-y-5 p-1 lg:p-2">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-xl border border-black/10 bg-white"
        >
          <div className="flex h-[50px] items-center gap-2.5 border-b border-black/10 px-6">
            <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
            <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">
              AI Copy Studio
            </AnimatedText>
            <span className="ml-auto text-[12px] text-muted-foreground">Powered by GPT-5.4</span>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Paste product details or select a product, choose a copywriting framework, and generate high-converting marketing scripts instantly.
            </p>
          </div>
        </motion.div>

        <div className="grid items-stretch gap-5 lg:grid-cols-[1fr_1fr]">

          {/* Left — Input */}
          <motion.div
            ref={leftPanelRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="space-y-4"
          >
            {/* Product Input */}
            <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
              <div className="flex h-[44px] items-center border-b border-black/10 px-4">
                <span className="text-[13px] font-semibold text-foreground">Product Details</span>
              </div>

              {/* Mode toggle */}
              <div className="flex items-center gap-1 p-3 pb-0">
                {(["paste", "select"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "rounded-lg px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] transition-all",
                      mode === m ? "bg-black text-white" : "text-muted-foreground hover:text-foreground hover:bg-black/[0.04]"
                    )}
                  >
                    {m === "paste" ? "Paste Details" : "Select Product"}
                  </button>
                ))}
              </div>

              <div className="p-3">
                <AnimatePresence mode="wait">
                  {mode === "paste" ? (
                    <motion.div
                      key="paste"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <textarea
                        value={pastedDetails}
                        onChange={(e) => setPastedDetails(e.target.value)}
                        placeholder="Paste your product name, description, features, price, target audience, unique selling points..."
                        className="w-full resize-none rounded-lg border border-black/[0.08] bg-[#F8F8F6] px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-black/20 focus:border-black/20 transition-all"
                        rows={8}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="select"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      {/* Product selector */}
                      <div className="relative">
                        <select
                          value={selectedProductId}
                          disabled={productsLoading || products.length === 0}
                          onChange={(event) => setSelectedProductId(event.target.value)}
                          className={cn(
                            "h-10 w-full appearance-none rounded-lg border border-black/[0.08] bg-[#F8F8F6] px-3 py-2.5 pr-10 text-sm transition-all focus:border-black/20 focus:outline-none focus:ring-1 focus:ring-black/20",
                            selectedProductId ? "font-medium text-foreground" : "text-muted-foreground/60",
                            (productsLoading || products.length === 0) && "cursor-not-allowed opacity-70"
                          )}
                        >
                          <option value="">
                            {productsLoading
                              ? "Loading products..."
                              : products.length
                              ? "Select a product..."
                              : "No products found"}
                          </option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}{p.selling_price ? ` - ৳${Number(p.selling_price).toLocaleString("en-BD")}` : ""}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      </div>

                      {productsError && (
                        <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
                          {productsError instanceof Error ? productsError.message : "Failed to load products"}
                        </p>
                      )}

                      {selectedProduct?.description && (
                        <div className="mt-3 rounded-lg border border-black/[0.06] bg-[#F8F8F6] px-3 py-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Description</p>
                          <p className="text-[12px] text-foreground/80 leading-relaxed">{selectedProduct.description}</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Framework selector */}
            <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
              <div className="flex h-[44px] items-center border-b border-black/10 px-4">
                <span className="text-[13px] font-semibold text-foreground">Copywriting Framework</span>
              </div>
              <div className="p-3 grid grid-cols-2 gap-1.5">
                {FRAMEWORKS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFramework(f.id)}
                    className={cn(
                      "group flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-all",
                      selectedFramework === f.id
                        ? "border-black bg-black text-white"
                        : "border-black/[0.08] bg-[#F8F8F6] hover:border-black/20 hover:bg-black/[0.03]"
                    )}
                  >
                    <span className={cn("text-[12px] font-bold tracking-wide", selectedFramework === f.id ? "text-white" : "text-foreground")}>
                      {f.name}
                    </span>
                    <span className={cn("text-[10px] leading-relaxed", selectedFramework === f.id ? "text-white/70" : "text-muted-foreground")}>
                      {f.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Language selector */}
            <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
              <div className="flex h-[44px] items-center border-b border-black/10 px-4">
                <span className="text-[13px] font-semibold text-foreground">Output Language</span>
              </div>
              <div className="flex items-center gap-1.5 p-3">
                {([
                  { id: "english", label: "English" },
                  { id: "bangla", label: "বাংলা" },
                ] as const).map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => setSelectedLanguage(lang.id)}
                    className={cn(
                      "flex-1 rounded-lg border py-2.5 text-[13px] font-semibold transition-all",
                      selectedLanguage === lang.id
                        ? "border-black bg-black text-white"
                        : "border-black/[0.08] bg-[#F8F8F6] text-foreground hover:border-black/20 hover:bg-black/[0.03]"
                    )}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              className={cn(
                "flex w-full h-12 items-center justify-center gap-2.5 rounded-xl text-[13px] font-semibold tracking-wide transition-all",
                canGenerate && !generating
                  ? "bg-black text-white hover:bg-black/85 active:scale-[0.99]"
                  : "bg-black/[0.06] text-muted-foreground cursor-not-allowed"
              )}
            >
              {generating ? (
                <>
                  <Spinner size="sm" />
                  Generating…
                </>
              ) : (
                <>
                  <img
                    src="https://img.icons8.com/material-rounded/24/bard--v2.png"
                    alt=""
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0"
                  />
                  Generate Script
                </>
              )}
            </button>
          </motion.div>

          {/* Right — Output */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            style={outputPanelHeight ? { height: outputPanelHeight } : undefined}
            className="flex min-h-[620px] overflow-hidden rounded-xl border border-black/10 bg-white flex-col lg:sticky lg:top-4 lg:min-h-0"
          >
            <div className="flex h-[44px] shrink-0 items-center justify-between border-b border-black/10 px-4">
              <div className="flex items-center gap-2">
                <img
                  src="https://img.icons8.com/material-rounded/24/bard--v2.png"
                  alt=""
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 opacity-75"
                />
                <AnimatedText className="text-[13px] font-semibold text-foreground">Generated Script</AnimatedText>
                {result && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    {framework.name}
                  </span>
                )}
              </div>
              {result && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setResult(null); }}
                    className="flex h-7 items-center gap-1 rounded-lg border border-black/10 bg-black/[0.03] px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-black/[0.06] hover:text-foreground transition-all"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Clear
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex h-7 items-center gap-1 rounded-lg border border-black/10 bg-black/[0.03] px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-black/[0.06] hover:text-foreground transition-all"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {generating ? (
                <div className="flex h-full items-center justify-center">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Spinner size="lg" />
                    <p className="text-sm font-medium text-foreground">Writing your {framework.name} script…</p>
                    <p className="text-[12px] text-muted-foreground">{framework.label}</p>
                  </div>
                </div>
              ) : result ? (
                <div className="space-y-4 text-foreground">
                  <section className="rounded-xl border border-black/[0.08] bg-[#F8F8F6] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground">🎯 Hook ({result.hook.time || "0:00-0:03"})</p>
                        <p className="mt-2 text-lg font-semibold leading-snug text-foreground">"{result.hook.script}"</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRegenerateHook}
                        disabled={regeneratingHook}
                        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 text-[11px] font-semibold text-foreground/70 transition-all hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {regeneratingHook ? <Spinner size="sm" /> : <RefreshCw className="h-3 w-3" />}
                        Regenerate
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(result.hook.tags || []).map((tag) => (
                        <span key={tag} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                      <div className="rounded-lg bg-white p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{result.hook.templateName || "Blackfile Template"}</p>
                        <p className="mt-1 text-sm font-medium text-foreground">"{result.hook.templateLine}"</p>
                      </div>
                      <div className="rounded-lg bg-white p-3 text-center">
                        <p className="text-xl font-semibold tabular-nums">{result.hook.templateViews || "3.7M"}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">views</p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-xl border border-black/[0.08] bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Scene-by-Scene Analysis</p>
                      <span className="text-[11px] font-medium text-muted-foreground">({result.sceneAnalysis?.length || 0} scenes)</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {(result.sceneAnalysis || []).map((scene, index) => (
                        <div key={`${scene.time}-${index}`} className="rounded-lg bg-[#F8F8F6] p-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white">{scene.time}</span>
                            <span className="text-sm font-semibold">{scene.title}</span>
                          </div>
                          {scene.line && <p className="mt-2 text-sm font-medium">"{scene.line}"</p>}
                          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">Psych:</span> {scene.psychology}</p>
                          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">Retention:</span> {scene.retention}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {(result.scenes || []).map((scene) => (
                    <section key={scene.number} className="rounded-xl border border-black/[0.08] bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-muted-foreground">📹 Scene {scene.number} ({scene.time})</p>
                          <p className="mt-1 text-sm font-semibold">{scene.title}</p>
                        </div>
                        <button
                          type="button"
                          className="flex h-7 items-center gap-1 rounded-lg border border-black/10 bg-black/[0.03] px-2 text-[10px] font-semibold text-muted-foreground"
                          title="Scene regeneration coming soon"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Regenerate
                        </button>
                      </div>
                      <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-muted-foreground">
                        <p><span className="font-semibold text-foreground">📝 Full Script:</span> {scene.dialogue}</p>
                        <p><span className="font-semibold text-foreground">🎬 Visual:</span> {scene.visual}</p>
                        <p><span className="font-semibold text-foreground">📱 Text Overlay:</span> {scene.textOverlay}</p>
                        <p><span className="font-semibold text-foreground">✨ Transition:</span> {scene.transition}</p>
                      </div>
                    </section>
                  ))}

                  <section className="rounded-xl border border-black/[0.08] bg-white p-4">
                    <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-muted-foreground">🎥 Camera & Lighting</p>
                    <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-muted-foreground">
                      <p><span className="font-semibold text-foreground">Main Shots:</span> {result.cameraLighting?.mainShots}</p>
                      <p><span className="font-semibold text-foreground">B-roll:</span> {result.cameraLighting?.broll}</p>
                      <p><span className="font-semibold text-foreground">Lighting:</span> {result.cameraLighting?.lighting}</p>
                      <p><span className="font-semibold text-foreground">Color Grade:</span> {result.cameraLighting?.colorGrade}</p>
                    </div>
                  </section>

                  <section className="rounded-xl border border-black/[0.08] bg-white p-4">
                    <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-muted-foreground">✂️ Editing Patterns</p>
                    <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-muted-foreground">
                      <p><span className="font-semibold text-foreground">Cut Frequency:</span> {result.editingPatterns?.cutFrequency}</p>
                      <p><span className="font-semibold text-foreground">Transitions:</span> {result.editingPatterns?.transitions}</p>
                      <p><span className="font-semibold text-foreground">Text Overlays:</span> {result.editingPatterns?.textOverlays}</p>
                      <p><span className="font-semibold text-foreground">Music:</span> {result.editingPatterns?.music}</p>
                    </div>
                  </section>

                  <section className="rounded-xl border border-black/[0.08] bg-[#F8F8F6] p-4">
                    <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-muted-foreground">🎬 CTA ({result.cta?.time})</p>
                    <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-muted-foreground">
                      <p><span className="font-semibold text-foreground">Dialogue:</span> {result.cta?.dialogue}</p>
                      <p><span className="font-semibold text-foreground">Text Overlay:</span> {result.cta?.textOverlay}</p>
                      <p><span className="font-semibold text-foreground">Visual:</span> {result.cta?.visual}</p>
                    </div>
                  </section>

                  <section className="rounded-xl border border-black/[0.08] bg-white p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Viral Probability</p>
                        <p className="mt-1 text-[12px] text-muted-foreground">Scroll-stopping potential</p>
                      </div>
                      <div className="text-right">
                        <p className="text-4xl font-semibold tabular-nums text-foreground">{result.viralProbability}</p>
                        <p className="text-xs text-muted-foreground">/100</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <ScorePill label="Hook Strength" value={result.scoreBreakdown?.hookStrength || 0} />
                      <ScorePill label="Script Structure" value={result.scoreBreakdown?.scriptStructure || 0} />
                      <ScorePill label="Trend Alignment" value={result.scoreBreakdown?.trendAlignment || 0} />
                      <ScorePill label="Engagement" value={result.scoreBreakdown?.engagementPotential || 0} />
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-[#F8F8F6] p-3 text-[12px]"><span className="font-semibold">Cut Frequency:</span> {result.productionSpecs?.cutFrequency}</div>
                      <div className="rounded-lg bg-[#F8F8F6] p-3 text-[12px]"><span className="font-semibold">Shot Type:</span> {result.productionSpecs?.shotType}</div>
                      <div className="rounded-lg bg-[#F8F8F6] p-3 text-[12px]"><span className="font-semibold">Lighting:</span> {result.productionSpecs?.lighting}</div>
                      <div className="rounded-lg bg-[#F8F8F6] p-3 text-[12px]"><span className="font-semibold">Text Overlay:</span> {result.productionSpecs?.textOverlay}</div>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-black/[0.06] bg-black/[0.025]">
                    <Wand2 className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-foreground">Your script will appear here</p>
                    <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[240px]">
                      Add product details, pick a framework, and hit Generate.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5 max-w-xs">
                    {FRAMEWORKS.slice(0, 5).map((f) => (
                      <span key={f.id} className="rounded-full border border-black/[0.06] bg-black/[0.025] px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                        {f.name}
                      </span>
                    ))}
                    <span className="rounded-full border border-black/[0.06] bg-black/[0.025] px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                      +5 more
                    </span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
