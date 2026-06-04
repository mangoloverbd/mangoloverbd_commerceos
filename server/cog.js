const LINE_ITEM_RE = /^\s*(\d+)\s*x\s+(.+?)\s*$/;

export function parseLineItems(productStr) {
  if (!productStr || typeof productStr !== "string") return [];
  return productStr
    .split(",")
    .map((part) => {
      const match = part.match(LINE_ITEM_RE);
      if (!match) return null;
      const qty = parseInt(match[1], 10);
      const name = match[2].trim();
      if (!qty || !name) return null;
      return { qty, name };
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
  // 3. Check if any catalog name is a prefix of the item name
  for (const [catalogName, entry] of cogByName) {
    if (key.startsWith(catalogName) && key.length > catalogName.length) {
      // Ensure the match ends at a word boundary (space, dash, paren, slash)
      const nextChar = key[catalogName.length];
      if (nextChar === " " || nextChar === "-" || nextChar === "/" || nextChar === "(") {
        return entry;
      }
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
