## Generalist

- Code organization:
  -- Keep logic modular and well-structured. Prefer isolating responsibilities (e.g., persistence, clipboard, view logic) into separate modules; avoid mixing unrelated concerns in a single file.
  -- Follow the existing folder-structure.md scheme, and document any changes or new directories there to preserve consistency and discoverability.
  -- Add concise comments where the code’s intent or rationale is not immediately obvious.
  -- Prefer a smaller conceptual surface area over excessive flexibility or abstraction depth.

- Code clarity and economy:
  -- Strive for concise, expressive solutions. Prefer fewer, well-chosen lines of clear logic over sprawling or repetitive code — but never at the expense of readability, maintainability, or robustness.
  -- Avoid overly clever, dense, or heavily abstracted constructs that obscure intent.
  -- Introduce new helpers, abstractions, or layers only when they clearly reduce cognitive complexity, duplication, or maintenance burden.
  -- Avoid speculative architecture or indirection for hypothetical future needs.
  -- When replacing or redesigning systems, prefer removing obsolete code paths rather than preserving compatibility layers unless backward compatibility is explicitly required.
  -- Minimize dead code, stale utilities, unused flags, outdated comments, legacy branches, and duplicated logic.
  -- If a refactor significantly increases line count, abstraction depth, or indirection, justify why the additional complexity is necessary.

- Formatting:
  -- Treat Prettier as the single source of truth for formatting (see .prettierrc).
  -- Do not make manual, style-only changes.
  -- After modifying files, ensure they are formatted with Prettier.

- Data model changes:
  -- Treat types.js as part of the source of truth for shared and persisted data shapes.
  -- When changing data structures, payload formats, or persisted state, review and update types.js accordingly.
  -- When code and types disagree, determine which reflects the intended design before changing either.
  -- If persisted data changes incompatibly, bump SCHEMA_VERSION and add or update migration logic.

- Testing:
  -- After significant changes or new features, ensure existing tests pass and extend tests where meaningful.
  -- Prefer tests that validate user-visible behavior, realistic workflows, and important invariants over tests tightly coupled to implementation details.
  -- Prefer realistic fixtures and integration-style coverage for complex systems (e.g., inference flows) rather than excessive micro-tests of internal state.
  -- Avoid regression tests that merely restate current implementation behavior without protecting against a meaningful failure mode.
  -- Tests should support confident refactoring, not unnecessarily freeze internal architecture.