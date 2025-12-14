// comment-events.js — shared dispatcher for comment store updates

import { dispatchAppEvent } from "./event-dispatcher.js";

export function emitCommentChangeEvent(change, context = {}) {
  if (!change && !context?.force) return;
  const viewKey =
    context?.viewKey ?? context?.vd?.key ?? change?.viewKey ?? null;
  const detail = {
    change: change ?? null,
    viewKey,
    rowIdentity: context?.rowIdentity ?? null,
    column: context?.column ?? null,
  };

  dispatchAppEvent("vibelister:comments-updated", detail);
}
