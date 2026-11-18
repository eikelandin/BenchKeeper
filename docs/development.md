# Development

How the checks and the workflows of this repository work.

## Workflows

- `checks.yml` runs `checks-core`, `plugin-checks` and `plugin-tests` in parallel; the job `checks` gates all three. `plugin-tests` runs the tests in `plugins/*/test/` with Node.js alone (no install, no app) on Linux and macOS. While the repository is private the macOS leg runs on pushes to `main` only; once it is public, on pull requests too.
- `token-budget.yml` runs on pull requests that change instruction files or docs: it measures the estimated tokens of the base and the head with `plugins/cl-repo/skills/debloat/token-budget.mjs`, posts the change as a pull request comment (pull requests from this repository only) and fails only when the head is above the budget in `.github/token-budget.json` (`budget.total`, `budget.files`). `checks-core` runs the same budget check, which makes it binding; lost protected text and dead links are warnings there. After a pull request that moves the total on purpose, `node plugins/cl-repo/skills/debloat/token-budget.mjs baseline --write` stores the new counts.
- Every workflow has `permissions: {}` at the top and per job, `timeout-minutes` on every job and a `concurrency` group that cancels superseded pull request runs.
- Every required check runs on pull requests into `main` and on pushes to `main`, except `conventional` (the pull request title) and `dependency-review`, which run on pull requests only.
- Every job runs only in `CedarLoom/cedarloom` (`if: github.repository == 'CedarLoom/cedarloom'`), so a fork or a copy runs none. `dependency-review` also skips while the repository is private, CodeQL and Scorecard while it is not public.
- The checks `checks`, `conventional` and `dependency-review` are the ones to keep green. A job change keeps these names: a branch rule requires a check by its name, and a required check that no job reports stays pending and blocks the merge.
- `checks-core` runs:
  - `actionlint` and `zizmor` (a checkout keeps its credentials only with a `zizmor: ignore[artipacked]` reason).
  - No em dash or emoji in text files (lockfiles, PNG files and changelogs apart).
  - No `2.1.x` version other than `2.1.323`, the Claude Code minimum in the README's Requirements, written into the step (other version lines pass; changelogs, tests, package manifests, lockfiles, workflows and the `plugin-checks` pin apart).
  - The `.github/scripts/` tests and checks (skill lint, plugin boundary, generated docs, version pins).
  - The token budget (`token-budget.mjs check --budget-only`).
- The plugin boundary check (`.github/scripts/plugin-boundary.mjs`) fails when a tracked file under `plugins/*/` (the generated `CHANGELOG.md` apart):
  - holds a path that leaves its plugin folder (a `../` path resolved from the file's folder, `${CLAUDE_PLUGIN_ROOT}/..`),
  - imports a package that is neither a `node:` module nor `claude-code`,
  - has a hook matcher in `hooks/*.json` whose `^<prefix>:` is not the plugin's name in `.claude-plugin/plugin.json`,
  - breaks rule `orca-only-orchestration`: the name `orca` as a word or inside an identifier (`ORCA_*` and `CEDARLOOM_ORCA_HANDLE` variables, `OrcaClient`, `isOrcaWorker`, `in_orca`; not inside a plain word such as `Majorca`) fails in every plugin folder but `plugins/cl-orchestration`, which runs only on Orca, and `plugins/cedarloom`, the bundle that installs it; `cl-workflow` and `cl-repo` work without Orca.
- Actions are pinned to commit SHAs with a version comment. Dependabot (`.github/dependabot.yml`) updates the `uses:` pins weekly.
