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

function normalizeActionGroup(group) {
  if (group == null) return "";
  const text = String(group).trim();
  return text ? text.toLowerCase() : "";
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
    const actionGroupKey = normalizeActionGroup(target.actionGroup);
    const currentValue = extractFieldValue(target);
    const info = describeInteractionInference(target.note);
    const source = normalizeInteractionSource(info?.source);
    return {
      ...target,
      actionId,
      variantSig,
      inputKey,
      actionGroupKey,
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

function registerSuggestion(map, target, source, confidence, value, profilePrefs) {
  if (profilePrefs?.shouldSkip(target, value)) return;
  if (!map.has(target.key)) map.set(target.key, {});
  map.get(target.key)[target.field] = { source, confidence, value };
}

function applyConsensus(groups, suggestions, source, profilePrefs, thresholds) {
  const minGroupSize = Number.isFinite(thresholds?.minGroupSize)
    ? thresholds.minGroupSize
    : thresholds?.consensusMinGroupSize;
  const minExistingRatio = Number.isFinite(thresholds?.minExistingRatio)
    ? thresholds.minExistingRatio
    : thresholds?.consensusMinExistingRatio;
  for (const list of groups.values()) {
    const total = list.length;
    if (!Number.isFinite(minGroupSize) || total < minGroupSize) continue;

    const existing = list.filter((t) => t.currentValue);
    if (!existing.length) continue;
    if (
      !Number.isFinite(minExistingRatio) ||
      existing.length / total < minExistingRatio
    )
      continue;
    const uniqueValues = new Map();
    for (const t of existing) {
      const key = valueKey(t.field, t.currentValue);
      if (!key) continue;
      if (!uniqueValues.has(key)) uniqueValues.set(key, t.currentValue);
    }
    if (uniqueValues.size !== 1) continue;
    const value = Array.from(uniqueValues.values())[0];
    const agreementRatio = total > 0 ? existing.length / total : null;
    const confidence = computeSuggestionConfidence(source, { agreementRatio });
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
        profilePrefs,
      );
    }
  }
}

export const HEURISTIC_SOURCES = Object.freeze({
  actionGroup: "action-group",
  modifierPropagation: "modifier-propagation",
  modifierProfile: "modifier-profile",
  inputDefault: "input-default",
  profileTrend: "profile-trend",
});

const BASE_CONFIDENCE = Object.freeze({
  [HEURISTIC_SOURCES.actionGroup]: 0.6,
  [HEURISTIC_SOURCES.modifierPropagation]: 0.82,
  [HEURISTIC_SOURCES.modifierProfile]: 0.64,
  [HEURISTIC_SOURCES.inputDefault]: 0.48,
  [HEURISTIC_SOURCES.profileTrend]: 0.56,
});

