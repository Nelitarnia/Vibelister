import { dispatchAppEvent } from "./event-dispatcher.js";

export const INTERACTION_TAGS_EVENT = "vibelister:interaction-tags-updated";

export function emitInteractionTagChangeEvent(change, context = {}) {
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

  dispatchAppEvent(INTERACTION_TAGS_EVENT, detail);
}
