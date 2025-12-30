// properties.js — Helpers for normalizing and formatting action properties

function expandPropertyCandidates(value) {
  if (Array.isArray(value)) return value.flatMap((v) => expandPropertyCandidates(v));
  if (value && typeof value === "object") {
    if ("properties" in value) return expandPropertyCandidates(value.properties);
  }
  if (value == null) return [];
  const text = typeof value === "string" ? value : String(value);
  return text
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function normalizeActionProperties(value) {
  const seen = new Set();
  const out = [];
  for (const prop of expandPropertyCandidates(value)) {
    const key = prop.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(prop);
  }
  return out;
}

export function formatActionProperties(value) {
  const props = Array.isArray(value) ? value : normalizeActionProperties(value);
  if (!props.length) return "";
  return props.join(", ");
}

export function normalizePropertyKeys(value) {
  return normalizeActionProperties(value).map((prop) => prop.toLowerCase());
}

export function setActionProperties(target, value) {
  if (!target || typeof target !== "object") return;
  const props = normalizeActionProperties(value);
  if (props.length) target.properties = props;
  else delete target.properties;
}
