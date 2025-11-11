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
│   │   ├── column-widths.js
│   │   ├── comment-events.js
│   │   ├── comments.js
│   │   ├── diagnostics.js
│   │   ├── editing-shortcuts.js
│   │   ├── grid-commands.js
│   │   ├── grid-renderer.js
│   │   ├── history.js
│   │   ├── interactions.js
│   │   ├── interactions-data.js
│   │   ├── outcomes.js
│   │   ├── persistence.js
│   │   ├── project-info-controller.js
│   │   ├── selection.js
│   │   ├── settings-controller.js
│   │   ├── types.js
│   │   ├── user-settings.js
│   │   ├── view-state.js
│   │   └── views.js
│   ├── data/
│   │   ├── color-utils.js
│   │   ├── comment-colors.js
│   │   ├── comments.js
│   │   ├── column-kinds.js
│   │   ├── constants.js
│   │   ├── mod-state.js
│   │   ├── deletion.js
│   │   ├── fs.js
│   │   ├── mutation-runner.js
│   │   ├── rows.js
│   │   ├── utils.js
│   │   └── variants/
│   │       └── variants.js
│   ├── support/
│   │   └── tests/
│   │       ├── specs/
│   │       │   ├── assertions.js
│   │       │   ├── clipboard.js
│   │       │   ├── column-resize.js
│   │       │   ├── column-kinds.js
│   │       │   ├── comments.js
│   │       │   ├── deletion.js
│   │       │   ├── grid-keys.js
│   │       │   ├── interactions.js
│   │       │   ├── mod-state.js
│   │       │   ├── model-fixtures.js
│   │       │   ├── model-snapshot.js
│   │       │   ├── model-variants.js
│   │       │   ├── persistence.js
│   │       │   ├── rows.js
│   │       │   ├── selection.js
│   │       │   ├── ui-grid-mouse.js
│   │       │   ├── ui-row-drag.js
│   │       │   └── undo.js
│   │       ├── tests-ui.js
│   │       └── tests.js
│   └── ui/
│       ├── color-picker.js
│       ├── column-resize.js
│       ├── drag.js
│       ├── comments.js
│       ├── grid-keys.js
│       ├── grid-mouse.js
│       ├── interactions-outline.js
│       ├── menus.js
│       ├── palette.js
│       ├── project-info.js
│       ├── rules.js
│       ├── settings.js
│       └── status.js
├── tests/
│   └── node.test.js
├── agents.md
├── format.bat
├── LICENSE
├── README.md
├── package.json
├── prettierrc.json
└── run.bat
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
- `history.js` wraps undo/redo wiring so the entry point just injects dependencies and consumes the resulting API.
- `editing-shortcuts.js` centralizes editing state, keyboard shortcuts, and palette-aware focus management so `app.js` only wires the controller into grid and palette initializers.
- `grid-commands.js` groups selection-aware grid mutations (row insertion, clearing, modifier toggles) so `app.js` can share a single command surface across menus, keyboard shortcuts, and palettes.
- `grid-renderer.js` owns grid layout, pooled cell rendering, and color resolution so the entry file simply requests reflows and scroll adjustments.
- `comments.js` exposes undo-friendly helpers for reading and mutating the normalized comment store so the rest of the app can work with stable row IDs and column keys.
- `comment-events.js` centralizes the DOM event dispatch for comment mutations so grid commands and other controllers can signal UI refreshes without duplicating `CustomEvent` wiring.
- `interactions-data.js` maintains the derived interaction metadata catalog so UI code can synthesize on-demand interaction pairs without keeping a large in-memory array.
- `interaction-tags.js` provides undo-friendly helpers for renaming and deleting interaction tags across the notes map so UI controllers can reuse consistent mutation wiring.
- `tag-events.js` centralizes the DOM event dispatch for interaction tag mutations so sidebar controllers can refresh in response to grid or bulk edits without duplicating `CustomEvent` wiring.
- `column-widths.js` captures default widths for each view, clones override metadata, and exposes helpers so state controllers can merge persisted sizing without bloating callers.
- `diagnostics.js` lazily loads the in-app self-tests so diagnostics can run without keeping the heavy harness in the main bundle.
- `persistence.js` encapsulates project lifecycle actions (new/open/save), migrations, and seeding so `app.js` wires those flows without holding their implementation details.
- `project-info-controller.js` manages the modal lifecycle and persistence handshake for project notes so the bootstrap sequence only needs to expose the entry point to menus.
- `settings-controller.js` owns user preference hydration, disk import/export, and dialog wiring so the bootstrap file only initializes it and exposes the entry point to menus.
- `user-settings.js` defines the persisted defaults, schema metadata, and sanitizers for color preferences so both the controller and UI can trust incoming payloads.
- `view-state.js` owns per-view selection snapshots and cached column layouts so `app.js` only orchestrates switching and rendering logic.

