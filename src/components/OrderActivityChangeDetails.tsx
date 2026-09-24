import { ArrowRight } from "@phosphor-icons/react";
import { Chip } from "@/components/base/badges/chip";
import { formatTaka } from "@/lib/orderEditor";
import {
  activityReasonLabel,
  activityStatusColor,
  activityStatusLabel,
  cleanActivityItemLabel,
  formatActivityFieldValue,
  formatSignedTaka,
  itemChangeKind,
  summarizeItemChanges,
  type ActivityChangeInput,
  type ActivityChangeLayout,
  type ActivityChipColor,
  type ItemChangeKind,
} from "@/lib/orderActivityPresentation";
import { cn } from "@/lib/utils";

const ITEM_CHIP_COLOR: Record<ItemChangeKind, ActivityChipColor> = {
  added: "lime",
  removed: "rose",
  increased: "yellow",
  decreased: "yellow",
  discount: "purple",
  variant: "cyan",
  other: "neutral",
};

function itemChipText(change: ActivityChangeInput, kind: ItemChangeKind): string {
  switch (kind) {
    case "added": return "+ Added";
    case "removed": return "− Removed";
    case "increased": return `↑ Qty ${change.before} → ${change.after}`;
    case "decreased": return `↓ Qty ${change.before} → ${change.after}`;
    case "discount": return `Discount ${formatTaka(Number(change.before))} → ${formatTaka(Number(change.after))}`;
    case "variant": return "↔ Size changed";
    default: return "Changed";
  }
}

function itemQuantity(change: ActivityChangeInput, kind: ItemChangeKind): number | null {
  if (kind === "added") return Number(change.after) || null;
  if (kind === "removed") return Number(change.before) || null;
  if (kind === "variant") return Number(change.quantity) || null;
  return null;
}

function StatusChip({ value }: { value: unknown }) {
  return (
    <Chip variant="caption" color={activityStatusColor(value)} className="gap-1.5">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {activityStatusLabel(value)}
    </Chip>
  );
}

function SignedAmount({ value }: { value: number }) {
  return (
    <span className={cn("shrink-0 font-medium tabular-nums", value > 0 ? "text-emerald-600" : "text-rose-600")}>
      {formatSignedTaka(value)}
    </span>
  );
}

function FieldChanges({ fields }: { fields: ActivityChangeInput[] }) {
  return (
    <dl className="space-y-1">
      {fields.map((change, index) => (
        <div
          key={`${change.field || change.label || "field"}-${index}`}
          data-testid="activity-field-change"
          className="flex flex-wrap items-baseline gap-x-2 text-[12px]"
        >
          <dt className="w-28 shrink-0 text-black/50">{change.label || change.field}</dt>
          <dd className="break-words text-black/45">{formatActivityFieldValue(change.field, change.before)}</dd>
          <span aria-hidden className="text-black/30">→</span>
          <dd className="break-words font-medium text-black/85">{formatActivityFieldValue(change.field, change.after)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The headline of what changed, shown in the middle of the event row. */
export function OrderActivityChangeSummary({ layout }: { layout: ActivityChangeLayout }) {
  const { status, total, items, inlineFields } = layout;
  const totalBefore = Number(total?.before);
  const totalAfter = Number(total?.after);
  const totalDelta = total && Number.isFinite(totalBefore) && Number.isFinite(totalAfter) ? totalAfter - totalBefore : 0;

  if (!status && !total && items.length === 0 && inlineFields.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:items-center">
      {status && (
        <div data-testid="activity-status-change" className="flex flex-wrap items-center gap-2 sm:justify-center">
          <StatusChip value={status.before} />
          <ArrowRight aria-hidden size={12} weight="light" className="text-black/40" />
          <StatusChip value={status.after} />
        </div>
      )}

      {(items.length > 0 || total) && (
        <div data-testid="activity-items-summary" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-black/70 sm:justify-center">
          {items.length > 0 && <span className="font-medium text-black/85">{summarizeItemChanges(items)}</span>}
          {items.length > 0 && total && <span aria-hidden className="text-black/25">·</span>}
          {total && (
            <span className="tabular-nums">
              Total {formatTaka(totalBefore)} → {formatTaka(totalAfter)}
            </span>
          )}
          {totalDelta !== 0 && (
            <Chip variant="caption" color={totalDelta > 0 ? "lime" : "rose"}>{formatSignedTaka(totalDelta)}</Chip>
          )}
        </div>
      )}

      {inlineFields.length > 0 && <FieldChanges fields={inlineFields} />}
    </div>
  );
}

/** Per-item rows and secondary field edits, listed beneath the event row. */
export function OrderActivityChangeList({ layout }: { layout: ActivityChangeLayout }) {
  const { items, listFields } = layout;
  if (items.length === 0 && listFields.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ul className="divide-y divide-black/[0.04] rounded-lg bg-[#FAFAF8] px-3 py-1">
          {items.map((change, index) => {
            const kind = itemChangeKind(change);
            const quantity = itemQuantity(change, kind);
            const amount = Number(change.amount_delta);
            return (
              <li
                key={`${change.item_key || change.label || "item"}-${index}`}
                data-testid="activity-item-change"
                className="flex min-w-0 items-center gap-2 py-1.5 text-[12px]"
              >
                <Chip variant="caption" color={ITEM_CHIP_COLOR[kind]} className="shrink-0">
                  {itemChipText(change, kind)}
                </Chip>
                <span
                  className={cn(
                    "min-w-0 truncate",
                    kind === "removed" ? "text-black/50 line-through decoration-black/25" : "text-black/85",
                  )}
                >
                  {kind === "variant"
                    ? `${change.label} · ${String(change.before)} → ${String(change.after)}`
                    : cleanActivityItemLabel(change.label)}
                </span>
                {quantity !== null && <span className="shrink-0 tabular-nums text-black/50">×{quantity}</span>}
                {change.addition_reason && (
                  <Chip variant="caption" color="soft" className="shrink-0">
                    {activityReasonLabel(change.addition_reason)}
                  </Chip>
                )}
                {Number.isFinite(amount) && amount !== 0 && (
                  <span className="ml-auto pl-2"><SignedAmount value={amount} /></span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {listFields.length > 0 && <FieldChanges fields={listFields} />}
    </div>
  );
}
