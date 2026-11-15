# The plugins

What the CedarLoom plugins add to a Claude Code session besides their skills, and the settings that control it. Install, update and uninstall steps are in the [README](../README.md); the skills are in [Skills](skills.md).

| Plugin | Hooks | Settings |
|---|---|---|
| `cl-workflow` | [Terminal questions](#terminal-questions), [role guard](#role-guard), [status band](#the-status-band) | `tierBand` |
| `cl-orchestration` | [Coordinator context rotation](#coordinator-context-rotation) | `rotateAtTokens`, `rotateAtPercent`, `rotateAfterTasks` |
| `cl-setup` | none | none |

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

## Terminal questions

By default a Claude Code session with the cl-workflow plugin on never uses the question tool (`AskUserQuestion`) or plan mode (`EnterPlanMode`).

- The plugin's `PreToolUse` hook refuses both with the rule as its reason: open questions with recommendations go into one issue per task in the issue tracker the project names, else the report; safe, reversible recommendations are taken and the work goes on; no chat-text interviews either.
- A `SessionStart` hook adds that rule as one line at start, resume, `/clear`, compaction and fork.
- `/cl-workflow:ask` allows both for 30 minutes, `for <n>m` or `for <n>h`, `until HH:MM` (local time), and `off` ends the window early.
- `/cl-workflow:questions`, the question queue, allows both for the rest of the session, as running it means you sit at the terminal; `/cl-workflow:ask off` or a timed `/cl-workflow:ask` replaces that. It asks you the open `question` issues of the hub repository that CedarLoom's owner-questions rule or the machine-local `CLAUDE.local.md` line names, never a project's own rules, in batches, comments each answer, and labels the ones you defer `deferred` so the queue skips them.
- A window ends at its time or when Claude Code quits. `/clear`, compaction and a fork keep it, while a new Claude Code process or a resumed conversation starts with questions off.
- A `UserPromptExpansion` hook sets the window, and that event fires only when a typed command expands ([hooks reference](https://code.claude.com/docs/en/hooks#userpromptexpansion)). So the same text in a scheduled task sets nothing (checked with a cron job, Claude Code 2.1.316), nor, by that reference, in a `/loop` iteration or a message from another session; the skill is user-only.
- The window is one file per Claude Code process in the plugin's data folder (`ask/<CLAUDE_PID>.json`, the window's end), and `CLAUDE_PID` is set in the Bash tool too, so a model that writes that file opens the window: the hooks stop a model that forgets the rule, not one that works around it.
- When the refusal hook cannot start, both stay refused ([`onFailure: "block"`](https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails)).
- On Windows the hooks start `node` without a shell, which needs `node.exe` itself on the PATH: with only a `.cmd` or `.bat` shim, the refusal still holds but `/cl-workflow:ask` cannot open the window (unverified on Windows).
- Setting `disableAllHooks` turns the hooks off.
- Codex runs none of these hooks, so there `/cl-workflow:ask` changes nothing.

## Role guard

Only the coordinator merges, releases and changes shared repository state. In every other Claude Code session with the cl-workflow plugin on, and in every subagent, its `PreToolUse` hook for the Bash, Monitor and PowerShell tools denies the following (a Monitor call on a WebSocket runs no command and passes):

- merging and direct commits (`gh pr merge`, the merge, `merge-upstream` and `contents` endpoints of `gh api` with a method other than GET, and its merge and `createCommitOnBranch` mutations, sent to `graphql` or `/graphql`) and releases (`gh release` except `list`, `view`, `download` and `verify`, `gh workflow run`, and the `dispatches` endpoints of `gh api`)
- tag pushes (`git push --tags`, `--follow-tags`, `--mirror`, `tag <name>`, or a refspec that is under `refs/tags/`, names a tag of the repository, or names a version such as `v1.2.0` and is no local branch) and pushes to the default branch (`main`, `master`, the branch `refs/remotes/<remote>/HEAD` names, or the current branch's push target for a `git push` without a refspec), `--all` and `--branches` included, and pushes to a remote whose default branch the hook cannot read: a URL, a path, or a remote without `refs/remotes/<remote>/HEAD` (`git remote set-head <remote> --auto` sets it); a push that names no remote goes where git sends it: the branch's `pushRemote`, `remote.pushDefault`, the branch's remote, else `origin`; git takes a unique prefix of a long option, so `--tag` counts as `--tags`
- repository settings and security: `gh repo edit`, `rename`, `archive`, `delete` and `deploy-key`, `gh secret` and `gh variable` writes, `gh workflow enable` and `disable`, and `gh api` calls other than GET to settings, rulesets, branch protection, secrets and security alerts
- `gh auth`, gh's own config, aliases and keys
- `git config` except its `--get` and `--list` forms, `git -c`, and `git stash`
- `claude --bare`: hooks do not run in bare mode, this one included, even for a plugin loaded with a flag ([headless mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode)). No line in a plugin starts `claude` with `--bare`, as a command line or as a spawn call with its argument list (skill lint). Bare mode is announced as the future default for `-p`; once it is, a `-p` launch from a guarded session runs unguarded unless the hook covers it too.

Start the coordinator's session with `CEDARLOOM_ROLE=coordinator` in its environment, for example `CEDARLOOM_ROLE=coordinator claude`, and nowhere else: a variable in your shell profile or in the `env` of user settings reaches every session, workers included. A session without it, or with another value, is guarded, and so is a session started from a guarded one, as long as it runs hooks.

- The coordinator's subagents inherit its environment, so the hook guards every call whose input names a subagent or teammate (`agent_id`, [hooks reference](https://code.claude.com/docs/en/hooks)). A session or script started from the coordinator's shell inherits the variable as well: start it without, for example `env -u CEDARLOOM_ROLE claude -p "<prompt>"`.
- The hook reads the command as the shell splits it, with the backslash as escape character for Bash and Monitor and the backtick for PowerShell: line continuations join, quoted words stay whole, and the text of each quoted word is read again as commands, so `bash -c "gh pr merge 1"` is denied, and so is a commit message or comment text that names such a command: put that text in a file (`-F`, `--body-file`).
- Git questions (the current branch, tags, the remote's default branch) go to the session's folder, to the existing folder a `cd`, `pushd` or `Set-Location` at the start of the command moves to, or to `git -C <dir>`. After `git --git-dir` or any other folder change the folder git runs in is unknown: a target that is a variable, a command substitution, a missing folder or a path with `~`, `cd -`, `popd` or `Pop-Location`, and a `cd` later in the command, after a keyword, in parentheses or braces, in a pipeline, in quoted text, in a comment or in a here-document. A push then has to name its branch (`git push origin <branch>`; a push without a refspec or of `HEAD` is denied), and its refspecs and the remote's default branch are checked in the session's folder and in every folder the command names, so each of them needs a readable `refs/remotes/<remote>/HEAD`. A push without a refspec is also denied where no current branch can be read: `git -C` to a missing folder, a detached HEAD. Without git on the hook's PATH every push is denied.
- The hook reads the command text and asks git for the current branch before the command runs. A push of the current branch (`git push` without a refspec, `git push origin HEAD`) after a command that switches to the default branch in the same line therefore passes, for example `git checkout main && git merge feat/x && git push`; the same push in a later tool call is denied. A repository ruleset on the default branch that requires pull requests and blocks direct pushes is required: it is the binding layer for pushes to the default branch, and the hook only stops most of them earlier. The hook's tests list these forms as known passes.
- It stops a model that forgets its role, not one that works around it (a variable as the command, a git or gh alias, a script, `node -e`, an MCP tool). The boundary is a GitHub token without those rights and rulesets on the default branch and release tags, which you set up yourself.
- When the hook cannot read its input, it exits with code 2, which refuses the call. When it cannot start, the call is refused as well ([`onFailure: "block"`](https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails), Claude Code 2.1.295 or later; an older version runs the call). Monitor's commands reach the hook from Claude Code 2.1.314. Whether it runs in `bypassPermissions` mode is unverified.
- Codex runs no such hook.

## Coordinator context rotation

A long-running coordinator of `/cl-orchestration:orchestrating-projects` starts over with a fresh context when it is idle, instead of growing until auto-compaction garbles its state. It applies only to a coordinator in an Orca terminal: its project folder (where the agent started; a shell `cd` does not move it) holds the handoff file `.cedarloom/runs/handoff.md`, which the skill writes when a run starts and deletes when it closes, and the file names that terminal (`Terminal: <ORCA_TERMINAL_HANDLE>`). The hooks act only in the session whose `ORCA_TERMINAL_HANDLE` matches, not in another session started in the same folder, and, in Claude Code, only in a session that draws on a surface: a `claude -p` child started from the coordinator's shell inherits the variable but never counts as the coordinator. The Codex hook cannot tell a `codex exec` child apart, so such a child gets the file when it compacts. Without the file or that line they do nothing, and they refuse a file that is a symbolic link or sits behind one, and a folder that is no readable git repository or where git tracks anything under `.cedarloom/runs`, so a repository cannot plant the file. The coordinator's folder must therefore be a git repository.

- After a `/clear` or compaction, the plugin hands the file back to the model with a line to run its Resume steps first (the runner's mail, then the run's state). Codex does this too, through a `SessionStart` hook you review and trust with `/hooks` ([Codex hooks](https://learn.chatgpt.com/docs/hooks)); how Codex runs a hook command on Windows is undocumented, so there it is unverified. After the file comes what git shows changed since the coordinator last wrote the file (the plugin's own status line does not count): the commits on local branches (the workers' branches too) and the uncommitted files with a newer modification time, at most 20 each; a git failure leaves the section out. At most 9,000 characters come back: the file first, with a line saying the rest was cut, and the section only in the room the file leaves.
- In Claude Code the plugin also writes a status line into the file's status block before a compaction and before its own clear.
- Claude Code only: when the main loop ends a turn with no background task running, no other Stop hook blocking the stop, and its context is above the plugin option `rotateAtTokens` (200000 by default), the plugin runs `/clear` and submits a prompt that resumes the coordinator from the file. `rotateAtPercent` above 0 compares that percent of the model's context window instead; both at 0 turns it off. On a model with a 200k context window, auto-compaction comes before 200,000 tokens, so set `rotateAtPercent` there (for example 60). At most one clear every 10 minutes. When Claude Code reports no context size, the plugin says so once in the transcript and clears nothing at the threshold.
- Claude Code only, off by default: `rotateAfterTasks` above 0 also clears such an idle coordinator once that many tasks of its Orca run have completed or failed since its last clear (since its first idle stop in that run, before any clear), whatever its context size. The plugin then reads `orca orchestration task-list --json` at each idle stop; when Orca gives no list, the count does not move.
- A `/clear` and resume prompt that have not finished after 15 minutes are given up: the plugin says so in the transcript, submits no resume prompt, and clears again at a later idle stop.

The options are those of `cl-orchestration@cedarloom` (see the top of this page). The hooks read and write only the handoff file, run `git ls-files` in its project folder (and, with `rotateAfterTasks`, `orca orchestration task-list --json`), and send nothing.
