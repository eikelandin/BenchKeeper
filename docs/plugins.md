# The plugins

What the CedarLoom plugins add to a Claude Code session besides their skills: hooks and their settings, Code Mode, and how the coordinator filters untrusted issue and pull request text. Install, update and uninstall steps are in the [README](../README.md); the skills are in [Skills](skills.md).

| Plugin | Hooks | Settings |
|---|---|---|
| `cl-workflow` | [Terminal questions](#terminal-questions), [role guard](#role-guard), [status band](#the-status-band) | `tierBand` |
| `cl-orchestration` | [Coordinator context rotation](#coordinator-context-rotation) | `rotateAtTokens`, `rotateAtPercent` |
| `cl-repo` | none | none |

Every hook runs `node`, so Node.js must be on the PATH. Set a plugin's options with `/plugin` (Installed tab, Configure options) or under `pluginConfigs` in `$HOME/.claude/settings.json`, then start a new session.

## The status band

Two rows of text above the prompt in the Claude Code terminal and desktop app (not the VS Code extension), off by default.

- Top row: the project folder, its git branch, and the level of [Ponytail](../README.md#recommended-add-on-ponytail), when installed.
- Checks row: the last test run and the last lint or type check of the main loop, each `passed`, `failed`, `not run` or `stale (N edits since)`, then `ASK until <time>` (or `ASK for this session`) while [terminal questions](#terminal-questions) are allowed, and the button `?`, which shows a short version of this text.
  - Test runs: `npm test`, `pnpm test`, `yarn test`, `bun test` (also with `run` and as `npm run test:<name>`), `node --test`, `playwright test`, `pytest`, `go test`, `cargo test`, `vitest` or `jest`.
  - Lint or type checks: `eslint`, `npm run lint`, `tsc`, `ruff`, `mypy`, `pyright`, `go vet`, `cargo clippy` or `biome`.
  - Stale: an edit by the main loop (Edit, Write, MultiEdit, NotebookEdit; not a subagent's, not a failed one) after a result.
  - A command counts when it starts the command or a part of a chain joined by `&&`, also after `npx`, `pnpm`, `pnpm exec`, `yarn`, `bunx`, `uv run` or `python -m` (`npx vitest run`, `python -m pytest`).
  - Redirections (`> test.log`, `2>&1`, `&> test.log`) are ignored, and one `sh -c '<script>'` (also `sh -lc`, as in `devcontainer exec ... sh -lc 'cd app && npm test'`) counts as its script.
  - `not run`: a chain with `||`, `;`, `|` or `&`, a quoted name, a background run, or a failed chain that is not the check alone.

Set `tierBand` to `true` (off: `false`) for `cl-workflow@cedarloom`, as described at the top of this page. The band reads the working folder, the current git branch (`git branch --show-current`), Ponytail's flag file `.ponytail-active` in the Claude Code configuration folder, and the commands and edits of the main loop; it writes no file and makes no network request.

## Terminal questions

In a Claude Code session with the cl-workflow plugin on, a hook refuses the question tool (`AskUserQuestion`) and plan mode (`EnterPlanMode`) by default.

- The plugin's `PreToolUse` hook refuses both with the rule as its reason: open questions with recommendations go into one issue per task in the issue tracker the project names, else the report; safe, reversible recommendations are taken and the work goes on; no chat-text interviews either.
- A `SessionStart` hook adds that rule as one line at start, resume, `/clear`, compaction and fork.
- `/cl-workflow:ask` allows both for 30 minutes, `for <n>m` or `for <n>h`, or `until HH:MM` (local time); `off` ends the window early.
- `/cl-workflow:questions` (the question queue) allows both for the rest of the session, as running it means you sit at the terminal; `/cl-workflow:ask off` or a timed `/cl-workflow:ask` replaces that. It asks the open [owner questions](#owner-questions).
- A window ends at its time or when Claude Code quits. `/clear`, compaction and a fork keep it; a new Claude Code process or a resumed conversation starts with questions off.
- A `UserPromptExpansion` hook sets the window; that event fires only when a typed command expands ([hooks reference](https://code.claude.com/docs/en/hooks#userpromptexpansion)). The same text in a scheduled task sets nothing, and by that reference neither does a `/loop` iteration or a message from another session; the skill is user-only.
- The window is one file per Claude Code process in the plugin's data folder (`ask/<CLAUDE_PID>.json`, the window's end). `CLAUDE_PID` is set in the Bash tool too, so a model that writes that file opens the window: the hooks stop a model that forgets the rule, not one that works around it.
- When the refusal hook cannot start, both stay refused ([`onFailure: "block"`](https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails)).
- On Windows (untested) the hooks start `node` without a shell, so `node.exe` itself must be on the PATH: with only a `.cmd` or `.bat` shim the refusal holds but `/cl-workflow:ask` cannot open the window.
- `disableAllHooks` turns the hooks off.
- Codex runs none of these hooks, so there `/cl-workflow:ask` changes nothing.

## Owner questions

The coordinator of `/cl-orchestration:coordinate` files an owner question, in the approval layout, as an issue labeled `cl:needs-human` in the project's repository when it has issues on, else in the local queue, `.cedarloom/questions/<project>-<n>.md` in the coordinator's folder, kept out of git. A private repository is recommended: on a public one the question is public, and the coordinator warns in the session when the run starts and again in its report.

| Label | Meaning |
| --- | --- |
| `cl:plan` | CedarLoom may read and plan the issue and ask on it; it does not start work |
| `cl:ready-for-agent` | the coordinator may start the issue (the default `startLabel`) |
| `cl:needs-human` | a question or approval waits for the owner |
| `cl:in-progress` | a worker holds the issue, so it never starts twice; a label left after its worker ended without a pull request (a host restart) holds the issue until you take it off: `gh issue edit <number> -R <owner/repo> --remove-label cl:in-progress` |
| `cl:deferred` | the owner parked it: it does not start and the question queue skips it |
| `cl:follow-up` | found during other work; workers, reviewers and jobs report it, and the coordinator files it sized for one pull request at the run's close, once a day, and in a `keepRunning` run when a project goes idle; you choose whether it starts |
| `cl:triage` | filed through the issue template; read it before adding another label |

Rejected work is closed as not planned, with no label. `/cl-repo:setup` lists the labels the repository lacks and creates the ones you approve.

`/cl-workflow:questions` asks this repository's `cl:needs-human` issues in batches, comments each answer and labels the ones you defer, then asks the local queue, where it writes the answer line the coordinator reads. That line counts as the owner's, so the [role guard](#role-guard) refuses edit-tool writes to the queue, and commands that reach it, in every session but the one where you typed `/cl-workflow:questions` and in every subagent; the coordinator files through `approval.mjs file`.

- A command reaches the queue when its text names `.cedarloom/questions` or when a word or redirection target, read as the shell decodes it from the session folder and from each folder a `cd`, `pushd` or `Set-Location` before it names, lies in it (`*`, `?` and `[...]` count as any name, but two such segments in a row, as in `*/*`, match no folder).
- It does not try to catch a command written to get around it (`.c*/q*`, braces, variables, bracket classes, look-alike letters, a tool's own folder option such as `git -C`), nor one that acts on `.cedarloom` itself, such as `rm -rf .cedarloom`. A session whose folder lies in the queue writes nothing there.
- The guard also refuses, in every session, writes to the window files of `/cl-workflow:ask`, commands that name them, and a `claude` launch with `/cl-workflow:questions` or `/questions` in its command line: `claude -p` expands such a command ([headless mode](https://code.claude.com/docs/en/headless)), and no hook input tells that session from one where you typed it.

## Role guard

The role guard leaves merges, releases and shared repository state to the coordinator as far as a hook can. In every other session with the cl-workflow plugin on, and in every subagent, its `PreToolUse` hook for the Bash, Monitor and PowerShell tools (and the edit tools, for the [local queue](#owner-questions)) denies these commands as it reads them. A command written to get around it can pass, and a Monitor call on a WebSocket runs no command and passes.

- merging and direct commits (`gh pr merge`, `gh repo sync`, its local form without a repository included, the merge, `merge-upstream` and `contents` endpoints of `gh api` with a method other than GET, and its merge and `createCommitOnBranch` mutations, sent to the `graphql` endpoint in any case, with leading or trailing slashes, a query or a fragment, or as its full URL) and releases (`gh release` except `list`, `view`, `download` and `verify`, `gh workflow run`, and the `dispatches` endpoints of `gh api`)
- tag pushes (`git push --tags`, `--follow-tags`, `--mirror`, `tag <name>`, or a refspec that is under `refs/tags/`, names a tag of the repository, or names a version such as `v1.2.0` and is no local branch) and pushes to the default branch (`main`, `master`, the branch `refs/remotes/<remote>/HEAD` names, or the current branch's push target for a `git push` without a refspec), `--all` and `--branches` included, and pushes to a remote whose default branch the hook cannot read: a URL, a path, or a remote without `refs/remotes/<remote>/HEAD` (`git remote set-head <remote> --auto` sets it); a push that names no remote goes where git sends it: the branch's `pushRemote`, `remote.pushDefault`, the branch's remote, the sole remote, else `origin`; git takes a unique prefix of a long option, so `--tag` counts as `--tags`
- repository settings and security: `gh repo edit`, `rename`, `archive`, `delete` and `deploy-key`, `gh secret` and `gh variable` writes, `gh workflow enable` and `disable`, and `gh api` calls other than GET to settings, rulesets, branch protection, secrets and security alerts
- `gh auth`, gh's own config, aliases and keys
- `git config` except its `--get` and `--list` forms, `git -c`, and `git stash`
- `claude --bare`: hooks do not run in bare mode, this one included, even for a plugin loaded with a flag ([headless mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode)). No line in a plugin starts `claude` with `--bare`, as a command line or as a spawn call with its argument list (skill lint). Bare mode is announced as the future default for `-p`; once it is, a `-p` launch from a guarded session runs unguarded unless the hook covers it too.

Only the coordinator's session runs with `CEDARLOOM_ROLE=coordinator` ([how to start it](../README.md#typical-flow)): a variable in your shell profile or the `env` of user settings reaches every session, workers included. Every other session with the plugin on is guarded, as is one started from a guarded one while it runs hooks.

- Subagents inherit the coordinator's environment, so the hook guards every call that names one (`agent_id`, [hooks reference](https://code.claude.com/docs/en/hooks)). Start a session from the coordinator's shell without the variable: `env -u CEDARLOOM_ROLE claude -p "<prompt>"`.
- The hook reads the command as the shell splits it, with the backslash as escape character for Bash and Monitor and the backtick for PowerShell: line continuations join, quoted words stay whole, and the text of each quoted word is read again as commands, so `bash -c "gh pr merge 1"` is denied, and so is a commit message or comment text that names such a command: put that text in a file (`-F`, `--body-file`).
- Git questions (the current branch, tags, the remote's default branch) go to the session's folder, to the existing folder a `cd`, `pushd` or `Set-Location` at the start of the command moves to, or to `git -C <dir>`. A push from the repository `GIT_DIR` (set anywhere in the command) or `git --git-dir` names is denied: push from its folder with `git -C <dir>`. After any other folder change git's folder is unknown: a target that is a variable, a substitution, a missing folder or a `~` path, `cd -`, `popd`, `Pop-Location`, and a `cd` later in the command, after a keyword, in parentheses, braces, a pipeline, quoted text, a comment or a here-document. A push then names its branch (`git push origin <branch>`; none or `HEAD` is denied), checked in the session's folder and each folder the command names, each needing a readable `refs/remotes/<remote>/HEAD`. A push without a refspec is denied where no current branch can be read (`git -C` to a missing folder, a detached HEAD), and every push without git on the hook's PATH.
- The hook asks git for the current branch before the command runs, so a push of the current branch after a switch to the default branch in the same line passes (`git checkout main && git merge feat/x && git push`; the hook's tests list such known passes).
- It stops a model that forgets its role, not one that works around it (a variable as the command, a git or gh alias, a script, `node -e`, an MCP tool). The binding layer is a GitHub token without those rights and rulesets on the default branch (pull requests required) and release tags, which you set up.
- Input the hook cannot read exits 2, which refuses the call; so does a hook that cannot start ([`onFailure: "block"`](https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails)). The hook is not tested in `bypassPermissions` mode.
- Codex runs no such hook.

## Coordinator context rotation

A long-running coordinator of `/cl-orchestration:coordinate` starts over with a fresh context when it is idle, instead of growing until auto-compaction garbles its state.

Where it applies:

- Only a coordinator whose project folder (where the agent started; a shell `cd` does not move it) holds the handoff file `.cedarloom/runs/handoff.md`, which the skill writes when a run starts and deletes when it closes, and whose session id the file names (`Session: <id>`). A Codex session holds no run: the coordinator needs Claude Code ([Start the run](../plugins/cl-orchestration/skills/coordinate/orca.md#start-the-run)), so the Codex `SessionStart` hook finds no file that names its session.
- The hooks act only in the session whose id matches, not in another session started in the same folder, and only in a session that draws on a surface. A `claude -p` run that resumes the coordinator's session carries its id but never counts as the coordinator, except for the hand-back after a compaction: that command hook does not tell such a run apart. A `claude --resume` of the coordinator's session in a second terminal draws on a surface, so both processes can restore, clear and move the line; a `/clear` there moves it even before that process has run a turn.
- After a `/clear`, or several in a row, in the same Claude Code process, the plugin moves the line to the new session id at the next prompt or turn. Only a `session.end` with reason `clear` arms that move, for one use, and any other session end disarms it, so an id change with no `/clear` before it (a `/resume` to another conversation) leaves the line as it is. A `/clear` whose `session.end` hook did not run (all `session.end` hooks share one short time bound), and a `/clear` followed by a `/resume` away and back, leave the line at the old id: the coordinator then gets no restore, stamp or clear until the owner asks it to resume the run, when it writes its id into the line ([Handoff file](../plugins/cl-orchestration/skills/coordinate/SKILL.md#handoff-file)).
- Without the file or that line the hooks do nothing, and they refuse a file that is a symbolic link or sits behind one, and a folder that is no readable git repository or where git tracks anything under `.cedarloom/runs`, so a repository cannot plant the file. The coordinator's folder must therefore be a git repository.

What it does:

- After a `/clear` or compaction, the plugin hands the file back with a line telling the model to run its Resume steps first (Orca's mail, then the run's state). After a `/clear` it comes with the first prompt that is no slash command, as context, or in the text of the plugin's own resume prompt; after a compaction a `SessionStart` command hook reads it from the folder `CLAUDE_PROJECT_DIR` names. The module reads the session's project root, which follows a `/cd`, a host's directory change and a worktree move; `CLAUDE_PROJECT_DIR` may not, so after such a move the file may not come back after a compaction. After the file comes what git shows changed since the coordinator last wrote it (the plugin's own status line does not count): commits on local branches (the workers' too) and uncommitted files with a newer modification time, at most 20 each; a git failure leaves the section out. At most 9,000 characters come back: the file first, with a line saying the rest was cut, then the section in the room left.
- In Claude Code the plugin also writes a status line into the file's status block before a compaction and before its own clear.
- Where Claude Code's built-in guard loads, it passes over the settings hook events (`classic.*`) of a mod the user installed ([mods admin](https://code.claude.com/docs/en/plugins/mods/admin)). There the status line before a compaction and the idle clear do not run, only the hand-back, and the coordinator's context grows until auto-compaction, or to the window limit when auto-compaction is off. The hand-back after a `/clear` hooks native events (`session.end`, `prompt.submit`, `turn.start`), and the one after a compaction is the command hook of the plugin's hooks file.
- Claude Code only: when the main loop ends a turn with no background task running and no other Stop hook blocking, and its context is above the option `rotateAtTokens` (200000 by default), the plugin runs `/clear` and submits a prompt that resumes the coordinator from the file. `rotateAtPercent` above 0 compares that percent of the model's context window instead; both at 0 turns it off. On a model with a 200k context window auto-compaction comes first, so set `rotateAtPercent` there (for example 60). At most one clear every 10 minutes. When Claude Code reports no context size, the plugin says so once in the transcript and clears nothing at the threshold.
- A `/clear` and resume prompt that have not finished after 15 minutes are given up: the plugin says so in the transcript, submits no resume prompt, and clears again at a later idle stop.

The hooks write only the handoff file. They read it, run `git` in its project folder (`ls-files`, `status`, `rev-parse`, `log`), read the modification times of the changed files git lists, and make no network request of their own; the resume prompt they submit goes to the model as any prompt does.

## Code Mode (optional)

[Code Mode](https://code.claude.com/docs/en/code-mode) is an experimental Claude Code feature in which Claude writes JavaScript that makes several tool calls in one step. It is off by default and may change or be removed in any release.

- It needs, among others: Claude Code at the [minimum version](../README.md#requirements) on the native build, an interactive terminal session, and Opus 5.5, Sonnet 5.5, Haiku 5.5 or Fable 5.2. Its [requirements](https://code.claude.com/docs/en/code-mode#requirements) list the rest and the settings that block it (an API key helper, agent teams, OpenTelemetry export, `DISABLE_TELEMETRY`).
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

Run unattended workers in a sandbox or a dev container with a network allow-list ([Requirements](../README.md#requirements)).
