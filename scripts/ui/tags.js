import {
  collectInteractionTags,
  normalizeInteractionTags,
} from "../app/interactions.js";
import { INTERACTION_TAGS_EVENT } from "../app/tag-events.js";

function buildTagCounts(model) {
  const counts = new Map();
  const notes = model?.notes;
  if (!notes || typeof notes !== "object") return counts;
  for (const note of Object.values(notes)) {
    if (!note || typeof note !== "object") continue;
    const tags = normalizeInteractionTags(note.tags);
    if (!Array.isArray(tags) || !tags.length) continue;
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return counts;
}

function formatCountLabel(value) {
  if (!Number.isFinite(value)) return "";
  const n = Math.max(0, value | 0);
  return n === 1 ? "1" : String(n);
}

export function initTagSidebar(options = {}) {
  const {
    panelHost,
    panelId = "tags",
    panelTitle = "Tags",
    sidebar,
    toggleButton,
    input,
    form,
    renameButton,
    deleteButton,
    listElement,
    emptyElement,
    tagManager,
    model,
    statusBar,
  } = options || {};

  if (!sidebar || !toggleButton || !model) return null;

  const host = panelHost || null;
  const manager = tagManager || null;
  const inputEl = input || null;
  const formEl = form || null;
  const renameBtn = renameButton || null;
  const deleteBtn = deleteButton || null;
  const listEl = listElement || null;
  const emptyEl = emptyElement || null;

  let paneHandle = null;
  let detachHostToggle = null;
  let manualToggleHandler = null;
  let isOpen = sidebar.dataset.open === "true";
  let tags = [];
  let counts = new Map();
  let selectedTag = "";
  let pendingSelection = null;
  let focusAfterRefresh = false;
  let documentHandler = null;
  let inputHandler = null;
  let renameHandler = null;
  let deleteHandler = null;

  function isPaneOpen() {
    if (paneHandle && typeof paneHandle.isOpen === "function") {
      return !!paneHandle.isOpen();
    }
    return !!isOpen;
  }

  function updateToggleState() {
    const expanded = isPaneOpen();
    toggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
    if (!paneHandle) {
      sidebar.dataset.open = expanded ? "true" : "false";
      sidebar.setAttribute("aria-hidden", expanded ? "false" : "true");
    }
  }

  function setOpen(next) {
    const desired = !!next;
    if (paneHandle) {
      if (desired) paneHandle.open();
      else paneHandle.close();
      return;
    }
    if (isOpen === desired) return;
    isOpen = desired;
    updateToggleState();
  }

  function togglePane() {
    setOpen(!isPaneOpen());
  }

  function ensureOpen() {
    if (paneHandle) {
      paneHandle.open();
    } else {
      setOpen(true);
    }
  }

  if (host && typeof host.registerPane === "function") {
    paneHandle = host.registerPane({
      id: panelId,
      element: sidebar,
      title: panelTitle,
      onShow: () => {
        isOpen = true;
        updateToggleState();
      },
      onHide: () => {
        isOpen = false;
        updateToggleState();
      },
    });
    if (paneHandle && typeof paneHandle.isOpen === "function") {
      isOpen = !!paneHandle.isOpen();
    }
    if (host && typeof host.attachToggle === "function") {
      detachHostToggle = host.attachToggle(toggleButton, panelId);
    }
  } else {
    manualToggleHandler = togglePane;
    toggleButton.addEventListener("click", manualToggleHandler);
    if (sidebar.id) {
      toggleButton.setAttribute("aria-controls", sidebar.id);
    }
  }

  updateToggleState();

  function buildListItem(tag) {
    if (!listEl || typeof document === "undefined") return null;
    const item = document.createElement("li");
    item.className = "tag-sidebar__item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-sidebar__tag";
    button.dataset.tag = tag;
    if (tag === selectedTag) {
      button.classList.add("tag-sidebar__tag--selected");
    }

    const name = document.createElement("span");
    name.className = "tag-sidebar__tag-name";
    name.textContent = tag;
    button.appendChild(name);

    const count = counts.get(tag) || 0;
    const countEl = document.createElement("span");
    countEl.className = "tag-sidebar__tag-count";
    countEl.textContent = formatCountLabel(count);
    countEl.setAttribute(
      "aria-label",
      count === 1 ? "1 occurrence" : `${count} occurrences`,
    );
    button.appendChild(countEl);

    button.addEventListener("click", () => {
      ensureOpen();
      setSelectedTag(tag, { focusInput: true, updateInput: true });
      renderList();
      updateActionState();
    });

    item.appendChild(button);
    return item;
  }

  function renderList() {
    if (!listEl) return;
    listEl.textContent = "";
    const items = Array.isArray(tags) ? tags : [];
    if (!items.length) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    for (const tag of items) {
      const item = buildListItem(tag);
      if (item) listEl.appendChild(item);
    }
  }

  function setSelectedTag(value, options = {}) {
    const { updateInput = false, focusInput = false } = options;
    selectedTag = typeof value === "string" ? value : "";
    if (inputEl && updateInput) {
      inputEl.value = selectedTag;
      if (focusInput) {
        inputEl.focus();
        inputEl.select();
      }
    }
  }

  function updateActionState() {
    const hasSelection = !!selectedTag;
    const newName = inputEl ? inputEl.value.trim() : "";
    if (renameBtn) {
      renameBtn.disabled = !manager || !hasSelection || !newName;
    }
    if (deleteBtn) {
      deleteBtn.disabled = !manager || !hasSelection;
    }
  }

  function refresh() {
    const previousSelection = selectedTag;
    tags = collectInteractionTags(model) || [];
    counts = buildTagCounts(model);

    let nextSelection = previousSelection;
    if (pendingSelection !== null) {
      if (pendingSelection && tags.includes(pendingSelection)) {
        nextSelection = pendingSelection;
      } else if (!pendingSelection) {
        nextSelection = "";
      } else if (!tags.includes(previousSelection)) {
        nextSelection = "";
      }
    } else if (nextSelection && !tags.includes(nextSelection)) {
      nextSelection = "";
    }

    const selectionChanged = nextSelection !== previousSelection;
    selectedTag = nextSelection;

    renderList();

    if (selectionChanged && inputEl) {
      inputEl.value = selectedTag;
      if (focusAfterRefresh && selectedTag) {
        inputEl.focus();
        inputEl.select();
      }
    }

    updateActionState();
    pendingSelection = null;
    focusAfterRefresh = false;
  }

  function handleTagsUpdated() {
    refresh();
  }

  function handleInputChange() {
    updateActionState();
  }

  function handleRename(event) {
    event?.preventDefault?.();
    if (!manager) {
      statusBar?.set?.("Tag manager unavailable.");
      return;
    }
    if (!selectedTag) {
      statusBar?.set?.("Select a tag to rename.");
      ensureOpen();
      return;
    }
    const raw = inputEl ? inputEl.value : "";
    const nextName = raw ? raw.trim() : "";
    if (!nextName) {
      statusBar?.set?.("Enter a new tag name.");
      inputEl?.focus?.();
      return;
    }
    pendingSelection = nextName;
    focusAfterRefresh = true;
    const result = manager.renameTag(selectedTag, nextName);
    if (!result || (result.replacements ?? 0) === 0) {
      pendingSelection = null;
      focusAfterRefresh = false;
      refresh();
    }
  }

  function handleDelete() {
    if (!manager) {
      statusBar?.set?.("Tag manager unavailable.");
      return;
    }
    if (!selectedTag) {
      statusBar?.set?.("Select a tag to delete.");
      ensureOpen();
      return;
    }
    pendingSelection = "";
    focusAfterRefresh = false;
    const result = manager.deleteTag(selectedTag);
    if (!result || (result.removals ?? 0) === 0) {
      pendingSelection = null;
      refresh();
    }
  }

  if (typeof document !== "undefined" && document?.addEventListener) {
    documentHandler = handleTagsUpdated;
    document.addEventListener(INTERACTION_TAGS_EVENT, documentHandler);
  }

  if (inputEl) {
    inputHandler = handleInputChange;
    inputEl.addEventListener("input", inputHandler);
  }

  if (formEl) {
    renameHandler = handleRename;
    formEl.addEventListener("submit", renameHandler);
  } else if (renameBtn) {
    renameHandler = handleRename;
    renameBtn.addEventListener("click", renameHandler);
  }

  if (deleteBtn) {
    deleteHandler = handleDelete;
    deleteBtn.addEventListener("click", deleteHandler);
  }

  refresh();

  return {
    refresh,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: togglePane,
    isOpen: () => isPaneOpen(),
    select(tag) {
      setSelectedTag(tag, { updateInput: true, focusInput: false });
      renderList();
      updateActionState();
    },
    destroy() {
      if (detachHostToggle) {
        detachHostToggle();
        detachHostToggle = null;
      }
      if (manualToggleHandler) {
        toggleButton.removeEventListener("click", manualToggleHandler);
        manualToggleHandler = null;
      }
      if (documentHandler && typeof document !== "undefined") {
        document.removeEventListener(INTERACTION_TAGS_EVENT, documentHandler);
        documentHandler = null;
      }
      if (inputHandler && inputEl) {
        inputEl.removeEventListener("input", inputHandler);
        inputHandler = null;
      }
      if (renameHandler) {
        if (formEl) formEl.removeEventListener("submit", renameHandler);
        if (renameBtn) renameBtn.removeEventListener("click", renameHandler);
        renameHandler = null;
      }
      if (deleteHandler && deleteBtn) {
        deleteBtn.removeEventListener("click", deleteHandler);
        deleteHandler = null;
      }
    },
  };
}
