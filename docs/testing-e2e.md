# Playwright smoke tests

This repo uses a small Playwright smoke suite for browser-critical workflows. Keep it intentionally small, deterministic, and focused on high-signal regressions.

## Commands

- `npm run test:e2e` — headless smoke run for local/CI usage.
- `npm run test:e2e:ui` — interactive Playwright UI mode for local debugging.

The suite reuses the existing app dev server via Playwright `webServer` (`npm start`).

## Selector policy

1. **Prefer role/name selectors first** (e.g., `getByRole('button', { name: 'Open…' })`) for user-facing controls.
2. **Use `data-testid` only for dynamic/virtualized surfaces** where role/name targeting is ambiguous or unstable.
3. **Avoid CSS-structure selectors** (`.foo > :nth-child(2)`) and fragile DOM nesting assumptions.

Current high-risk anchors:

- `grid-root`
- `grid-visible-cells`
- `active-cell-editor`
- `interactions-outline-root`
- `inference-dialog-root`
- `cleanup-dialog-root`
- key sidebar toggles/panes (`sidebar-toggle-*`, `sidebar-pane-*`)

## Virtualized grid guidance

The grid virtualizes cells, so off-screen cell nodes are not guaranteed to exist.

- Always target cells through coordinate helpers that query visible nodes.
- Scroll/select as needed; do not rely on persistent off-screen DOM.
- Keep cell actions in shared helpers (`e2e/helpers/grid-helpers.js`).

## CI stability defaults

- Disable animations in test context.
- Wait on user-observable states (status text, dialog visibility, selected tab).
- Never add arbitrary fixed sleeps unless there is no observable alternative.
- Keep retries conservative (currently 1 retry in CI only).
- Collect trace/screenshot/video **on failure only**.

## Maintenance rules

- UI changes touching critical controls should preserve accessible role/name semantics or intentionally update test IDs.
- Add smoke specs only for workflows that are regression-prone and business-critical.
- If a flow needs extensive setup, prefer improving helper APIs over adding duplicate setup code in many specs.
