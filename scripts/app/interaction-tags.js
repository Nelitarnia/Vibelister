import { normalizeInteractionTags } from "./interactions.js";
import { emitInteractionTagChangeEvent } from "./tag-events.js";

function normalizeTagName(value) {
  if (value == null) return "";
  const text = typeof value === "string" ? value : String(value);
  return text.trim();
}

function cleanupNoteIfEmpty(notes, noteKey, note) {
  if (!note || typeof note !== "object") return;
  if (Object.keys(note).length === 0) {
    delete notes[noteKey];
  }
}

function renameTagsInModel(model, sourceTag, targetTag) {
  const notes = model?.notes;
  const result = {
    type: "rename",
    from: sourceTag,
    to: targetTag,
    notesUpdated: 0,
    replacements: 0,
  };
  if (!notes || typeof notes !== "object") {
    return result;
  }
  const sourceKey = sourceTag.toLowerCase();

  for (const [noteKey, rawNote] of Object.entries(notes)) {
    if (!rawNote || typeof rawNote !== "object") continue;
    const tags = normalizeInteractionTags(rawNote.tags);
    if (!Array.isArray(tags) || tags.length === 0) {
      if (Object.prototype.hasOwnProperty.call(rawNote, "tags")) {
        delete rawNote.tags;
        cleanupNoteIfEmpty(notes, noteKey, rawNote);
      }
      continue;
    }
    let replacedHere = 0;
    const updated = [];
    for (const tag of tags) {
      const normalized = normalizeTagName(tag);
      if (normalized && normalized.toLowerCase() === sourceKey) {
        updated.push(targetTag);
        replacedHere += 1;
      } else if (normalized) {
        updated.push(tag);
      }
    }
    if (!replacedHere) continue;
    const cleaned = normalizeInteractionTags(updated);
    if (cleaned.length) {
      rawNote.tags = cleaned;
    } else {
      delete rawNote.tags;
      cleanupNoteIfEmpty(notes, noteKey, rawNote);
    }
    result.notesUpdated += 1;
    result.replacements += replacedHere;
  }

  return result;
}

function deleteTagsInModel(model, targetTag) {
  const notes = model?.notes;
  const result = {
    type: "delete",
    tag: targetTag,
    notesUpdated: 0,
    removals: 0,
  };
  if (!notes || typeof notes !== "object") {
    return result;
  }
  const targetKey = targetTag.toLowerCase();

  for (const [noteKey, rawNote] of Object.entries(notes)) {
    if (!rawNote || typeof rawNote !== "object") continue;
    const tags = normalizeInteractionTags(rawNote.tags);
    if (!Array.isArray(tags) || tags.length === 0) {
      if (Object.prototype.hasOwnProperty.call(rawNote, "tags")) {
        delete rawNote.tags;
        cleanupNoteIfEmpty(notes, noteKey, rawNote);
      }
      continue;
    }
    const kept = [];
    let removedHere = 0;
    for (const tag of tags) {
      const normalized = normalizeTagName(tag);
      if (normalized && normalized.toLowerCase() === targetKey) {
        removedHere += 1;
      } else if (normalized) {
        kept.push(tag);
      }
    }
    if (!removedHere) continue;
    const cleaned = normalizeInteractionTags(kept);
    if (cleaned.length) {
      rawNote.tags = cleaned;
    } else {
      delete rawNote.tags;
      cleanupNoteIfEmpty(notes, noteKey, rawNote);
    }
    result.notesUpdated += 1;
    result.removals += removedHere;
  }

  return result;
}

function formatCount(value, singular, plural) {
  if (value === 1) return `${value} ${singular}`;
  return `${value} ${plural}`;
}

export function createInteractionTagManager(options = {}) {
  const { model, runModelMutation, makeUndoConfig, statusBar } = options || {};

  function renameTag(oldName, newName) {
    const from = normalizeTagName(oldName);
    const to = normalizeTagName(newName);
    if (!from || !to) {
      statusBar?.set?.("Tag names cannot be empty.");
      return null;
    }
    if (from.toLowerCase() === to.toLowerCase()) {
      statusBar?.set?.("Tag name is unchanged.");
      return null;
    }

    const mutate = () => renameTagsInModel(model, from, to);
    const handleResult = (res) => {
      if (!res || res.type !== "rename") {
        statusBar?.set?.(`No tags named “${from}” found.`);
        return;
      }
      if ((res.replacements ?? 0) > 0) {
        const noteText = formatCount(res.notesUpdated ?? 0, "note", "notes");
        const tagText = formatCount(res.replacements ?? 0, "tag", "tags");
        statusBar?.set?.(`Renamed ${tagText} across ${noteText}.`);
        emitInteractionTagChangeEvent(res, {
          reason: "rename",
          tag: from,
          newTag: to,
          count: res.replacements ?? 0,
        });
      } else {
        statusBar?.set?.(`No tags named “${from}” found.`);
      }
    };

    if (typeof runModelMutation !== "function") {
      const result = mutate();
      handleResult(result);
      return result;
    }

    return runModelMutation("renameInteractionTag", mutate, {
      render: true,
      undo: makeUndoConfig?.({
        label: (res) => {
          const target = res?.from || from;
          return target ? `rename ${target}` : "rename tag";
        },
        shouldRecord: (res) => (res?.replacements ?? 0) > 0,
        includeLocation: false,
        includeColumn: false,
      }),
      after: handleResult,
    });
  }

  function deleteTag(tagName) {
    const target = normalizeTagName(tagName);
    if (!target) {
      statusBar?.set?.("Tag name cannot be empty.");
      return null;
    }

    const mutate = () => deleteTagsInModel(model, target);
    const handleResult = (res) => {
      if (!res || res.type !== "delete") {
        statusBar?.set?.(`No tags named “${target}” found.`);
        return;
      }
      if ((res.removals ?? 0) > 0) {
        const noteText = formatCount(res.notesUpdated ?? 0, "note", "notes");
        const tagText = formatCount(res.removals ?? 0, "tag", "tags");
        statusBar?.set?.(`Deleted ${tagText} from ${noteText}.`);
        emitInteractionTagChangeEvent(res, {
          reason: "delete",
          tag: target,
          count: res.removals ?? 0,
        });
      } else {
        statusBar?.set?.(`No tags named “${target}” found.`);
      }
    };

    if (typeof runModelMutation !== "function") {
      const result = mutate();
      handleResult(result);
      return result;
    }

    return runModelMutation("deleteInteractionTag", mutate, {
      render: true,
      undo: makeUndoConfig?.({
        label: (res) => {
          const tag = res?.tag || target;
          return tag ? `delete ${tag}` : "delete tag";
        },
        shouldRecord: (res) => (res?.removals ?? 0) > 0,
        includeLocation: false,
        includeColumn: false,
      }),
      after: handleResult,
    });
  }

  return {
    renameTag,
    deleteTag,
  };
}
