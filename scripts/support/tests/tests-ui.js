// tests-ui.js — interaction tests with a tiny fake DOM

export function runUiTests(ui){
  const log = (...a)=>console.log('[ui-tests]', ...a);
  const ok  = (cond,msg)=>console.assert(!!cond, msg);

  // --- tiny event target ---
  function makeTarget(){
    const listeners = {};
    return {
      listeners,
      addEventListener(type, cb){ (listeners[type] ||= []).push(cb); },
      removeEventListener(type, cb){
        const arr = listeners[type] || []; const i = arr.indexOf(cb); if (i>=0) arr.splice(i,1);
      },
      contains(node){ return node && node._root === this; },
      dispatch(type, e){ (listeners[type] || []).forEach(cb => cb(e)); },
      scrollTop: 0,
    };
  }

  function makeCell(sheet, r, c){
    return {
      _root: sheet,
      dataset: { r: String(r), c: String(c) },
      closest(sel){ return sel.includes('cell') || sel.includes('[data-r]') ? this : null; },
    };
  }

  // --- harness wiring ---
  const sheet = makeTarget();
  const rowHdrs = makeTarget(); // for wheel forwarding
  const editor = {}; // stub

  let began = null, toggled = null, rendered = 0;
  const deps = {
    sheet, rowHdrs, editor,
    sel: { r:0, c:0 },
    selection: { rows:new Set(), anchor:null, colsAll:false },
    SelectionNS: {
      selectRow: (r)=>{ deps.selection.rows.clear(); deps.selection.rows.add(r); deps.selection.anchor=r; deps.selection.colsAll=false; },
      extendTo: (r)=>{ const a = deps.selection.anchor ?? deps.sel.r; deps.selection.rows.clear(); for(let i=Math.min(a,r);i<=Math.max(a,r);i++) deps.selection.rows.add(i); deps.selection.anchor=a; },
      setColsAll: (v)=>{ deps.selection.colsAll = !!v; },
      isAllCols: ()=> deps.selection.colsAll,
    },
    isEditing: ()=>false,
    beginEdit: (r,c)=>{ began = [r,c]; },
    endEdit: ()=>{},
    render: ()=>{ rendered++; },
    ensureVisible: ()=>{},
    viewDef: ()=>({ columns: [{key:'name'},{key:'mod:7'}] }),
    isModColumn: (col)=>/^mod:/.test(col.key),
    setModForSelection: (c)=>{ toggled = c; },
  };

  ui.initGridMouse(deps);

  function mousedown(target, detail=1){
    const e = { button:0, detail, preventDefault(){}, target };
    sheet.dispatch('mousedown', e);
  }
  function dblclick(target){
    const e = { preventDefault(){}, target };
    sheet.dispatch('dblclick', e);
  }
  function wheelHeader(deltaY){
    const e = { deltaY, preventDefault(){}, };
    rowHdrs.dispatch('wheel', e);
  }

  // --- tests ---

  // 1) Double-click on non-mod opens editor
  (function(){
    const c = makeCell(sheet, 3, 0);
    began = null; mousedown(c, 2);
    ok(began && began[0]===3 && began[1]===0, 'dblclick begins edit on non-mod');
  })();

  // 2) Double-click on mod column does nothing
  (function(){
    const c = makeCell(sheet, 3, 1);
    began = null; mousedown(c, 2);
    ok(began===null, 'dblclick suppressed on mod column');
  })();

  // 3) Single click selects and toggles mod across selection
  (function(){
    // select rows 2..4
    deps.selection.rows = new Set([2,3,4]); deps.selection.anchor=2;
    const c = makeCell(sheet, 3, 1);
    toggled = null; mousedown(c, 1);
    ok(toggled===1, 'mod column toggled across multi-selection');
  })();

  // 4) Row header wheel forwards to sheet
  (function(){
    const top0 = sheet.scrollTop;
    wheelHeader(60);
    ok(sheet.scrollTop === top0 + 60, 'row header wheel forwarded to sheet');
  })();

  log('UI tests executed.');
}

export default runUiTests;
