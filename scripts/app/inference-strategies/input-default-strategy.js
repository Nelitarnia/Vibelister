function actionInputKey(target) {
  const actionKey = target.actionId == null ? "" : String(target.actionId);
  return `${actionKey}|${target.inputKey}|${target.phase}|${target.field}`;
}

export const inputDefaultStrategy = {
  key: "input-default",
  thresholds(thresholds) {
    return {
      minGroupSize: thresholds.inputDefaultMinGroupSize,
      minExistingRatio: thresholds.inputDefaultMinExistingRatio,
    };
  },
  prepare({ targets }) {
    const byInputDefault = new Map();
    for (const target of targets) {
      const key = actionInputKey(target);
      if (!byInputDefault.has(key)) byInputDefault.set(key, []);
      byInputDefault.get(key).push(target);
    }
    return byInputDefault;
  },
  suggest({ state: groups, thresholds, suggestions, profilePrefs, helpers }) {
    for (const list of groups.values()) {
      const total = list.length;
      if (total < thresholds.minGroupSize) continue;
      const existing = list.filter((t) => t.currentValue);
      if (!existing.length) continue;
      if (existing.length / total < thresholds.minExistingRatio) continue;
      const candidate = existing[0];
      const existingRatio = total > 0 ? existing.length / total : null;
      const confidence = helpers.computeSuggestionConfidence(
        helpers.sources.inputDefault,
        { existingRatio },
      );
      for (const target of list) {
        if (!helpers.eligibleForSuggestion(target)) continue;
        helpers.registerSuggestion(
          suggestions,
          target,
          helpers.sources.inputDefault,
          confidence,
          helpers.cloneValue(target.field, candidate.currentValue),
          profilePrefs,
        );
      }
    }
  },
};
