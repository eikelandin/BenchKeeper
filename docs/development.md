# Development

How the checks, the workflows and the local agent setup of this repository work.

## Workflows

- `checks.yml` runs `checks-core`, `plugin-checks` and `plugin-tests` in parallel; the job `checks` gates all three. `plugin-tests` runs the tests in `plugins/*/test/` with Node.js alone (no install, no app) on Linux and macOS.
- `token-budget.yml` runs on pull requests that change instruction files or docs: it measures the estimated tokens of the base and the head with `plugins/cl-setup/skills/debloat/token-budget.mjs`, posts the change as a pull request comment (pull requests from this repository only) and fails only when the head is above the budget in `.github/token-budget.json` (`budget.total`, `budget.files`); `checks-core` runs the same budget check, which makes it binding. Lost protected text and dead links are warnings there. After a pull request that moves the total on purpose, `node plugins/cl-setup/skills/debloat/token-budget.mjs baseline --write` stores the new counts.
- Every workflow has `permissions: {}` at the top and per job, `timeout-minutes` on every job and a `concurrency` group that cancels superseded pull request runs.
- Every required check runs on pull requests into `main` and on pushes to `main`, except `conventional` (the pull request title) and `dependency-review`, which run on pull requests only.
- The rulesets name the required checks: `checks`, `build`, `conventional`, `dependency-review`. A job change keeps these names.
- `checks-core`: `actionlint`, `zizmor` (a checkout keeps its credentials only with a `zizmor: ignore[artipacked]` reason), no em dash or emoji in text files outside the `.agents/` and `.claude/` folders, the `.github/scripts/` tests and checks (skill lint, plugin boundary, generated docs, version pins, claims), and the token budget (`token-budget.mjs check --budget-only`).
- The plugin boundary check (`.github/scripts/plugin-boundary.mjs`) fails when a tracked file under `plugins/*/` (the generated `CHANGELOG.md` apart) names the app or its successor (`app/` paths, `benchkeeper`, any `@cedarloom/` package, the `cedarloom` command, `cedarloom-app`, the `minApp` version lock), holds a path that leaves its plugin folder (a `../` path resolved from the file's folder, `${CLAUDE_PLUGIN_ROOT}/..`), imports a package that is neither a `node:` module nor `claude-code`, or has a hook matcher in `hooks/*.json` whose `^<prefix>:` is not the plugin's name in `.claude-plugin/plugin.json`. Today's matches are listed per file and rule in `.github/scripts/plugin-boundary-allow.json`. The check fails for an entry that no longer matches, so the change that removes the last reference removes its entry, and in a pull request it fails when the list holds more (file, rule) pairs than the base branch's list. The text `@cedarloom/app` in any form (a runner call, an option, `npm:`, an install), and a package runner word (`npx`, `pnpx`, `bunx`, `dlx`, `exec`, `x`) before `cedarloom-app` or `benchkeeper` in the same command, a trailing backslash continuing it, fail even when listed: plugin text calls the installed `cedarloom-app` when `command -v cedarloom-app` finds it.
- Actions are pinned to commit SHAs with a version comment. Dependabot (`.github/dependabot.yml`) updates the `uses:` pins and the npm packages of the site weekly. By hand: the actionlint image digest, `node-version` in every workflow (Node 22), the dev container image (bump its tag and digest together), and the Claude Code pin of the `plugin-checks` job (`.github/claude-code/package.json` and its lockfile, the npm `stable` tag).
- The Chromium headless shell version of `@playwright/test` in `web/package.json` is also set in `.devcontainer/Dockerfile`; the CI step `Version pins` fails when they differ. Dependabot keeps `@playwright/test` out of its groups and opens a pull request of its own, which stays red: raise both places by hand in one pull request, which closes it.
- SonarCloud: automatic analysis, no workflow. The gate on new code is set by the owner in SonarCloud: 0 open issues, duplication not above the recorded baseline. It has no coverage condition.

## Plugin mod types

The plugin mods (`hooks/` of `plugins/cl-workflow`: the status band; of `plugins/cl-orchestration`: the coordinator rotation) are type-checked by hand, not in CI: Claude Code writes the types a mod imports (`claude-code`, `claude-code/testing`) only when a logged-in session loads it, into `.claude-plugin/types/` of that plugin (git-ignored), and no `claude plugin` command writes them. For each of the two plugins `<p>`:

1. Load the mod once: `claude --plugin-dir plugins/<p>`, then quit the session.
2. In the dev container: `node_modules/.bin/tsc -p plugins/<p>` (the options are the ones the types file names for a hooks module).

The types are those of the Claude Code that loaded the mod, which can be newer than the `plugin-checks` pin.

## Site

`.github/workflows/pages.yml` runs the README sync check, the build, and axe in light and dark. It deploys on pushes to `main`, on a published release and by hand ([releasing](releasing.md#site)); a failing `build` job fails the run and the previous deployment stays. Pushes share one concurrency group, so deployments are ordered.

Preview: `npm run preview` in `web/` in the dev container serves the site under `/BenchKeeper/` on a free host port: `podman port $(podman ps -q --filter label=devcontainer.local_folder="$PWD") 4321`.

## Dev container in VS Code

Set `dev.containers.copyGitConfig` to `false` and `dev.containers.gitCredentialHelperConfigLocation` to `none` in the local user settings (the extension reads them only there), and do not forward the SSH agent.

## Agent config

`.mcp.json` is committed: Claude Code's project MCP server `playwright`, a browser in the dev container. In an interactive session Claude Code asks before it starts it ([project scope](https://code.claude.com/docs/en/mcp#project-scope)); a `claude -p` run starts it without asking, unless it passes `--strict-mcp-config`. The project skills (`.claude/skills/`, `.agents/skills/`), `skills-lock.json` and `.codex/config.toml` are local to each checkout and not tracked. In a new clone:

1. Run the project setup of the legacy app: `npx benchkeeper@6.27.0 projects apply --agents claude,codex`. It installs the skills and the lock file and lists them in `.git/info/exclude`.
2. For Codex, write the server into `.codex/config.toml` (`[mcp_servers.playwright]` with the `command` and `args` of its `.mcp.json` entry).
3. Add `/.codex/config.toml`, `/.claude/skills` and `/.agents/skills` to `.git/info/exclude`.

A new worktree (Orca, Claude Code `--worktree`) gets a copy of the paths that `.worktreeinclude` in the primary checkout lists, when Git ignores them there. The project setup of step 1 writes that file with its own list between `# cedarloom-app:worktrees` markers and adds `/.worktreeinclude` to `.git/info/exclude`. Add `.codex/config.toml`, `.claude/skills` and `.agents/skills` below the block, one path per line; the setup keeps lines outside it.
