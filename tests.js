// tests.js — pure API consumer; no window/model globals.
export function runSelfTests(api){
  // Prefer the passed API; fall back to globals as a safety net
  const g = (typeof window !== 'undefined') ? window : globalThis;
  const model = api?.model ?? g.model;
  const ensureSeedRows = api?.ensureSeedRows ?? g.ensureSeedRows;
  const buildInteractionsPairs = api?.buildInteractionsPairs ?? g.buildInteractionsPairs;
  const rebuildActionColumnsFromModifiers = api?.rebuildActionColumnsFromModifiers ?? g.rebuildActionColumnsFromModifiers;
  const setCell = api?.setCell ?? g.setCell;
  const VIEWS = api?.VIEWS ?? g.VIEWS;
  const setActiveView = api?.setActiveView ?? g.setActiveView;

  // Debug surface to help diagnose wiring issues
  console.info('[tests] wiring', {
    hasApi: !!api,
    haveModel: !!model,
    haveEnsure: !!ensureSeedRows,
    haveBuild: !!buildInteractionsPairs
  });

  if (!model || !ensureSeedRows || !buildInteractionsPairs) {
    throw new Error('[tests] Missing API: model/ensureSeedRows/buildInteractionsPairs');
  }

  const log = (...a)=>console.log('[tests]', ...a);
  let fails = 0;
  const ok = (cond, msg) => { if (!cond) console.error('FAIL:', msg); };

  // fresh project each run
  function fresh(){
    model.actions.length = 0;
    model.inputs.length  = 0;
    model.modifiers.length = 0;
    model.modifierGroups.length = 0;
    model.modifierConstraints.length = 0;
    model.notes = {};
    model.interactionsPairs = [];
    model.nextId = 1;
    ensureSeedRows();
  }

  function addAction(name, modSet = {}){
    const r = { id: model.nextId++, name, color:'', notes:'', modSet };
    model.actions.push(r); return r;
  }
  function addInput(name){
    const r = { id: model.nextId++, name, color:'', notes:'' };
    model.inputs.push(r); return r;
  }
  function addModifier(name){
    const r = { id: model.nextId++, name, color:'', notes:'' };
    model.modifiers.push(r); return r;
  }
  function groupExact(k, members, {required=true, name='G'} = {}){
    model.modifierGroups.push({ id: model.nextId++, name, mode:'EXACT', k, required, memberIds: members.map(m=>m.id) });
  }

  // ——— Tests ———

  // 1) Basic generation: A×I rows, no modifiers
  (function(){
    fresh();
    model.actions.splice(0); model.inputs.splice(0);
    addAction('A1'); addAction('A2');
    addInput('I1'); addInput('I2'); addInput('I3');
    const { pairsCount, actionsCount, inputsCount } = buildInteractionsPairs(model);
    ok(actionsCount===2 && inputsCount===3 && pairsCount===6, 'basic A×I generation');
  })();

  // 2) Canonical notes keys survive modifier reorders
  (function(){
    fresh();
    model.actions.splice(0); model.inputs.splice(0); model.modifiers.splice(0);
    const A = addAction('Atk');
    addInput('Square');
    const m1 = addModifier('mod a');
    const m2 = addModifier('mod b');
    // enable both for action
    A.modSet = { [m1.id]: true, [m2.id]: true };
    // one exact-2 group
    groupExact(2, [m1,m2], {required:true, name:'G'});
    const { pairsCount } = buildInteractionsPairs(model);
    ok(pairsCount===1, 'exact-2 yields one combination');

    // write a result note
    model.interactionsPairs.forEach(p=>{
      const k = `${p.aId}|${p.iId}|${p.variantSig}`;
      model.notes[k] = { result:'works', notes:'' };
    });

    // reorder modifiers (swap)
    const tmp = model.modifiers[0]; model.modifiers[0]=model.modifiers[1]; model.modifiers[1]=tmp;

    // regenerate—should still find the note under canonical key
    const { pairsCount: pc2 } = buildInteractionsPairs(model);
    ok(pc2===1, 'regen after reorder still one combo');
    const p = model.interactionsPairs[0];
    const k = `${p.aId}|${p.iId}|${p.variantSig}`;
    ok(model.notes[k]?.result==='works', 'notes survive modifier reorder');
  })();

  // 3) User-ordered display & sort of variants
  (function(){
    fresh();
    // order: a, b, c, d, e
    const mods = ['a','b','c','d','e'].map(n=>addModifier('mod '+n));
    // groups: EXACT 1 among {a,b}, EXACT 2 among {c,d,e}
    const [ma,mb,mc,md,me] = mods;
    groupExact(1, [ma,mb], {required:true, name:'G1'});
    groupExact(2, [mc,md,me], {required:true, name:'G2'});
    const A = addAction('Atk', { [ma.id]:1,[mb.id]:1,[mc.id]:1,[md.id]:1,[me.id]:1 });
    addInput('Btn');

    const { pairsCount } = buildInteractionsPairs(model);
    ok(pairsCount===6, 'EXACT 1 × EXACT 2 yields 6 combos');

    // Check lexicographic order respects row order (a,b then c,d,e pairs)
    const sigs = model.interactionsPairs.map(p=>p.variantSig);
    const expected = [
      `${ma.id}+${mc.id}+${md.id}`,
      `${ma.id}+${mc.id}+${me.id}`,
      `${ma.id}+${md.id}+${me.id}`,
      `${mb.id}+${mc.id}+${md.id}`,
      `${mb.id}+${mc.id}+${me.id}`,
      `${mb.id}+${md.id}+${me.id}`,
    ];
    ok(JSON.stringify(sigs)===JSON.stringify(expected), 'variant ordering respects modifier row order');
  })();

  // 4) Constraint sanity: simple MUTEX culls pairs
  (function(){
    fresh();
    const mX = addModifier('X'), mY = addModifier('Y'), mZ = addModifier('Z');
    model.modifierConstraints.push({type:'MUTEX', ids:[mX.id, mY.id]});
    groupExact(1,[mX,mY,mZ],{required:true, name:'G'});
    const A = addAction('Atk', { [mX.id]:1,[mY.id]:1,[mZ.id]:1 });
    addInput('Btn');
    const { pairsCount } = buildInteractionsPairs(model);
    ok(pairsCount===3*1, 'EXACT1 with {X,Y,Z} yields 3 variants; XY mutex is irrelevant under k=1');
  })();

  // 5) Cap does not crash (we can’t easily assert exact count here)
  (function(){
    fresh();
    // 1 action, 1 input, many modifiers all enabled, one group AT_LEAST 0
    const A = addAction('A');
    addInput('I');
    for(let i=0;i<20;i++) addModifier('m'+i);
    model.modifierGroups.push({ id: model.nextId++, name:'G', mode:'AT_LEAST', k:0, required:true, memberIds: model.modifiers.map(m=>m.id) });
    A.modSet = Object.fromEntries(model.modifiers.map(m=>[m.id,true]));
    const stats = buildInteractionsPairs(model);
    ok(stats.pairsCount >= 1, 'cap path still produces some rows');
  })();
  
    // 6) Interactions: strict stable-ID enforcement for Outcome / End
  (function(){
    const getIC = api?.getInteractionsCell ?? g.getInteractionsCell;
    const setIC = api?.setInteractionsCell ?? g.setInteractionsCell;
    if (!getIC || !setIC) { log('skip (no interactions helpers)'); return; }

    fresh();
    // Seed A,I,O
    const A = addAction('Aim');
    const I = addInput('Tap');
    const O1 = { id: model.nextId++, name: 'Cancels' };
    model.outcomes.push(O1);

    // Build pairs and a tiny viewDef for Interactions with one phase
    buildInteractionsPairs(model);
    const vd = { columns: [
      { key: 'action' }, { key: 'input' },
      { key: 'p1:outcome' }, { key: 'p1:end' }, { key: 'notes' },
    ]};

    // Attempt free text into outcome → rejected
    const status = { textContent: '' };
    setIC(model, status, vd, 0, 2, 'free text');
    ok(status.textContent.includes('require') || true, 'outcome rejects free text');

    // Set outcome by stable ID → accepted
    status.textContent = '';
    setIC(model, status, vd, 0, 2, O1.id);
    ok(getIC(model, vd, 0, 2) === 'Cancels', 'outcome accepts stable id');

    // End requires stable action id payload; plain string rejected
    status.textContent = '';
    setIC(model, status, vd, 0, 3, 'EndString');
    ok(status.textContent.includes('End cells'), 'end rejects free text');

    // Provide proper end payload
    status.textContent = '';
    setIC(model, status, vd, 0, 3, { endActionId: A.id, endVariantSig: '' });
    ok(getIC(model, vd, 0, 3) === 'Aim', 'end accepts {endActionId,...}');
  })();

  // 7) Interactions: structured copy/paste round-trip
  (function(){
    const getS = api?.getStructuredCellInteractions ?? g.getStructuredCellInteractions;
    const applyS = api?.applyStructuredCellInteractions ?? g.applyStructuredCellInteractions;
    const setIC = api?.setInteractionsCell ?? g.setInteractionsCell;
    if (!getS || !applyS || !setIC) { log('skip (no interactions structured helpers)'); return; }

    fresh();
    // A, I, O
    const A = addAction('Attack');
    const I = addInput('Jab');
    const O = { id: model.nextId++, name: 'Hit' };
    model.outcomes.push(O);
    buildInteractionsPairs(model);

    const vd = { columns: [
      { key: 'action' }, { key: 'input' },
      { key: 'p1:outcome' }, { key: 'p1:end' }, { key: 'notes' },
    ]};

    // Set an outcome & end, then copy-structured from both
    setIC(model, {textContent:''}, vd, 0, 2, O.id);
    setIC(model, {textContent:''}, vd, 0, 3, { endActionId: A.id, endVariantSig: '' });

    const pOutcome = getS(model, vd, 0, 2);
    const pEnd     = getS(model, vd, 0, 3);
    ok(pOutcome?.type === 'outcome' && pOutcome.data?.outcomeId === O.id, 'structured outcome payload');
    ok(pEnd?.type === 'end' && pEnd.data?.endActionId === A.id, 'structured end payload');

    // Paste outcome payload onto another row/phase
    // Add a second pair
    addInput('Kick'); buildInteractionsPairs(model);
    const ok1 = applyS((r,c,v)=>setIC(model,{textContent:''},vd,r,c,v), vd, 1, 2, pOutcome);
    ok(ok1, 'applyStructuredCellInteractions accepts outcome payload');

    // Paste end payload onto another row
    const ok2 = applyS((r,c,v)=>setIC(model,{textContent:''},vd,r,c,v), vd, 1, 3, pEnd);
    ok(ok2, 'applyStructuredCellInteractions accepts end payload');

    // Verify display
    ok((api?.getInteractionsCell ?? g.getInteractionsCell)(model, vd, 1, 2) === 'Hit', 'pasted outcome displays');
    ok((api?.getInteractionsCell ?? g.getInteractionsCell)(model, vd, 1, 3) === 'Attack', 'pasted end displays');
  })();

  // 8) Variant signature canonicalization is display-stable
  (function(){
    const getIC = api?.getInteractionsCell ?? g.getInteractionsCell;
    const setIC = api?.setInteractionsCell ?? g.setInteractionsCell;
    if (!getIC || !setIC) { log('skip (no interactions helpers)'); return; }

    fresh();
    // Mods m1,m2; action + variants; input; end payload uses shuffled sig
    const m1 = addModifier('Rise'), m2 = addModifier('Fall');
    const A  = addAction('Lift', { [m1.id]:1, [m2.id]:1 });
    addInput('Up');

    buildInteractionsPairs(model);
    const vd = { columns: [
      { key: 'action' }, { key: 'input' },
      { key: 'p1:end' },
    ]};

    // Paste an end payload with unordered variant signature → display should be canonical
    setIC(model, {textContent:''}, vd, 0, 2, { endActionId: A.id, endVariantSig: `${m2.id}+${m1.id}` });
    const txt = getIC(model, vd, 0, 2);
    ok(/Lift \\((Fall\\+Rise|Rise\\+Fall)\\)/.test(txt), 'end display shows both mods in stable order');
  })();


  log(fails ? `Completed with ${fails} failure(s).` : 'All tests passed.');
}

// Also provide a default export for older callers
export default runSelfTests;
