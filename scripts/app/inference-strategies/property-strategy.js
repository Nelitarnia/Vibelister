function buildInputGroupKey(target, property) {
  return `${property}|${target.inputKey}|${target.phase}|${target.field}`;
}

function buildPhaseGroupKey(target, property) {
  return `${property}|${target.phase}|${target.field}`;
}

export const propertyStrategy = {
  key: "action-property",
  thresholds(thresholds) {
    return {
      enabled: thresholds.actionPropertyEnabled !== false,
      input: {
        minGroupSize: thresholds.actionPropertyMinGroupSize,
        minExistingRatio: thresholds.actionPropertyMinExistingRatio,
      },
      phase: {
        minGroupSize: thresholds.actionPropertyPhaseMinGroupSize,
        minExistingRatio: thresholds.actionPropertyPhaseMinExistingRatio,
      },
    };
  },
  prepare({ targets }) {
    const byInput = new Map();
    const byPhase = new Map();
    for (const target of targets) {
      if (!Array.isArray(target.properties) || !target.properties.length) continue;
      for (const prop of target.properties) {
        const propertyKey = String(prop || "").trim().toLowerCase();
        if (!propertyKey) continue;
        const inputKey = buildInputGroupKey(target, propertyKey);
        if (!byInput.has(inputKey)) byInput.set(inputKey, []);
        byInput.get(inputKey).push(target);

        const phaseKey = buildPhaseGroupKey(target, propertyKey);
        if (!byPhase.has(phaseKey)) byPhase.set(phaseKey, []);
        byPhase.get(phaseKey).push(target);
      }
    }
    return { byInput, byPhase };
  },
  suggest({ state, thresholds, suggestions, profilePrefs, helpers }) {
    if (state.byInput.size) {
      helpers.applyConsensus(
        state.byInput,
        suggestions,
        helpers.sources.actionProperty,
        profilePrefs,
        thresholds.input,
      );
    }
    if (state.byPhase.size) {
      helpers.applyConsensus(
        state.byPhase,
        suggestions,
        helpers.sources.actionProperty,
        profilePrefs,
        thresholds.phase,
      );
    }
  },
};
