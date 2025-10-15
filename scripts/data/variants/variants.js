// variants.js - variant engine which generates the list of Actions with modifiers.
// Self-contained: no imports; operates on provided model via function args

// helpers for ordering
export function modOrderMap(model){
  const map={};
  const mods = (model && Array.isArray(model.modifiers)) ? model.modifiers : [];
  mods.forEach((m,idx)=>{ if(m && typeof m.id==='number') map[m.id]=idx; });
  return map;
}
export function sortIdsByUserOrder(ids, model){
  const ord=modOrderMap(model);
  return ids.slice().sort((a,b)=>((ord[a]??1e9)-(ord[b]??1e9))||(a-b));
}
export function compareVariantSig(a,b, model){
  if(a===b) return 0;
  const A=a?a.split('+').map(Number):[];
  const B=b?b.split('+').map(Number):[];
  if(A.length!==B.length) return A.length-B.length;
  const As=sortIdsByUserOrder(A,model), Bs=sortIdsByUserOrder(B,model);
  const ord = modOrderMap(model); // safe even if model undefined
  for(let i=0;i<As.length;i++){
    const da=((ord[As[i]]??1e9)), db=((ord[Bs[i]]??1e9));
    if(da!==db) return da-db;
    if(As[i]!==Bs[i]) return As[i]-Bs[i];
  }
  return 0;
}

// Treat raw modSet values as tri-state: 0=OFF, 1=ON, 2=BYPASS
function modStateIsOn(v)        { return ((v|0) === 1); }   // only ON participates in generation
function modStateActiveish(v)   { return ((v|0) >= 1); }    // ON or BYPASS counts as "marked"

// canonical signature for storage
function variantSignature(ids){
  if(!ids||!ids.length) return '';
  const a=Array.from(new Set(ids.map(Number))).filter(Number.isFinite).sort((x,y)=>x-y);
  return a.join('+');
}

// group modes
export const GROUP_MODES = { EXACT:'EXACT', AT_LEAST:'AT_LEAST', AT_MOST:'AT_MOST', RANGE:'RANGE' };

// canonical signature normalizer for strings (e.g., '5+1+5' -> '1+5')
export function canonicalSig(sig){
  if (!sig) return '';
  const arr = String(sig).split('+').map(Number).filter(Number.isFinite);
  arr.sort((a,b)=>a-b);
  // dedupe
  const out=[]; let prev;
  for(const x of arr){ if(x!==prev){ out.push(x); prev=x; } }
  return out.join('+');
}

const CAP_PER_ACTION   = 5000;  // total variants per action (early stop)
const MAX_GROUP_COMBOS = 50000; // safety cap for a *single group's* choice list

function kCombos(a,k){
  const out=[],n=a.length;
  if(k<0||k>n) return out;
  if(k===0){ out.push([]); return out }
  const idx=Array.from({length:k},(_,i)=>i);
  out.push(idx.map(i=>a[i]));
  while(true){
    let p=k-1;
    while(p>=0 && idx[p]===p+n-k) p--;
    if(p<0) break;
    idx[p]++;
    for(let i=p+1;i<k;i++) idx[i]=idx[i-1]+1;
    out.push(idx.map(i=>a[i]));
  }
  return out;
}

function rangeCombos(a,min,max){
  const out=[];
  const hi=Math.min(a.length,max);
  const lo=Math.max(0,min);
  for(let k=lo;k<=hi;k++){
    const ks=kCombos(a,k);
    for(let i=0;i<ks.length;i++){
      out.push(ks[i]);
      if(out.length>=MAX_GROUP_COMBOS) return out; // early cut to avoid huge lists
    }
  }
  return out;
}

function groupCombos(g,elig){
  const m=elig.filter(id=>g.memberIds.includes(id));
  const mode=g.mode||GROUP_MODES.EXACT, req=!!g.required;
  let ch=[];
  if(mode===GROUP_MODES.EXACT)      ch=kCombos(m, g.k??0);
  else if(mode===GROUP_MODES.AT_LEAST) ch=rangeCombos(m, g.k??0, m.length);
  else if(mode===GROUP_MODES.AT_MOST)  ch=rangeCombos(m, 0, g.k??0);
  else if(mode===GROUP_MODES.RANGE)    ch=rangeCombos(m, g.kMin??0, g.kMax??m.length);

  // optional-empty for non-required groups
  if(!req && !ch.some(a=>a.length===0)) ch.unshift([]);
  if(req && ch.length===0) return [];
  return ch;
}

