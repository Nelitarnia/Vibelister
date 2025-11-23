import {
  DEFAULT_INTERACTION_CONFIDENCE,
  DEFAULT_INTERACTION_SOURCE,
  applyInteractionMetadata,
  describeInteractionInference,
  noteKeyForPair,
  isInteractionPhaseColumnActiveForRow,
  normalizeInteractionConfidence,
  normalizeInteractionSource,
} from "./interactions.js";
import { parsePhaseKey } from "../data/utils.js";
import { emitInteractionTagChangeEvent } from "./tag-events.js";

const OUT_OF_VIEW_STATUS = "Inference tools only work in the Interactions view.";
const NO_TARGETS_STATUS =
  "Select Outcome, End, or Tag cells in the Interactions view to use inference tools.";

function hasStructuredValue(note, field) {
  if (!note || typeof note !== "object") return false;
  if (field === "outcome") return "outcomeId" in note || "result" in note;
  if (field === "end")
    return (
      "endActionId" in note || "endVariantSig" in note || "endFree" in note
    );
  if (field === "tag") return Array.isArray(note.tags) && note.tags.length > 0;
  return false;
}

function normalizeUncertainty(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.5;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return num;
}

  function collectSelectionTargets({
    model,
    selection,
    sel,
    getActiveView,
  viewDef,
    getInteractionsPair,
    filterField,
  }) {
    if (typeof getActiveView === "function" && getActiveView() !== "interactions") {
      return { targets: [], allowed: false, reason: OUT_OF_VIEW_STATUS };
    }
  const vd = typeof viewDef === "function" ? viewDef() : viewDef;
  const cols = Array.isArray(vd?.columns) ? vd.columns : [];
  const colSet = selection?.colsAll
    ? cols.map((_, idx) => idx)
    : selection?.cols?.size
      ? Array.from(selection.cols).sort((a, b) => a - b)
      : [sel?.c];
  const rows = selection?.rows?.size
    ? Array.from(selection.rows).sort((a, b) => a - b)
    : [sel?.r];
  const targets = [];
  for (const r of rows) {
    if (!Number.isFinite(r)) continue;
    const pair = getInteractionsPair?.(model, r);
    if (!pair) continue;
    for (const c of colSet) {
      if (!Number.isFinite(c) || c < 0 || c >= cols.length) continue;
      const column = cols[c];
      const pk = parsePhaseKey(column?.key);
      if (!pk) continue;
      if (filterField && pk.field !== filterField) continue;
      const key = noteKeyForPair(pair, pk.p);
      const note = model?.notes?.[key];
      targets.push({
        key,
        field: pk.field,
        phase: pk.p,
        note,
        row: r,
        col: c,
        column,
        pair,
      });
    }
  }
  return { targets, allowed: true, viewDef: vd };
}

