import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUp,
  CaretDown,
  Check,
  FileText,
  Globe,
  Image as ImageIcon,
  Microphone,
  Package,
  Paperclip,
  Stop,
  Tag,
  Users,
  X,
} from "@phosphor-icons/react";
import { createShader, playSweep, accentChain, ACCENTS } from "glimm";
import { Spinner } from "@/components/ui/ios-spinner";

export type UploadedFile = {
  name: string;
  type: string;
  content: string;
  isImage?: boolean;
  preview?: string;
};

type ModelOption = { id: string; label: string; tag?: string };

type Source = {
  key: string;
  name: string;
  desc: string;
  icon: ReactNode;
  attach?: boolean;
  toggle?: boolean;
};

type Command = { key: string; name: string; desc: string };

const RAINBOW = accentChain([
  ACCENTS.red,
  ACCENTS.orange,
  ACCENTS.yellow,
  ACCENTS.green,
  ACCENTS.cyan,
  ACCENTS.blue,
  ACCENTS.purple,
]);

function parseToken(
  draft: string,
): { kind: "at" | "slash"; query: string; start: number } | null {
  const match = /(^|\s)([@/])([\w-]*)$/.exec(draft);
  if (!match) return null;
  return {
    kind: match[2] === "@" ? "at" : "slash",
    query: match[3].toLowerCase(),
    start: match.index + match[1].length,
  };
}

type SpeechRecognitionResult = {
  0: { transcript: string };
  isFinal: boolean;
};

type SpeechRecognitionErrorEvent = { error: string; message?: string };

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: { results: ArrayLike<SpeechRecognitionResult> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition;
}

const SIZE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "1024x1024", label: "Square" },
  { value: "1536x1024", label: "Landscape" },
  { value: "1024x1536", label: "Portrait" },
];

