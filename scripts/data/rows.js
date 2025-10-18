export function makeRow(model) {
  if (!model || typeof model.nextId !== "number") {
    throw new Error("model.nextId must be a number");
  }
  const row = { id: model.nextId++, name: "", color: "", color2: "", notes: "" };
  return row;
}

export function insertBlankRows(model, rows, index, count) {
  if (!Array.isArray(rows)) return [];
  const n = Number.isFinite(count) ? (count | 0) : 0;
  if (n <= 0) return [];
  const at = Number.isFinite(index) ? (index | 0) : 0;
  const clampedIndex = Math.max(0, Math.min(at, rows.length));
  const inserted = [];
  for (let i = 0; i < n; i++) inserted.push(makeRow(model));
  if (inserted.length) rows.splice(clampedIndex, 0, ...inserted);
  return inserted;
}
