# Variant generation micro-benchmark

`node scripts/data/variants/variants-benchmark.js` stress-tests variant generation by
building interactions for dozens of actions and modifiers in a tight loop. It is
useful for watching how often constraint maps are allocated while rendering many
actions.

Example output after caching constraint maps during variant generation:

```
$ node scripts/data/variants/variants-benchmark.js
┌───────────────┬────────────┐
│ (index)       │ Values     │
├───────────────┼────────────┤
│ actionCount   │ 60         │
│ modifierCount │ 14         │
│ iterations    │ 50         │
│ pairs         │ 216000     │
│ elapsedMs     │ 440.975585 │
│ heapDelta     │ 7973136    │
└───────────────┴────────────┘
```

Comparing the `heapDelta` or allocating profiles here against previous builds
shows the reduced churn from sharing frozen constraint maps across actions.