export function createInteractionBulkActions(options = {}) {
  const {
    model,
    selection,
    sel,
    getActiveView,
    viewDef,
    statusBar,
    runModelMutation,
    makeUndoConfig,
    getInteractionsPair,
  } = options;

  let defaultUncertainty = 0.5;

  function setDefaultUncertainty(value) {
    defaultUncertainty = normalizeUncertainty(value);
    return defaultUncertainty;
  }

  function getDefaultUncertainty() {
    return defaultUncertainty;
  }

  function toggleUncertain() {
    const { targets, allowed, viewDef: vd, reason } = collectSelectionTargets({
      model,
      selection,
      sel,
      getActiveView,
      viewDef,
      getInteractionsPair,
    });
    if (!allowed) {
      const status =
        reason || "Default uncertainty can only be applied in the Interactions view.";
      statusBar?.set?.(status);
      return { status };
    }
    if (!targets.length) {
      statusBar?.set?.(NO_TARGETS_STATUS);
      return { status: NO_TARGETS_STATUS };
    }
    const confidence = 1 - defaultUncertainty;
    const uncertaintyText = `${Math.round(defaultUncertainty * 100)}%`;

    return runModelMutation?.(
      "Set inferred uncertainty",
      () => {
        const notes = model?.notes || (model.notes = {});
        const result = { updated: 0, skippedInactive: 0, unchanged: 0, inspected: 0 };
        for (const target of targets) {
          const active = isInteractionPhaseColumnActiveForRow(
            model,
            vd,
            target.row,
            target.col,
            target.column,
          );
          if (!active) {
            result.skippedInactive++;
            continue;
          }
          const note = notes[target.key] || (notes[target.key] = {});
          const before = describeInteractionInference(note);
          const beforeSource = normalizeInteractionSource(before?.source);
          applyInteractionMetadata(note, {
            confidence,
            source: DEFAULT_INTERACTION_SOURCE,
          });
          const after = describeInteractionInference(note);
          const afterSource = normalizeInteractionSource(after?.source);
          if (
            before.confidence !== after.confidence ||
            beforeSource !== afterSource ||
            !before.inferred
          ) {
            result.updated++;
          } else {
            result.unchanged++;
          }
          result.inspected++;
        }
        return result;
      },
      {
        render: true,
        undo: makeUndoConfig?.({
          label: "set inference uncertainty",
          shouldRecord: (res) => (res?.updated ?? 0) > 0,
        }),
        status: (res) => {
          const updated = res?.updated ?? 0;
          const unchanged = res?.unchanged ?? 0;
          const skipped = res?.skippedInactive ?? 0;
          const updatedText = `${updated || "no"} cell${updated === 1 ? "" : "s"}`;
          const unchangedText = unchanged ? ` (${unchanged} unchanged)` : "";
          const skippedText = skipped
            ? ` Skipped ${skipped} inactive cell${skipped === 1 ? "" : "s"}.`
            : "";
          return `Manual inference: ${updatedText} set to ${uncertaintyText} uncertainty${unchangedText}.${skippedText}`;
        },
      },
    );
  }

  function summarizeSelectionInference() {
    const { targets, allowed, viewDef: vd, reason } = collectSelectionTargets({
      model,
      selection,
      sel,
      getActiveView,
      viewDef,
      getInteractionsPair,
    });
    if (!allowed) return { allowed: false, status: reason || OUT_OF_VIEW_STATUS };
    if (!targets.length) return { allowed: true, count: 0 };

    const summary = {
      allowed: true,
      count: 0,
      confidence: null,
      source: null,
      confidenceMixed: false,
      sourceMixed: false,
    };

    for (const target of targets) {
      const active = isInteractionPhaseColumnActiveForRow(
        model,
        vd,
        target.row,
        target.col,
        target.column,
      );
      if (!active) continue;
      const info = describeInteractionInference(target.note);
      const confidence = normalizeInteractionConfidence(info?.confidence);
      const source = normalizeInteractionSource(info?.source);
      if (summary.confidence == null) summary.confidence = confidence;
      else if (summary.confidence !== confidence) summary.confidenceMixed = true;
      if (summary.source == null) summary.source = source;
      else if (summary.source !== source) summary.sourceMixed = true;
      summary.count++;
    }

    return summary;
  }

  function acceptInferred() {
    const { targets, allowed, reason } = collectSelectionTargets({
      model,
      selection,
      sel,
      getActiveView,
      viewDef,
      getInteractionsPair,
    });
    if (!allowed) {
      const status = reason || "Accepting inferred values only works in Interactions.";
      statusBar?.set?.(status);
      return { status };
    }
    if (!targets.length) {
      statusBar?.set?.(NO_TARGETS_STATUS);
      return { status: NO_TARGETS_STATUS };
    }
    return runModelMutation?.(
      "Accept inferred",
      () => {
        const notes = model?.notes || (model.notes = {});
        const result = {
          promoted: 0,
          skippedManual: 0,
          skippedEmpty: 0,
        };
        for (const target of targets) {
          const note = notes[target.key];
          const hasValue = hasStructuredValue(note, target.field);
          if (!hasValue) {
            result.skippedEmpty++;
            continue;
          }
          const info = describeInteractionInference(note);
          if (!info?.inferred) {
            result.skippedManual++;
            continue;
          }
          applyInteractionMetadata(note, {
            confidence: DEFAULT_INTERACTION_CONFIDENCE,
            source: DEFAULT_INTERACTION_SOURCE,
          });
          result.promoted++;
        }
        return result;
      },
      {
        render: true,
        undo: makeUndoConfig?.({
          label: "accept inference",
          shouldRecord: (res) => (res?.promoted ?? 0) > 0,
        }),
        status: (res) => {
          const promoted = res?.promoted ?? 0;
          const manual = res?.skippedManual ?? 0;
          const empty = res?.skippedEmpty ?? 0;
          const skippedParts = [];
          if (manual) skippedParts.push(`${manual} manual`);
          if (empty) skippedParts.push(`${empty} empty`);
          const skipped = skippedParts.length
            ? ` (left ${skippedParts.join(", ")} unchanged)`
            : "";
          return `Promoted ${promoted || "no"} inferred entr${
            promoted === 1 ? "y" : "ies"
          } to manual defaults.${skipped}`;
        },
      },
    );
  }

  function clearInferenceMetadata() {
    const { targets, allowed, reason } = collectSelectionTargets({
      model,
      selection,
      sel,
      getActiveView,
      viewDef,
      getInteractionsPair,
    });
    if (!allowed) {
      const status = reason || "Clearing inferred metadata only works in Interactions.";
      statusBar?.set?.(status);
      return { status };
    }
    if (!targets.length) {
      statusBar?.set?.(NO_TARGETS_STATUS);
      return { status: NO_TARGETS_STATUS };
    }
    return runModelMutation?.(
      "Clear inference metadata",
      () => {
        const notes = model?.notes || (model.notes = {});
        const result = {
          cleared: 0,
          removed: 0,
          skippedManual: 0,
          skippedEmpty: 0,
        };
        for (const target of targets) {
          const note = notes[target.key];
          if (!note || typeof note !== "object") {
            result.skippedEmpty++;
            continue;
          }
          const hadValue = hasStructuredValue(note, target.field);
          const info = describeInteractionInference(note);
          if (!info?.inferred) {
            result.skippedManual++;
            continue;
          }
          if (target.field === "outcome") {
            delete note.outcomeId;
            delete note.result;
          } else if (target.field === "end") {
            delete note.endActionId;
            delete note.endVariantSig;
            delete note.endFree;
          } else if (target.field === "tag") {
            const previous = Array.isArray(note.tags) ? note.tags.slice() : [];
            delete note.tags;
            if (previous.length) {
              emitInteractionTagChangeEvent(null, {
                reason: "clearInference",
                noteKey: target.key,
                pair: target.pair,
                phase: target.phase,
                tags: previous,
                count: previous.length,
              });
            }
          }
          applyInteractionMetadata(note, null);
          if (!hasStructuredValue(note, target.field)) {
            result.cleared++;
            if (!Object.keys(note).length) {
              delete notes[target.key];
              result.removed++;
            }
          } else if (!hadValue) {
            result.skippedEmpty++;
          }
        }
        return result;
      },
      {
        render: true,
        undo: makeUndoConfig?.({
          label: "clear inference metadata",
          shouldRecord: (res) => (res?.cleared ?? 0) > 0,
        }),
        status: (res) => {
          const cleared = res?.cleared ?? 0;
          const removed = res?.removed ?? 0;
          const manual = res?.skippedManual ?? 0;
          const empty = res?.skippedEmpty ?? 0;
          const skippedParts = [];
          if (manual) skippedParts.push(`${manual} manual`);
          if (empty) skippedParts.push(`${empty} empty`);
          const removedNote = removed ? ` Removed ${removed} empty entr${removed === 1 ? "y" : "ies"}.` : "";
          const skippedText = skippedParts.length
            ? ` (left ${skippedParts.join(", ")} unchanged)`
            : "";
          return `Cleared ${cleared || "no"} inferred entr${cleared === 1 ? "y" : "ies"}.${removedNote}${skippedText}`;
        },
      },
    );
  }

  return {
    toggleUncertain,
    acceptInferred,
    clearInferenceMetadata,
    summarizeSelectionInference,
    getDefaultUncertainty,
    setDefaultUncertainty,
  };
}
