import {
  applyInteractionMetadata,
  describeInteractionInference,
} from "./interactions.js";
import { emitInteractionTagChangeEvent } from "./tag-events.js";

const CLEARABLE_FIELDS = Object.freeze(["outcome", "end", "tag"]);

function hasStructuredValue(note, field) {
  if (!note || typeof note !== "object") return false;
  if (field === "outcome") return "outcomeId" in note;
  if (field === "end") return "endActionId" in note || "endVariantSig" in note;
  if (field === "tag") return Array.isArray(note.tags) && note.tags.length > 0;
  return false;
}

function clearFieldFromNote(note, field) {
  if (!note || typeof note !== "object") return false;
  if (field === "outcome") {
    const hadValue = "outcomeId" in note;
    delete note.outcomeId;
    return hadValue;
  }
  if (field === "end") {
    const hadValue = "endActionId" in note || "endVariantSig" in note;
    delete note.endActionId;
    delete note.endVariantSig;
    return hadValue;
  }
  if (field === "tag") {
    const hadValue = Array.isArray(note.tags) && note.tags.length > 0;
    delete note.tags;
    return hadValue;
  }
  return false;
}

export function groupTargetsByNote(targets = [], notes = {}) {
  const groupedTargets = new Map();
  for (const target of targets) {
    if (!target?.key) continue;
    let entry = groupedTargets.get(target.key);
    if (!entry) {
      entry = {
        noteKey: target.key,
        note: notes?.[target.key],
        pair: target.pair,
        phase: target.phase,
        targets: [],
      };
      groupedTargets.set(target.key, entry);
    }
    entry.targets.push(target);
  }
  return groupedTargets;
}

/**
 * Canonical inference clear behavior: clearing an inferred selection is phase-level by
 * default. If any clearable field is targeted in a phase, all Outcome/End/Tag values in
 * that phase are removed and metadata is reset. `mode: "strict"` exists for callers that
 * need selected-field-only behavior.
 */
export function clearInferredTargets({
  notes,
  targets,
  mode = "phase",
  onFieldCleared,
}) {
  const groupedTargets = groupTargetsByNote(targets, notes);
  const result = {
    cleared: 0,
    clearedFields: 0,
    removed: 0,
    skippedManual: 0,
    skippedEmpty: 0,
  };

  for (const group of groupedTargets.values()) {
    const noteTargets = group.targets;
    const note = notes?.[group.noteKey];
    if (!note || typeof note !== "object") {
      result.skippedEmpty += noteTargets.length;
      continue;
    }

    const info = describeInteractionInference(note);
    if (!info?.inferred) {
      result.skippedManual += noteTargets.length;
      continue;
    }

    const requested = new Set(
      noteTargets
        .map((target) => target?.field)
        .filter((field) => CLEARABLE_FIELDS.includes(field)),
    );
    if (!requested.size) {
      result.skippedEmpty += noteTargets.length;
      continue;
    }

    const fieldsToClear =
      mode === "strict" ? [...requested] : [...CLEARABLE_FIELDS];

    let clearedFieldCount = 0;
    for (const field of fieldsToClear) {
      const previousValue =
        field === "tag"
          ? Array.isArray(note.tags)
            ? note.tags.slice()
            : []
          : field === "outcome"
            ? (note.outcomeId ?? null)
            : field === "end"
              ? (note.endActionId ?? note.endVariantSig ?? null)
              : null;
      const hadValue = hasStructuredValue(note, field);
      if (!hadValue) continue;
      if (field === "tag") {
        const previousTags = Array.isArray(note.tags) ? note.tags.slice() : [];
        if (clearFieldFromNote(note, field) && previousTags.length) {
          emitInteractionTagChangeEvent(null, {
            reason: "clearInference",
            noteKey: group.noteKey,
            pair: group.pair,
            phase: group.phase,
            tags: previousTags,
            count: previousTags.length,
          });
        }
      } else {
        clearFieldFromNote(note, field);
      }
      clearedFieldCount++;
      if (typeof onFieldCleared === "function") {
        onFieldCleared({
          note,
          noteKey: group.noteKey,
          pair: group.pair,
          phase: group.phase,
          field,
          previousValue,
          nextValue:
            field === "tag"
              ? []
              : field === "outcome" || field === "end"
                ? null
                : "",
        });
      }
    }

    if (!clearedFieldCount) {
      result.skippedEmpty += noteTargets.length;
      continue;
    }

    result.cleared += 1;
    result.clearedFields += clearedFieldCount;
    applyInteractionMetadata(note, null);
    if (!Object.keys(note).length) {
      delete notes[group.noteKey];
      result.removed++;
    }
  }

  return result;
}
