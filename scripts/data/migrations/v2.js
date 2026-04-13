function buildNameLookup(rows) {
  const lookup = new Map();
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    if (!row || !Number.isFinite(row.id)) continue;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;
    const key = name.toLowerCase();
    const bucket = lookup.get(key) || [];
    bucket.push(row.id);
    lookup.set(key, bucket);
  }
  return lookup;
}

function resolveUniqueIdByName(lookup, text) {
  if (!(lookup instanceof Map)) return null;
  const key = String(text || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  const ids = lookup.get(key);
  if (!Array.isArray(ids) || ids.length !== 1) return null;
  const id = Number(ids[0]);
  return Number.isFinite(id) ? id : null;
}

export function migrateToSchemaV2(model) {
  const notes = model?.notes;
  if (!notes || typeof notes !== "object") return;
  const outcomeByName = buildNameLookup(model?.outcomes);
  const actionByName = buildNameLookup(model?.actions);

  for (const note of Object.values(notes)) {
    if (!note || typeof note !== "object") continue;

    if (!Number.isFinite(note.outcomeId) && typeof note.result === "string") {
      const resolvedOutcomeId = resolveUniqueIdByName(outcomeByName, note.result);
      if (Number.isFinite(resolvedOutcomeId)) note.outcomeId = resolvedOutcomeId;
    }
    delete note.result;

    if (
      !Number.isFinite(note.endActionId) &&
      typeof note.endFree === "string"
    ) {
      const resolvedActionId = resolveUniqueIdByName(actionByName, note.endFree);
      if (Number.isFinite(resolvedActionId)) {
        note.endActionId = resolvedActionId;
        if (typeof note.endVariantSig !== "string") note.endVariantSig = "";
      }
    }
    delete note.endFree;
  }
}