export default function OrderChatComposer({
  onSend,
  loading,
  onStop,
  models,
  model,
  onModelChange,
  imageMode,
  onImageModeChange,
  imageSize,
  onImageSizeChange,
  placeholder,
  isAdmin,
}: {
  onSend: (text: string, files: UploadedFile[]) => void;
  loading: boolean;
  onStop: () => void;
  models: ModelOption[];
  model: string;
  onModelChange: (id: string) => void;
  imageMode: boolean;
  onImageModeChange: (on: boolean) => void;
  imageSize: string;
  onImageSizeChange: (size: string) => void;
  placeholder?: string;
  isAdmin?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [active, setActive] = useState(0);
  const [listening, setListening] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [rowBox, setRowBox] = useState<{ top: number; height: number } | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [modelBox, setModelBox] = useState<{ top: number; height: number } | null>(null);
  const [modelHovered, setModelHovered] = useState<number | null>(null);
  const [sizeBox, setSizeBox] = useState<{ top: number; height: number } | null>(null);
  const [sizeHovered, setSizeHovered] = useState<number | null>(null);
  const [modelMenuLeft, setModelMenuLeft] = useState(0);
  const [sizeMenuLeft, setSizeMenuLeft] = useState(0);

  const composerAnchorRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const modelRef = useRef<HTMLButtonElement>(null);
  const sizeRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const modelRowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sizeRowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const glimmRef = useRef<HTMLCanvasElement>(null);
  const shaderRef = useRef<ReturnType<typeof createShader> | null>(null);
  const sweepingRef = useRef(false);
  const baseDraftRef = useRef("");
  const shouldListenRef = useRef(false);
  const draftRef = useRef("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const sources: Source[] = [
    { key: "attach", name: "Add photos & files", desc: "Upload from your computer", icon: <Paperclip weight="light" size={15} />, attach: true },
    { key: "image", name: "Image generation", desc: imageMode ? "Currently active" : "Generate or edit images", icon: <ImageIcon weight="light" size={15} />, toggle: true },
    { key: "orders", name: "Orders", desc: "Search and analyze orders", icon: <Package weight="light" size={15} /> },
    { key: "products", name: "Products", desc: "Catalog, COGs, stock levels", icon: <Tag weight="light" size={15} /> },
    { key: "customers", name: "Customers", desc: "Profiles and history", icon: <Users weight="light" size={15} /> },
    { key: "web", name: "Web search", desc: "Real-time news and info", icon: <Globe weight="light" size={15} /> },
  ];

  const commands: Command[] = [
    { key: "pending", name: "/pending", desc: "How many orders are pending?" },
    { key: "steadfast", name: "/steadfast", desc: "Show orders sent to Steadfast" },
    { key: "revenue", name: "/revenue", desc: "What's the total revenue?" },
    { key: "notes", name: "/notes", desc: "Which orders have notes?" },
    { key: "summarize", name: "/summarize", desc: "Summarize the conversation so far" },
  ];

  const wide = expanded;
  const token = dismissed ? null : parseToken(draft);
  const menu: "at" | "slash" | null = plusOpen ? "at" : token?.kind ?? null;
  const query = plusOpen ? "" : token?.query ?? "";

  const rows: { key: string; name: string; desc: string }[] =
    menu === "at"
      ? sources.filter((s) => s.name.toLowerCase().includes(query))
      : menu === "slash"
        ? commands.filter((c) => c.name.slice(1).startsWith(query))
        : [];

  useEffect(() => {
    setActive(0);
    setEngaged(false);
  }, [menu, query]);

  useLayoutEffect(() => {
    const target = rowRefs.current[active];
    if (target) setRowBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [menu, query, active, rows.length]);

  const modelIndex = models.findIndex((m) => m.id === model);
  const sizeIndex = SIZE_OPTIONS.findIndex((s) => s.value === imageSize);

  useLayoutEffect(() => {
    if (!modelOpen) return;
    const target = modelRowRefs.current[modelHovered ?? modelIndex];
    if (target) setModelBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [modelOpen, modelHovered, modelIndex]);

  useLayoutEffect(() => {
    if (!sizeOpen) return;
    const target = sizeRowRefs.current[sizeHovered ?? sizeIndex];
    if (target) setSizeBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [sizeOpen, sizeHovered, sizeIndex]);

  useLayoutEffect(() => {
    if (!modelOpen || !composerAnchorRef.current || !modelRef.current) return;
    const anchorRect = composerAnchorRef.current.getBoundingClientRect();
    const triggerRect = modelRef.current.getBoundingClientRect();
    setModelMenuLeft(Math.max(0, Math.min(triggerRect.left - anchorRect.left, anchorRect.width - 176)));
  }, [modelOpen, wide, model]);

  useLayoutEffect(() => {
    if (!sizeOpen || !composerAnchorRef.current || !sizeRef.current) return;
    const anchorRect = composerAnchorRef.current.getBoundingClientRect();
    const triggerRect = sizeRef.current.getBoundingClientRect();
    setSizeMenuLeft(Math.max(0, Math.min(triggerRect.left - anchorRect.left, anchorRect.width - 160)));
  }, [sizeOpen, wide, imageSize]);

  useEffect(() => { if (!modelOpen) setModelHovered(null); }, [modelOpen]);
  useEffect(() => { if (!sizeOpen) setSizeHovered(null); }, [sizeOpen]);

  const makeShader = () => {
    const canvas = glimmRef.current;
    if (!canvas) return null;
    const random = Math.random;
    Math.random = () => 0;
    try {
      return createShader({ canvas, palette: RAINBOW, direction: "ltr", bandTight: 10, swellAmount: 0.85 });
    } finally {
      Math.random = random;
    }
  };

  useEffect(() => {
    shaderRef.current = makeShader();
    return () => { shaderRef.current?.destroy(); shaderRef.current = null; };
  }, []);

  const celebrate = () => {
    if (sweepingRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    shaderRef.current?.destroy();
    const shader = makeShader();
    shaderRef.current = shader;
    if (!shader) return;
    sweepingRef.current = true;
    const sweep = playSweep(shader, {
      palette: RAINBOW, direction: "ltr", sweepMs: 570, outroMs: 80,
      peakAlpha: 1.3, bandTight: 10, brightness: 1.4, swellAmount: 1, waveSpeed: 1.8, easing: "easeOutExpo",
    });
    sweep.done.finally(() => { sweepingRef.current = false; });
  };

  const selectModel = (next: ModelOption) => {
    onModelChange(next.id);
    setModelOpen(false);
    const prev = models[modelIndex];
    if (prev && next.id !== prev.id && next.tag === "Flagship") celebrate();
  };

  useEffect(() => { draftRef.current = draft; }, [draft]);

  useEffect(() => {
    if (!listening) {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
      return;
    }
    const Recognition = getSpeechRecognition();
    if (!Recognition) { setListening(false); return; }
    shouldListenRef.current = true;
    baseDraftRef.current = draftRef.current;

    const startRecognition = () => {
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        let interim = "";
        let sessionFinals = "";
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) sessionFinals += transcript;
          else interim += transcript;
        }
        if (sessionFinals) {
          const base = baseDraftRef.current;
          baseDraftRef.current = `${base}${base ? " " : ""}${sessionFinals}`;
        }
        const parts = [baseDraftRef.current, interim].filter((s) => s.length > 0);
        setDraft(parts.join(" "));
      };
      recognition.onend = () => {
        if (!shouldListenRef.current) {
          setListening(false);
          inputRef.current?.focus();
          return;
        }
        setTimeout(() => {
          if (!shouldListenRef.current) return;
          try { recognition.start(); } catch { /* onend will retry or stop */ }
        }, 250);
      };
      recognition.onerror = (event) => {
        const err = event?.error ?? "";
        if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture") {
          shouldListenRef.current = false;
          setListening(false);
        }
      };
      try {
        recognition.start();
      } catch {
        setListening(false);
      }
    };

    const ensureMicAndStart = async () => {
      try {
        const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
        stream?.getTracks().forEach((t) => t.stop());
      } catch {
        shouldListenRef.current = false;
        setListening(false);
        return;
      }
      if (shouldListenRef.current) startRecognition();
    };
    void ensureMicAndStart();

    return () => {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
    };
  }, [listening]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const controls = controlsRef.current;
    const measure = measureRef.current;
    const modelButton = imageMode ? sizeRef.current : modelRef.current;
    if (!input || !controls || !measure || !modelButton) return;
    const fixedControlsWidth = 28 * 3 + modelButton.offsetWidth;
    const inlineGaps = 4 * 4;
    const inlineInputWidth = controls.clientWidth - fixedControlsWidth - inlineGaps;
    const needsFullWidth = draft.includes("\n") || measure.offsetWidth + 8 > inlineInputWidth;
    if (needsFullWidth !== expanded) setExpanded(needsFullWidth);
    const minHeight = 28;
    const maxHeight = 100;
    input.style.height = "0px";
    const contentHeight = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(contentHeight, minHeight), maxHeight)}px`;
    input.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }, [draft, expanded, imageMode]);

  useEffect(() => {
    if (!modelOpen && !plusOpen && !sizeOpen) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element).closest("[data-promptbar]")) {
        setModelOpen(false); setPlusOpen(false); setSizeOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [modelOpen, plusOpen, sizeOpen]);

  const closeMenus = () => { setPlusOpen(false); setModelOpen(false); setSizeOpen(false); };

  const readFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const nextFiles = await Promise.all(
      Array.from(list).map(async (file) => {
        const isImage = file.type.startsWith("image/");
        if (isImage) {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          return { name: file.name, type: file.type, content: base64, isImage: true, preview: base64 } as UploadedFile;
        }
        const canRead = file.type.startsWith("text/") || /\.(csv|json|txt|md|tsv)$/i.test(file.name);
        const content = canRead ? await file.text().catch(() => "") : "";
        return { name: file.name, type: file.type || "file", content, isImage: false } as UploadedFile;
      }),
    );
    setAttachments((prev) => [...prev, ...nextFiles].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const pick = (row: { key: string; name: string }) => {
    const source = sources.find((s) => s.key === row.key);
    if (source?.attach) {
      fileInputRef.current?.click();
      if (token) setDraft(draft.slice(0, token.start));
    } else if (source?.toggle) {
      onImageModeChange(!imageMode);
      if (token) setDraft(draft.slice(0, token.start));
    } else if (menu === "at") {
      setDraft(`${token ? draft.slice(0, token.start) : draft}@${row.name} `);
    } else {
      setDraft(`${token ? draft.slice(0, token.start) : draft}${row.name} `);
    }
    setPlusOpen(false);
    setDismissed(false);
    inputRef.current?.focus();
  };

  const canSend = draft.trim().length > 0 || attachments.length > 0;

  const send = () => {
    if (!canSend || loading) return;
    onSend(draft.trim(), attachments);
    setDraft("");
    setAttachments([]);
    closeMenus();
    setExpanded(false);
  };

  const activeModel = models[modelIndex] ?? models[0];
  const activeSize = SIZE_OPTIONS[sizeIndex] ?? SIZE_OPTIONS[0];

  return (
    <div data-promptbar className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={imageMode ? "image/*" : undefined}
        className="hidden"
        onChange={(event) => readFiles(event.target.files)}
      />
      <div ref={composerAnchorRef} className="relative">
        {/* @ / slash menu */}
        {menu && (
          <div
            onMouseLeave={() => setEngaged(false)}
            className="absolute inset-x-0 bottom-full z-10 mb-2 rounded-[10px] bg-surface p-1 shadow-raised"
            style={{ animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "bottom center" }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover"
              style={{
                top: rowBox?.top ?? 0,
                height: rowBox?.height ?? 0,
                opacity: rowBox && engaged && rows.length > 0 ? 1 : 0,
                transition: "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
              }}
            />
            {rows.map((row, i) => {
              const source = menu === "at" ? sources.find((s) => s.key === row.key) : undefined;
              return (
                <button
                  key={row.key}
                  type="button"
                  ref={(el) => { rowRefs.current[i] = el; }}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => { setActive(i); setEngaged(true); }}
                  onClick={() => pick(row)}
                  className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left"
                >
                  {source && (
                    <span className="flex size-5.5 shrink-0 items-center justify-center text-ink-2">
                      {source.icon}
                    </span>
                  )}
                  <span className="shrink-0 text-[12.5px] font-medium text-ink">{row.name}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{row.desc}</span>
                  {source?.toggle && imageMode && (
                    <span className="shrink-0 text-[12px] font-medium text-green">Active</span>
                  )}
                </button>
              );
            })}
            {rows.length === 0 && (
              <div className="flex h-9 items-center px-2 text-[12px] text-ink-3">No matches for "{query}"</div>
            )}
            <div className="mt-1 border-t border-line px-2 pt-1.5 pb-1 text-[11px] text-ink-3">
              {menu === "at" ? "Type to search sources & files" : "Type to search commands"}
            </div>
          </div>
        )}

        {/* model menu */}
        {modelOpen && !imageMode && (
          <div
            onMouseLeave={() => setModelHovered(null)}
            className="absolute bottom-full z-10 mb-2 w-44 rounded-[10px] bg-surface p-1 shadow-raised"
            style={{ left: modelMenuLeft, animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "bottom left" }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover"
              style={{
                top: modelBox?.top ?? 0,
                height: modelBox?.height ?? 0,
                opacity: modelBox && modelHovered !== null ? 1 : 0,
                transition: "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
              }}
            />
            {models.map((m, i) => (
              <button
                key={m.id}
                type="button"
                ref={(el) => { modelRowRefs.current[i] = el; }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setModelHovered(i)}
                onClick={() => { selectModel(m); inputRef.current?.focus(); }}
                className="relative z-10 flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{m.label}</span>
                {m.tag && <span className="shrink-0 text-[11px] text-ink-3">{m.tag}</span>}
                <span className={`shrink-0 text-ink ${m.id === model ? "" : "invisible"}`}>
                  <Check weight="light" size={13} />
                </span>
              </button>
            ))}
          </div>
        )}

        {/* size menu */}
        {sizeOpen && imageMode && (
          <div
            onMouseLeave={() => setSizeHovered(null)}
            className="absolute bottom-full z-10 mb-2 w-40 rounded-[10px] bg-surface p-1 shadow-raised"
            style={{ left: sizeMenuLeft, animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "bottom left" }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover"
              style={{
                top: sizeBox?.top ?? 0,
                height: sizeBox?.height ?? 0,
                opacity: sizeBox && sizeHovered !== null ? 1 : 0,
                transition: "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
              }}
            />
            {SIZE_OPTIONS.map((s, i) => (
              <button
                key={s.value}
                type="button"
                ref={(el) => { sizeRowRefs.current[i] = el; }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setSizeHovered(i)}
                onClick={() => { onImageSizeChange(s.value); setSizeOpen(false); inputRef.current?.focus(); }}
                className="relative z-10 flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{s.label}</span>
                <span className={`shrink-0 text-ink ${s.value === imageSize ? "" : "invisible"}`}>
                  <Check weight="light" size={13} />
                </span>
              </button>
            ))}
          </div>
        )}

        {/* composer */}
        <div
          className="relative isolate flex flex-col gap-1.5 overflow-hidden rounded-[10px] border border-line bg-surface p-1.5 shadow-card transition-[border-color] duration-150 focus-within:border-line-strong"
        >
          <canvas
            ref={glimmRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
            style={{ borderRadius: "inherit" }}
          />
          <span
            ref={measureRef}
            aria-hidden="true"
            className="pointer-events-none absolute invisible whitespace-pre text-[13px] leading-[18px]"
          >
            {draft}
          </span>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5 px-0.5">
              {attachments.map((file, i) => (
                file.isImage && file.preview ? (
                  <div key={`${file.name}-${i}`} className="relative group">
                    <img src={file.preview} alt={file.name} className="h-12 w-12 rounded-[6px] object-cover border border-black/10" />
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => setAttachments((current) => current.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 flex size-4.5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X weight="light" size={10} />
                    </button>
                  </div>
                ) : (
                  <span
                    key={`${file.name}-${i}`}
                    className="flex h-6.5 items-center gap-1.5 bg-field py-1 pr-1 pl-1.5 text-[11.5px] text-ink-2 shadow-hairline rounded-chip"
                    style={{ animation: "pop-in 200ms cubic-bezier(0.23,1,0.32,1) both" }}
                  >
                    <FileText weight="light" size={12} />
                    <span className="max-w-36 truncate">{file.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => setAttachments((current) => current.filter((_, j) => j !== i))}
                      className="-my-1 flex size-6 items-center justify-center text-ink-3 transition-colors duration-100 hover:bg-line/70 hover:text-ink rounded-[5px]"
                    >
                      <X weight="light" size={10} />
                    </button>
                  </span>
                )
              ))}
            </div>
          )}

          <div
            ref={controlsRef}
            className={`grid items-end gap-x-1 gap-y-1.5 ${
              wide
                ? "grid-cols-[28px_auto_minmax(0,1fr)_28px_28px]"
                : "grid-cols-[28px_minmax(0,1fr)_auto_28px_28px]"
            }`}
          >
            {/* + button */}
            <button
              type="button"
              aria-label="Add attachments and sources"
              aria-expanded={plusOpen}
              onClick={() => { setModelOpen(false); setSizeOpen(false); setPlusOpen((current) => !current); inputRef.current?.focus(); }}
              className={`flex size-7 shrink-0 items-center justify-center justify-self-start text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover hover:text-ink active:scale-[0.94] rounded-[8px] ${plusOpen ? "bg-hover text-ink" : ""} ${wide ? "col-start-1 row-start-2" : "col-start-1 row-start-1"}`}
            >
              {imageMode ? <ImageIcon weight="light" size={16} /> : <Paperclip weight="light" size={16} />}
            </button>

            {/* textarea */}
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              disabled={loading}
              onChange={(event) => { setDraft(event.target.value); setDismissed(false); setPlusOpen(false); }}
              onKeyDown={(event) => {
                if (menu && rows.length > 0) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    setEngaged(true);
                    setActive((current) => (current + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
                    return;
                  }
                  if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
                    event.preventDefault();
                    pick(rows[active]);
                    return;
                  }
                }
                if (event.key === "Escape") { setDismissed(true); closeMenus(); return; }
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder={listening ? "Listening…" : placeholder ?? (imageMode ? "Describe the image you want to generate…" : "Send a message…")}
              aria-label="Prompt"
              className={`min-h-7 min-w-0 w-full resize-none bg-transparent px-1 py-[5px] text-[13px] leading-[18px] text-ink outline-none [overflow-wrap:anywhere] placeholder:text-ink-3 disabled:opacity-60 ${wide ? "col-span-full col-start-1 row-start-1" : "col-start-2 row-start-1"}`}
            />

            {/* model / size picker */}
            {imageMode ? (
              <button
                ref={sizeRef}
                type="button"
                aria-expanded={sizeOpen}
                aria-label="Choose image size"
                onClick={() => { setPlusOpen(false); setModelOpen(false); setSizeOpen((current) => !current); }}
                className={`flex h-7 shrink-0 items-center gap-1 px-1.5 text-[12px] font-medium text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink rounded-[8px] ${wide ? "col-start-2 row-start-2 justify-self-start" : "col-start-3 row-start-1"}`}
              >
                {activeSize.label}
                <span className="text-ink-3"><CaretDown weight="light" size={11} /></span>
              </button>
            ) : (
              <button
                ref={modelRef}
                type="button"
                aria-expanded={modelOpen}
                aria-label="Choose model"
                onClick={() => { setPlusOpen(false); setSizeOpen(false); setModelOpen((current) => !current); }}
                className={`flex h-7 shrink-0 items-center gap-1 px-1.5 text-[12px] font-medium text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink rounded-[8px] ${wide ? "col-start-2 row-start-2 justify-self-start" : "col-start-3 row-start-1"}`}
              >
                {activeModel.label}
                <span className="text-ink-3"><CaretDown weight="light" size={11} /></span>
              </button>
            )}

            {/* dictation */}
            <button
              type="button"
              aria-label={listening ? "Stop dictation" : "Start dictation"}
              aria-pressed={listening}
              onClick={() => setListening((current) => !current)}
              className={`flex size-7 shrink-0 items-center justify-center transition-[background-color,color,transform] duration-150 active:scale-[0.94] rounded-[8px] ${listening ? "bg-accent-tint text-accent-ink" : "text-ink-3 hover:bg-hover hover:text-ink"} ${wide ? "col-start-4 row-start-2" : "col-start-4 row-start-1"}`}
            >
              {listening ? (
                <span className="flex h-3.5 items-center gap-[2.5px]">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-[2.5px] rounded-full bg-current"
                      style={{ height: "100%", animation: `eq-bounce 900ms ease-in-out ${i * 150}ms infinite` }}
                    />
                  ))}
                </span>
              ) : (
                <Microphone weight="light" size={15} />
              )}
            </button>

            {/* send */}
            <button
              type="button"
              aria-label={loading ? "Stop" : "Send"}
              disabled={!canSend && !loading}
              onClick={loading ? onStop : send}
              className={`flex size-7 shrink-0 items-center justify-center transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.94] rounded-[8px] ${wide ? "col-start-5 row-start-2" : "col-start-5 row-start-1"}`}
              style={{
                background: loading || canSend ? "var(--ink)" : "var(--line-strong)",
                color: loading || canSend ? "var(--surface)" : "var(--ink-2)",
              }}
            >
              {loading ? <Stop weight="light" size={14} /> : <ArrowUp weight="light" size={16} />}
            </button>
          </div>
        </div>
      </div>
      {isAdmin === false && !imageMode && (
        <p className="mt-1.5 px-1 text-[11px] text-ink-3">AI mutations are admin-only.</p>
      )}
    </div>
  );
}
