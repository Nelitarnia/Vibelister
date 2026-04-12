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

- Testing:
  -- After each significant change or new feature, ensure existing tests pass and extend tests to cover new or modified logic, especially edge cases and data transformations.
