# Variant generation micro-benchmark

`node scripts/data/variants/variants-benchmark.js` stress-tests variant
generation by building interactions for dozens of actions and modifiers in a
tight loop and by repeatedly materializing dense variant sets for a single
action. It is useful for watching how often constraint maps are allocated while
rendering many actions and how much CPU is spent deduping large variant lists.

Example output after caching constraint maps during variant generation and
storing variant signatures directly during collection:

```
$ node scripts/data/variants/variants-benchmark.js
┌─────────┬─────────────────┬─────────────┬───────────────┬────────────┬────────┬─────────────┬───────────┬────────┬───────────┬────────────────┐
│ (index) │ benchmark       │ actionCount │ modifierCount │ iterations │ pairs  │ elapsedMs   │ heapDelta │ groups │ groupSize │ variantsPerRun │
├─────────┼─────────────────┼─────────────┼───────────────┼────────────┼────────┼─────────────┼───────────┼────────┼───────────┼────────────────┤
│ 0       │ 'interactions'  │ 60          │ 14            │ 50         │ 216000 │ 491.373841  │ 10081344  │        │           │                │
│ 1       │ 'denseVariants' │             │               │ 150        │        │ 9903.997293 │           │ 3      │ 6         │ 5000           │
└─────────┴─────────────────┴─────────────┴───────────────┴────────────┴────────┴─────────────┴───────────┴────────┴───────────┴────────────────┘
```

The `denseVariants` row repeatedly generates capped variant sets for one action
whose modifier groups allow thousands of combinations. Comparing its
`elapsedMs` to previous runs highlights CPU savings from avoiding repeated
signature normalization during generation.