function clampConfidence(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function computeSuggestionConfidence(source, context = {}) {
  const base = BASE_CONFIDENCE[source] ?? 0.5;
  if (
    source === HEURISTIC_SOURCES.modifierPropagation ||
    source === HEURISTIC_SOURCES.modifierProfile
  ) {
    const ratio = context.agreementRatio;
    if (Number.isFinite(ratio)) return clampConfidence(base * ratio);
  }
  if (source === HEURISTIC_SOURCES.inputDefault) {
    const ratio = context.existingRatio;
    if (Number.isFinite(ratio)) return clampConfidence(base * ratio);
  }
  if (source === HEURISTIC_SOURCES.profileTrend) {
    const preferenceRatio = context.preferenceRatio;
    const supportBoost = Number.isFinite(context.supportCount)
      ? Math.min(context.supportCount, 20) * 0.01
      : 0;
    if (Number.isFinite(preferenceRatio)) {
      return clampConfidence(base * preferenceRatio + supportBoost);
    }
    return clampConfidence(base + supportBoost);
  }
  return clampConfidence(base);
}

export const DEFAULT_HEURISTIC_THRESHOLDS = Object.freeze({
  consensusMinGroupSize: 2,
  consensusMinExistingRatio: 0.5,
  actionGroupMinGroupSize: 2,
  actionGroupMinExistingRatio: 0.6,
  actionGroupPhaseMinGroupSize: 3,
  actionGroupPhaseMinExistingRatio: 0.72,
  inputDefaultMinGroupSize: 2,
  inputDefaultMinExistingRatio: 0.5,
  profileTrendMinObservations: 3,
  profileTrendMinPreferenceRatio: 0.55,
});

function normalizeThresholds(override = {}) {
  const defaults = DEFAULT_HEURISTIC_THRESHOLDS;
  return {
    consensusMinGroupSize: Number.isFinite(override.consensusMinGroupSize)
      ? override.consensusMinGroupSize
      : defaults.consensusMinGroupSize,
    consensusMinExistingRatio: Number.isFinite(override.consensusMinExistingRatio)
      ? override.consensusMinExistingRatio
      : defaults.consensusMinExistingRatio,
    actionGroupMinGroupSize: Number.isFinite(override.actionGroupMinGroupSize)
      ? override.actionGroupMinGroupSize
      : defaults.actionGroupMinGroupSize,
    actionGroupMinExistingRatio: Number.isFinite(override.actionGroupMinExistingRatio)
      ? override.actionGroupMinExistingRatio
      : defaults.actionGroupMinExistingRatio,
    actionGroupPhaseMinGroupSize: Number.isFinite(
      override.actionGroupPhaseMinGroupSize,
    )
      ? override.actionGroupPhaseMinGroupSize
      : defaults.actionGroupPhaseMinGroupSize,
    actionGroupPhaseMinExistingRatio: Number.isFinite(
      override.actionGroupPhaseMinExistingRatio,
    )
      ? override.actionGroupPhaseMinExistingRatio
      : defaults.actionGroupPhaseMinExistingRatio,
    inputDefaultMinGroupSize: Number.isFinite(override.inputDefaultMinGroupSize)
      ? override.inputDefaultMinGroupSize
      : defaults.inputDefaultMinGroupSize,
    inputDefaultMinExistingRatio: Number.isFinite(override.inputDefaultMinExistingRatio)
      ? override.inputDefaultMinExistingRatio
      : defaults.inputDefaultMinExistingRatio,
    profileTrendMinObservations: Number.isFinite(override.profileTrendMinObservations)
      ? override.profileTrendMinObservations
      : defaults.profileTrendMinObservations,
    profileTrendMinPreferenceRatio: Number.isFinite(override.profileTrendMinPreferenceRatio)
      ? override.profileTrendMinPreferenceRatio
      : defaults.profileTrendMinPreferenceRatio,
  };
}

function modifierIdsFromSig(sig) {
  if (!sig) return [];
  return String(sig)
    .split("+")
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
}

function normalizePhaseKey(phase) {
  return phase == null ? null : String(phase);
}

function selectProfileBucket(container, phase, allowPhaseFallback) {
  if (!container) return null;
  const phaseKey = normalizePhaseKey(phase);
  if (phaseKey != null) {
    const phaseBucket = container.phases?.[phaseKey];
    if (phaseBucket) return phaseBucket;
    if (!allowPhaseFallback) return null;
  }
  return container.all || null;
}

function summarizeProfileForTarget(target, profiles, cache) {
  if (!profiles) return null;
  const allowPhaseFallback = normalizePhaseKey(target.phase) == null;
  const cacheKey = `${target.key}|${target.field}|${target.phase ?? ""}|${allowPhaseFallback}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const field = target.field;
  if (field !== "outcome" && field !== "end" && field !== "tag") {
    cache.set(cacheKey, null);
    return null;
  }

  let change = 0;
  let noEffect = 0;
  const valueCounts = new Map();

  const mergeBucket = (bucket) => {
    if (!bucket) return;
    change += Number(bucket.change || 0);
    noEffect += Number(bucket.noop || 0) + Number(bucket.clear || 0);
    const values = bucket.values || {};
    for (const [key, entry] of Object.entries(values)) {
      const count = Number(entry?.count || 0);
      const value = entry?.value;
      if (!valueCounts.has(key)) valueCounts.set(key, { count: 0, value });
      const item = valueCounts.get(key);
      item.count += count;
      if (item.value == null && value != null) item.value = value;
    }
  };

  const inputBucket = selectProfileBucket(
    profiles.input?.[target.inputKey]?.[field],
    target.phase,
    allowPhaseFallback,
  );
  mergeBucket(inputBucket);

  const modIds = modifierIdsFromSig(target.variantSig);
  for (const modId of modIds) {
    const bucket = selectProfileBucket(
      profiles.modifier?.[modId]?.[field],
      target.phase,
      allowPhaseFallback,
    );
    mergeBucket(bucket);
  }

  let topValue = null;
  let topValueKey = "";
  let topCount = 0;
  for (const [key, entry] of valueCounts.entries()) {
    if (entry.count > topCount) {
      topCount = entry.count;
      topValue = entry.value;
      topValueKey = key;
    }
  }

  const summary =
    change === 0 && noEffect === 0 && topCount === 0
      ? null
      : { change, noEffect, topValue, topValueKey, topCount };
  cache.set(cacheKey, summary);
  return summary;
}

function hasProfileTrendSignal(summary, thresholds) {
  if (!summary) return false;
  const total = summary.change + summary.noEffect;
  if (total < thresholds.profileTrendMinObservations) return false;
  if (summary.topCount <= 0) return false;
  const preferenceRatio = summary.topCount / total;
  return preferenceRatio >= thresholds.profileTrendMinPreferenceRatio;
}

function buildProfilePrefs(profiles, thresholds) {
  const cache = new Map();
  return {
    shouldSkip(target, candidateValue) {
      const summary = summarizeProfileForTarget(target, profiles, cache);
      if (!summary) return false;
      const candidateKey = valueKey(target.field, candidateValue);
      if (
        summary.noEffect > summary.change * 1.2 &&
        (!candidateKey || candidateKey !== summary.topValueKey)
      ) {
        return true;
      }
      return false;
    },
    hasSignal(target) {
      const summary = summarizeProfileForTarget(target, profiles, cache);
      return hasProfileTrendSignal(summary, thresholds);
    },
    preferredValue(target) {
      const summary = summarizeProfileForTarget(target, profiles, cache);
      if (!hasProfileTrendSignal(summary, thresholds)) return null;
      if (summary.change >= summary.noEffect && summary.topValue) {
        return summary.topValue;
      }
      return null;
    },
    getSummary(target) {
      return summarizeProfileForTarget(target, profiles, cache);
    },
  };
}

export function proposeInteractionInferences(targets, profiles, thresholdOverrides) {
  const thresholds = normalizeThresholds(thresholdOverrides);
  const prepared = prepareTargets(targets || []);
  const suggestions = new Map();

  const profilePrefs = profiles ? buildProfilePrefs(profiles, thresholds) : null;

  const byActionInput = new Map();
  const byActionGroupInput = new Map();
  const byActionGroupPhase = new Map();
  const byModifierProfile = new Map();
  const byInputDefault = new Map();

  for (const target of prepared) {
    const { actionId, inputKey, field, phase, variantSig, actionGroupKey } = target;
    const actionKey = actionId == null ? "" : String(actionId);
    const groupKey = `${actionKey}|${inputKey}|${phase}|${field}`;
    if (!byActionInput.has(groupKey)) byActionInput.set(groupKey, []);
    byActionInput.get(groupKey).push(target);

    if (actionGroupKey) {
      const inputGroupKey = `${actionGroupKey}|${inputKey}|${phase}|${field}`;
      if (!byActionGroupInput.has(inputGroupKey))
        byActionGroupInput.set(inputGroupKey, []);
      byActionGroupInput.get(inputGroupKey).push(target);

      const phaseGroupKey = `${actionGroupKey}|${phase}|${field}`;
      if (!byActionGroupPhase.has(phaseGroupKey))
        byActionGroupPhase.set(phaseGroupKey, []);
      byActionGroupPhase.get(phaseGroupKey).push(target);
    }

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
    profilePrefs,
    {
      minGroupSize: thresholds.consensusMinGroupSize,
      minExistingRatio: thresholds.consensusMinExistingRatio,
    },
  );

  applyConsensus(
    byActionGroupInput,
    suggestions,
    HEURISTIC_SOURCES.actionGroup,
    profilePrefs,
    {
      minGroupSize: thresholds.actionGroupMinGroupSize,
      minExistingRatio: thresholds.actionGroupMinExistingRatio,
    },
  );

  applyConsensus(
    byActionGroupPhase,
    suggestions,
    HEURISTIC_SOURCES.actionGroup,
    profilePrefs,
    {
      minGroupSize: thresholds.actionGroupPhaseMinGroupSize,
      minExistingRatio: thresholds.actionGroupPhaseMinExistingRatio,
    },
  );

  applyConsensus(
    byModifierProfile,
    suggestions,
    HEURISTIC_SOURCES.modifierProfile,
    profilePrefs,
    {
      minGroupSize: thresholds.consensusMinGroupSize,
      minExistingRatio: thresholds.consensusMinExistingRatio,
    },
  );

  for (const list of byInputDefault.values()) {
    const total = list.length;
    if (total < thresholds.inputDefaultMinGroupSize) continue;
    const existing = list.filter((t) => t.currentValue);
    if (!existing.length) continue;
    if (existing.length / total < thresholds.inputDefaultMinExistingRatio) continue;
    const candidate = existing[0];
    const existingRatio = total > 0 ? existing.length / total : null;
    const confidence = computeSuggestionConfidence(
      HEURISTIC_SOURCES.inputDefault,
      { existingRatio },
    );
    for (const target of list) {
      if (!eligibleForSuggestion(target)) continue;
      const already = suggestions.get(target.key)?.[target.field];
      if (already) continue;
      registerSuggestion(
        suggestions,
        target,
        HEURISTIC_SOURCES.inputDefault,
        confidence,
        cloneValue(target.field, candidate.currentValue),
        profilePrefs,
      );
    }
  }

  if (profilePrefs) {
    for (const target of prepared) {
      if (!eligibleForSuggestion(target)) continue;
      const already = suggestions.get(target.key)?.[target.field];
      if (already) continue;
      if (!profilePrefs.hasSignal(target)) continue;
      if (profilePrefs.shouldSkip(target)) continue;
      const preferred = profilePrefs.preferredValue(target);
      if (!preferred) continue;
      const summary = profilePrefs.getSummary(target);
      const total = summary ? summary.change + summary.noEffect : 0;
      const preferenceRatio = total > 0 ? summary.topCount / total : null;
      const confidence = computeSuggestionConfidence(
        HEURISTIC_SOURCES.profileTrend,
        {
          preferenceRatio,
          supportCount: summary?.topCount,
        },
      );
      registerSuggestion(
        suggestions,
        target,
        HEURISTIC_SOURCES.profileTrend,
        confidence,
        cloneValue(target.field, preferred),
        profilePrefs,
      );
    }
  }

  return suggestions;
}

