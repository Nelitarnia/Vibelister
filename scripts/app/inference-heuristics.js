import {
  DEFAULT_INTERACTION_SOURCE,
  describeInteractionInference,
  normalizeInteractionSource,
  normalizeInteractionTags,
} from "./interactions.js";

function normalizeVariantSig(pair) {
  if (!pair) return "";
  const sig =
    typeof pair.variantSig === "string" || typeof pair.variantSig === "number"
      ? String(pair.variantSig)
      : "";
  return sig;
}

function normalizeInputKey(pair) {
  if (!pair) return "";
  const kind = String(pair.kind || "AI").toUpperCase();
  if (kind === "AA") {
    return Number.isFinite(pair.rhsActionId) ? `rhs:${pair.rhsActionId}` : "";
  }
  return Number.isFinite(pair.iId) ? `in:${pair.iId}` : "";
}

function normalizeActionId(pair) {
  const id = Number(pair?.aId);
  return Number.isFinite(id) ? id : null;
}

function extractFieldValue(target) {
  const { note, field } = target;
  if (!note || typeof note !== "object") return null;
  if (field === "outcome") {
    if (Number.isFinite(note.outcomeId)) return { outcomeId: note.outcomeId };
    if (typeof note.result === "string" && note.result.trim()) {
      return { result: note.result.trim() };
    }
    return null;
  }
  if (field === "end") {
    if (Number.isFinite(note.endActionId)) {
      return {
        endActionId: note.endActionId,
        endVariantSig:
          typeof note.endVariantSig === "string" ? note.endVariantSig : "",
      };
    }
    if (typeof note.endFree === "string" && note.endFree.trim()) {
      return { endFree: note.endFree.trim() };
    }
    return null;
  }
  if (field === "tag") {
    const tags = normalizeInteractionTags(note.tags);
    return tags.length ? { tags } : null;
  }
  return null;
}

function valueKey(field, value) {
  if (!value) return "";
  if (field === "outcome") {
    if (Number.isFinite(value.outcomeId)) return `o:${value.outcomeId}`;
    if (typeof value.result === "string") return `r:${value.result}`;
  }
  if (field === "end") {
    if (Number.isFinite(value.endActionId)) {
      const sig = typeof value.endVariantSig === "string" ? value.endVariantSig : "";
      return `e:${value.endActionId}|${sig}`;
    }
    if (typeof value.endFree === "string") return `f:${value.endFree}`;
  }
  if (field === "tag") {
    const tags = normalizeInteractionTags(value.tags);
    return `t:${tags.join("|")}`;
  }
  return "";
}

function cloneValue(field, value) {
  if (!value) return null;
  if (field === "outcome") {
    if (Number.isFinite(value.outcomeId)) return { outcomeId: value.outcomeId };
    if (typeof value.result === "string") return { result: value.result };
    return null;
  }
  if (field === "end") {
    if (Number.isFinite(value.endActionId)) {
      return {
        endActionId: value.endActionId,
        endVariantSig:
          typeof value.endVariantSig === "string" ? value.endVariantSig : "",
      };
    }
    if (typeof value.endFree === "string") return { endFree: value.endFree };
    return null;
  }
  if (field === "tag") {
    const tags = normalizeInteractionTags(value.tags);
    return tags.length ? { tags } : { tags: [] };
  }
  return null;
}

function prepareTargets(targets) {
  return targets.map((target) => {
    const actionId = normalizeActionId(target.pair);
    const variantSig = normalizeVariantSig(target.pair);
    const inputKey = normalizeInputKey(target.pair);
    const currentValue = extractFieldValue(target);
    const info = describeInteractionInference(target.note);
    const source = normalizeInteractionSource(info?.source);
    return {
      ...target,
      actionId,
      variantSig,
      inputKey,
      currentValue,
      hasValue: !!currentValue,
      isManual: source === DEFAULT_INTERACTION_SOURCE && !!currentValue,
      isInferred: !!info?.inferred,
    };
  });
}

function eligibleForSuggestion(target) {
  if (!target) return false;
  if (!target.hasValue) return true;
  if (target.isManual) return false;
  return target.isInferred;
}

function registerSuggestion(map, target, source, confidence, value) {
  if (!map.has(target.key)) map.set(target.key, {});
  map.get(target.key)[target.field] = { source, confidence, value };
}

function applyConsensus(groups, suggestions, source, confidence) {
  for (const list of groups.values()) {
    const existing = list.filter((t) => t.currentValue);
    if (!existing.length) continue;
    const uniqueValues = new Map();
    for (const t of existing) {
      const key = valueKey(t.field, t.currentValue);
      if (!key) continue;
      if (!uniqueValues.has(key)) uniqueValues.set(key, t.currentValue);
    }
    if (uniqueValues.size !== 1) continue;
    const value = Array.from(uniqueValues.values())[0];
    for (const target of list) {
      if (!eligibleForSuggestion(target)) continue;
      const already = suggestions.get(target.key)?.[target.field];
      if (already) continue;
      registerSuggestion(
        suggestions,
        target,
        source,
        confidence,
        cloneValue(target.field, value),
      );
    }
  }
}

export const HEURISTIC_SOURCES = Object.freeze({
  modifierPropagation: "modifier-propagation",
  modifierProfile: "modifier-profile",
  inputDefault: "input-default",
});

const SOURCE_CONFIDENCE = Object.freeze({
  [HEURISTIC_SOURCES.modifierPropagation]: 0.82,
  [HEURISTIC_SOURCES.modifierProfile]: 0.64,
  [HEURISTIC_SOURCES.inputDefault]: 0.48,
});

export function proposeInteractionInferences(targets) {
  const prepared = prepareTargets(targets || []);
  const suggestions = new Map();

  const byActionInput = new Map();
  const byModifierProfile = new Map();
  const byInputDefault = new Map();

  for (const target of prepared) {
    const { actionId, inputKey, field, phase, variantSig } = target;
    const actionKey = actionId == null ? "" : String(actionId);
    const groupKey = `${actionKey}|${inputKey}|${phase}|${field}`;
    if (!byActionInput.has(groupKey)) byActionInput.set(groupKey, []);
    byActionInput.get(groupKey).push(target);

    const profileKey = `${actionKey}|${variantSig}|${phase}|${field}`;
    if (!byModifierProfile.has(profileKey)) byModifierProfile.set(profileKey, []);
    byModifierProfile.get(profileKey).push(target);

    if (!byInputDefault.has(groupKey)) byInputDefault.set(groupKey, []);
    byInputDefault.get(groupKey).push(target);
  }

  applyConsensus(
    byActionInput,
    suggestions,
    HEURISTIC_SOURCES.modifierPropagation,
    SOURCE_CONFIDENCE[HEURISTIC_SOURCES.modifierPropagation],
  );

  applyConsensus(
    byModifierProfile,
    suggestions,
    HEURISTIC_SOURCES.modifierProfile,
    SOURCE_CONFIDENCE[HEURISTIC_SOURCES.modifierProfile],
  );

  for (const list of byInputDefault.values()) {
    const candidate = list.find((t) => t.currentValue);
    if (!candidate) continue;
    for (const target of list) {
      if (!eligibleForSuggestion(target)) continue;
      const already = suggestions.get(target.key)?.[target.field];
      if (already) continue;
      registerSuggestion(
        suggestions,
        target,
        HEURISTIC_SOURCES.inputDefault,
        SOURCE_CONFIDENCE[HEURISTIC_SOURCES.inputDefault],
        cloneValue(target.field, candidate.currentValue),
      );
    }
  }

  return suggestions;
}

