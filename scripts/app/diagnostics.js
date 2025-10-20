export function createDiagnosticsController({
  model,
  statusBar,
  ensureSeedRows,
  rebuildActionColumnsFromModifiers,
  VIEWS,
  setActiveView,
  setCell,
}) {
  function runSelfTests() {
    const start = performance.now();
    Promise.all([
      import("../data/variants/variants.js"),
      import("./interactions.js"),
      import("../support/tests/tests.js"),
      import("../support/tests/tests-ui.js").catch(() => ({ default: null })),
      import("../ui/grid-mouse.js"),
    ])
      .then(([v, inter, m, uiTests, ui]) => {
        const api = {
          // core data
          model,
          ensureSeedRows,
          // variants / views
          buildInteractionsPairs: v.buildInteractionsPairs,
          rebuildActionColumnsFromModifiers,
          VIEWS,
          setActiveView,
          // cells
          setCell,
          // interactions helpers
          noteKeyForPair: inter.noteKeyForPair,
          getInteractionsCell: inter.getInteractionsCell,
          setInteractionsCell: inter.setInteractionsCell,
          getStructuredCellInteractions: inter.getStructuredCellInteractions,
          applyStructuredCellInteractions: inter.applyStructuredCellInteractions,
        };

        // Run model-level tests
        try {
          const run = m.runSelfTests || m.default;
          if (typeof run === "function") run(api);
        } catch (err) {
          console.error("[tests] runSelfTests(model) failed:", err);
        }

        // Run UI interaction tests if present
        try {
          const runUi =
            (uiTests && (uiTests.runUiTests || uiTests.default)) || null;
          if (runUi && typeof runUi === "function") runUi(ui);
        } catch (err) {
          console.error("[tests] runUiTests failed:", err);
        }

        const ms = Math.round(performance.now() - start);
        statusBar?.set(`Self-tests executed in ${ms} ms`);
      })
      .catch((err) => {
        console.error("Failed to load tests", err);
        statusBar?.set("Self-tests failed to load.");
      });
  }

  return { runSelfTests };
}
