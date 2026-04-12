import { normalizeActionProperties } from "../data/properties.js";

export function parseEndActionQuery(raw) {
  const s = String(raw || "").trim();
  if (!s) return { name: "", mods: [], properties: [] };
  const tokens = s.split(/\s+/);
  const mods = [];
  const properties = [];
  const nameParts = [];
  for (let t of tokens) {
    if (!t) continue;
    const lower = t.toLowerCase();
    if (t.startsWith("#") && t.length > 1) {
      properties.push(lower.slice(1));
      continue;
    }
    if (t.startsWith("+") && t.length > 1) {
      const body = lower.slice(1);
      if (body.startsWith("prop:") || body.startsWith("property:") || body.startsWith("p:")) {
        properties.push(body.replace(/^(prop|property|p):/, ""));
      } else {
        mods.push(body);
      }
      continue;
    }
    nameParts.push(lower);
  }
  return { name: nameParts.join(" "), mods, properties };
}

export function matchesEndActionFilters({
  actionName,
  actionProperties,
  nameQuery,
  modTokens,
  propertyTokens,
  variantModNames,
}) {
  const lowerName = String(actionName || "").toLowerCase();
  if (nameQuery && !lowerName.startsWith(nameQuery)) return false;
  const normalizedProperties = normalizeActionProperties(actionProperties).map((p) =>
    p.toLowerCase(),
  );
  if (
    propertyTokens &&
    propertyTokens.length &&
    !propertyTokens.every((tok) => normalizedProperties.some((prop) => prop.includes(tok)))
  )
    return false;
  if (modTokens && modTokens.length) {
    const lowerMods = (variantModNames || []).map((m) => m.toLowerCase());
    if (!modTokens.every((tok) => lowerMods.some((nm) => nm.includes(tok)))) return false;
  }
  return true;
}

export function normalizeCellTextToQuery(s, model = null) {
  const txt = String(s || "").trim();
  if (!txt) return "";

  const actionNames = new Set();
  if (model && Array.isArray(model.actions)) {
    for (const row of model.actions) {
      const nm = String(row?.name || "").trim();
      if (nm) actionNames.add(nm);
    }
  }
  if (actionNames.has(txt)) return txt;

  let action = txt;
  let modsPart = "";

  const dashIdx = txt.lastIndexOf("—");
  if (dashIdx > -1 && dashIdx < txt.length - 1) {
    action = txt.slice(0, dashIdx).trim();
    modsPart = txt.slice(dashIdx + 1).trim();
  } else if (txt.endsWith(")")) {
    const end = txt.length - 1;
    let depth = 0;
    let start = -1;
    for (let i = end; i >= 0; i--) {
      const ch = txt[i];
      if (ch === ")") {
        depth++;
      } else if (ch === "(") {
        depth--;
        if (depth === 0) {
          start = i;
          break;
        }
      }
    }
    if (start >= 0 && start < end && depth === 0) {
      const before = txt.slice(0, start).trim();
      const candidate = txt.slice(start + 1, end).trim();
      if (before && candidate) {
        action = before;
        modsPart = candidate;
      }
    }
  }
  let query = action;
  if (modsPart) {
    const parts = modsPart
      .split(/[+,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (parts.length) query += " " + parts.map((p) => "+" + p).join(" ");
  }
  return query;
}
