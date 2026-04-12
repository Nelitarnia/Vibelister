import { MOD, SCHEMA_VERSION } from "../constants.js";
import { DEFAULT_VARIANT_CAPS } from "../variants/variant-settings.js";
import {
  enumerateModStates,
  MOD_STATE_BOOLEAN_TRUE_NAME,
  MOD_STATE_DEFAULT_VALUE,
  normalizeModStateValue,
} from "../mod-state.js";
import { createDefaultMeta } from "../../app/model-init.js";
import { normalizeCommentColorPalette } from "../comment-colors.js";
import { normalizeCommentsMap } from "../comments.js";
import { normalizeActionProperties } from "../properties.js";
import {
  DEFAULT_INTERACTION_CONFIDENCE,
  DEFAULT_INTERACTION_SOURCE,
  normalizeInteractionConfidence,
  normalizeInteractionSource,
} from "../../app/interactions.js";

const DEFAULT_MOD_RUNTIME = enumerateModStates(MOD);
const DEFAULT_MOD_TRUE_VALUE =
  DEFAULT_MOD_RUNTIME.states.find(
    (state) => state.name === MOD_STATE_BOOLEAN_TRUE_NAME,
  )?.value ?? MOD_STATE_DEFAULT_VALUE;
const DEFAULT_MOD_FALLBACK = DEFAULT_MOD_RUNTIME.defaultState.value;

function sanitizeModValue(raw) {
  return normalizeModStateValue(raw, {
    runtime: DEFAULT_MOD_RUNTIME,
    fallback: DEFAULT_MOD_FALLBACK,
    booleanTrueValue: DEFAULT_MOD_TRUE_VALUE,
  });
}

function normalizeProjectInfo(value) {
  if (value == null) return "";
  return String(value).replace(/\r\n?/g, "\n");
}

function clearBypassIndexArtifacts(target) {
  if (!target || typeof target !== "object") return;
  delete target.interactionsIndexBypass;
  delete target.interactionsIndexBypassScoped;
  delete target.interactionsIndexBypassCache;
  delete target.interactionsIndexBypassScopedCache;
  delete target.interactionsIndexCache;
  delete target.interactionsIndexScopedCache;
}

function stripDefaultInteractionMetadata(note) {
  if (!note || typeof note !== "object") return;
  const hasConfidence = Object.prototype.hasOwnProperty.call(
    note,
    "confidence",
  );
  const hasSource = Object.prototype.hasOwnProperty.call(note, "source");
  if (hasConfidence) {
    const conf = normalizeInteractionConfidence(note.confidence);
    if (conf !== DEFAULT_INTERACTION_CONFIDENCE) note.confidence = conf;
    else delete note.confidence;
  }
  if (hasSource) {
    const src = normalizeInteractionSource(note.source);
    if (src !== DEFAULT_INTERACTION_SOURCE) note.source = src;
    else delete note.source;
  }
}

function stripDefaultInteractionMetadataFromNotes(notes) {
  if (!notes || typeof notes !== "object") return;
  for (const note of Object.values(notes))
    stripDefaultInteractionMetadata(note);
}

function normalizeVariantCaps(raw) {
  const caps = raw && typeof raw === "object" ? raw : {};
  const fallback = DEFAULT_VARIANT_CAPS;
  const normalizeCap = (value, fallbackValue) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallbackValue;
    const asInt = Math.floor(n);
    return asInt > 0 ? asInt : fallbackValue;
  };
  return {
    variantCapPerAction: normalizeCap(
      caps.variantCapPerAction,
      fallback.variantCapPerAction,
    ),
    variantCapPerGroup: normalizeCap(
      caps.variantCapPerGroup,
      fallback.variantCapPerGroup,
    ),
  };
}

function normalizeList(values) {
  if (!Array.isArray(values) || !values.length) return undefined;
  const unique = Array.from(
    new Set(
      values
        .map((value) => {
          const str = String(value ?? "").trim();
          return str || null;
        })
        .filter(Boolean),
    ),
  );
  return unique.length ? unique : undefined;
}

