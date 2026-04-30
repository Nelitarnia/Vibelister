/**
 * Row classification predicates for interaction pair variants.
 *
 * Examples:
 * - Enabled modifier variant: { variantSig: 'mod:on', isBypassVariant: false }
 *   => baseline-visible and not bypass.
 * - Bypassed variant of same modifier: { variantSig: 'mod:on', isBypassVariant: true }
 *   => bypass row and hidden from baseline-visible sets.
 */
export function isBypassRow(pair) {
  return !!(pair && (pair.isBypassVariant ?? false));
}

export function isVariantRow(pair) {
  if (!pair || typeof pair !== "object") return false;
  return Boolean(pair.variantSig || pair.rhsVariantSig);
}

export function isBaselineVisibleRow(pair, options = {}) {
  if (options.includeBypass) return true;
  return !isBypassRow(pair);
}
