function hasInlineQty(line: string): boolean {
  return /^\d+\s*(x|×)\s+/i.test(line);
}

export function formatProductLine(line: string, fallbackQty: number | null | undefined): string {
  if (!line) return "—";
  if (hasInlineQty(line)) return line;
  if (fallbackQty && fallbackQty > 0) return `${line} ×${fallbackQty}`;
  return line;
}

export function formatTooltipProductLine(line: string, hasStructuredItems: boolean, fallbackQty: number | null | undefined): string {
  return hasStructuredItems ? line : formatProductLine(line, fallbackQty);
}
