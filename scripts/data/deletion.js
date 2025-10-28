// deletion.js — data-level helpers for removing modifier references after row deletion

export function sanitizeModifierRulesAfterDeletion(model, deletedIds) {
  if (!model || !Array.isArray(deletedIds) || !deletedIds.length) return;
  const del = new Set(deletedIds);

  if (Array.isArray(model.modifierGroups)) {
    const idKeys = ["ids", "members", "memberIds"];

    model.modifierGroups = model.modifierGroups
      .map((group) => {
        const next = { ...group };
        let longest = 0;
        let foundArray = false;

        for (const key of idKeys) {
          if (!Array.isArray(group[key])) continue;
          foundArray = true;
          const filtered = group[key].filter((id) => !del.has(id));
          next[key] = filtered;
          if (filtered.length > longest) longest = filtered.length;
        }

        return { group: next, longest, foundArray };
      })
      .filter(({ longest, foundArray }) => !foundArray || longest > 0)
      .map(({ group }) => group);
  }

  if (Array.isArray(model.modifierConstraints)) {
    model.modifierConstraints = model.modifierConstraints
      .map((constraint) => {
        const next = { ...constraint };
        for (const key of Object.keys(next)) {
          const value = next[key];
          if (Array.isArray(value)) {
            next[key] = value.filter(
              (item) => typeof item !== "number" || !del.has(item),
            );
          } else if (typeof value === "number" && del.has(value)) {
            next[key] = null;
          } else if (value && typeof value === "object") {
            const obj = { ...value };
            for (const innerKey of Object.keys(obj)) {
              const innerValue = obj[innerKey];
              if (typeof innerValue === "number" && del.has(innerValue)) {
                obj[innerKey] = null;
              } else if (Array.isArray(innerValue)) {
                obj[innerKey] = innerValue.filter(
                  (item) => typeof item !== "number" || !del.has(item),
                );
              }
            }
            next[key] = obj;
          }
        }
        return next;
      })
      .filter((constraint) => {
        const a = constraint.aId ?? constraint.a ?? constraint.left ?? null;
        const b = constraint.bId ?? constraint.b ?? constraint.right ?? null;
        if (typeof a === "number" && typeof b === "number" && a !== b)
          return true;
        for (const key of Object.keys(constraint)) {
          const value = constraint[key];
          if (
            Array.isArray(value) &&
            value.filter((item) => typeof item === "number").length >= 2
          )
            return true;
        }
        return false;
      });
  }
}
