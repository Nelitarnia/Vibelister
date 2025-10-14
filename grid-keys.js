// grid-keys.js
import { MIME_CELL, readStructuredFromEvent, writeStructuredToEvent } from "./clipboard-codec.js";
// Keyboard navigation for the grid + app-level shortcuts.
// Exported as an initializer so App.js can pass dependencies explicitly.

// Single source of truth for the structured payload MIME


export function initGridKeys(deps) { // (clipboard-enhanced)
  const {
    // state & selectors
    isEditing, // () => boolean
    getActiveView, // () => string
    selection, sel,
    // DOM/controls
    editor,
    // grid APIs
    clearSelection, render, beginEdit, endEdit, moveSel, ensureVisible,
    viewDef, getRowCount, dataArray, isModColumn, modIdFromKey, setModForSelection, setCell,
    // app-level actions
    cycleView, saveToDisk, openFromDisk, newProject, doGenerate, runSelfTests,
    // deletion
    deleteSelection,
    // NEW: model & cell text getter for clipboard ops
    model,
    getCellText, getStructuredCell, applyStructuredCell,
  } = deps;

  function isTypingInEditable(ae) {
    return (
      ae &&
      ae !== editor &&
      (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)
    );
  }

  function gridIsEditing() {
    try { return !!isEditing(); } catch { return !!(editor && editor.style.display !== 'none'); }
  }

  function onGridKeyDown(e) {
    if (document.querySelector('[aria-modal="true"]')) return; // respect modals
    const ae = document.activeElement;
    if (isTypingInEditable(ae)) return;

    // Clear multi-selection with Escape when not editing
    if (!gridIsEditing() && e.key === 'Escape' && selection.rows.size > 0) {
      clearSelection();
      render();
      return;
    }

    // Global delete (when not editing a cell)
    if (!gridIsEditing() && (e.key === 'Delete' || (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey))) {
      e.preventDefault();
      if (typeof deleteSelection === 'function') {
        if (getActiveView && getActiveView() === 'interactions') {
          // Shift+Delete (or Shift+Backspace) → clear all editable cells in selection
          // Delete → clear active editable column across selection
          deleteSelection({ mode: e.shiftKey ? 'clearAllEditable' : 'clearActiveCell' });
        } else {
          deleteSelection();
        }
      }
      return;
    }

    // In-cell editing mode
    if (gridIsEditing()) {
      // If editing the Interactions → Outcome cell, defer Enter/Escape to the palette handler in App.js
      try {
        const keyDef = viewDef().columns[sel.c];
        const cellKey = keyDef && keyDef.key;
        if (getActiveView()==='interactions' && cellKey &&
            (cellKey === 'result' ||
             (String(cellKey).startsWith('p') && String(cellKey).endsWith(':outcome')) ||
             (String(cellKey).startsWith('p') && String(cellKey).endsWith(':end')))) {
          return;
        }
      } catch {}

      if (e.key === 'Enter') { e.preventDefault(); endEdit(true); moveSel(1, 0, false); return; }
      if (e.key === 'Escape') { e.preventDefault(); endEdit(false); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        endEdit(true);
        const maxC = viewDef().columns.length - 1;
        let r = sel.r, c = sel.c;
        if (e.shiftKey) { if (c>0) c--; else { c = maxC; r = Math.max(0, r-1); } }
        else { if (c<maxC) c++; else { c = 0; r = Math.min(getRowCount()-1, r+1); } }
        sel.r = r; sel.c = c; ensureVisible(sel.r, sel.c); render(); return;
      }
      return;
    }

    // ----- MODIFIER COLUMNS: handle first (tri-state) -----
    const col = viewDef().columns[sel.c];
    if (getActiveView() === 'actions' && isModColumn(col)) {
      // Cycle: OFF→ON→BYPASS→OFF on Enter / Space / X / F2
      if (e.key === ' ' || e.key.toLowerCase() === 'x' || e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        if (selection.rows.size > 1) setModForSelection(sel.c, undefined); // batch cycle using active row's next
        else setCell(sel.r, sel.c, undefined); // single cycle
        render();
        return;
      }
      // Optional explicit sets: Alt+0/1/2 → OFF/ON/BYPASS
      if (e.altKey && (e.key === '0' || e.key === '1' || e.key === '2')) {
        e.preventDefault();
        const target = Number(e.key);
        if (selection.rows.size > 1) setModForSelection(sel.c, target);
        else setCell(sel.r, sel.c, target);
        render();
        return;
      }
    }

    // ----- Generic editing / navigation (non-mod cells) -----
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); beginEdit(sel.r, sel.c); return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); moveSel(0,-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveSel(0, 1); return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); moveSel(-1,0); return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); moveSel( 1,0); return; }
    if (e.key === 'Tab')        { e.preventDefault(); moveSel(0, e.shiftKey ? -1 : 1); return; }

    // Type-to-edit ONLY on non-mod columns
    if (!isModColumn(col) && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      beginEdit(sel.r, sel.c);
      editor.value = '';
    }
  }

  function onShortcutKeyDown(e) {
    const isMac = navigator.platform.includes('Mac');
    const mod = isMac ? e.metaKey : e.ctrlKey;

    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveToDisk(false); return; }
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openFromDisk(); return; }
    if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); newProject(); return; }
    if (e.altKey && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); doGenerate(); return; }
    if (e.altKey && (e.key === 't' || e.key === 'T')) { e.preventDefault(); runSelfTests(); return; }
    if (mod && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      if (editor.style.display !== 'none') return; // don't cycle while editing
      e.preventDefault(); cycleView(e.key === 'ArrowRight' ? 1 : -1); return;
    }
  }

  window.addEventListener('keydown', onGridKeyDown, true); // capture: grid first
  window.addEventListener('keydown', onShortcutKeyDown);    // bubble: plays nice