function buildConstraintMaps(cs){
  const req=new Map(), forb=new Map(), mut=new Set();
  for(const c of cs||[]){
    if(c.type==='REQUIRES'){
      if(!req.has(c.a)) req.set(c.a,new Set());
      req.get(c.a).add(c.b);
    } else if(c.type==='FORBIDS'){
      if(!forb.has(c.a)) forb.set(c.a,new Set());
      forb.get(c.a).add(c.b);
    } else if(c.type==='MUTEX' && Array.isArray(c.ids)){
      for(let i=0;i<c.ids.length;i++)
        for(let j=i+1;j<c.ids.length;j++){
          const a=c.ids[i], b=c.ids[j], k=a<b?`${a}|${b}`:`${b}|${a}`;
          mut.add(k);
        }
    }
  }
  return { req, forb, mut };
}
function violatesConstraints(setArr,maps){
  const s=new Set(setArr), a=[...s];
  for(let i=0;i<a.length;i++)
    for(let j=i+1;j<a.length;j++){
      const x=a[i], y=a[j], k=x<y?`${x}|${y}`:`${y}|${x}`;
      if(maps.mut.has(k)) return true;
    }
  for(const x of s){
    const fb=maps.forb.get(x);
    if(fb) for(const y of fb) if(s.has(y)) return true;
    const rq=maps.req.get(x);
    if(rq) for(const y of rq) if(!s.has(y)) return true;
  }
  return false;
}

function computeVariantsForAction(action,model){
  const set = action.modSet || {};
  const elig = Object.keys(set).map(Number).filter(id => modStateIsOn(set[id]));
  if(!elig.length) return [''];
  const groups=(model.modifierGroups||[]).map(g=>({
    id:g.id,name:g.name, memberIds:(g.memberIds||[]).slice(),
    mode:g.mode, k:g.k, kMin:g.kMin, kMax:g.kMax, required:!!g.required
  }));
  if(!groups.length) return [''];

  const choices=[];
  for(const g of groups){
    const ch=groupCombos(g,elig);
    if(g.required && ch.length===0) return [];
    choices.push(ch);
  }
  choices.sort((a,b)=>a.length-b.length);

  const maps=buildConstraintMaps(model.modifierConstraints);
  const res=[];
  (function rec(i,acc){
    if(res.length>=CAP_PER_ACTION) return;               // hard stop
    if(i===choices.length){ res.push(variantSignature(acc)); return }
    const list=choices[i];
    for(let idx=0; idx<list.length; idx++){
      const ch=list[idx];
      const next=acc.concat(ch);
      if(!violatesConstraints(next,maps)){
        rec(i+1,next);
        if(res.length>=CAP_PER_ACTION) return;
      }
    }
  })(0,[]);

  // Deduplicate identical signatures (e.g., overlapping groups choosing the same modifier)
  const uniq = Array.from(new Set(res));
  uniq.sort((a,b)=>compareVariantSig(a,b,model));
  return uniq.length ? uniq : [''];
}

export function buildInteractionsPairs(model){
  const actions = (model.actions||[]).filter(a => (a && (a.name||'').trim().length));
  const inputs  = (model.inputs ||[]).filter(i => (i && (i.name||'').trim().length));
  const useG    = (model.modifierGroups && model.modifierGroups.length>0);
  const pairs   = [];
  let capped=false, cappedActions=0;
  const mode = (model.meta && model.meta.interactionsMode) || 'AI';

  if (mode === 'AA') {
    // Actions × Actions (with variants on BOTH sides)
    for (const a of actions){
      let varsA = useG ? computeVariantsForAction(a, model) : [''];
      if (varsA.length > CAP_PER_ACTION){ varsA = varsA.slice(0, CAP_PER_ACTION); capped=true; cappedActions++; }
      for (const sigA of varsA){
        for (const b of actions){
          let varsB = useG ? computeVariantsForAction(b, model) : [''];
          // We do not increment cappedActions for B; keep semantics per-left-action
          if (varsB.length > CAP_PER_ACTION) varsB = varsB.slice(0, CAP_PER_ACTION);
          for (const sigB of varsB){
            pairs.push({ aId:a.id, rhsActionId:b.id, variantSig:sigA, rhsVariantSig:sigB, kind:'AA' });
          }
        }
      }
    }
    model.interactionsPairs = pairs;
    return { actionsCount: actions.length, inputsCount: actions.length, pairsCount: pairs.length, capped, cappedActions };
  }  // Default: Actions × Inputs
  for(const a of actions){
    let vars = useG ? computeVariantsForAction(a, model) : [''];
    if(vars.length > CAP_PER_ACTION){ vars = vars.slice(0, CAP_PER_ACTION); capped=true; cappedActions++; }
    for(const sig of vars){
      for(const i of inputs) pairs.push({ aId:a.id, iId:i.id, variantSig:sig, kind:'AI' });
    }
  }
  model.interactionsPairs = pairs;
  return { actionsCount:actions.length, inputsCount:inputs.length, pairsCount:pairs.length, capped, cappedActions };
}
