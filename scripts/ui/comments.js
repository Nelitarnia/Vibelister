import { listCommentsForView } from "../app/comments.js";

const DEFAULT_EMPTY_SELECTION_MESSAGE = "Select a cell to manage comments.";

function getEntryText(entry) {
  if (!entry) return "";
  const value = entry.value;
  if (value && typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.note === "string") return value.note;
    if (typeof value.message === "string") return value.message;
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }
  if (value == null) return "";
  return String(value);
}

function buildPayload(existingEntry, text) {
  if (existingEntry && existingEntry.value && typeof existingEntry.value === "object") {
    return { ...existingEntry.value, text };
  }
  return { text };
}

export function initCommentsUI(options = {}) {
  const {
    toggleButton,
    addButton,
    sidebar,
    closeButton,
    listElement,
    emptyElement,
    editorForm,
    textarea,
    saveButton,
    deleteButton,
    cancelButton,
    selectionLabel,
    SelectionCtl,
    selection,
    sel,
    onSelectionChanged,
    getCellComments,
    setCellComment,
    deleteCellComment,
    getActiveView,
    viewDef,
    dataArray,
    render,
    statusBar,
    model,
    ensureVisible,
    VIEWS,
    noteKeyForPair,
    getInteractionsPair,
  } = options;

  if (!sidebar || !toggleButton) return null;

  let isOpen = sidebar.dataset.open === "true";
  let editingEntry = null;
  let comments = [];
  let selectionUnsub = null;
  let commentsHandler = null;

  let filterState = normalizeFilter(
    model?.meta?.commentFilter || {
      viewKey: typeof getActiveView === "function" ? getActiveView() : null,
    },
  );
  if (!filterState.viewKey && typeof getActiveView === "function") {
    filterState = { ...filterState, viewKey: getActiveView() };
  }
  let filteredEntries = [];
  let filteredIndex = -1;

  persistFilterState(filterState);

  function normalizeStringArray(values) {
    if (!Array.isArray(values) || !values.length) return null;
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
    if (!unique.length) return null;
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  }

  function normalizeFilter(raw = {}) {
    const base = { viewKey: null, rowIds: null, columnKeys: null };
    if (!raw || typeof raw !== "object") return base;
    if (typeof raw.viewKey === "string") {
      const trimmed = raw.viewKey.trim();
      if (trimmed) base.viewKey = trimmed;
    }
    base.rowIds = normalizeStringArray(raw.rowIds || raw.rows);
    base.columnKeys = normalizeStringArray(raw.columnKeys || raw.columns);
    return base;
  }

  function arraysEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function filtersEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
      a.viewKey === b.viewKey &&
      arraysEqual(a.rowIds, b.rowIds) &&
      arraysEqual(a.columnKeys, b.columnKeys)
    );
  }

  function persistFilterState(next = filterState) {
    if (!model || typeof model !== "object") return;
    if (!model.meta || typeof model.meta !== "object") model.meta = {};
    model.meta.commentFilter = { ...next };
  }

  function getFilterViewKey() {
    if (filterState.viewKey) return filterState.viewKey;
    return typeof getActiveView === "function" ? getActiveView() : null;
  }

  function resolveViewDefinitionForFilter(viewKey) {
    if (!viewKey) return null;
    const active = typeof getActiveView === "function" ? getActiveView() : null;
    if (active && viewKey === active) {
      const current = typeof viewDef === "function" ? viewDef() : null;
      if (current) return current;
    }
    if (VIEWS && typeof VIEWS === "object" && VIEWS[viewKey]) {
      return VIEWS[viewKey];
    }
    return null;
  }

  function rowsForViewKey(viewKey) {
    if (!viewKey || !model || typeof model !== "object") return [];
    const active = typeof getActiveView === "function" ? getActiveView() : null;
    if (active && viewKey === active) {
      const rows = typeof dataArray === "function" ? dataArray() : null;
      return Array.isArray(rows) ? rows : [];
    }
    if (viewKey === "actions") return Array.isArray(model.actions) ? model.actions : [];
    if (viewKey === "inputs") return Array.isArray(model.inputs) ? model.inputs : [];
    if (viewKey === "modifiers")
      return Array.isArray(model.modifiers) ? model.modifiers : [];
    if (viewKey === "outcomes") return Array.isArray(model.outcomes) ? model.outcomes : [];
    return [];
  }

  function buildInteractionsRowResolver() {
    if (
      !model ||
      typeof getInteractionsPair !== "function" ||
      typeof noteKeyForPair !== "function"
    ) {
      return () => -1;
    }
    const total = Number(model?.interactionsIndex?.totalRows);
    if (!Number.isFinite(total) || total <= 0) return () => -1;
    const map = new Map();
    for (let rowIndex = 0; rowIndex < total; rowIndex++) {
      const pair = getInteractionsPair(model, rowIndex);
      if (!pair) continue;
      const key = noteKeyForPair(pair, undefined);
      if (!key) continue;
      const normalized = String(key);
      if (!map.has(normalized)) map.set(normalized, rowIndex);
    }
    return (rowId) => {
      const key = String(rowId ?? "");
      return map.has(key) ? map.get(key) : -1;
    };
  }

  function matchesFilterEntry(entry) {
    if (!entry) return false;
    if (filterState.rowIds && filterState.rowIds.length) {
      if (!filterState.rowIds.includes(entry.rowId)) return false;
    }
    if (filterState.columnKeys && filterState.columnKeys.length) {
      if (!filterState.columnKeys.includes(entry.columnKey)) return false;
    }
    return true;
  }

  function syncFilteredIndexToSelection() {
    const active = typeof getActiveView === "function" ? getActiveView() : null;
    if (!active || active !== getFilterViewKey()) {
      filteredIndex = -1;
      return;
    }
    filteredIndex = filteredEntries.findIndex(
      (entry) => entry.rowIndex === sel.r && entry.columnIndex === sel.c,
    );
  }

  function rebuildFilteredEntries() {
    const viewKey = getFilterViewKey();
    const viewDefinition = resolveViewDefinitionForFilter(viewKey);
    if (!viewDefinition) {
      filteredEntries = [];
      filteredIndex = -1;
      return;
    }
    const options =
      viewKey === "interactions"
        ? { findRowIndex: buildInteractionsRowResolver() }
        : { rows: rowsForViewKey(viewKey) };
    filteredEntries = listCommentsForView(model, viewDefinition, options).filter(
      (entry) => matchesFilterEntry(entry),
    );
    syncFilteredIndexToSelection();
  }

  function setFilter(next, options = {}) {
    const normalized = normalizeFilter({ ...filterState, ...next });
    if (filtersEqual(filterState, normalized)) return filterState;
    filterState = normalized;
    persistFilterState(filterState);
    if (!options.skipRebuild) rebuildFilteredEntries();
    return filterState;
  }

  function getFilter() {
    return {
      viewKey: filterState.viewKey,
      rowIds: filterState.rowIds ? filterState.rowIds.slice() : null,
      columnKeys: filterState.columnKeys ? filterState.columnKeys.slice() : null,
    };
  }

  function getFilteredEntries() {
    return filteredEntries.map((entry) => ({ ...entry }));
  }

  function getFilteredIndex() {
    return filteredIndex;
  }

  function focusFilteredEntryAt(index, options = {}) {
    if (!Array.isArray(filteredEntries) || !filteredEntries.length) return null;
    const entry = filteredEntries[index];
    if (!entry) return null;
    const active = typeof getActiveView === "function" ? getActiveView() : null;
    if (entry.viewKey && entry.viewKey !== active) {
      statusBar?.set?.(`Switch to the ${entry.viewKey} view to inspect this comment.`);
      return null;
    }
    if (!Number.isInteger(entry.rowIndex) || entry.rowIndex < 0) {
      statusBar?.set?.("Comment row is no longer available.");
      return null;
    }
    if (!Number.isInteger(entry.columnIndex) || entry.columnIndex < 0) {
      statusBar?.set?.("Comment column is no longer available.");
      return null;
    }
    SelectionCtl?.setActiveCell?.(entry.rowIndex, entry.columnIndex);
    if (typeof ensureVisible === "function") {
      const align = options && typeof options === "object" ? options.align : undefined;
      if (align) ensureVisible(entry.rowIndex, entry.columnIndex, { align });
      else ensureVisible(entry.rowIndex, entry.columnIndex);
    }
    filteredIndex = index;
    return entry;
  }

  function stepFilteredEntry(step = 1, options = {}) {
    if (!Array.isArray(filteredEntries) || !filteredEntries.length) {
      statusBar?.set?.("No comments match the current filter.");
      return null;
    }
    const total = filteredEntries.length;
    let offset = Number.isFinite(step) ? Math.trunc(step) : 0;
    if (offset === 0) offset = 1;
    let nextIndex = filteredIndex;
    if (!Number.isInteger(nextIndex) || nextIndex < 0) {
      nextIndex = offset > 0 ? 0 : total - 1;
    } else {
      nextIndex = (nextIndex + offset) % total;
      if (nextIndex < 0) nextIndex += total;
    }
    return focusFilteredEntryAt(nextIndex, options);
  }

  function forEachFilteredEntry(cb) {
    if (typeof cb !== "function") return;
    for (const entry of filteredEntries) cb(entry);
  }

  function hasValidSelection() {
    return Number.isFinite(sel?.r) && Number.isFinite(sel?.c);
  }

  function updateToggleState() {
    toggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
    sidebar.dataset.open = isOpen ? "true" : "false";
    sidebar.setAttribute("aria-hidden", isOpen ? "false" : "true");
  }

  function setOpen(next) {
    const desired = !!next;
    if (isOpen === desired) return;
    isOpen = desired;
    updateToggleState();
    if (!isOpen) stopEditing();
  }

  function ensureOpen() {
    if (!isOpen) {
      isOpen = true;
      updateToggleState();
    }
  }

  function closeSidebar() {
    if (!isOpen) return;
    isOpen = false;
    updateToggleState();
    stopEditing();
  }

  function updateSelectionLabel() {
    if (!selectionLabel) return;
    if (!hasValidSelection()) {
      selectionLabel.textContent = DEFAULT_EMPTY_SELECTION_MESSAGE;
      return;
    }
    const vd = typeof viewDef === "function" ? viewDef() : null;
    const active = typeof getActiveView === "function" ? getActiveView() : null;
    const viewTitle = vd?.title || vd?.key || active || "";
    const columns = Array.isArray(vd?.columns) ? vd.columns : [];
    const column = columns[sel.c];
    const columnLabel = column?.title || column?.key || `Column ${sel.c + 1}`;
    let rowLabel = `Row ${sel.r + 1}`;
    if (vd && vd.key !== "interactions" && typeof dataArray === "function") {
      const rows = dataArray();
      const row = rows && rows[sel.r];
      if (row) {
        if (typeof row.name === "string" && row.name.trim()) rowLabel = row.name.trim();
        else if (row.id != null) rowLabel = `Row ${row.id}`;
      }
    }
    selectionLabel.textContent = viewTitle
      ? `${viewTitle}: ${columnLabel} — ${rowLabel}`
      : `${columnLabel} — ${rowLabel}`;
  }

  function renderList() {
    if (listElement) listElement.innerHTML = "";
    const hasComments = Array.isArray(comments) && comments.length > 0;
    if (toggleButton) toggleButton.dataset.hasComment = hasComments ? "true" : "false";
    if (addButton) {
      addButton.textContent = hasComments ? "Edit comment" : "Add comment";
      addButton.disabled = !hasValidSelection();
    }
    if (deleteButton) deleteButton.disabled = !hasComments;

    if (!hasValidSelection()) {
      if (emptyElement) {
        emptyElement.hidden = false;
        emptyElement.textContent = DEFAULT_EMPTY_SELECTION_MESSAGE;
      }
      return;
    }

    if (!hasComments) {
      if (emptyElement) {
        emptyElement.hidden = false;
        emptyElement.textContent = "No comment on this cell.";
      }
      return;
    }

    if (emptyElement) emptyElement.hidden = true;
    if (!listElement) return;

    comments.forEach((entry, index) => {
      const item = document.createElement("li");
      item.className = "comment-sidebar__item";

      const text = document.createElement("div");
      text.className = "comment-sidebar__item-text";
      text.textContent = getEntryText(entry) || "(empty comment)";
      item.appendChild(text);

      const meta = document.createElement("div");
      meta.className = "comment-sidebar__item-meta";
      meta.textContent = index === 0 ? "Primary" : `Entry ${index + 1}`;
      item.appendChild(meta);

      item.addEventListener("click", () => startEditing(entry));
      listElement.appendChild(item);
    });
  }

  function syncFromSelection() {
    updateSelectionLabel();
    if (!hasValidSelection()) {
      comments = [];
      stopEditing();
      renderList();
      rebuildFilteredEntries();
      return;
    }
    const options = {
      view: typeof getActiveView === "function" ? getActiveView() : undefined,
      viewDef: typeof viewDef === "function" ? viewDef() : undefined,
    };
    const entries =
      typeof getCellComments === "function"
        ? getCellComments(sel.r, sel.c, options) || []
        : [];
    comments = Array.isArray(entries) ? entries : [];
    if (!comments.length) stopEditing();
    renderList();
    rebuildFilteredEntries();
  }

  function startEditing(entry = null) {
    if (!hasValidSelection()) return;
    ensureOpen();
    editingEntry = entry || (comments.length ? comments[0] : null);
    if (editorForm) {
      editorForm.hidden = false;
      editorForm.dataset.mode = editingEntry ? "edit" : "create";
    }
    if (textarea) {
      textarea.value = getEntryText(editingEntry);
      textarea.focus();
      textarea.select();
    }
    if (deleteButton) deleteButton.disabled = !editingEntry;
  }

  function stopEditing() {
    editingEntry = null;
    if (editorForm) {
      editorForm.hidden = true;
      editorForm.dataset.mode && delete editorForm.dataset.mode;
    }
    if (textarea) textarea.value = "";
    if (deleteButton) deleteButton.disabled = !comments.length;
  }

  function handleSave(e) {
    e?.preventDefault?.();
    if (!hasValidSelection() || !textarea) return;
    const raw = textarea.value;
    const text = raw != null ? raw.trim() : "";
    if (!text) {
      statusBar?.set?.("Comment text cannot be empty.");
      return;
    }
    const payload = buildPayload(editingEntry, text);
    const options = {
      view: typeof getActiveView === "function" ? getActiveView() : undefined,
      viewDef: typeof viewDef === "function" ? viewDef() : undefined,
    };
    const change = setCellComment?.(sel.r, sel.c, payload, options);
    if (change) {
      statusBar?.set?.("Comment saved.");
      SelectionCtl?.setActiveCell?.(sel.r, sel.c);
      render?.();
    }
    stopEditing();
    syncFromSelection();
  }

  function handleDelete() {
    if (!hasValidSelection() || !comments.length) return;
    const options = {
      view: typeof getActiveView === "function" ? getActiveView() : undefined,
      viewDef: typeof viewDef === "function" ? viewDef() : undefined,
    };
    const change = deleteCellComment?.(sel.r, sel.c, options);
    if (change) {
      statusBar?.set?.("Comment removed.");
      SelectionCtl?.setActiveCell?.(sel.r, sel.c);
      render?.();
    }
    stopEditing();
    syncFromSelection();
  }

  function onCommentsUpdated() {
    if (editorForm && !editorForm.hidden) return; // avoid clobbering in-progress edits
    syncFromSelection();
  }

  const toggleHandler = () => setOpen(!isOpen);
  const addHandler = () => startEditing();
  const closeHandler = () => closeSidebar();
  const cancelHandler = () => stopEditing();

  toggleButton.addEventListener("click", toggleHandler);
  addButton?.addEventListener("click", addHandler);
  closeButton?.addEventListener("click", closeHandler);
  cancelButton?.addEventListener("click", cancelHandler);
  saveButton?.addEventListener("click", handleSave);
  editorForm?.addEventListener("submit", handleSave);
  deleteButton?.addEventListener("click", handleDelete);

  if (typeof onSelectionChanged === "function") {
    selectionUnsub = onSelectionChanged(() => {
      if (!selection) return;
      syncFromSelection();
    });
  }

  commentsHandler = onCommentsUpdated;
  document.addEventListener("vibelister:comments-updated", commentsHandler);

  updateToggleState();
  syncFromSelection();

  return {
    refresh: syncFromSelection,
    setOpen,
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => isOpen,
    getFilter,
    setFilter: (next, options) => setFilter(next, options),
    getFilteredEntries,
    getFilteredIndex,
    focusFilteredEntryAt,
    stepFilteredEntry,
    forEachFilteredEntry,
    destroy() {
      toggleButton.removeEventListener("click", toggleHandler);
      addButton?.removeEventListener("click", addHandler);
      closeButton?.removeEventListener("click", closeHandler);
      cancelButton?.removeEventListener("click", cancelHandler);
      saveButton?.removeEventListener("click", handleSave);
      editorForm?.removeEventListener("submit", handleSave);
      deleteButton?.removeEventListener("click", handleDelete);
      if (selectionUnsub) selectionUnsub();
      if (commentsHandler) {
        document.removeEventListener("vibelister:comments-updated", commentsHandler);
        commentsHandler = null;
      }
    },
  };
}