// ---- Clipboard: generic structured refs for any stable-ID cell ----


function isInteractions() { return getActiveView() === 'interactions'; }
function getCellKey(r, c) { const cd = viewDef().columns[c]; return cd && cd.key; }

function onCopy(e){
  if (document.querySelector('[aria-modal="true"]')) return;
  const ae = document.activeElement;
  if (isTypingInEditable(ae)) return;
  if (gridIsEditing()) return;

  // Always put plain text
  const text = (typeof getCellText === 'function') ? String(getCellText(sel.r, sel.c) || '') : '';
  e.preventDefault();
  try { e.clipboardData.setData('text/plain', text); } catch {}

  // If the cell has a structured payload, add it via codec
if (typeof getStructuredCell === 'function') {
  const payload = getStructuredCell(sel.r, sel.c);
  console.debug('[copy] types before:', Array.from(e.clipboardData.types || []));
  if (writeStructuredToEvent(e, payload)) {
    console.debug('[copy] wrote', MIME_CELL, 'bytes=', JSON.stringify(payload).length, 'payload=', payload);
  } else {
    console.debug('[copy] no canonical structured payload for this cell; writing text/plain only');
  }
} else {
      console.debug('[copy] no canonical structured payload for this cell; writing text/plain only');
    }
  }


function onPaste(e){
  if (document.querySelector('[aria-modal="true"]')) return;
  const ae = document.activeElement;
  if (isTypingInEditable(ae)) return;

  e.preventDefault();

  const rows = selection.rows.size > 1 ? Array.from(selection.rows).sort((a,b)=>a-b) : [sel.r];

  // Try structured first via codec (canonical wrapper only)
const types = Array.from(e.clipboardData.types || []);
console.debug('[paste] types:', types);
const payload = readStructuredFromEvent(e);
if (payload && typeof applyStructuredCell === 'function') {
    let applied = false;
    for (const r of rows) {
      if (applyStructuredCell(r, sel.c, payload)) applied = true;
    }
    console.debug('[paste] structured applied?', applied, 'payload=', payload);
    if (applied) { render(); return; }
  } else {
    if (!payload) console.debug('[paste] no structured payload present in clipboard under', MIME_CELL);
    else console.debug('[paste] structured payload shape not canonical; falling back to text');
  }

  // Fallback: plain text into all rows
  const txt = e.clipboardData.getData('text/plain') || '';
  for (const r of rows) setCell(r, sel.c, txt);
  render();
}

window.addEventListener('copy', onCopy, true);
window.addEventListener('paste', onPaste, true);

  // Return disposer for future use (optional)
  return () => {
    window.removeEventListener('keydown', onGridKeyDown, true);
    window.removeEventListener('keydown', onShortcutKeyDown);
    window.removeEventListener('copy', onCopy, true);
    window.removeEventListener('paste', onPaste, true);
  };
}
