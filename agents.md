## Generalist

- Code organization:
  -- Keep logic modular and well-structured. Prefer isolating responsibilities (e.g., persistence, clipboard, view logic) into separate modules; avoid mixing unrelated concerns in a single file.
  -- Follow the existing folder-structure.md scheme, and document any changes or new directories there to preserve consistency and discoverability.
  -- Add concise comments where the code’s intent isn’t immediately obvious.

- Code clarity and economy:
  -- Strive for concise, expressive solutions. Prefer fewer, well-chosen lines of clear logic over sprawling or repetitive code — but never at the expense of readability, maintainability, or robustness.
  -- Avoid overly clever or dense constructs that obscure intent; prioritize clarity over brevity when in doubt.

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
  -- After each significant change or new feature, ensure existing tests pass and extend tests to cover new or modified logic, especially edge cases and data transformations.
