// Three product-string formats exist in the codebase:
//   Shopify sync:  "2x Product Name"              (qty first)
//   Storefront:    "ProductName (attrs) x2"        (name first, qty last)
//   Manual/social: "Product Name"                  (bare name, qty implied 1)
// Handle all three. Comma separates multiple line items, but NOT commas
// inside "(attrs)" — a storefront item can be "T-Shirt (Black, M) x1".
const QTY_FIRST_RE = /^\s*(\d+)\s*x\s+(.+?)\s*$/;
const QTY_LAST_RE = /^\s*(.+?)\s+x\s*(\d+)\s*$/;

// Split on commas that are NOT inside parentheses.
function splitLineItems(productStr) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of productStr) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

export function parseLineItems(productStr) {
  if (!productStr || typeof productStr !== "string") return [];
  return splitLineItems(productStr)
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      const m1 = trimmed.match(QTY_FIRST_RE);
      if (m1) {
        const qty = parseInt(m1[1], 10);
        const name = m1[2].trim();
        if (!qty || !name) return null;
        return { qty, name };
      }
      const m2 = trimmed.match(QTY_LAST_RE);
      if (m2) {
        const name = m2[1].trim();
        const qty = parseInt(m2[2], 10);
        if (!qty || !name) return null;
        return { qty, name };
      }
      // Looks like an incomplete quantity marker (e.g. "3x", "3 x") with no
      // product name — not a bare product name, so skip it.
      if (/^\s*\d+\s*x\b/.test(trimmed)) return null;
      // Bare product name with no quantity marker — treat as a single unit.
      // Real orders (manual/social/inbox) often store just the product name.
      return { qty: 1, name: trimmed };
    })
    .filter(Boolean);
}

export function buildCogLookup(products) {
  const lookup = new Map();
  for (const p of products || []) {
    const rawName = p?.name;
    if (typeof rawName !== "string") continue;
    const key = rawName.trim().toLowerCase();
    if (!key) continue;
    const cog = parseFloat(p.cog || 0) || 0;
    const selling_price = parseFloat(p.selling_price || 0) || 0;
    const existing = lookup.get(key);
    if (!existing || (cog > 0 && existing.cog === 0)) {
      lookup.set(key, { cog, selling_price });
    }
  }
  return lookup;
}

/**
 * Fuzzy lookup: tries exact match first, then checks if the item name
 * starts with any catalog product name (handles Shopify variant suffixes
 * like "Product Name - Color / Size").
 */
export function fuzzyLookup(cogByName, itemName) {
  const key = itemName.toLowerCase();
  // 1. Exact match
  const exact = cogByName.get(key);
  if (exact) return exact;
  // 2. Strip variant suffix after " - " and try again
  const dashIdx = key.indexOf(" - ");
  if (dashIdx > 0) {
    const base = key.slice(0, dashIdx).trim();
    const stripped = cogByName.get(base);
    if (stripped) return stripped;
  }
  // 3. Strip "(attrs)" suffix (storefront format) and try again
  const parenIdx = key.indexOf(" (");
  if (parenIdx > 0) {
    const base = key.slice(0, parenIdx).trim();
    const stripped = cogByName.get(base);
    if (stripped) return stripped;
  }
  // 4. Check if any catalog name is a prefix of the item name
  for (const [catalogName, entry] of cogByName) {
    if (key.startsWith(catalogName) && key.length > catalogName.length) {
      // Ensure the match ends at a word boundary (space, dash, paren, slash)
      const nextChar = key[catalogName.length];
      if (nextChar === " " || nextChar === "-" || nextChar === "/" || nextChar === "(") {
        return entry;
      }
    }
  }
  // 5. Lenient fallback: bidirectional substring match (same approach as
  //    orderMentionsProduct). Catches "Cotton T-Shirt Black" catalog vs
  //    "T-Shirt" order item, or vice versa.
  for (const [catalogName, entry] of cogByName) {
    if (entry.cog > 0 && (key.includes(catalogName) || catalogName.includes(key))) {
      return entry;
    }
  }
  return null;
}

export function computeOrderCogs(orders, products) {
  const cogByName = buildCogLookup(products);
  const cogByOrderId = new Map();
  let totalCog = 0;
  let priced = 0;
  let total = 0;

  for (const order of orders || []) {
    const items = parseLineItems(order?.product);
    let orderCog = 0;
    for (const item of items) {
      total += 1;
      const product = fuzzyLookup(cogByName, item.name);
      if (product && product.cog > 0) {
        orderCog += item.qty * product.cog;
        priced += 1;
      }
    }
    totalCog += orderCog;
    if (order?.id != null) cogByOrderId.set(order.id, orderCog);
  }

  return {
    totalCog,
    coverage: { set: priced, total },
    cogByOrderId,
  };
}
