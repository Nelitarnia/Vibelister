const DEFAULT_HISTORY_LIMIT = 50;
const DISPLAY_CHAR_LIMIT = 140;

const NBSP = "\u00a0";

function pad2(v) {
  return v < 10 ? `0${v}` : `${v}`;
}

function formatTimestamp(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function formatDisplayText(text) {
  if (!text) return "";
  if (text.length <= DISPLAY_CHAR_LIMIT) return text;
  return `${text.slice(0, DISPLAY_CHAR_LIMIT - 1).trimEnd()}…`;
}

function normalizeDisplayValue(text) {
  return text && text.trim() ? text : NBSP;
}

export function initStatusBar(element, opts = {}) {
  if (!element) return null;

  const limit = Math.max(
    1,
    Number.isFinite(opts.historyLimit)
      ? opts.historyLimit
      : Number.isFinite(opts.limit)
        ? opts.limit
        : DEFAULT_HISTORY_LIMIT,
  );
  const history = [];
  let latest = element.textContent || "";
  const messageEl = document.createElement("span");
  messageEl.className = "status__text";
  while (element.firstChild) element.removeChild(element.firstChild);
  element.appendChild(messageEl);
  updateDisplayedMessage(latest);
  let panel = null;
  let isOpen = false;
  let outsideHandler = null;
  let escHandler = null;
  let focusHandler = null;
  const panelId = element.id
    ? `${element.id}-history`
    : `status-history-${Math.random().toString(36).slice(2)}`;

  function ensureLiveRegion() {
    if (!element.hasAttribute("aria-live"))
      element.setAttribute("aria-live", "polite");
    if (!element.hasAttribute("role")) element.setAttribute("role", "button");
    if (!element.hasAttribute("tabindex"))
      element.setAttribute("tabindex", "0");
    element.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (!element.getAttribute("title"))
      element.setAttribute("title", "Status (click to view history)");
  }

  function pushHistory(entry) {
    history.push(entry);
    if (history.length > limit) history.splice(0, history.length - limit);
  }

  function renderHistory() {
    if (!panel) return;
    panel.innerHTML = "";
    panel.setAttribute("role", "log");
    panel.setAttribute("aria-label", "Status message history");
    if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");

    const heading = document.createElement("div");
    heading.className = "status-history__header";
    heading.textContent = "Status history";
    panel.appendChild(heading);

    if (!history.length) {
      const empty = document.createElement("div");
      empty.className = "status-history__empty";
      empty.textContent = "No messages yet.";
      panel.appendChild(empty);
      return;
    }

    const list = document.createElement("ul");
    list.className = "status-history__list";
    panel.appendChild(list);

    for (const entry of [...history].reverse()) {
      const item = document.createElement("li");
      item.className = "status-history__item";
      item.setAttribute("role", "listitem");
      item.tabIndex = 0;

      const time = document.createElement("time");
      time.className = "status-history__item-time";
      time.dateTime = entry.time.toISOString();
      time.textContent = formatTimestamp(entry.time);
      item.appendChild(time);

      const text = document.createElement("div");
      text.className = "status-history__item-text";
      text.textContent = entry.message;
      item.appendChild(text);

      list.appendChild(item);
    }
  }

  function ensurePanel() {
    if (panel) return;
    panel = document.createElement("div");
    panel.className = "status-history";
    panel.id = panelId;
    panel.dataset.open = "false";
    element.setAttribute("aria-controls", panelId);
    element.appendChild(panel);
    renderHistory();
  }

  function onDocumentMouseDown(e) {
    if (!panel) return;
    if (element.contains(e.target)) return;
    hideHistory();
  }

  function onDocumentKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      hideHistory(true);
    }
  }

  function onDocumentFocusIn(e) {
    if (!panel || !isOpen) return;
    if (panel.contains(e.target)) return;
    if (element.contains(e.target)) return;
    hideHistory();
  }

  function focusFirstHistoryEntry() {
    if (!panel) return;
    const firstItem = panel.querySelector(".status-history__item");
    if (firstItem) {
      firstItem.focus({ preventScroll: true });
      return;
    }
    panel.focus({ preventScroll: true });
  }

  function showHistory() {
    ensurePanel();
    renderHistory();
    panel.dataset.open = "true";
    panel.style.display = "flex";
    isOpen = true;
    element.setAttribute("aria-expanded", "true");
    focusFirstHistoryEntry();
    if (!outsideHandler) {
      outsideHandler = onDocumentMouseDown;
      document.addEventListener("mousedown", outsideHandler, true);
    }
    if (!escHandler) {
      escHandler = onDocumentKeyDown;
      document.addEventListener("keydown", escHandler, true);
    }
    if (!focusHandler) {
      focusHandler = onDocumentFocusIn;
      document.addEventListener("focusin", focusHandler, true);
    }
  }

  function hideHistory(shouldFocusElement = false) {
    if (!panel) return;
    panel.dataset.open = "false";
    panel.style.display = "none";
    isOpen = false;
    element.setAttribute("aria-expanded", "false");
    if (outsideHandler) {
      document.removeEventListener("mousedown", outsideHandler, true);
      outsideHandler = null;
    }
    if (escHandler) {
      document.removeEventListener("keydown", escHandler, true);
      escHandler = null;
    }
    if (focusHandler) {
      document.removeEventListener("focusin", focusHandler, true);
      focusHandler = null;
    }
    if (shouldFocusElement) element.focus({ preventScroll: true });
  }

  function toggleHistory() {
    if (isOpen) hideHistory();
    else showHistory();
  }

  function updateDisplayedMessage(msg) {
    const displayText = formatDisplayText(msg);
    const visible = normalizeDisplayValue(displayText);

    if (messageEl && messageEl.parentNode !== element && element)
      element.insertBefore(messageEl, element.firstChild);
    if (messageEl && messageEl.parentNode === element) messageEl.textContent = visible;
    else if (messageEl) messageEl.textContent = visible;
    else if (element) element.textContent = visible;

    if (messageEl) {
      const hasMessage = msg && msg.trim();
      if (hasMessage) {
        messageEl.dataset.fullMessage = msg;
        messageEl.setAttribute("title", msg);
        messageEl.setAttribute("aria-label", msg);
      } else {
        delete messageEl.dataset.fullMessage;
        messageEl.removeAttribute("title");
        messageEl.removeAttribute("aria-label");
      }
    }
  }

  function set(message, opts = {}) {
    const msg = message == null ? "" : String(message);
    latest = msg;
    updateDisplayedMessage(msg);
    const skipHistory = opts.skipHistory ?? msg.trim() === "";
    if (!skipHistory) {
      pushHistory({
        message: msg,
        time: opts.time instanceof Date ? opts.time : new Date(),
      });
      renderHistory();
    } else {
      renderHistory();
    }
    return latest;
  }

  function clear() {
    set("", { skipHistory: true });
  }

  function getHistory() {
    return history.map((entry) => ({ ...entry }));
  }

  function handleClick(e) {
    if (e && panel && panel.contains(e.target)) return;
    toggleHistory();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleHistory();
    }
  }

  element.dataset.interactive = "true";
  element.addEventListener("click", handleClick);
  element.addEventListener("keydown", handleKeyDown);

  ensureLiveRegion();
  if (latest && latest.trim()) {
    pushHistory({ message: latest, time: new Date() });
    renderHistory();
  }

  return {
    element,
    set,
    clear,
    getHistory,
    showHistory,
    hideHistory,
    toggleHistory,
    ensureLiveRegion,
    get text() {
      return latest;
    },
    set text(v) {
      set(v);
    },
  };
}
