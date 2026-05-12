import { canonicalSig } from "./variants/variants.js";

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
    const sigA = canonicalSig(pairLike.variantSig || "");
    const sigB = canonicalSig(pairLike.rhsVariantSig || "");
    return `aa|${actionId}|${rhsActionId}|${sigA}|${sigB}`;
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
    return {
      kind: "AI",
      actionId,
      inputId,
      variantSig: canonicalSig(parts[3] || ""),
      baseKey: String(baseKey),
      canonicalSig: `ai|${actionId}|${inputId}|${canonicalSig(parts[3] || "")}`,
    };
  }
  if (prefix === "aa" && parts.length >= 5) {
    const lhsId = normalizeKeyInt(parts[1]);
    const rhsId = normalizeKeyInt(parts[2]);
    if (!Number.isFinite(lhsId) || !Number.isFinite(rhsId)) return null;
    return {
      kind: "AA",
      actionId: lhsId,
      rhsActionId: rhsId,
      variantSig: canonicalSig(parts[3] || ""),
      rhsVariantSig: canonicalSig(parts[4] || ""),
      baseKey: String(baseKey),
      canonicalSig: `aa|${lhsId}|${rhsId}|${canonicalSig(parts[3] || "")}|${canonicalSig(parts[4] || "")}`,
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
      canonicalSig: `ai|${actionId}|${inputId}|${variantSig}`,
    };
  }
  return null;
}
