import { canonicalSig } from "../data/variants/variants.js";

export function createInteractionMaintenance({
  model,
  buildInteractionsPairs,
  getInteractionsOutline,
  getInteractionsRowCount,
  getInteractionsPair,
  noteKeyForPair,
  canonicalSigImpl = canonicalSig,
}) {
  function rebuildInteractionsInPlace() {
    buildInteractionsPairs(model);
    getInteractionsOutline()?.refresh?.();
  }

  function pruneNotesToValidPairs() {
    const validBase = new Set();
    const rowCount = getInteractionsRowCount(model);
    for (let r = 0; r < rowCount; r++) {
      const p = getInteractionsPair(model, r);
      if (!p) continue;
      try {
        const base = noteKeyForPair(p, undefined);
        if (base) validBase.add(base);

        const sigA = canonicalSigImpl(p.variantSig || "");
        if (!p.kind || p.kind === "AI") {
          validBase.add(`${p.aId}|${p.iId}|${sigA}`);
        } else if (p.kind === "AA") {
          const sigB = canonicalSigImpl(p.rhsVariantSig || "");
          validBase.add(`aa|${p.aId}|${p.rhsActionId}|${sigA}|${sigB}`);
          const lo = Math.min(Number(p.aId), Number(p.rhsActionId));
          const hi = Math.max(Number(p.aId), Number(p.rhsActionId));
          validBase.add(`aa|${lo}|${hi}|${sigA}`);
        }
      } catch (_) {
        /* ignore malformed pairs while pruning */
      }
    }

    function baseKeyOf(k) {
      const s = String(k || "");
      const i = s.indexOf("|p");
      return i >= 0 ? s.slice(0, i) : s;
    }

    for (const k in model.notes) {
      if (!validBase.has(baseKeyOf(k))) delete model.notes[k];
    }
  }

  return { rebuildInteractionsInPlace, pruneNotesToValidPairs };
}

export default createInteractionMaintenance;
