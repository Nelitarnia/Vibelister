# Proposed folder structure for Vibelister

This document outlines a maintainable directory layout tailored to the current codebase. It groups files by their primary responsibility so that navigation stays intuitive as the project grows.

## High-level layout

```
/
├── docs/
│   └── folder-structure.md
├── public/
│   ├── index.html
│   └── style.css
├── scripts/
│   ├── app/
│   │   ├── app.js
│   │   ├── clipboard-codec.js
│   │   ├── interactions.js
│   │   ├── outcomes.js
│   │   ├── selection.js
│   │   ├── types.js
│   │   └── views.js
│   ├── data/
│   │   ├── column-kinds.js
│   │   ├── constants.js
│   │   ├── fs.js
│   │   ├── variants/
│   │   │   └── variants.js
│   │   └── utils.js
│   ├── ui/
│   │   ├── color-picker.js
│   │   ├── drag.js
│   │   ├── grid-keys.js
│   │   ├── grid-mouse.js
│   │   ├── menus.js
│   │   ├── palette.js
│   │   ├── rules.js
│   │   └── status.js
│   └── support/
│       └── tests/
│           ├── specs/
│           │   ├── assertions.js
│           │   ├── interactions.js
│           │   ├── model-fixtures.js
│           │   ├── model-variants.js
│           │   └── ui-grid-mouse.js
│           ├── tests-ui.js
│           └── tests.js
├── tests/
│   └── node.test.js
├── README.md
├── package.json
├── run.bat
└── prettierrc.json
```

## Folder breakdown

### `docs/`

- Centralize developer-facing documentation so guidance, architectural notes, and ADRs have a consistent home.
- Start with this folder-structure proposal and move existing planning notes here as they expand.

### `public/`

- Hold static assets served directly to the browser.
- Place `index.html` and `style.css` here; add images, fonts, or icons later.
- If you adopt a bundler, point it at this directory for easy deployment.

### `scripts/`

- Collect all JavaScript source files under a single root so tooling can target the directory easily (linting, bundling, tests).
- Subdivide by responsibility, keeping related modules close together.

#### `scripts/app/`

- House entry points and cross-cutting application logic.
- `app.js` stays the primary bootstrap file, while `interactions.js`, `outcomes.js`, `selection.js`, `types.js`, and `views.js` remain close by.
- `clipboard-codec.js` lives here because it bridges app state with external data.

#### `scripts/data/`

- Group modules that define data shapes, constants, and persistence helpers.
- `variants.js` merits its own subfolder (`variants/`) because it describes sizable domain data; additional variant files can join it without clutter.
- Keep utility helpers (`utils.js`) and structural descriptors (`column-kinds.js`, `constants.js`, `fs.js`) nearby.

#### `scripts/ui/`

- Concentrate modules that manage user interactions and visual behavior: drag handling, keyboard/mouse input, menu and palette logic, and rule rendering.
- This clustering clarifies which code is safe to adjust when tweaking UI without touching data logic.

#### `scripts/support/`

- Offer a home for cross-cutting helpers that are not part of the runtime app bundle, such as lightweight test harnesses.
- The `tests/` subtree now keeps reusable spec modules (`specs/`) separate from browser runners (`tests.js`, `tests-ui.js`), ensuring Node and in-app harnesses share the same assertions and fixtures.
- If automated tooling (lint configs, coverage scripts) grows, place small utilities here or alongside them.

### `tests/`

- Node's built-in test runner (`node --test`) looks here for CLI-driven specs; `node.test.js` wires the shared suites into the command line workflow.
- Additional CLI-focused helpers (fixtures, mocks) can live alongside the entrypoint as they evolve.

### Root files

- `package.json` enables the automated test script (`npm test`) and flags the project as an ES module environment.
- `prettierrc.json` carries formatting conventions; use the provided scripts (`run.bat`, `format.bat`) as convenience wrappers when working on Windows.
- `README.md` continues to document the project overview, setup steps, and known gaps.

## Transition tips

- Move files incrementally, updating import paths in small batches to keep diffs manageable.
- Add `index.js` aggregators only if they reduce import noise; otherwise rely on explicit paths for clarity.
- Update `README.md` once you begin the migration so new contributors know where to look.
- Consider introducing a build step (e.g., Vite, Parcel) after reorganizing so bundling respects the new structure.

Adopting this layout keeps domain, UI, and support code clearly separated while remaining flexible for future expansion.
