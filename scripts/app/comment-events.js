// comment-events.js — shared dispatcher for comment store updates

export function emitCommentChangeEvent(change, context = {}) {
  if (!change && !context?.force) return;
  if (typeof document === "undefined" || !document?.dispatchEvent) return;
  const viewKey =
    context?.viewKey ?? context?.vd?.key ?? change?.viewKey ?? null;
  const detail = {
    change: change ?? null,
    viewKey,
    rowIdentity: context?.rowIdentity ?? null,
    column: context?.column ?? null,
  };
  try {
    document.dispatchEvent(
      new CustomEvent("vibelister:comments-updated", { detail }),
    );
  } catch (_error) {
    /* silently ignore dispatch failures */
  }
}
