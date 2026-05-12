import { canonicalSig } from "./variants/variants.js";

/**
 * `canonicalSig`: canonicalized variant-signature segment only (e.g. `"1+5"`).
 * `canonicalKey`: canonicalized full interaction key (`ai|...` / `aa|...`) including ids + signature segments.
 */

export function isFiniteInteger(value) {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n);
}

export function normalizeKeyInt(value) {
  const n = Number(value);
  return isFiniteInteger(n) ? n : null;
}

export function buildBaseInteractionKey(pairLike) {
  if (!pairLike) return "";
  const kind = String(pairLike.kind || "AI").toUpperCase();
  if (kind === "AA") {
    const actionId = normalizeKeyInt(pairLike.aId ?? pairLike.actionId);
    const rhsActionId = normalizeKeyInt(
      pairLike.rhsActionId ?? pairLike.bId ?? pairLike.otherActionId,
    );
    if (!Number.isFinite(actionId) || !Number.isFinite(rhsActionId)) return "";
    const lhsVariantSigCanonical = canonicalSig(pairLike.variantSig || "");
    const rhsVariantSigCanonical = canonicalSig(pairLike.rhsVariantSig || "");
    return `aa|${actionId}|${rhsActionId}|${lhsVariantSigCanonical}|${rhsVariantSigCanonical}`;
  }
  const actionId = normalizeKeyInt(pairLike.aId ?? pairLike.actionId);
  const inputId = normalizeKeyInt(pairLike.iId ?? pairLike.inputId);
  if (!Number.isFinite(actionId) || !Number.isFinite(inputId)) return "";
  return `ai|${actionId}|${inputId}|${canonicalSig(pairLike.variantSig || "")}`;
}

export function encodePhaseSuffix(baseKey, phase) {
  if (!baseKey) return "";
  if (phase == null) return String(baseKey);
  const p = normalizeKeyInt(phase);
  if (!Number.isFinite(p) || p < 0) return String(baseKey);
  return `${baseKey}|p${p}`;
}

export function parsePhaseSuffix(key) {
  const text = String(key || "");
  const match = /^(.*)\|p(\d+)$/.exec(text);
  if (!match) return null;
  return { baseKey: match[1], phase: Number(match[2]) };
}

export function baseKeyOf(key) {
  const parsed = parsePhaseSuffix(key);
  return parsed ? parsed.baseKey : String(key || "");
}

export function parseInteractionKey(baseKey) {
  if (!baseKey) return null;
  const parts = String(baseKey).split("|");
  if (parts.length < 3) return null;
  const prefix = parts[0].toLowerCase();
  if (prefix === "ai" && parts.length >= 4) {
    const actionId = normalizeKeyInt(parts[1]);
    const inputId = normalizeKeyInt(parts[2]);
    if (!Number.isFinite(actionId) || !Number.isFinite(inputId)) return null;
    const variantSigCanonical = canonicalSig(parts[3] || "");
    return {
      /**
       * `AI`: canonical `ai|actionId|inputId|variantSig` format.
       * `AA`: canonical `aa|actionId|rhsActionId|variantSig|rhsVariantSig` format.
       * `LEGACY_AI`: legacy `actionId|inputId|variantSig` input normalized to canonical AI output.
       * `canonicalKey` always returns normalized full-key format (`ai|...` or `aa|...`).
       */
      kind: "AI",
      actionId,
      inputId,
      variantSig: variantSigCanonical,
      baseKey: String(baseKey),
      canonicalKey: `ai|${actionId}|${inputId}|${variantSigCanonical}`,
    };
  }
  if (prefix === "aa" && parts.length >= 5) {
    const lhsId = normalizeKeyInt(parts[1]);
    const rhsId = normalizeKeyInt(parts[2]);
    if (!Number.isFinite(lhsId) || !Number.isFinite(rhsId)) return null;
    const variantSigCanonical = canonicalSig(parts[3] || "");
    const rhsVariantSigCanonical = canonicalSig(parts[4] || "");
    return {
      kind: "AA",
      actionId: lhsId,
      rhsActionId: rhsId,
      variantSig: variantSigCanonical,
      rhsVariantSig: rhsVariantSigCanonical,
      baseKey: String(baseKey),
      canonicalKey: `aa|${lhsId}|${rhsId}|${variantSigCanonical}|${rhsVariantSigCanonical}`,
    };
  }
  if (Number.isFinite(Number(prefix)) && parts.length === 3) {
    const actionId = normalizeKeyInt(parts[0]);
    const inputId = normalizeKeyInt(parts[1]);
    if (!Number.isFinite(actionId) || !Number.isFinite(inputId)) return null;
    const variantSig = canonicalSig(parts[2] || "");
    return {
      kind: "LEGACY_AI",
      actionId,
      inputId,
      variantSig,
      baseKey: String(baseKey),
      canonicalKey: `ai|${actionId}|${inputId}|${variantSig}`,
    };
  }
  return null;
}
