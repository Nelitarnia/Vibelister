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
  } = options;

  if (!sidebar || !toggleButton) return null;

  let isOpen = sidebar.dataset.open === "true";
  let editingEntry = null;
  let comments = [];
  let selectionUnsub = null;
  let commentsHandler = null;

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
