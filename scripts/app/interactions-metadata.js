export const DEFAULT_INTERACTION_CONFIDENCE = 1;
export const DEFAULT_INTERACTION_SOURCE = "manual";

export function normalizeInteractionConfidence(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_INTERACTION_CONFIDENCE;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return num;
}

export function normalizeInteractionSource(value) {
  if (typeof value !== "string") return DEFAULT_INTERACTION_SOURCE;
  const trimmed = value.trim();
  return trimmed || DEFAULT_INTERACTION_SOURCE;
}

export function readInteractionMetadata(note) {
  const hasConfidence = note && typeof note === "object" && "confidence" in note;
  const hasSource = note && typeof note === "object" && "source" in note;
  const sourceMetadata =
    note && typeof note === "object" && typeof note.sourceMetadata === "object"
      ? note.sourceMetadata
      : null;
  const confidence = normalizeInteractionConfidence(
    note && typeof note === "object" ? note.confidence : undefined,
  );
  const source = normalizeInteractionSource(
    note && typeof note === "object" ? note.source : undefined,
  );
  const inferred =
    (hasConfidence || hasSource) &&
    (confidence !== DEFAULT_INTERACTION_CONFIDENCE || source !== DEFAULT_INTERACTION_SOURCE);
  return { confidence, source, inferred, sourceMetadata };
}

export function applyInteractionMetadata(note, metadata) {
  if (!note || typeof note !== "object") return;
  const nextConfidence = metadata
    ? normalizeInteractionConfidence(metadata.confidence)
    : DEFAULT_INTERACTION_CONFIDENCE;
  const nextSource = metadata
    ? normalizeInteractionSource(metadata.source)
    : DEFAULT_INTERACTION_SOURCE;
  const hasSourceMetadataField =
    !metadata || Object.prototype.hasOwnProperty.call(metadata, "sourceMetadata");
  const nextSourceMetadata =
    metadata && typeof metadata.sourceMetadata === "object" ? metadata.sourceMetadata : null;
  if (nextConfidence !== DEFAULT_INTERACTION_CONFIDENCE) {
    note.confidence = nextConfidence;
  } else if ("confidence" in note) {
    delete note.confidence;
  }
  if (nextSource !== DEFAULT_INTERACTION_SOURCE) {
    note.source = nextSource;
  } else if ("source" in note) {
    delete note.source;
  }
  if (hasSourceMetadataField) {
    if (nextSourceMetadata && Object.keys(nextSourceMetadata).length) {
      note.sourceMetadata = nextSourceMetadata;
    } else if ("sourceMetadata" in note) {
      delete note.sourceMetadata;
    }
  }
}

export function extractInteractionMetadata(value) {
  if (!value || typeof value !== "object") return null;
  const hasConfidence = Object.prototype.hasOwnProperty.call(value, "confidence");
  const hasSource = Object.prototype.hasOwnProperty.call(value, "source");
  const hasSourceMetadata = Object.prototype.hasOwnProperty.call(value, "sourceMetadata");
  if (!hasConfidence && !hasSource && !hasSourceMetadata) return null;
  return {
    confidence: hasConfidence
      ? normalizeInteractionConfidence(value.confidence)
      : DEFAULT_INTERACTION_CONFIDENCE,
    source: hasSource ? normalizeInteractionSource(value.source) : DEFAULT_INTERACTION_SOURCE,
    sourceMetadata:
      hasSourceMetadata && typeof value.sourceMetadata === "object"
        ? value.sourceMetadata
        : undefined,
  };
}
