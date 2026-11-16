# The plugins

What the CedarLoom plugins add to a Claude Code session besides their skills, and the settings that control it. Install, update and uninstall steps are in the [README](../README.md); the skills are in [Skills](skills.md).

| Plugin | Hooks | Settings |
|---|---|---|
| `cl-workflow` | [Terminal questions](#terminal-questions), [role guard](#role-guard), [status band](#the-status-band) | `tierBand` |
| `cl-orchestration` | [Coordinator context rotation](#coordinator-context-rotation) | `rotateAtTokens`, `rotateAtPercent` |
| `cl-repo` | none | none |

Every hook runs `node`, so Node.js must be on the PATH. Set a plugin's options with `/plugin` (Installed tab, Configure options) or under `pluginConfigs` in `$HOME/.claude/settings.json`, then start a new session.

## The status band

Two rows of text above the prompt in the Claude Code terminal and desktop app; the VS Code extension does not draw it. It is off by default.

- Top row: the project folder, its git branch, and the level of Ponytail (a separate, optional plugin for lean code) when it is installed.
- Checks row: the last test run and the last lint or type check of the main loop, each `passed`, `failed`, `not run` or `stale (N edits since)`, then `ASK until <time>` (or `ASK for this session`) while [terminal questions](#terminal-questions) are allowed, and the button `?`.
  - Test runs: `npm test`, `pnpm test`, `yarn test`, `bun test` (also with `run` and as `npm run test:<name>`), `node --test`, `playwright test`, `pytest`, `go test`, `cargo test`, `vitest` or `jest`.
  - Lint or type checks: `eslint`, `npm run lint`, `tsc`, `ruff`, `mypy`, `pyright`, `go vet`, `cargo clippy` or `biome`.
  - Stale: an edit by the main loop (Edit, Write, MultiEdit, NotebookEdit; not a subagent's, not a failed one) after a result makes it stale.
  - A command counts when it starts the command or a part of a chain joined by `&&`, also after `npx`, `pnpm`, `pnpm exec`, `yarn`, `bunx`, `uv run` or `python -m` (`npx vitest run`, `python -m pytest`).
  - Redirections (`> test.log`, `2>&1`, `&> test.log`) are ignored, and one `sh -c '<script>'` (also `sh -lc`, as in `devcontainer exec ... sh -lc 'cd app && npm test'`) is read as its script.
  - `not run`: a chain with `||`, `;`, `|` or `&`, a quoted name, a background run, or a failed chain that is not the check alone.

`?` shows a short version of this text.

Turn it on: set `tierBand` to `true` for `cl-workflow@cedarloom` in the plugin's options, or under `pluginConfigs` in `$HOME/.claude/settings.json`. Turn it off: set it to `false`. Start a new Claude Code session after changing the option. The band reads the working folder, git, Ponytail's flag file `.ponytail-active` and the commands and edits of the main loop; it writes and sends nothing, and what it shows stays on this machine.

Ponytail draws a band of its own, so with both on the two stack. `/ponytail band off` hides Ponytail's.

[Ponytail](https://github.com/DietrichGebert/ponytail) steers the agent to write only what the task needs, without cutting validation, error handling, security or accessibility; install it with `/plugin marketplace add DietrichGebert/ponytail`, then `/plugin install ponytail@ponytail` ([README](../README.md#optional-ponytail)).

## Terminal questions

By default a Claude Code session with the cl-workflow plugin on never uses the question tool (`AskUserQuestion`) or plan mode (`EnterPlanMode`).

- The plugin's `PreToolUse` hook refuses both with the rule as its reason: open questions with recommendations go into one issue per task in the issue tracker the project names, else the report; safe, reversible recommendations are taken and the work goes on; no chat-text interviews either.
- A `SessionStart` hook adds that rule as one line at start, resume, `/clear`, compaction and fork.
- `/cl-workflow:ask` allows both for 30 minutes, `for <n>m` or `for <n>h`, `until HH:MM` (local time), and `off` ends the window early.
- `/cl-workflow:questions`, the question queue, allows both for the rest of the session, as running it means you sit at the terminal; `/cl-workflow:ask off` or a timed `/cl-workflow:ask` replaces that. It asks you the open [owner questions](#owner-questions) in batches, comments each answer, and labels the ones you defer `cedarloom:deferred` so the queue skips them.
- A window ends at its time or when Claude Code quits. `/clear`, compaction and a fork keep it, while a new Claude Code process or a resumed conversation starts with questions off.
- A `UserPromptExpansion` hook sets the window, and that event fires only when a typed command expands ([hooks reference](https://code.claude.com/docs/en/hooks#userpromptexpansion)). So the same text in a scheduled task sets nothing (checked with a cron job, Claude Code 2.1.316), nor, by that reference, in a `/loop` iteration or a message from another session; the skill is user-only.
- The window is one file per Claude Code process in the plugin's data folder (`ask/<CLAUDE_PID>.json`, the window's end), and `CLAUDE_PID` is set in the Bash tool too, so a model that writes that file opens the window: the hooks stop a model that forgets the rule, not one that works around it.
- When the refusal hook cannot start, both stay refused ([`onFailure: "block"`](https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails)).
- On Windows the hooks start `node` without a shell, which needs `node.exe` itself on the PATH: with only a `.cmd` or `.bat` shim, the refusal still holds but `/cl-workflow:ask` cannot open the window (unverified on Windows).
- Setting `disableAllHooks` turns the hooks off.
- Codex runs none of these hooks, so there `/cl-workflow:ask` changes nothing.

## Owner questions

The coordinator of `/cl-orchestration:coordinate` files an owner question in the approval layout as an issue of the project's repository, labeled `cedarloom:needs-human`, when that repository is private with issues on; else it writes it to the local queue, `.cedarloom/questions/<project>-<n>.md` in the coordinator's folder, kept out of git. A question never goes to a public repository.

| Label | Meaning |
| --- | --- |
| `cedarloom` | CedarLoom may read and plan the issue and ask on it; it does not start work |
| `cedarloom:ready-for-agent` | the coordinator may start the issue (the default `startLabel`) |
| `cedarloom:needs-human` | a question or approval waits for the owner |
| `cedarloom:in-progress` | a worker holds the issue, so it never starts twice; a label left after its worker ended without a pull request (a host restart) holds the issue until you take it off: `gh issue edit <number> -R <owner/repo> --remove-label cedarloom:in-progress` |
| `cedarloom:deferred` | the owner parked it: it does not start and the question queue skips it |

Rejected work is closed as not planned, with no label. Create each label in the repository before the first run: `gh label create <name> --description "<meaning>"`.

- `/cl-workflow:questions` asks this repository's `cedarloom:needs-human` issues if it is private, then the local queue, where it writes the answer line the coordinator reads. That line counts as the owner's: the [role guard](#role-guard) lets only that session, no subagent, write the queue or reach it in a command; the coordinator files through `approval.mjs file`. A command reaches the queue when its text names `.cedarloom/questions` or when a word or redirection target, read as the shell decodes it from the session folder and from each folder a `cd`, `pushd` or `Set-Location` before it names, lies in it (`*`, `?` and `[...]` count as any name, but two such segments in a row, as in `*/*`, match no folder). Like the rest of the guard it does not try to catch a command written to get around it (`.c*/q*`, braces, variables, bracket classes, look-alike letters, a tool's own folder option such as `git -C`), nor one that acts on `.cedarloom` itself, such as `rm -rf .cedarloom`. A session whose folder lies in the queue writes nothing there. No session writes the window files of `/cl-workflow:ask` or starts `claude` with `/cl-workflow:questions` or `/questions` in its command line: `claude -p` expands such a command ([headless mode](https://code.claude.com/docs/en/headless)), and no hook input tells that session from one where you typed it.

## Role guard

Only the coordinator merges, releases and changes shared repository state. In every other Claude Code session with the cl-workflow plugin on, and in every subagent, its `PreToolUse` hook for the Bash, Monitor and PowerShell tools (and the edit tools, for the [local queue](#owner-questions)) denies the following (a Monitor call on a WebSocket runs no command and passes):

- merging and direct commits (`gh pr merge`, `gh repo sync`, its local form without a repository included, the merge, `merge-upstream` and `contents` endpoints of `gh api` with a method other than GET, and its merge and `createCommitOnBranch` mutations, sent to the `graphql` endpoint in any case, with leading or trailing slashes, a query or a fragment, or as its full URL) and releases (`gh release` except `list`, `view`, `download` and `verify`, `gh workflow run`, and the `dispatches` endpoints of `gh api`)
- tag pushes (`git push --tags`, `--follow-tags`, `--mirror`, `tag <name>`, or a refspec that is under `refs/tags/`, names a tag of the repository, or names a version such as `v1.2.0` and is no local branch) and pushes to the default branch (`main`, `master`, the branch `refs/remotes/<remote>/HEAD` names, or the current branch's push target for a `git push` without a refspec), `--all` and `--branches` included, and pushes to a remote whose default branch the hook cannot read: a URL, a path, or a remote without `refs/remotes/<remote>/HEAD` (`git remote set-head <remote> --auto` sets it); a push that names no remote goes where git sends it: the branch's `pushRemote`, `remote.pushDefault`, the branch's remote, the sole remote, else `origin`; git takes a unique prefix of a long option, so `--tag` counts as `--tags`
- repository settings and security: `gh repo edit`, `rename`, `archive`, `delete` and `deploy-key`, `gh secret` and `gh variable` writes, `gh workflow enable` and `disable`, and `gh api` calls other than GET to settings, rulesets, branch protection, secrets and security alerts
- `gh auth`, gh's own config, aliases and keys
- `git config` except its `--get` and `--list` forms, `git -c`, and `git stash`
- `claude --bare`: hooks do not run in bare mode, this one included, even for a plugin loaded with a flag ([headless mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode)). No line in a plugin starts `claude` with `--bare`, as a command line or as a spawn call with its argument list (skill lint). Bare mode is announced as the future default for `-p`; once it is, a `-p` launch from a guarded session runs unguarded unless the hook covers it too.

Start the coordinator's session with `CEDARLOOM_ROLE=coordinator claude` and nowhere else: a variable in your shell profile or the `env` of user settings reaches every session, workers included. Any other session is guarded, as is one started from a guarded one while it runs hooks.

- Subagents inherit the coordinator's environment, so the hook guards every call that names one (`agent_id`, [hooks reference](https://code.claude.com/docs/en/hooks)). Start a session from the coordinator's shell without the variable: `env -u CEDARLOOM_ROLE claude -p "<prompt>"`.
- The hook reads the command as the shell splits it, with the backslash as escape character for Bash and Monitor and the backtick for PowerShell: line continuations join, quoted words stay whole, and the text of each quoted word is read again as commands, so `bash -c "gh pr merge 1"` is denied, and so is a commit message or comment text that names such a command: put that text in a file (`-F`, `--body-file`).
- Git questions (the current branch, tags, the remote's default branch) go to the session's folder, to the existing folder a `cd`, `pushd` or `Set-Location` at the start of the command moves to, or to `git -C <dir>`. A push from the repository `GIT_DIR` (set anywhere in the command) or `git --git-dir` names is denied: push from its folder with `git -C <dir>`. After any other folder change git's folder is unknown: a target that is a variable, a substitution, a missing folder or a `~` path, `cd -`, `popd`, `Pop-Location`, and a `cd` later in the command, after a keyword, in parentheses, braces, a pipeline, quoted text, a comment or a here-document. A push then names its branch (`git push origin <branch>`; none or `HEAD` is denied), checked in the session's folder and each folder the command names, each needing a readable `refs/remotes/<remote>/HEAD`. A push without a refspec is denied where no current branch can be read (`git -C` to a missing folder, a detached HEAD), and every push without git on the hook's PATH.
- The hook asks git for the current branch before the command runs, so a push of the current branch after a switch to the default branch in the same line passes (`git checkout main && git merge feat/x && git push`; the hook's tests list such known passes). A ruleset on the default branch that requires pull requests is required as the binding layer; the hook only stops most such pushes earlier.
- It stops a model that forgets its role, not one that works around it (a variable as the command, a git or gh alias, a script, `node -e`, an MCP tool). The boundary is a GitHub token without those rights and rulesets on the default branch and release tags, which you set up yourself.
- Input the hook cannot read exits 2, which refuses the call; so does a hook that cannot start ([`onFailure: "block"`](https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails), Claude Code 2.1.295 or later; an older version runs the call). Monitor's commands reach the hook from Claude Code 2.1.314. Whether it runs in `bypassPermissions` mode is unverified.
- Codex runs no such hook.

## Coordinator context rotation

A long-running coordinator of `/cl-orchestration:coordinate` starts over with a fresh context when it is idle, instead of growing until auto-compaction garbles its state. It applies only to a coordinator whose project folder (where the agent started; a shell `cd` does not move it) holds the handoff file `.cedarloom/runs/handoff.md`, which the skill writes when a run starts and deletes when it closes, and whose session id the file names (`Session: <id>`). A Codex session holds no run: the coordinator needs Claude Code ([Start the run](../plugins/cl-orchestration/skills/coordinate/orca.md#start-the-run)), so the Codex `SessionStart` hook finds no file that names its session. The hooks act only in the session whose id matches, not in another session started in the same folder, and only in a session that draws on a surface: a `claude -p` run that resumes the coordinator's session carries its id but never counts as the coordinator. A `claude --resume` of the coordinator's session in a second terminal draws on a surface, so both processes can restore, clear and move the line. After a `/clear` in the same Claude Code process, the plugin moves the line to the new session id. Without the file or that line they do nothing, and they refuse a file that is a symbolic link or sits behind one, and a folder that is no readable git repository or where git tracks anything under `.cedarloom/runs`, so a repository cannot plant the file. The coordinator's folder must therefore be a git repository.

- After a `/clear` or compaction, the plugin hands the file back to the model with a line to run its Resume steps first (Orca's mail, then the run's state). After the file comes what git shows changed since the coordinator last wrote the file (the plugin's own status line does not count): the commits on local branches (the workers' branches too) and the uncommitted files with a newer modification time, at most 20 each; a git failure leaves the section out. At most 9,000 characters come back: the file first, with a line saying the rest was cut, and the section only in the room the file leaves.
- In Claude Code the plugin also writes a status line into the file's status block before a compaction and before its own clear.
- Claude Code only: when the main loop ends a turn with no background task running, no other Stop hook blocking the stop, and its context is above the plugin option `rotateAtTokens` (200000 by default), the plugin runs `/clear` and submits a prompt that resumes the coordinator from the file. `rotateAtPercent` above 0 compares that percent of the model's context window instead; both at 0 turns it off. On a model with a 200k context window, auto-compaction comes before 200,000 tokens, so set `rotateAtPercent` there (for example 60). At most one clear every 10 minutes. When Claude Code reports no context size, the plugin says so once in the transcript and clears nothing at the threshold.
- A `/clear` and resume prompt that have not finished after 15 minutes are given up: the plugin says so in the transcript, submits no resume prompt, and clears again at a later idle stop.

The options are those of `cl-orchestration@cedarloom` (see the top of this page). The hooks read and write only the handoff file, run `git ls-files` in its project folder, and send nothing.

## Code Mode (optional)

[Code Mode](https://code.claude.com/docs/en/code-mode) is an experimental Claude Code feature in which Claude writes JavaScript that makes several tool calls in one step. It is off by default and may change or be removed in any release.

- Needs, among others: Claude Code v2.1.323 or later on the native build, an interactive terminal session, and Opus 5.5, Sonnet 5.5, Haiku 5.5 or Fable 5.2. The full list, and the settings that block it (an API key helper, agent teams, OpenTelemetry export, `DISABLE_TELEMETRY`), are in its [requirements](https://code.claude.com/docs/en/code-mode#requirements).
- Turn it on: set `"CLAUDE_CODE_EXPERIMENTAL_CODE_MODE": "1"` in the `env` block of `$HOME/.claude/settings.json`. Claude Code ignores it in a project's settings. A Code Mode session resumes only with it on.
- The hooks of these plugins keep working: each tool call the code makes still reaches the `PreToolUse` hooks, and a hook that fails or times out refuses that call.
- Code Mode does not start while the `cl-workflow` [status band](#the-status-band) is on, since its module checks tool calls: set `tierBand` to `false` (the default) first.

## Untrusted input

Issue and pull request text can carry instructions. `/cl-orchestration:coordinate` passes workers and reviewers only text by trusted authors: the repository owner, the policy's `trustedAuthors`, and members or collaborators with `admin` or `write` on the [permission endpoint](https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user). A failed lookup passes nothing.

| Text | How it reaches an agent | Check |
|---|---|---|
| Issue title, body and comments | `thread.mjs` writes the trusted thread and counts the comments left out; the spec's `Thread:` block carries it | `thread.test.mjs` |
| Unresolved review threads | `thread.mjs --pull` writes each thread a trusted author opened, with its trusted comments, and counts the rest; the reviewer's brief and the worker's follow-up carry it. Access counts in the project's repository | `thread.test.mjs` |
| Any other comment or review | not passed: the spec and `rules/worker.md` tell workers and reviewers to read none themselves | wording only |

Run unattended workers in Claude Code's [sandbox](https://code.claude.com/docs/en/sandboxing) or a dev container with a network allow-list: it limits what a misled worker can reach or send.
