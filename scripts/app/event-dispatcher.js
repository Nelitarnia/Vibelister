export function dispatchAppEvent(eventName, detail = null, options = {}) {
  if (!eventName) return null;
  if (typeof document === "undefined" || !document?.dispatchEvent) return null;

  const eventOptions = { ...(options ?? {}), detail: detail ?? null };

  let eventObject = null;
  if (typeof CustomEvent === "function") {
    try {
      eventObject = new CustomEvent(eventName, eventOptions);
    } catch (_error) {
      eventObject = null;
    }
  }

  if (!eventObject) {
    eventObject = { type: eventName, ...eventOptions };
  }

  try {
    document.dispatchEvent(eventObject);
    return eventObject;
  } catch (_error) {
    return null;
  }
}
