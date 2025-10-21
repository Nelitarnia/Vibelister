## Generalist

- Code organization:
  - Keep logic modular and well-structured. When adding new functionality, create dedicated modules or utilities rather than expanding core files (e.g., App.js).
  - Follow the existing folder-structure.md scheme, and document any changes or new directories there to preserve consistency and discoverability.
  - Add concise comments where the code’s intent isn’t immediately obvious.
  
- Code clarity and economy:
  - Strive for concise, expressive solutions. Prefer fewer, well-chosen lines of clear logic over sprawling or repetitive code — but never at the expense of readability, maintainability, or robustness.

- Formatting:
  - Focus on functional and logical improvements; avoid cosmetic reformatting.
  - Defer style enforcement to Prettier (see `.prettierrc`).
  - Do not alter indentation or line wrapping unless necessary for clarity.

- Keep unit tests up-to-date:
  - After each significant change or new feature, verify coverage and add or adjust tests so all critical logic remains tested.
