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
      const product = cogByName.get(item.name.toLowerCase());
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
