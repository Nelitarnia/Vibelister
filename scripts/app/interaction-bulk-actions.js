import {
  DEFAULT_INTERACTION_CONFIDENCE,
  DEFAULT_INTERACTION_SOURCE,
  applyInteractionMetadata,
  clearInteractionsCell,
  describeInteractionInference,
  noteKeyForPair,
  setInteractionsCell,
  isInteractionPhaseColumnActiveForRow,
} from "./interactions.js";
import { parsePhaseKey } from "../data/utils.js";
import { findOutcomeIdByName } from "./outcomes.js";
import { emitInteractionTagChangeEvent } from "./tag-events.js";

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
    return { targets: [], allowed: false };
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

  function toggleUncertain() {
    const outcomeId = findOutcomeIdByName(model, "Uncertain");
    if (outcomeId == null) {
      statusBar?.set?.("Add an \"Uncertain\" outcome to use this toggle.");
      return null;
    }
    const { targets, allowed, viewDef: vd } = collectSelectionTargets({
      model,
      selection,
      sel,
      getActiveView,
      viewDef,
      getInteractionsPair,
      filterField: "outcome",
    });
    if (!allowed) {
      statusBar?.set?.("Uncertain toggle only applies in the Interactions view.");
      return null;
    }

    return runModelMutation?.(
      "Toggle Uncertain",
      () => {
        const result = { applied: 0, cleared: 0, skipped: 0 };
        for (const target of targets) {
          const active = isInteractionPhaseColumnActiveForRow(
            model,
            vd,
            target.row,
            target.col,
            target.column,
          );
          if (!active) {
            result.skipped++;
            continue;
          }
          const note = model?.notes?.[target.key];
          const isAlreadyUncertain =
            note &&
            typeof note === "object" &&
            note.outcomeId === outcomeId &&
            !("result" in note);
          const changed = isAlreadyUncertain
            ? clearInteractionsCell(model, vd, target.row, target.col)
            : setInteractionsCell(model, null, vd, target.row, target.col, {
                outcomeId,
                confidence: DEFAULT_INTERACTION_CONFIDENCE,
                source: DEFAULT_INTERACTION_SOURCE,
              });
          if (changed) {
            if (isAlreadyUncertain) result.cleared++;
            else result.applied++;
          }
        }
        return result;
      },
      {
        render: true,
        undo: makeUndoConfig?.({
          label: "toggle uncertain",
          shouldRecord: (res) => (res?.applied ?? 0) + (res?.cleared ?? 0) > 0,
        }),
        status: (res) => {
          const applied = res?.applied ?? 0;
          const cleared = res?.cleared ?? 0;
          const skipped = res?.skipped ?? 0;
          const parts = [];
          if (applied) parts.push(`${applied} set`);
          if (cleared) parts.push(`${cleared} cleared`);
          if (!parts.length) parts.push("No changes");
          const skippedText = skipped ? ` (skipped ${skipped} inactive cells)` : "";
          return `Uncertain toggle: ${parts.join(",")}${skippedText}.`;
        },
      },
    );
  }

  function acceptInferred() {
    const { targets, allowed } = collectSelectionTargets({
      model,
      selection,
      sel,
      getActiveView,
      viewDef,
      getInteractionsPair,
    });
    if (!allowed) {
      statusBar?.set?.("Accepting inferred values only works in Interactions.");
      return null;
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
    const { targets, allowed } = collectSelectionTargets({
      model,
      selection,
      sel,
      getActiveView,
      viewDef,
      getInteractionsPair,
    });
    if (!allowed) {
      statusBar?.set?.("Clearing inferred metadata only works in Interactions.");
      return null;
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

  return { toggleUncertain, acceptInferred, clearInferenceMetadata };
}
