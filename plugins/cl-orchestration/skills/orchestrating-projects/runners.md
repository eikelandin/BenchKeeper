# Runners

A runner starts the workers, carries messages between them and the coordinator, and cleans them up. [SKILL.md](SKILL.md) is runner-neutral: where it needs one of the steps below, it links to the runner's section.

## Choosing the runner

The coordinator chooses once, when the run starts, and writes the name into the handoff file's `Runner:` line. A resumed run keeps the runner of that line.

1. **Run argument.** `--runner <name>` before the project paths.
2. **Plugin option.** `runner`, as [SKILL.md](SKILL.md) reads it: empty means auto.
3. **Auto.** Run the Detect step of `orca` and of every runner plugin `cl-<name>` whose model-only skill `cl-<name>:runner` is available. Exactly one answers: that runner. More than one: start nothing and ask the owner to set `runner`, since no order between them holds. None: claude-code when its Detect step answers, else start nothing and tell the owner that no runner answered.

A name counts only when plain: lower-case letters, digits and `-`, no `-` first. A runner named by the argument or the option that is not listed here, not available as a runner plugin, or fails its Detect step starts nothing: tell the owner the name and the reason. There is no fallback to another runner.

## Interface

Each runner file has these sections, under its own headings where the file says so.

| Section | What it gives the coordinator |
| --- | --- |
| Detect | A read-only probe and the result that means the runner can start workers. |
| Start | How a worker starts with its spec, in its own worktree. |
| Acknowledgement | How a worker confirms that it took its task, and when a missing confirmation counts as a miss. |
| Reports | Where `DONE`, `BLOCKED` and `NEEDS_REPLAN` arrive, mapped to the [outcomes](SKILL.md#outcomes). |
| Questions | The worker's question command, or none. |
| Follow-up | How review findings, red checks and owner answers reach the owning worker. |
| Watch | How the coordinator waits without polling, and the liveness check. |
| Dialogs | What happens to a permission prompt, per [mode](#modes). |
| Write scope | What the worker can write, what enforces it, and the check after each report. |
| Resume | What survives a clear or restart of the coordinator, and how workers are bound again. |
| Clean up | Releasing the worker and removing its worktree. |
| Host limit | How many workers run at once. |
| Scheduled runs | How recurring runs start, or none. |

## Runners

| Runner | File | Detect |
| --- | --- | --- |
| `claude-code` (built in, the default) | [claude-code.md](claude-code.md) | the session is Claude Code with background agents and session crons |
| `orca` (in this skill folder) | [orca.md](orca.md) | an Orca executable is found and its `skills get orchestration` succeeds |

## Modes

Each project's `mode` comes from its policy ([policy.md](policy.md)). A leading `--mode supervised` run argument lowers every project of the run to supervised; nothing raises a mode. A runner whose file offers no automatic mode runs the project supervised: say so in the report. The handoff's `Mode:` line holds each project's mode for the run and, where lower than its policy's, why; a resumed run keeps it.

- **Supervised:** a worker starts in its agent's default permission mode, with no flag that bypasses or skips permission prompts; its prompts are the owner's (the runner's Dialogs). Every question to the owner blocks its own item until answered; other items go on.
- **Automatic:** a Claude Code worker starts only with the sandbox on (below), with `--permission-mode dontAsk` and `--settings <run folder>/settings/<id>.json` on its launch; a call the bounds and allow rules do not cover is denied, never prompted. No flag that bypasses permission prompts, in any form. The coordinator takes the recommended default only for a safe, reversible choice and records it in the handoff's `## Decisions` and the report. A worker takes one issue, whatever `issuesPerWorker` says: it cannot commit, so it cannot switch branches. Its spec changes as [spec-template.md](spec-template.md#automatic-mode) says.

`dontAsk` only refuses tool calls that no allow rule lists; it decides no question.
An owner-only decision still makes the worker stop that item and report BLOCKED with the question: the coordinator files the issue, the item waits, and the owner's answer resumes the same worker session.

### Sandbox on

The worker's settings file is a copy of [automatic-settings.json](automatic-settings.json) outside its worktree, with each `//W/` replaced by `/`, the worktree's absolute path and `/` (`Edit(//W/**)` becomes `Edit(//home/me/wt/**)`: in a `--settings` file `/path` counts from the file's folder) and `sandbox.network.allowedDomains` replaced by the policy's `sandbox.allowedDomains`. Change nothing else. The worker cannot write the file: the file tools, the sandbox and `dontAsk` keep it to its worktree.

- Claude Code v2.1.319 or later (`claude --version`): an older version may ignore a key it does not know. The keys need at most v2.1.314 where the settings reference states a version, `sandbox.credentials.envVars` states none (unverified), and no other key needs v2.1.319; on v2.1.316 every key of that template without `envVars` acted, and v2.1.325 ran the whole template.
- The file tools keep to the worktree (`blockWritesOutsideWorkingDirectories`, `blockReadsOutsideWorkingDirectories`), and with the sandbox on the read block also closes the home folder and the other users' folders to Bash. Bash writes reach the worktree, the temporary folder and the shared `.git` minus `hooks` and `config`. The credential entries keep cloud, container and GPG credentials closed and unset the GitHub and npm tokens for every command.
- The network allow list is `strictAllowlist` with the policy's hosts: what the project's own tools fetch. The worker neither pushes nor runs `gh`, so no GitHub host is needed for git. The `Bash(git push *)` deny stops the plain form only: `git -C . push` passed it and failed at the sandbox's network proxy (Claude Code v2.1.325), so the push bound rests on the allow list and on credentials. Where the policy lists `github.com`, it rests on credentials alone.
- The deny rules close the paths that configure Claude Code or run later outside the sandbox (`.claude`, `.mcp.json`, `.vscode`, `.idea`, `.bashrc`, `.zshrc`, `.gitconfig`, `.envrc`, `.npmrc`, `.husky`). An item that must change one is BLOCKED for the owner.
- Lists of rules and folders merge across every settings scope the worker loads, so the bounds are the template plus the user's and the main checkout's entries.

### Automatic start

Check 2 runs before every automatic worker, the others before the first automatic worker of each project in a run, in this order. A failure runs that project supervised for the rest of the run where the runner offers it, else starts nothing there; write it in the handoff's `Mode:` line and name the check or step in the report.

1. `claude --version` is v2.1.319 or later.
2. The worker's settings file parses: `node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' <file>`. A file that does not parse would load silently as no file.
3. No hook of the user settings, of the project's `.claude/settings.json` or of the main checkout's `.claude/settings.local.json`, and no server of the project's `.mcp.json`, runs a file inside the repository or a tool that loads the repository's code or configuration (a formatter, a linter, a package script): hooks run outside the sandbox, so a worker that edits such a file gets its code run unsandboxed.
4. Name in the run report the allow rules, `additionalDirectories`, `sandbox.filesystem.allowWrite`, `sandbox.excludedCommands` and `sandbox.network.allowedDomains` entries of the user settings, and the allow rules and `additionalDirectories` of the project's `.claude/settings.json` and of the main checkout's `.claude/settings.local.json`.
5. The probe: one worker with the same launch in a scratch worktree of the project (create `.husky/` there first), its spec these steps. Check each result yourself where you can.
   1. Version: as check 1.
   2. The Write and Read tools on a file in the run folder are refused, and no file appears there. The Write refusal names `blockWritesOutsideWorkingDirectories`, which shows the settings file loaded.
   3. Bash `touch` and `cat` on that file fail with `Operation not permitted`.
   4. The Write tool and Bash `touch` on `.claude/settings.json`, `.mcp.json`, `.husky/pre-commit`, `.envrc`, `.npmrc` and `.git` are refused, and Bash `touch <common .git>/hooks/probe` (the absolute path, filled in) fails with `Operation not permitted`.
   5. Bash `curl -sS -I https://example.com` is refused.
   6. Bash `env -u CEDARLOOM_ROLE claude -p 'reply ok'` fails.
   7. A write in the worktree and `git add` succeed; `git push origin HEAD:refs/heads/probe/<r>` is refused, and `git -C <W> ls-remote origin refs/heads/probe/<r>` prints nothing. Then commit on the host as [Commit and push](#commit-and-push) says, and run its push with `--dry-run`.

Pass rule: every step as stated, and the probe's report arrives by the runner's Reports, which shows the worker reaches the coordinator from inside the sandbox; no report within `stallMinutes` fails it. Steps 2 and 5 also pass on `dontAsk` alone; without the sandbox, step 3 names don't-ask mode instead of `Operation not permitted` and step 7's `git add` is refused. After the probe, remove the scratch worktree and its branch `probe/<r>`: its commit is the probe's, never pushed.

### Commit and push

The worker stages its change and reports the branch, the staged files and a commit message. The worker can write the refs, replace objects and grafts of the shared `.git`, so these steps take commits from origin, never from local refs or history. It can also write the worktree's folder there, which `<W>/.git` names: before each step and any other git command of yours in `<W>` (Clean up's too), read that folder's `commondir` with the file tool. It holds `../..` and the folder has no `config.worktree`; anything else (git would load configuration, and so commands, the worker wrote) makes the item BLOCKED. After the runner's Write scope check:

1. `git -C <W> rev-parse HEAD` is a commit of origin: `gh api repos/<owner/repo>/compare/<that sha>...<branch>` (while origin has no such branch, `<default branch>`) gives `identical` or `ahead`. In a merge round (step 5), `git -C <W> rev-parse MERGE_HEAD` is the sha that step merged. Anything else (a worker commit) makes the item BLOCKED.
2. `git --no-replace-objects -C <W> diff --cached --name-only` (in a merge round, against `MERGE_HEAD`) lists the reported files, all in the owned paths. A path under `.github/workflows/` is the owner's (it runs in CI with the repository's secrets before review): BLOCKED with the question, before the push.
3. Write the message to a file in the run folder with the file tool, then `git -C <W> -c core.hooksPath=/dev/null commit -F <file>` and `git -C <W> -c core.hooksPath=/dev/null push origin HEAD:refs/heads/<branch>`: a hook would run worktree code outside the sandbox, so the project's hooks do not run here and its CI checks the change. The commit is signed where the owner's git configuration signs. First round: `gh pr create -R <owner/repo> --draft --base <default branch> --head <branch> --title "<your own words>" --body-file <file>`. A new title or body the worker answers with is the coordinator's to set.
4. Before a follow-up, `git -C <W> fetch origin <branch>` and `git -C <W> -c core.hooksPath=/dev/null merge --ff-only <sha>`, the sha `git -C <W> ls-remote origin refs/heads/<branch>` prints: `gh pr update-branch` moves the branch on origin.
5. A conflict with the default branch: the same with `<default branch>` and `merge --no-commit` in place of `--ff-only`, then the follow-up. The worker resolves and stages, and step 3's commit is the merge.
