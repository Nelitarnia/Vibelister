export const profileTrendStrategy = {
  key: "profile-trend",
  thresholds(thresholds) {
    return {
      minObservations: thresholds.profileTrendMinObservations,
      minPreferenceRatio: thresholds.profileTrendMinPreferenceRatio,
    };
  },
  prepare({ targets }) {
    return targets;
  },
  suggest({ state: targets, profilePrefs, suggestions, helpers }) {
    if (!profilePrefs) return;
    for (const target of targets) {
      if (!helpers.eligibleForSuggestion(target)) continue;
      if (!profilePrefs.hasSignal(target)) continue;
      if (profilePrefs.shouldSkip(target)) continue;
      const preferred = profilePrefs.preferredValue(target);
      if (!preferred) continue;
      const summary = profilePrefs.getSummary(target);
      const total = summary ? summary.change + summary.noEffect : 0;
      const preferenceRatio = total > 0 ? summary.topCount / total : null;
      const confidence = helpers.computeSuggestionConfidence(
        helpers.sources.profileTrend,
        {
          preferenceRatio,
          supportCount: summary?.topCount,
        },
      );
      helpers.registerSuggestion(
        suggestions,
        target,
        helpers.sources.profileTrend,
        confidence,
        helpers.cloneValue(target.field, preferred),
        profilePrefs,
      );
    }
  },
};
