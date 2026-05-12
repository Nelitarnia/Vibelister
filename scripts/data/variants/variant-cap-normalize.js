export function normalizeVariantCap(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const asInt = Math.floor(n);
  return asInt > 0 ? asInt : fallback;
}

export function normalizeVariantCapsObject(raw, fallbackCaps) {
  const caps = raw && typeof raw === "object" ? raw : {};
  const fallback = fallbackCaps && typeof fallbackCaps === "object" ? fallbackCaps : {};
  return {
    variantCapPerAction: normalizeVariantCap(
      caps.variantCapPerAction,
      fallback.variantCapPerAction,
    ),
    variantCapPerGroup: normalizeVariantCap(
      caps.variantCapPerGroup,
      fallback.variantCapPerGroup,
    ),
  };
}
