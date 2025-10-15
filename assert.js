// assert.js - a short list of debug message templates to use with test suites.
let FAILS = 0, SECTIONS = 0;
export const section = (name) => (console.groupCollapsed(`%c${++SECTIONS}. ${name}`, "font-weight:bold"), () => console.groupEnd());
export const ok  = (cond, msg) => { if (!cond) { FAILS++; console.error('✗', msg); } else console.log('✓', msg); };
export const eq  = (a,b,msg) => ok(Object.is(a,b), msg ?? `eq: ${a} === ${b}`);
export const deepEq = (a,b,msg) => ok(JSON.stringify(a)===JSON.stringify(b), msg ?? 'deepEq');
export const throws = (fn,msg) => { let t=false; try{fn()}catch{t=true} ok(t, msg ?? 'throws'); };
export const done = () => { if (FAILS) throw new Error(`[tests] ${FAILS} failure(s)`); console.log('%cAll tests passed.','color:green'); };
