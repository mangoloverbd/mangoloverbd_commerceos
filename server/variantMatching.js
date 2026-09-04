const normalize = (value) => String(value || "").toLowerCase().replace(/\s+/g, "");

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

export function productNeedsVariant({ item, variantsByProductName }) {
  const variants = variantsByProductName[String(item?.product || "").trim().toLowerCase()] || [];
  return variants.length > 0 && !item?.variant_id;
}
