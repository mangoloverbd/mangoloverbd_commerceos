import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUUpLeft, ChatsCircle, CheckCircle, ShieldCheck } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { RISE_EASE } from "./Rise";
import type { HomeAttentionCard, HomeChatRow, HomeOrderRow, HomePreview, HomeTagTone } from "./types";

const TAG_TONES: Record<HomeTagTone, string> = {
  ok: "bg-[#E3F4E5] text-[#2B7A36]",
  warn: "bg-[#FDEFD9] text-[#E0861B]",
  risk: "bg-[#FBE4E1] text-[#B4372A]",
};

const SOURCE_LABELS: Record<string, string> = { facebook: "Messenger", instagram: "Instagram", whatsapp: "WhatsApp" };

function OrderRows({ rows }: { rows: HomeOrderRow[] }) {
  return (
    <div className="absolute -bottom-2.5 -right-5 left-7 h-[210px] rounded-tl-[18px] border border-[#ECEAE4] bg-[#F6F5F1] p-[18px]">
      {rows.map((row) => (
        <div key={row.title} className="mb-2 grid grid-cols-[1.3fr_1fr_0.8fr] items-center gap-2.5 rounded-[10px] bg-white px-3.5 py-2.5 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <span className="truncate text-[#111110]">{row.title}</span>
          <span className="truncate text-[#8C8A84]">{row.detail}</span>
          <span className={cn("justify-self-start whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-medium", TAG_TONES[row.tag.tone])}>
            {row.tag.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChatBubbles({ rows }: { rows: HomeChatRow[] }) {
  return (
    <div className="absolute bottom-[74px] right-[30px] flex max-w-[calc(100%-60px)] flex-col items-end gap-2.5">
      {rows.map((row, index) => (
        <div
          key={`${row.name}-${index}`}
          className="max-w-[300px] self-start rounded-2xl rounded-bl-[4px] border border-[#ECEAE4] bg-white px-3.5 py-2.5 text-[13px] leading-[1.45] shadow-[0_6px_20px_rgba(0,0,0,0.05)]"
        >
          <span className="mb-[3px] block text-[10px] uppercase tracking-[0.2em] text-[#8C8A84]">
            {SOURCE_LABELS[row.source ?? ""] ?? "Inbox"} · {row.name}
          </span>
          <span className="line-clamp-2">{row.text || "Sent an attachment"}</span>
        </div>
      ))}
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  const reduceMotion = useReducedMotion();
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="absolute bottom-0 right-10 flex items-end gap-2.5">
      {rows.map((row, index) => (
        <div key={row.label} className="relative flex w-[58px] flex-col items-center">
          <span className="mb-1.5 w-[72px] truncate text-center text-[11px] text-[#55534E]" title={row.label}>{row.label}</span>
          <motion.div
            className="w-[58px] origin-bottom rounded-t-xl bg-[linear-gradient(160deg,#FFE1A3,#F2A93B_55%,#E0861B)] shadow-[inset_0_2px_0_rgba(255,255,255,0.6),0_10px_30px_rgba(224,134,27,0.25)]"
            style={{ height: 40 + (row.value / max) * 150 }}
            initial={reduceMotion ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 1, delay: index * 0.08, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </div>
      ))}
    </div>
  );
}

function Places({ rows }: { rows: { city: string; count: number }[] }) {
  return (
    <ul className="absolute bottom-[74px] left-7 right-7 flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.city} className="flex items-center gap-2.5 rounded-[10px] bg-[#F6F5F1] px-3.5 py-2.5 text-[13px]">
          <span className="h-2 w-2 rounded-full bg-[#F2A93B]" aria-hidden="true" />
          <span className="flex-1 truncate">{row.city}</span>
          <span className="tabular-nums text-[#8C8A84]">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

const KIND_ICONS: Record<string, ReactNode> = {
  protection_holds: <ShieldCheck weight="light" size={132} />,
  inbox_orders: <ChatsCircle weight="light" size={132} />,
  returns: <ArrowUUpLeft weight="light" size={132} />,
  all_clear: <CheckCircle weight="light" size={132} />,
};

function Preview({ preview, kind }: { preview: HomePreview | null; kind: string }) {
  if (preview?.type === "orders" && preview.rows.length) return <OrderRows rows={preview.rows} />;
  if (preview?.type === "chat" && preview.rows.length) return <ChatBubbles rows={preview.rows} />;
  if (preview?.type === "bars" && preview.rows.length) return <Bars rows={preview.rows} />;
  if (preview?.type === "places" && preview.rows.length) return <Places rows={preview.rows} />;
  return (
    <div aria-hidden="true" className="absolute bottom-6 right-7 text-[#F2A93B]/70">
      {KIND_ICONS[kind] ?? <CheckCircle weight="light" size={132} />}
    </div>
  );
}

export function AttentionCards({ cards }: { cards: HomeAttentionCard[] }) {
  const reduceMotion = useReducedMotion();
  return (
    <section aria-label="Needs your attention" className="relative z-[2] grid grid-cols-3 gap-5 px-5 pb-5 max-[1200px]:grid-cols-1 max-md:px-4 max-md:pb-10">
      {cards.map((card, index) => (
        <motion.article
          key={card.kind}
          data-testid={`home-card-${card.kind}`}
          className="relative flex min-h-[440px] flex-col overflow-hidden rounded-[26px] border border-[#ECEAE4] bg-white px-7 pt-7"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 + index * 0.08, ease: RISE_EASE }}
        >
          <h3 className="max-w-[440px] text-[21px] font-medium leading-[1.3] tracking-[-0.01em] text-[#111110]">{card.title}</h3>
          <p className="mt-2.5 max-w-[470px] text-[14.5px] leading-[1.6] text-[#55534E]">{card.body}</p>
          <div className="relative mt-auto h-[240px]">
            <Preview preview={card.preview} kind={card.kind} />
          </div>
          <Link
            to={card.cta.to}
            state={card.cta.state}
            className="absolute bottom-6 left-7 z-[2] rounded-full border border-[#ECEAE4] bg-white px-[18px] py-2.5 text-[14px] font-medium text-[#111110] shadow-[0_1px_2px_rgba(17,17,16,0.04),0_8px_24px_rgba(17,17,16,0.05)] transition-transform duration-150 ease-out hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          >
            {card.cta.label}
          </Link>
        </motion.article>
      ))}
    </section>
  );
}
