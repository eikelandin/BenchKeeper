# Lens: code

For source and tests. This lens looks for code that should not be there. A search for bugs or security holes is a code review or a security review, not this audit.

First run the read-only checks the repository names in AGENTS.md or its package scripts (type check, lint, unused code, duplicates) and cite their output. Then read.

## Patterns

| Pattern | The code | Action |
| --- | --- | --- |
| dead | Unreferenced code. Before calling it unused, search the whole repository: strings, config, docs, dynamic imports, other packages. | remove |
| duplicate | Two implementations of the same logic. Cite both. | rewrite |
| over-built | An abstraction with one caller, an option no caller passes, a setting nobody sets. | rewrite |
| stale | Commented-out code, a flag that is on everywhere, a comment the code contradicts. | remove or rewrite |
| test that cannot fail | A test of mocks, copy or constants: it passes when the change it guards is reverted. | remove |
| risk | A bug seen on the way. Give the input that fails. | flag; to chase it, a diagnosis skill when one is installed |

## Not findings

- A comment that records a deliberate shortcut or decision.
- Public API with no caller inside the repository.
- Generated and vendored files: out of scope.
