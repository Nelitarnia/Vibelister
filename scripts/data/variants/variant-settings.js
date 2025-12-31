export const DEFAULT_VARIANT_CAPS = Object.freeze({
  variantCapPerAction: 5000,
  variantCapPerGroup: 50000,
});

function sanitizeCap(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.max(1, Math.floor(n));
  return Number.isFinite(v) ? v : fallback;
}

export function normalizeVariantCaps(source = {}, defaults = DEFAULT_VARIANT_CAPS) {
  const caps = source && typeof source === "object" ? source : {};
  const fallback = defaults || DEFAULT_VARIANT_CAPS;
  return {
    variantCapPerAction: sanitizeCap(caps.variantCapPerAction, fallback.variantCapPerAction),
    variantCapPerGroup: sanitizeCap(caps.variantCapPerGroup, fallback.variantCapPerGroup),
  };
}
