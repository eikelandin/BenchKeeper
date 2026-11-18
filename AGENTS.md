# AGENTS.md

## Commands

Every command runs in the dev container: start it with `devcontainer up --docker-path podman --workspace-folder .`, then run `devcontainer exec --docker-path podman --workspace-folder . <command>`, compound commands as `... sh -lc '<commands>'`. Git (fetch, commit, push) runs on the host: the container mounts the git metadata read-only.

The plugins (in `plugins/*/`, Node.js alone, no install), in `sh -lc`: `for dir in plugins/*/test; do node --import ./.github/scripts/plugin-test-env.mjs --test "$dir"/*.test.mjs || exit 1; done`.

The changed-files check, for each area the change touches:
- `plugins/`: the plugin tests above.
- `plugins/` and `.github/`: the scripts of the `checks-core` job in [checks.yml](.github/workflows/checks.yml) that cover the changed files.

## Before you push

- Run the changed-files check after your last edit, right before every push. Never use `--no-verify`.
- Don't poll CI: wait with `gh run watch <run-id> --interval 30 --compact --exit-status` or `gh pr checks --watch --interval 30`.
- main stays releasable. A red main is fixed before anything else merges.

## Tests

- Do not add tests by default. Add one only when it fails if your change is reverted, hardcodes its expected values (never computed by production code, locale files or mocks), and runs at the single layer that owns the behavior.
- Never test copy or translations, CSS classes, constants, third-party libraries, private state, timing or call counts. When you touch such a test, delete it instead of updating it.
- There are no coverage thresholds.

## Every change considers

- The plugins: Linux and macOS (the plugin tests run on both, on Node.js 22; when macOS runs: [Development](docs/development.md#workflows)), Windows untested.
- Footguns, read before changing that area: [git and child processes](docs/agents/git-and-processes.md).

## Pointers

- [docs/agents/](docs/agents/): [domain docs](docs/agents/domain.md).
- [Development](docs/development.md): workflows and checks. [Releasing](docs/releasing.md).
