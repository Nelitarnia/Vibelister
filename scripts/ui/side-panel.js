export function createSidePanelHost(options = {}) {
  const { container, titleElement, closeButton, defaultTitle } = options || {};
  if (!container) return null;

  const titleEl = titleElement || null;
  const closeBtn = closeButton || null;
  let isOpen = container.dataset.open === "true";
  let activeId = container.dataset.activePane || null;
  const panes = new Map();
  const toggles = new Map();
  const fallbackTitle =
    typeof defaultTitle === "string" && defaultTitle.trim()
      ? defaultTitle.trim()
      : titleEl && typeof titleEl.textContent === "string"
        ? titleEl.textContent.trim()
        : "";
  let currentTitle = fallbackTitle;

  function setContainerOpen(open) {
    isOpen = !!open;
    container.dataset.open = isOpen ? "true" : "false";
    container.setAttribute("aria-hidden", isOpen ? "false" : "true");
    if (!isOpen) {
      container.removeAttribute("data-active-pane");
    }
  }

  function setTitle(value) {
    const text = typeof value === "string" ? value.trim() : "";
    currentTitle = text || fallbackTitle;
    if (titleEl) {
      titleEl.textContent = currentTitle;
    }
  }

  function updateToggleStates() {
    for (const { button, paneId } of toggles.values()) {
      if (!button) continue;
      const expanded = isOpen && activeId === paneId;
      button.setAttribute("aria-expanded", expanded ? "true" : "false");
    }
  }

  function hidePane(entry) {
    if (!entry) return;
    if (entry.element) {
      entry.element.hidden = true;
      if (entry.element.dataset.active) delete entry.element.dataset.active;
    }
    entry.onHide?.();
  }

  function showPane(entry, options = {}) {
    if (!entry) return false;
    if (entry.element) {
      entry.element.hidden = false;
      entry.element.dataset.active = "true";
    }
    const desiredTitle =
      typeof options.title === "string"
        ? options.title
        : entry.title || fallbackTitle;
    setTitle(desiredTitle);
    entry.onShow?.(options);
    return true;
  }

  function closeActivePane() {
    if (!activeId) return;
    const entry = panes.get(activeId);
    hidePane(entry);
    activeId = null;
    setContainerOpen(false);
    setTitle(fallbackTitle);
    updateToggleStates();
  }

  function openPane(paneId, options = {}) {
    if (!paneId) return false;
    const id = String(paneId);
    const entry = panes.get(id);
    if (!entry) return false;

    if (activeId && activeId !== id) {
      hidePane(panes.get(activeId));
    }

    const changed = activeId !== id || !isOpen;
    activeId = id;
    container.dataset.activePane = id;
    setContainerOpen(true);
    const opened = showPane(entry, options);
    updateToggleStates();
    return changed && opened;
  }

  function closePane(paneId) {
    if (!paneId) {
      closeActivePane();
      return true;
    }
    const id = String(paneId);
    if (!activeId || activeId !== id) {
      // If the target pane is inactive, nothing to close.
      return false;
    }
    closeActivePane();
    return true;
  }

  function togglePane(paneId, options = {}) {
    if (isOpen && activeId && activeId === paneId) {
      closePane(paneId);
      return false;
    }
    return openPane(paneId, options);
  }

  function registerPane(config = {}) {
    const { id, element, title, onShow, onHide } = config || {};
    if (!id) return null;
    const paneId = String(id);
    const entry = {
      id: paneId,
      element: element || null,
      title: typeof title === "string" ? title : "",
      onShow: typeof onShow === "function" ? onShow : null,
      onHide: typeof onHide === "function" ? onHide : null,
    };
    panes.set(paneId, entry);

    if (entry.element) {
      entry.element.dataset.pane = paneId;
      if (!(isOpen && activeId === paneId)) {
        entry.element.hidden = true;
      } else {
        entry.element.hidden = false;
        entry.element.dataset.active = "true";
      }
    }

    return {
      id: paneId,
      open: (opts = {}) => openPane(paneId, opts),
      close: () => closePane(paneId),
      toggle: (opts = {}) => togglePane(paneId, opts),
      isOpen: () => isOpen && activeId === paneId,
      isActive: () => isOpen && activeId === paneId,
      setTitle: (value) => {
        if (entry) entry.title = typeof value === "string" ? value : entry.title;
        if (isOpen && activeId === paneId) setTitle(entry.title);
      },
    };
  }

  function attachToggle(button, paneId) {
    if (!button || !paneId) return null;
    const handler = () => togglePane(paneId);
    toggles.set(button, { button, paneId, handler });
    button.addEventListener("click", handler);
    if (container.id) {
      button.setAttribute("aria-controls", container.id);
    }
    const expanded = isOpen && activeId === paneId;
    button.setAttribute("aria-expanded", expanded ? "true" : "false");
    return () => {
      const stored = toggles.get(button);
      if (stored) {
        button.removeEventListener("click", stored.handler);
        toggles.delete(button);
      } else {
        button.removeEventListener("click", handler);
      }
    };
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      closePane(activeId);
    });
  }

  setContainerOpen(isOpen && !!activeId);
  if (!isOpen || !activeId) {
    setTitle(fallbackTitle);
  }
  updateToggleStates();

  return {
    registerPane,
    attachToggle,
    openPane,
    closePane,
    close: () => closePane(activeId),
    togglePane,
    setTitle,
    getTitle: () => currentTitle,
    isOpen: () => isOpen,
    getActivePane: () => (isOpen ? activeId : null),
  };
}
