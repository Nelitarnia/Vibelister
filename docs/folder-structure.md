# Proposed folder structure for Vibelister

This document outlines a maintainable directory layout tailored to the current codebase. It groups files by their primary responsibility so that navigation stays intuitive as the project grows.

## High-level layout

```
/
├── docs/
│   ├── folder-structure.md
│   └── variants-benchmark.md
├── public/
│   ├── index.html
│   └── style.css
├── scripts/
│   ├── dev-server.js
│   ├── build-entry.js
│   ├── app/
│   │   ├── main.js
│   │   ├── app.js
│   │   ├── app-root.js
│   │   ├── bootstrap-editing-and-persistence.js
│   │   ├── bootstrap-grid-runtime.js
│   │   ├── bootstrap-interactions-and-lifecycle.js
│   │   ├── bootstrap-shell.js
│   │   ├── clipboard-codec.js
│   │   ├── cleanup-controller.js
│   │   ├── column-widths.js
│   │   ├── comment-events.js
│   │   ├── comments.js
│   │   ├── event-dispatcher.js
│   │   ├── diagnostics.js
│   │   ├── editing-shortcuts.js
│   │   ├── grid-commands.js
│   │   ├── grid-cells.js
│   │   ├── grid-renderer.js
│   │   ├── grid-runtime-coordinator.js
│   │   ├── history.js
│   │   ├── inference-application.js
│   │   ├── inference-controller.js
│   │   ├── inference-heuristics.js
│   │   ├── inference-index-access.js
│   │   ├── inference-targets.js
│   │   ├── inference-profiles.js
│   │   ├── inference-utils.js
│   │   ├── inference-strategies/
│   │   │   └── property-strategy.js
│   │   ├── interaction-bulk-actions.js
│   │   ├── interaction-maintenance.js
│   │   ├── interaction-tags.js
│   │   ├── interactions-data.js
│   │   ├── interactions.js
│   │   ├── outcomes.js
│   │   ├── persistence.js
│   │   ├── menus-bootstrap.js
│   │   ├── setup-dialogs.js
│   │   ├── setup-editing.js
│   │   ├── setup-view-state.js
│   │   ├── setup-renderer.js
│   │   ├── setup-history.js
│   │   ├── setup-grid-commands.js
│   │   ├── setup-input-handlers.js
│   │   ├── setup-interaction-tools.js
│   │   ├── setup-chrome.js
│   │   ├── setup-palette.js
│   │   ├── setup-persistence.js
│   │   ├── project-info-controller.js
│   │   ├── selection.js
│   │   ├── schedule-render.js
│   │   ├── settings-controller.js
│   │   ├── shell-coordinator.js
│   │   ├── sidebar-bootstrap.js
│   │   ├── tabs-bootstrap.js
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
│   │   ├── properties.js
│   │   ├── deletion.js
│   │   ├── fs.js
│   │   ├── mutation-runner.js
│   │   ├── rows.js
│   │   ├── utils.js
│   │   └── variants/
│   │       ├── mod-state-normalize.js
│   │       ├── variant-combinatorics.js
│   │       ├── variant-constraints.js
│   │       ├── variant-settings.js
│   │       ├── interactions-index-cache.js
│   │       ├── variants-benchmark.js
│   │       └── variants.js
│   ├── support/
│   │   └── tests/
│   │       ├── specs/
│   │       │   ├── app-harness.js
│   │       │   ├── app-coordinators.js
│   │       │   ├── app-init.js
│   │       │   ├── assertions.js
│   │       │   ├── cleanup.js
│   │       │   ├── clipboard.js
│   │       │   ├── data-version.js
│   │       │   ├── column-resize.js
│   │       │   ├── column-kinds.js
│   │       │   ├── comments.js
│   │       │   ├── deletion.js
│   │       │   ├── grid-keys.js
│   │       │   ├── inference-utils.js
│   │       │   ├── inference-index-access.js
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
│       ├── interaction-tools.js
│       ├── menus.js
│       ├── palette.js
│       ├── project-info.js
│       ├── cleanup-dialog.js
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
- `variants-benchmark.md` records the micro-benchmark harness for interaction variant generation along with usage notes and sample output to track allocation changes over time.

### `public/`

- Hold static assets served directly to the browser.
- Place `index.html` and `style.css` here; add images, fonts, or icons later.
- If you adopt a bundler, point it at this directory for easy deployment.

### `scripts/`

- Collect all JavaScript source files under a single root so tooling can target the directory easily (linting, bundling, tests).
- Subdivide by responsibility, keeping related modules close together.

- `dev-server.js` spins up the lightweight Node-based static server used by `npm start` to serve the `public/` directory during development.
- `build-entry.js` bundles and minifies the browser entry module with esbuild so production builds can consume a single optimized asset.

#### `scripts/app/`

- House entry points and cross-cutting application logic.
- `main.js` is the top-level browser entry imported by `public/index.html`; it loads `createApp` from the main bootstrap and invokes `init()` without exporting additional symbols.
- `app.js` stays the primary bootstrap file, while `interactions.js`, `outcomes.js`, `selection.js`, `types.js`, and `views.js` remain close by.
- `dom-elements.js` centralizes DOM lookups so bootstrap wiring can share a consistent set of handles.
- `menus-bootstrap.js`, `sidebar-bootstrap.js`, and `tabs-bootstrap.js` resolve only the DOM nodes required by menus, sidebars, and tabs so the entry file can pass focused handles into their controllers.
- `app-root.js` builds the root application context (model, shared UI handles, lifecycle helpers) so `app.js` can bootstrap via a single factory instead of coordinating module-level globals.
- `bootstrap-editing-and-persistence.js` combines editing, palette, persistence, and diagnostics wiring behind a single entry point so the main bootstrapper can compose the shared context without mutating module state directly.
- `bootstrap-grid-runtime.js` assembles the grid renderer, interaction tools, history wiring, grid commands, and dialog setup into a single factory that returns focused render/layout, selection, mutation, and dialog facades for the app bootstrapper.
- `bootstrap-interactions-and-lifecycle.js` wires input handlers, sidebar controllers, menus, and lifecycle hooks so `app.js` can delegate the final orchestration pass to one module instead of juggling teardown/init responsibilities itself.
- `bootstrap-shell.js` resolves DOM handles, status bar wiring, view state initialization, and shell lifecycle hooks so the main bootstrapper consumes a compact descriptor instead of orchestrating each setup step manually.
- `clipboard-codec.js` lives here because it bridges app state with external data.
- `history.js` wraps undo/redo wiring so the entry point just injects dependencies and consumes the resulting API.
- `model-init.js` builds the initial app model, view state, and history surface so the entry point only wires dependencies.
- `editing-shortcuts.js` centralizes editing state, keyboard shortcuts, and palette-aware focus management so `app.js` only wires the controller into grid and palette initializers.
- `grid-commands.js` groups selection-aware grid mutations (row insertion, clearing, modifier toggles) so `app.js` can share a single command surface across menus, keyboard shortcuts, and palettes.
- `grid-cells.js` encapsulates cell lookups, mutations, and structured clipboard helpers behind a dependency-injected factory so the grid can read/write values and comments without coupling to global state.
- `grid-renderer.js` owns grid layout, pooled cell rendering, and color resolution so the entry file simply requests reflows and scroll adjustments.
- `grid-runtime-coordinator.js` composes grid cell helpers, modifiers metadata, selection APIs, and runtime wiring so the entry point can bootstrap the grid with one injected factory.
- `comments.js` exposes undo-friendly helpers for reading and mutating the normalized comment store so the rest of the app can work with stable row IDs and column keys.
- `comment-events.js` centralizes the DOM event dispatch for comment mutations so grid commands and other controllers can signal UI refreshes without duplicating `CustomEvent` wiring.
- `cleanup-controller.js` rebuilds variant catalogs, analyzes orphaned notes/comments, and coordinates the cleanup dialog so destructive operations participate in the shared undo history.
- `inference-controller.js` scopes interaction cells for inference runs, applies or clears inferred metadata with undo/status wiring, and skips manual edits so bulk operations respect source flags.
- `inference-application.js` applies the proposed suggestions to interaction notes, coordinating metadata updates, profile impact tracking, and tag-change events while honoring overwrite/skip rules.
- `inference-index-access.js` encapsulates index construction and selection mapping for regular vs. bypass interactions, including scoped bypass caches and active-row remapping.
- `inference-targets.js` resolves requested vs. suggestion scopes, gathers eligible cells for inference, and shares scope-plan metadata so the controller can log intent.
- `inference-heuristics.js` hosts the inference runner that composes discrete strategy modules, normalizes thresholds, and exposes the suggestion entry point.
- `inference-strategies/` collects table-driven consensus, action-group, action-property, modifier-profile, input-default, profile-trend, and phase-adjacency strategies so heuristics can be enabled, disabled, or unit-tested in isolation.
- `inference-strategies/property-strategy.js` groups inference targets by shared action properties (per input/phase/field) so property similarity can seed suggestions alongside action groups.
- `inference-profiles.js` maintains per-modifier and per-input trend profiles, decaying counts, snapshotting them for heuristic runs, and exposing a read-only view that leans suggestions toward recently observed "no change" patterns.
- `inference-utils.js` centralizes the shared normalization, extraction, keying, and cloning helpers consumed by heuristics, profiles, and inference-aware interactions.
- `interaction-bulk-actions.js` coordinates toolbar and sidebar bulk actions for interaction cells, applying Uncertain toggles, accepting inferred metadata, and clearing inference flags with undo/status updates.
- `interaction-maintenance.js` rebuilds interaction pairs and prunes orphaned notes to valid signatures so inference and grid routines consume a consistent catalog.
- `interactions-data.js` maintains the derived interaction metadata catalog so UI code can synthesize on-demand interaction pairs without keeping a large in-memory array.
- `interaction-tags.js` provides undo-friendly helpers for renaming and deleting interaction tags across the notes map so UI controllers can reuse consistent mutation wiring.
- `tag-events.js` centralizes the DOM event dispatch for interaction tag mutations so sidebar controllers can refresh in response to grid or bulk edits without duplicating `CustomEvent` wiring.
- `sidebar-wiring.js` coordinates the shared sidebar host, panel registration, and tab toggles so view controllers can reuse the same plumbing.
- `column-widths.js` captures default widths for each view, clones override metadata, and exposes helpers so state controllers can merge persisted sizing without bloating callers.
- `diagnostics.js` lazily loads the in-app self-tests so diagnostics can run without keeping the heavy harness in the main bundle.
- `persistence.js` encapsulates project lifecycle actions (new/open/save), migrations, and seeding so `app.js` wires those flows without holding their implementation details.
- `project-info-controller.js` manages the modal lifecycle and persistence handshake for project notes so the bootstrap sequence only needs to expose the entry point to menus.
- `settings-controller.js` owns user preference hydration, disk import/export, and dialog wiring so the bootstrap file only initializes it and exposes the entry point to menus.
- `shell-coordinator.js` wraps shell bootstrap wiring (status, IDs) so the app entry point can inject dependencies without coupling to the implementation details.
- `user-settings.js` defines the persisted defaults, schema metadata, and sanitizers for color preferences so both the controller and UI can trust incoming payloads.
- `view-state.js` owns per-view selection snapshots and cached column layouts so `app.js` only orchestrates switching and rendering logic.
- `view-controller.js` centralizes view switching, tab events, and layout updates so the bootstrap file can delegate cross-panel coordination.

#### `scripts/data/`

- Group modules that define data shapes, constants, and persistence helpers.
- `mutation-runner.js` centralizes layout/render/derived rebuild side effects for core model mutations, exposes a transaction helper so multi-step edits fire those hooks only once, and provides a canonical snapshot utility for history features.
- `rows.js` centralizes helpers for creating and inserting blank rows so both the app and tests reuse the same logic.
- `variants/` now houses the modifier set pipeline: `variants.js` remains the orchestrator while `mod-state-normalize.js` interprets stored flags, `variant-combinatorics.js` builds eligibility combinations, `variant-constraints.js` evaluates rule requirements, `variant-settings.js` normalizes per-action/group cap defaults, and `interactions-index-cache.js` reuses scoped indexes keyed by include-bypass and base-version metadata.
- `variants/variants-benchmark.js` stress-tests variant generation across large action/modifier sets so profiling and allocation comparisons stay repeatable.
- `deletion.js` scrubs modifier groups and constraints after rows are removed so downstream consumers never see dangling references.
- `mod-state.js` centralizes the modifier-state descriptor (IDs, glyphs, parsing tokens) so column kinds, palette UI, persistence, and tests reuse the same definitions.
- Keep utility helpers (`utils.js`) and structural descriptors (`column-kinds.js`, `constants.js`, `fs.js`) nearby.
- `color-utils.js` offers shared normalization and contrast helpers so rendering modules and pickers reuse consistent color logic.
- `comment-colors.js` centralizes the curated preset palette for comment badges and selectors, exposing helpers so UI code stays
  in sync with the available options.
- `event-dispatcher.js` provides a guarded helper for emitting DOM events with `CustomEvent` when available so callers can short
  -circuit safely during non-browser runs.
- `comments.js` composes stable identifiers for per-row, per-view comment buckets and normalizes persisted maps so app state and
  migrations share the same helpers.
- `properties.js` normalizes and formats the list-valued properties field on actions so the Actions view and persistence share consistent token handling.

#### `scripts/ui/`

- Concentrate modules that manage user interactions and visual behavior: drag handling, keyboard/mouse input, menu and palette logic, and rule rendering.
- This clustering clarifies which code is safe to adjust when tweaking UI without touching data logic.
- `column-resize.js` binds resize handles in the grid header to pointer gestures, persisting per-column width overrides and coordinating layout rerenders.
- `side-panel.js` manages the shared right-hand sidebar host so comments and tags can register panes and share toggles without conflicting state.
- `tags.js` drives the interaction tag sidebar UI, coordinating host toggles, list rendering, and bulk rename/delete actions through the shared tag manager.
- `interaction-tools.js` wires the Interactions bulk-actions pane and toolbar toggle, gating activation to the Interactions view and dispatching bulk mutations with status feedback.
- `variant-diagnostics.js` opens a lightweight modal that renders diagnostic summaries for the currently selected action’s variants.
- `settings.js` renders the modal for customizing palette colors and keeps the dialog in sync with the sanitized `user-settings` payloads.
- `project-info.js` renders the project notes dialog, providing a textarea host and dispatching change events so controllers can persist updates without duplicating DOM wiring.
- `cleanup-dialog.js` displays the cleanup overlay, tracks per-action selections, and surfaces analyze/apply results provided by the controller.
- `inference-dialog.js` renders the inference modal with scope selectors, overwrite/empty toggles, confidence/source defaults, and run/clear actions aligned with cleanup dialog affordances.

#### `scripts/support/`

- Offer a home for cross-cutting helpers that are not part of the runtime app bundle, such as lightweight test harnesses.
- The `tests/` subtree now keeps reusable spec modules (`specs/`) separate from browser runners (`tests.js`, `tests-ui.js`), ensuring Node and in-app harnesses share the same assertions and fixtures.
- `specs/app-harness.js` builds a stub DOM, Id map, and controller set so bootstrap and view wiring can be exercised without the browser.
- `specs/app-coordinators.js` covers the shell, grid runtime, and interaction maintenance coordinators so their injected contracts stay stable.
- `specs/app-init.js` hosts contract tests that assert the staged bootstrap surface keeps exposing render/history/view APIs and tab callbacks.
- `specs/comments.js` exercises serialization and persistence paths for the comment map helpers so both Node and browser runners can reuse the shared expectations.
- `specs/cleanup.js` seeds fixture models with stale notes/comments and verifies the cleanup controller only prunes unreachable entries.
- `specs/data-utils.js` covers column offset helpers (e.g., `visibleCols`) so scroll-driven grid calculations keep working edge cases such as partial viewports and trailing gaps.
- `specs/properties-palette.js` boots the app harness and asserts the properties palette opens and closes correctly on the first edit to guard against regression in palette wiring.
- `specs/inference-utils.js` covers normalization, keying, and cloning behaviors so inference helpers stay stable across refactors.
- `specs/variant-normalization.js`, `specs/variant-combinatorics.js`, and `specs/variant-constraints.js` isolate tests for the mod-state normalization, combination builder, and constraint evaluation helpers used by the variant generator.
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

Adopting this layout keeps domain, UI, and support code clearly separated while remaining flexible for future expansion.
