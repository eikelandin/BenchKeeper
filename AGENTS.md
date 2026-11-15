# AGENTS.md

## Commands

Every command runs in the dev container: start it with `devcontainer up --docker-path podman --workspace-folder .`, then run `devcontainer exec --docker-path podman --workspace-folder . <command>`, compound commands as `... sh -lc '<commands>'`. `devcontainer exec` starts in the repository root and has no working-folder option: run the commands of `web/` as `... sh -lc 'cd web && <commands>'`. Git (fetch, commit, push) runs on the host: the container mounts the git metadata read-only.

CedarLoom (the pnpm workspace in `packages/`, from the repository root; details in [packages/README.md](packages/README.md)):
- Install: `pnpm install --frozen-lockfile`
- Types, lint, format, unused code, duplicates: `pnpm run typecheck`, `pnpm run lint`, `pnpm run format` (`pnpm run format:check` only reports), `pnpm run knip`, `pnpm run jscpd`
- Tests: `pnpm test` (every package, then `scripts/*.test.ts`); one package: `pnpm --filter @cedarloom/<package> run test`; the UI in browsers: `pnpm --filter @cedarloom/ui run test:ui`

The site (in `web/`): `npm ci`, `npm run build`, `npm test`.

The plugins (in `plugins/*/`, Node.js alone, no install), in `sh -lc`: `for dir in plugins/*/test; do node --import ./.github/scripts/plugin-test-env.mjs --test "$dir"/*.test.mjs || exit 1; done`.

The changed-files check, for each area the change touches:
- `packages/`: `git fetch origin main` on the host, then `pnpm --filter "...[origin/main]" --filter "!{.}" run typecheck && pnpm run lint && pnpm run format:check && pnpm run knip && pnpm run jscpd && pnpm --filter "...[origin/main]" --filter "!{.}" run test`. A change to the root configuration or `scripts/` runs `pnpm run typecheck` and `pnpm test` in full, as CI does. A change to `packages/ui` also runs `pnpm --filter @cedarloom/ui run catalog` (then `git diff --exit-code -- packages/ui/locales packages/ui/schema` on the host) and `pnpm --filter @cedarloom/ui run test:ui`.
- `web/`: `npm run build && npm test`
- `plugins/`: the plugin tests above.
- `plugins/` and `.github/`: the scripts of the `checks-core` job in [checks.yml](.github/workflows/checks.yml) that cover the changed files.
- CI also runs typos over the CedarLoom files ([cedarloom.yml](.github/workflows/cedarloom.yml)); it is not installed in the container.

## Before you push

- Run the changed-files check after your last edit, right before every push. Never use `--no-verify`.
- Don't poll CI: wait with `gh run watch <run-id> --interval 30 --compact --exit-status` or `gh pr checks --watch --interval 30`.
- main stays releasable. A red main is fixed before anything else merges.

## Code

- Make the smallest change that does the whole task, including the callers, tests, fixtures, configuration and docs it breaks or changes. Add nothing speculative: no option, flag, layer, shim or "for later" code; name what you left out in one line of the report.
- Reuse in this order: code the repository has (extend it, never a parallel version; abstract at the second caller, not the first), the standard library or platform, an installed dependency, a maintained package (recent releases, a license the project allows, a size that fits; name it and why in the pull request), own code. A few own lines beat a new dependency.
- Validate where data enters (user input, files, the network, another process) and where a wrong value loses data or breaks security. Inside, trust the types, the framework and your own code: no guard or fallback for a case that cannot happen. An error you cannot handle propagates; never swallow it or hide it behind a default.
- One job per function, module and file, named after it; never `utils`, `helpers`, `common`, `misc` or `shared`. A unit that wants such a name has two jobs: split it.
- Keep the repository's layers: imports point down, never up. Code that gets a test takes the time, randomness and I/O it uses as parameters.
- Remove what your change made unused. Leave other code, comments and formatting as they are; name unrelated dead code in the report.
- Comments only where the code cannot say it: one line, the why, not the how.
- UI code follows the styleguide and tokens that Pointers links. No new colors, font sizes, spacing or shadows when a token already covers the role.

## Tests

- Do not add tests by default. Add one only when it fails if your change is reverted, hardcodes its expected values (never computed by production code, locale files or mocks), and runs at the single layer that owns the behavior.
- Never test copy or translations, CSS classes, constants, third-party libraries, private state, timing or call counts. When you touch such a test, delete it instead of updating it.
- There are no coverage thresholds.

## Every change considers

- CedarLoom: macOS, Linux and Windows (its test job runs on all three); the CLI (`packages/cli`), the server (`packages/server`) and the UI (`packages/ui`).
- Footguns, read before changing that area: [git and child processes](docs/agents/git-and-processes.md).

## Pointers

- [docs/agents/](docs/agents/): [domain docs](docs/agents/domain.md), the [issue policy](docs/agents/issue-tracker.md) (this repository takes no issues), [triage labels](docs/agents/triage-labels.md).
- [Development](docs/development.md): workflows, checks and the dev container. [Releasing](docs/releasing.md).
- Styleguide and tokens: the Mantine theme of each surface, [packages/ui/src/main.tsx](packages/ui/src/main.tsx) (CedarLoom) and [web/src/components/SiteShell.tsx](web/src/components/SiteShell.tsx) (the site).
- Licenses a dependency may have: the `allow-licenses` list of the dependency review in [cedarloom.yml](.github/workflows/cedarloom.yml).
