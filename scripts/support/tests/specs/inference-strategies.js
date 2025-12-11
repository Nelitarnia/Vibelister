import {
  HEURISTIC_SOURCES,
  runInferenceStrategies,
} from "../../../app/inference-heuristics.js";
import {
  actionGroupStrategy,
  consensusStrategy,
  inputDefaultStrategy,
  modifierProfileStrategy,
  phaseAdjacencyStrategy,
  profileTrendStrategy,
} from "../../../app/inference-strategies/index.js";

function makeNote(value, metadata = {}) {
  if (!value) return null;
  return { ...value, ...metadata };
}

function makeTarget({
  key,
  actionId = 1,
  inputId = 1,
  variantSig = "",
  phase = 1,
  field = "outcome",
  value = null,
  source,
  actionGroup,
}) {
  const pair = { kind: "AI", aId: actionId, iId: inputId, variantSig };
  const note = makeNote(value, source ? { source, confidence: 0.4 } : {});
  return {
    key: key || `${actionId}-${inputId}-${variantSig || "base"}-${phase}-${field}`,
    field,
    phase,
    note,
    pair,
    row: actionId,
    actionGroup,
    actionGroupKey: actionGroup,
  };
}

export function getInferenceStrategyTests() {
  return [
    {
      name: "consensus replaces weaker input default",
      run(assert) {
        const targets = [
          makeTarget({ value: { outcomeId: 3 } }),
          makeTarget({}),
        ];
        const strategies = [inputDefaultStrategy, consensusStrategy];
        const suggestions = runInferenceStrategies(targets, null, null, strategies);
        const suggestion = suggestions.get(targets[1].key)?.outcome;
        assert.ok(suggestion, "consensus suggested a value");
        assert.strictEqual(
          suggestion.source,
          HEURISTIC_SOURCES.modifierPropagation,
          "consensus overrides earlier suggestion",
        );
        assert.ok(suggestion.confidence > 0.3, "consensus confidence applied");
      },
    },
    {
      name: "action-group keeps higher-confidence propagation",
      run(assert) {
        const targets = [
          makeTarget({ actionId: 2, inputId: 5, actionGroup: "bundle", value: { outcomeId: 8 } }),
          makeTarget({ actionId: 2, inputId: 5, actionGroup: "bundle" }),
        ];
        const strategies = [consensusStrategy, actionGroupStrategy];
        const suggestions = runInferenceStrategies(targets, null, null, strategies);
        const suggestion = suggestions.get(targets[1].key)?.outcome;
        assert.ok(suggestion, "suggestion produced");
        assert.strictEqual(
          suggestion.source,
          HEURISTIC_SOURCES.modifierPropagation,
          "action group does not displace higher confidence",
        );
      },
    },
    {
      name: "modifier-profile upgrades action-group suggestion",
      run(assert) {
        const targets = [
          makeTarget({
            actionId: 3,
            inputId: 6,
            variantSig: "7",
            actionGroup: "bundle",
            value: { outcomeId: 12 },
          }),
          makeTarget({ actionId: 3, inputId: 6, variantSig: "7", actionGroup: "bundle" }),
        ];
        const strategies = [actionGroupStrategy, modifierProfileStrategy];
        const suggestions = runInferenceStrategies(targets, null, null, strategies);
        const suggestion = suggestions.get(targets[1].key)?.outcome;
        assert.ok(suggestion, "modifier profile produced suggestion");
        assert.strictEqual(suggestion.source, HEURISTIC_SOURCES.modifierProfile);
        assert.ok(suggestion.confidence > 0.3, "modifier profile confidence applied");
      },
    },
    {
      name: "input default fills when no other strategies run",
      run(assert) {
        const targets = [makeTarget({ value: { outcomeId: 21 } }), makeTarget({})];
        const suggestions = runInferenceStrategies(targets, null, null, [inputDefaultStrategy]);
        const suggestion = suggestions.get(targets[1].key)?.outcome;
        assert.ok(suggestion, "input default emitted suggestion");
        assert.strictEqual(suggestion.source, HEURISTIC_SOURCES.inputDefault);
        assert.ok(suggestion.confidence > 0, "input default confidence assigned");
      },
    },
    {
      name: "profile trend replaces consensus with preferred value",
      run(assert) {
        const preferredValue = { outcomeId: 99 };
        const profiles = {
          input: {
            "in:1": {
              outcome: {
                phases: {
                  1: {
                    change: 6,
                    noop: 0,
                    clear: 0,
                    values: { "o:99": { count: 6, value: preferredValue } },
                  },
                },
              },
            },
          },
        };
        const targets = [
          makeTarget({ value: { outcomeId: 1 } }),
          makeTarget({}),
        ];
        const strategies = [consensusStrategy, profileTrendStrategy];
        const suggestions = runInferenceStrategies(targets, profiles, {
          profileTrendMinObservations: 1,
          profileTrendMinPreferenceRatio: 0,
        }, strategies);
        const suggestion = suggestions.get(targets[1].key)?.outcome;
        assert.ok(suggestion, "profile trend suggested a value");
        assert.strictEqual(suggestion.source, HEURISTIC_SOURCES.profileTrend);
        assert.strictEqual(suggestion.value.outcomeId, preferredValue.outcomeId);
      },
    },
    {
      name: "phase adjacency bridges matching anchors",
      run(assert) {
        const targets = [
          makeTarget({ phase: 1, value: { outcomeId: 5 } }),
          makeTarget({ phase: 2 }),
          makeTarget({ phase: 3, value: { outcomeId: 5 } }),
        ];
        const suggestions = runInferenceStrategies(
          targets,
          null,
          null,
          [phaseAdjacencyStrategy],
        );
        const suggestion = suggestions.get(targets[1].key)?.outcome;
        assert.ok(suggestion, "gap received adjacency suggestion");
        assert.strictEqual(suggestion.source, HEURISTIC_SOURCES.phaseAdjacency);
        assert.ok(suggestion.confidence > 0.3, "adjacency confidence scaled by gap");
      },
    },
  ];
}
