const normalize = (value) => String(value || "").toLowerCase().replace(/\s+/g, "");
const normalizeText = (value) => String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsDelimitedValue(text, value) {
  const normalizedText = normalizeText(text);
  const normalizedValue = normalizeText(value);
  if (!normalizedText || !normalizedValue) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(normalizedValue)}(?=$|[^\\p{L}\\p{N}])`, "iu")
    .test(normalizedText);
}

export function variantLabel(attributes) {
  if (!attributes || typeof attributes !== "object") return "";
  return Object.entries(attributes).map(([key, value]) => `${key}: ${value}`).join(", ");
}

export function matchVariantId({ label, variants }) {
  const wanted = normalize(label);
  if (!wanted || !Array.isArray(variants)) return null;
  const matches = variants.filter((variant) => {
    const full = normalize(variantLabel(variant.attributes));
    const values = Object.values(variant.attributes || {}).map(normalize);
    return full === wanted || values.includes(wanted);
  });
  return matches.length === 1 ? matches[0].id : null;
}

export function matchProductFromText({ text, products }) {
  const wanted = normalizeText(text);
  if (!wanted || !Array.isArray(products)) return null;

  const matches = products.filter((product) => {
    const name = normalizeText(product?.name);
    return name && containsDelimitedValue(wanted, name);
  });
  if (matches.length === 0) return null;

  const longestNameLength = Math.max(...matches.map((product) => normalizeText(product.name).length));
  const mostSpecificMatches = matches.filter(
    (product) => normalizeText(product.name).length === longestNameLength,
  );
  return mostSpecificMatches.length === 1 ? mostSpecificMatches[0] : null;
}

export function matchVariantIdFromText({ text, variants }) {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  if (variants.length === 1) return variants[0]?.id || null;

  const matches = variants.filter((variant) => {
    const values = Object.values(variant?.attributes || {}).filter(
      (value) => normalizeText(value),
    );
    return values.length > 0 && values.every((value) => containsDelimitedValue(text, value));
  });
  return matches.length === 1 ? matches[0].id : null;
}

export function productNeedsVariant({ item, variantsByProductName }) {
  const variants = variantsByProductName[String(item?.product || "").trim().toLowerCase()] || [];
  return variants.length > 0 && !item?.variant_id;
}
