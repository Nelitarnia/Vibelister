import { normalizeVariantCapsObject } from "./variant-cap-normalize.js";

export const DEFAULT_VARIANT_CAPS = Object.freeze({
  variantCapPerAction: 5000,
  variantCapPerGroup: 50000,
});

export function normalizeVariantCaps(
  source = {},
  defaults = DEFAULT_VARIANT_CAPS,
) {
  return normalizeVariantCapsObject(source, defaults || DEFAULT_VARIANT_CAPS);
}
