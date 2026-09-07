const LEGACY_QUANTITY_PREFIX = /^(?:cart checkout\s*-\s*)?(\d+)\s*[x×]\s*/i;
const LEGACY_QUANTITY_SUFFIX = /\s*[x×]\s*(\d+)\s*$/i;
const MAX_ORDER_ITEM_QUANTITY = 2_147_483_647;

function normalizeQuantity(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(MAX_ORDER_ITEM_QUANTITY, Math.floor(parsed));
}

function splitLegacyProductText(productText) {
  const parts = [];
  let current = "";
  let parenthesesDepth = 0;

  for (let index = 0; index < productText.length; index += 1) {
    const character = productText[index];
    if (character === "(") parenthesesDepth += 1;
    if (character === ")") parenthesesDepth = Math.max(0, parenthesesDepth - 1);

    const plusSeparator = character === "+" &&
      /\s/.test(productText[index - 1] || "") &&
      /\s/.test(productText[index + 1] || "");
    if ((character === "," || plusSeparator) && parenthesesDepth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function parseLegacyProductLines(productText, fallbackQuantity = 1) {
  if (typeof productText !== "string") return [];

  const parts = splitLegacyProductText(productText);

  return parts.map((part) => {
    const prefixMatch = part.match(LEGACY_QUANTITY_PREFIX);
    const suffixMatch = part.match(LEGACY_QUANTITY_SUFFIX);
    const quantityMatch = prefixMatch || suffixMatch;
    const quantity = quantityMatch
      ? normalizeQuantity(quantityMatch[1])
      : parts.length === 1
        ? normalizeQuantity(fallbackQuantity)
        : 1;
    const productName = prefixMatch
      ? part.replace(LEGACY_QUANTITY_PREFIX, "").trim()
      : part.replace(LEGACY_QUANTITY_SUFFIX, "").trim();
    return { productName: productName || part, quantity };
  });
}

export function buildLegacyOrderItems({ orderId, productText, fallbackQuantity, price, discount }) {
  const fallbackQuantityValue = normalizeQuantity(fallbackQuantity);
  const legacyLines = parseLegacyProductLines(productText, fallbackQuantityValue);
  const fallbackLines = legacyLines.length > 0
    ? legacyLines
    : typeof productText === "string" && productText.trim()
      ? [{ productName: productText.trim(), quantity: fallbackQuantityValue }]
      : [];
  const totalQuantity = fallbackLines.reduce((sum, item) => sum + item.quantity, 0);
  const grossPrice = (Number(price) || 0) + (Number(discount) || 0);
  let allocatedTotal = 0;

  return fallbackLines.map((line, index) => {
    const isLastLine = index === fallbackLines.length - 1;
    const unitPrice = isLastLine
      ? (grossPrice - allocatedTotal) / line.quantity
      : grossPrice / Math.max(1, totalQuantity);
    allocatedTotal += unitPrice * line.quantity;
    return {
      id: `legacy-${orderId}-${index}`,
      product_id: null,
      variant_id: null,
      product_name: line.productName,
      variant_name: null,
      unit_price: unitPrice,
      discount_type: null,
      discount_value: 0,
      unit_discount: 0,
      quantity: line.quantity,
    };
  });
}

export function mergeResolvedOrderItems(items) {
  const merged = new Map();
  for (const item of items) {
    const key = `${item.productId || ""}:${item.variantId || ""}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity = Math.min(
        MAX_ORDER_ITEM_QUANTITY,
        existing.quantity + normalizeQuantity(item.quantity),
      );
    } else {
      merged.set(key, { ...item, quantity: normalizeQuantity(item.quantity) });
    }
  }
  return [...merged.values()];
}
