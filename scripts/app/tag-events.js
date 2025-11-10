export const INTERACTION_TAGS_EVENT = "vibelister:interaction-tags-updated";

export function emitInteractionTagChangeEvent(change, context = {}) {
  if (typeof document === "undefined" || !document?.dispatchEvent) return;

  const detail = {
    change: change ?? null,
    reason: context?.reason ?? null,
    noteKey: context?.noteKey ?? null,
    phase: context?.phase ?? null,
    pair: context?.pair ?? null,
    tag: context?.tag ?? null,
    newTag: context?.newTag ?? null,
    tags: context?.tags ?? null,
    count: context?.count ?? null,
    force: context?.force ?? false,
  };

  let eventObject = null;
  if (typeof CustomEvent === "function") {
    try {
      eventObject = new CustomEvent(INTERACTION_TAGS_EVENT, { detail });
    } catch (_error) {
      eventObject = null;
    }
  }
  if (!eventObject) {
    eventObject = { type: INTERACTION_TAGS_EVENT, detail };
  }

  try {
    document.dispatchEvent(eventObject);
  } catch (_error) {
    /* ignore dispatch errors */
  }
}
