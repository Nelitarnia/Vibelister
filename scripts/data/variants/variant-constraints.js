// variant-constraints.js - helpers for enforcing modifier constraints

function freezeMapOfSets(input) {
  const frozen = new Map();
  for (const [key, set] of input.entries()) {
    frozen.set(key, Object.freeze(new Set(set)));
  }
  return Object.freeze(frozen);
}

export function buildConstraintMaps(cs) {
  const req = new Map(),
    forb = new Map(),
    mut = new Set();
  for (const c of cs || []) {
    if (c.type === "REQUIRES") {
      if (!req.has(c.a)) req.set(c.a, new Set());
      req.get(c.a).add(c.b);
    } else if (c.type === "FORBIDS") {
      if (!forb.has(c.a)) forb.set(c.a, new Set());
      forb.get(c.a).add(c.b);
    } else if (c.type === "MUTEX" && Array.isArray(c.ids)) {
      for (let i = 0; i < c.ids.length; i++)
        for (let j = i + 1; j < c.ids.length; j++) {
          const a = c.ids[i],
            b = c.ids[j],
            k = a < b ? `${a}|${b}` : `${b}|${a}`;
          mut.add(k);
        }
    }
  }
  return Object.freeze({
    req: freezeMapOfSets(req),
    forb: freezeMapOfSets(forb),
    mut: Object.freeze(new Set(mut)),
  });
}

export function violatesConstraints(setArr, maps) {
  const s = new Set(setArr),
    a = [...s];
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j < a.length; j++) {
      const x = a[i],
        y = a[j],
        k = x < y ? `${x}|${y}` : `${y}|${x}`;
      if (maps.mut.has(k)) return true;
    }
  for (const x of s) {
    const fb = maps.forb.get(x);
    if (fb) for (const y of fb) if (s.has(y)) return true;
    const rq = maps.req.get(x);
    if (rq) for (const y of rq) if (!s.has(y)) return true;
  }
  return false;
}