#### `scripts/data/`

- Group modules that define data shapes, constants, and persistence helpers.
- `mutation-runner.js` centralizes layout/render/derived rebuild side effects for core model mutations, exposes a transaction helper so multi-step edits fire those hooks only once, and provides a canonical snapshot utility for history features.
- `rows.js` centralizes helpers for creating and inserting blank rows so both the app and tests reuse the same logic.
- `variants.js` merits its own subfolder (`variants/`) because it describes sizable domain data; additional variant files can join it without clutter.
- `deletion.js` scrubs modifier groups and constraints after rows are removed so downstream consumers never see dangling references.
- `mod-state.js` centralizes the modifier-state descriptor (IDs, glyphs, parsing tokens) so column kinds, palette UI, persistence, and tests reuse the same definitions.
- Keep utility helpers (`utils.js`) and structural descriptors (`column-kinds.js`, `constants.js`, `fs.js`) nearby.
- `color-utils.js` offers shared normalization and contrast helpers so rendering modules and pickers reuse consistent color logic.
- `comment-colors.js` centralizes the curated preset palette for comment badges and selectors, exposing helpers so UI code stays
  in sync with the available options.
- `comments.js` composes stable identifiers for per-row, per-view comment buckets and normalizes persisted maps so app state and
  migrations share the same helpers.

#### `scripts/ui/`

- Concentrate modules that manage user interactions and visual behavior: drag handling, keyboard/mouse input, menu and palette logic, and rule rendering.
- This clustering clarifies which code is safe to adjust when tweaking UI without touching data logic.
- `column-resize.js` binds resize handles in the grid header to pointer gestures, persisting per-column width overrides and coordinating layout rerenders.
- `side-panel.js` manages the shared right-hand sidebar host so comments and tags can register panes and share toggles without conflicting state.
- `tags.js` drives the interaction tag sidebar UI, coordinating host toggles, list rendering, and bulk rename/delete actions through the shared tag manager.
- `settings.js` renders the modal for customizing palette colors and keeps the dialog in sync with the sanitized `user-settings` payloads.
- `project-info.js` renders the project notes dialog, providing a textarea host and dispatching change events so controllers can persist updates without duplicating DOM wiring.

#### `scripts/support/`

- Offer a home for cross-cutting helpers that are not part of the runtime app bundle, such as lightweight test harnesses.
- The `tests/` subtree now keeps reusable spec modules (`specs/`) separate from browser runners (`tests.js`, `tests-ui.js`), ensuring Node and in-app harnesses share the same assertions and fixtures.
- `specs/comments.js` exercises serialization and persistence paths for the comment map helpers so both Node and browser runners can reuse the shared expectations.
- If automated tooling (lint configs, coverage scripts) grows, place small utilities here or alongside them.

### `tests/`

- Node's built-in test runner (`node --test`) looks here for CLI-driven specs; `node.test.js` wires the shared suites into the command line workflow.
- Additional CLI-focused helpers (fixtures, mocks) can live alongside the entrypoint as they evolve.

### Root files

- `agents.md` captures repository-specific contribution guidelines—skim it before adjusting tooling or adding new modules.
- `package.json` enables the automated test script (`npm test`) and flags the project as an ES module environment.
- `prettierrc.json` carries formatting conventions enforced by automated tooling.
- `format.bat` provides a Windows-friendly wrapper around the Prettier formatter so contributors can quickly normalize style.
- `run.bat` launches a lightweight static server and opens the current build in a browser for manual testing on Windows.
- `README.md` continues to document the project overview, setup steps, and known gaps.
- `LICENSE` records the MIT terms that govern redistribution.

## Transition tips

- Move files incrementally, updating import paths in small batches to keep diffs manageable.
- Add `index.js` aggregators only if they reduce import noise; otherwise rely on explicit paths for clarity.
- Update `README.md` once you begin the migration so new contributors know where to look.
- Consider introducing a build step (e.g., Vite, Parcel) after reorganizing so bundling respects the new structure.

Adopting this layout keeps domain, UI, and support code clearly separated while remaining flexible for future expansion.