export function migrateToSchemaV1(model) {
  clearBypassIndexArtifacts(model);
  const defaultMeta = createDefaultMeta();

  if (!model.meta) model.meta = createDefaultMeta();
  if (typeof model.meta.projectName !== "string") model.meta.projectName = "";
  model.meta.projectInfo = normalizeProjectInfo(model.meta.projectInfo);
  if (
    !("interactionsMode" in model.meta) ||
    (model.meta.interactionsMode !== "AI" &&
      model.meta.interactionsMode !== "AA")
  ) {
    model.meta.interactionsMode = "AI";
  }

  if (!model.meta.columnWidths || typeof model.meta.columnWidths !== "object") {
    model.meta.columnWidths = {};
  } else {
    const cleaned = {};
    for (const [key, value] of Object.entries(model.meta.columnWidths)) {
      const num = Number(value);
      if (Number.isFinite(num) && num > 0) cleaned[key] = num;
    }
    model.meta.columnWidths = cleaned;
  }

  if (
    !model.meta.commentFilter ||
    typeof model.meta.commentFilter !== "object"
  ) {
    model.meta.commentFilter = {};
  } else {
    const cf = model.meta.commentFilter;
    const normalized = {};
    if (typeof cf.viewKey === "string") {
      const trimmed = cf.viewKey.trim();
      if (trimmed) normalized.viewKey = trimmed;
    }
    const rows = normalizeList(cf.rowIds || cf.rows);
    if (rows) normalized.rowIds = rows;
    const columns = normalizeList(cf.columnKeys || cf.columns);
    if (columns) normalized.columnKeys = columns;
    const colors = normalizeList(
      cf.colorIds || cf.colors || cf.colorId || cf.color,
    );
    if (colors) normalized.colorIds = colors;
    if (!normalized.viewKey && defaultMeta.commentFilter?.viewKey) {
      normalized.viewKey = defaultMeta.commentFilter.viewKey;
    }
    model.meta.commentFilter = normalized;
  }

  model.meta.commentColors = normalizeCommentColorPalette(
    model.meta.commentColors,
  );
  model.meta.variantCaps = normalizeVariantCaps(model.meta.variantCaps);

  if (!Array.isArray(model.actions)) model.actions = [];
  if (!Array.isArray(model.inputs)) model.inputs = [];
  if (!Array.isArray(model.modifiers)) model.modifiers = [];
  if (!Array.isArray(model.outcomes)) model.outcomes = [];
  if (!Array.isArray(model.modifierGroups)) model.modifierGroups = [];
  if (!Array.isArray(model.modifierConstraints)) model.modifierConstraints = [];

  if (!model.notes || typeof model.notes !== "object") model.notes = {};
  stripDefaultInteractionMetadataFromNotes(model.notes);

  model.comments = normalizeCommentsMap(model.comments);

  if (!Array.isArray(model.interactionsPairs)) model.interactionsPairs = [];
  if (!model.interactionsIndex || typeof model.interactionsIndex !== "object") {
    model.interactionsIndex = { mode: "AI", groups: [] };
  } else {
    if (!Array.isArray(model.interactionsIndex.groups))
      model.interactionsIndex.groups = [];
    if (!model.interactionsIndex.mode) model.interactionsIndex.mode = "AI";
    const total = Number(model.interactionsIndex.totalRows);
    model.interactionsIndex.totalRows =
      Number.isFinite(total) && total >= 0 ? total : 0;
    if (!Array.isArray(model.interactionsIndex.actionsOrder))
      model.interactionsIndex.actionsOrder = [];
    if (!Array.isArray(model.interactionsIndex.inputsOrder))
      model.interactionsIndex.inputsOrder = [];
    if (
      !model.interactionsIndex.variantCatalog ||
      typeof model.interactionsIndex.variantCatalog !== "object"
    ) {
      model.interactionsIndex.variantCatalog = {};
    }
    if (!Array.isArray(model.interactionsIndex.propertiesCatalog)) {
      model.interactionsIndex.propertiesCatalog = [];
    } else {
      model.interactionsIndex.propertiesCatalog = normalizeActionProperties(
        model.interactionsIndex.propertiesCatalog,
      );
    }
  }

  let maxId = 0;
  for (const row of model.actions) {
    if (typeof row.id !== "number") row.id = ++maxId;
    else maxId = Math.max(maxId, row.id);
    if (!row.modSet || typeof row.modSet !== "object") row.modSet = {};
    for (const key in row.modSet)
      row.modSet[key] = sanitizeModValue(row.modSet[key]);
    const props = normalizeActionProperties(row.properties);
    if (props.length) row.properties = props;
    else delete row.properties;
  }

  for (const rows of [model.inputs, model.modifiers, model.outcomes]) {
    for (const row of rows) {
      if (typeof row.id !== "number") row.id = ++maxId;
      else maxId = Math.max(maxId, row.id);
    }
  }

  if (!Number.isFinite(model.nextId)) model.nextId = maxId + 1;
  else model.nextId = Math.max(model.nextId, maxId + 1);

  model.meta.schema = SCHEMA_VERSION;
}
