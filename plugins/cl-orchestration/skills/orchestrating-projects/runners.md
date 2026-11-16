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
| Gates | How an owner decision holds its item, per [mode](#modes), and how the owner's answer reaches the worker ([Gates](#gates)). |
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
- **Automatic:** a Claude Code worker starts only with the sandbox on (below), with `--permission-mode dontAsk` and `--settings <run folder>/settings/<id>.json` on its launch; a call the bounds and allow rules do not cover is denied, never prompted. No flag that bypasses permission prompts, in any form. The coordinator takes the recommended default only for a safe, reversible choice and records it in the handoff's `## Decisions` and the report. A worker takes one issue, whatever `issuesPerWorker` says: it cannot commit, so it cannot switch branches. It is released at its report, and each follow-up of it is a new start ([Sandbox on](#sandbox-on)). Its spec changes as [spec-template.md](spec-template.md#automatic-mode) says.

`dontAsk` only refuses tool calls that no allow rule lists; it decides no question: an owner-only decision is a gate ([Gates](#gates)).

### Gates

A gate holds one item for the owner while the other items go on ([Owner-only decisions](SKILL.md#owner-only-decisions)): in supervised mode every question put to the owner, in automatic mode an owner-only decision only.

- Worker side: the worker never decides an owner-only question and never takes a default for it, also where a tool call would pass. With a question command and in supervised mode it asks and waits for the answer; otherwise it stops that item and reports BLOCKED with the question ([spec-template.md](spec-template.md)).
- Coordinator side: put each such question to the owner once, in your own words, as an approval whose What starts with `question` and names the issue and the decision ([approvals.md](approvals.md)), and record it in `## Open` with the worker (its id and, where it asked, the question's id) in place of the head. A BLOCKED report keeps its worktree and branch ([Outcomes](SKILL.md#outcomes)).
- After the answer the runner's Gates section brings it to the same worker, or where its session ended to a new start in its worktree with the gate form of the spec's Branch line ([spec-template.md](spec-template.md)) and the answer under `Shared context:`. Either counts like a follow-up for the caps ([SKILL.md](SKILL.md#loop), step 5). The item goes on and ends with a new report. An answer that holds, and no answer, keep it blocked: list it in the report.

### Sandbox on

The worker's settings file is written by `node <skill folder>/worker-settings.mjs <worktree path> <run folder>/settings/<id>.json <domain>...`, both paths absolute, the domains being the policy's `sandbox.allowedDomains`, never by hand: [automatic-settings.json](automatic-settings.json) with `//W/` as the worktree, `//C/` as the shared `.git` (two levels above the folder the worktree's `.git` file names) and the domains as `sandbox.network.allowedDomains`. The worker cannot write the file: the file tools, the sandbox and `dontAsk` keep it to its worktree.

- Claude Code v2.1.319 or later (`claude --version`): an older version may ignore a key it does not know. The keys need at most v2.1.314 where the settings reference states a version, `sandbox.credentials.envVars` states none (unverified), and no other key needs v2.1.319; on v2.1.316 every key of that template without `envVars` acted, and v2.1.325 ran the whole template.
- The file tools keep to the worktree (`blockWritesOutsideWorkingDirectories`, `blockReadsOutsideWorkingDirectories`), and with the sandbox on the read block also closes the home folder and the other users' folders to Bash. Bash writes reach the worktree, the temporary folder and the shared `.git` minus `hooks`, `config` and the paths of the deny rules below, so a package manager whose cache lies in the home folder fails there (`npm ci`: `EPERM` on `~/.npm/_cacache`, v2.1.325). The credential entries keep cloud, container and GPG credentials closed and unset the GitHub and npm tokens for every command.
- The worker reaches no runner app over a local socket. With Orca, its `orca orchestration send` and `ask` fail with `runtime_unavailable` (Orca 1.4.254, Claude Code v2.1.325): the CLI reads `orca-runtime.json` in the home folder, which the read block closes, and stops there. It would then connect to Orca's socket, which the sandbox closes too (unverified: read from the CLI's source and the settings reference, not run). Neither is opened: that file holds Orca's one auth token, with which `orca terminal create --command` runs any command on the host outside the sandbox. So an automatic worker's report arrives only as Orca's `Worker stopped without reporting` escalation with its last output, not by the runner's Reports; the probe's pass rule fails, and the project runs supervised ([Automatic start](#automatic-start)).
- The network allow list is `strictAllowlist` with the policy's hosts: what the project's own tools fetch. The worker neither pushes nor runs `gh`, so no GitHub host is needed for git. The `Bash(git push *)` deny stops the plain form only: `git -C . push` passed it and failed at the sandbox's network proxy (Claude Code v2.1.325), so the push bound rests on the allow list and on credentials, and a GitHub host in the allow list runs the project supervised ([Automatic start](#automatic-start), check 4).
- The deny rules close the paths that configure Claude Code or run later outside the sandbox (`.claude`, `.mcp.json`, `.vscode`, `.idea`, `.bashrc`, `.zshrc`, `.gitconfig`, `.envrc`, `.npmrc`, `.husky`), and `commondir` and `config.worktree` in the shared `.git` and in each of its `worktrees/*` folders, which would make git load configuration the worker wrote: in the main checkout and in any worktree of the project, outside the sandbox. An item that must change one is BLOCKED for the owner.
- For each folder under the shared `.git`'s `worktrees` when the file is written, the script adds the two rules with that folder's name beside the `worktrees/*` pattern rules. Only a rule that names a path keeps its folder from being renamed, and so from being swapped for a copy with another `commondir` (on Linux through mount points: the sandbox makes each folder between a named path and the write root one, which the kernel refuses to rename), and on Linux the sandbox skips a pattern rule for writes. A folder made after the file was written has the pattern rules alone, until that worker's next settings file: on macOS they close its two files but not a rename of the folder, on Linux nothing. So no worktree of a project is made while an automatic worker of that project is started and not yet released:
  - An automatic worker is released as soon as its report arrives. Its staged change waits in the worktree, which stays, for [Commit and push](#commit-and-push) to open its pull request. It counts as released only once its session has ended, which the runner's Clean up confirms ([orca.md](orca.md#clean-up)).
  - Every later turn of that worker (a follow-up with review findings, a re-check, a conflict with the default branch) is a new start in the same worktree, with its settings file written again, so that file names the folders that exist then.
  - This is the regular case, also with one worker per project: the next issue of the project gets its worktree only once the worker before it is released, and a follow-up never runs under a settings file older than a worktree.
  - Workers that start together get their worktrees before the first of their settings files. A worktree needed while one of them still works waits until that worker is released.
  - Some automatic workers are never released or not released yet: a worker whose terminal a person typed in is never released, a start held at a dialog has loaded its settings file and so counts as started, and a worker whose session end the runner cannot confirm stays unreleased. While one of these lasts, no worktree is made in its project, and the project's waiting issues are listed for the owner in the report and do not hold the run open.
  - Supervised workers stay open for follow-ups as the runner says.

  The `commondir` read of [Commit and push](#commit-and-push) is the second check. Unverified: the sandbox's part of this is read from the [sandbox runtime](https://github.com/anthropic-experimental/sandbox-runtime)'s README and source, not run, and which runtime version Claude Code carries is not known.
- Lists of rules and folders merge across every settings scope the worker loads, so the bounds are the template plus the user's and the main checkout's entries.

### Automatic start

Check 2 runs before every start of an automatic worker (its first start, a retry, each follow-up, the probe), the others before the first automatic worker of each project in a run, in this order. A failure, except the `--check` read of check 2, runs that project supervised for the rest of the run where the runner offers it, else starts nothing there; write it in the handoff's `Mode:` line and name the check or step in the report.

1. `claude --version` is v2.1.319 or later.
2. `worker-settings.mjs` wrote the worker's settings file right before the start ([Sandbox on](#sandbox-on)) and exited 0. A hand-made file can keep a placeholder or a wrong path and still load, with its deny rules pointing nowhere. Then, as the last command before the runner starts the worker's session (with Orca, before each `terminal create`), `node <skill folder>/worker-settings.mjs --check` with the same arguments exits 0: it reads the file as it is then and passes only the exact text the script writes for that worktree and those domains. Claude Code starts with an empty settings file as with none, so without the sandbox and the file-tool bounds (v2.1.325). Any other exit starts no worker: it makes the item BLOCKED, and for the probe it fails check 5.
3. No hook of the user settings, of managed settings, of an enabled plugin, of the project's `.claude/settings.json` or of the main checkout's `.claude/settings.local.json`, no MCP server of the user settings, of an enabled plugin or of the project's `.mcp.json`, and no monitor or LSP server of an enabled plugin runs a file inside the repository or a tool that loads the repository's code or configuration (a formatter, a linter, a package script): these run outside the sandbox, so a worker that edits such a file gets its code run unsandboxed.
4. No entry that defeats a bound, in managed settings, the user settings, the project's `.claude/settings.json` or the main checkout's `.claude/settings.local.json`: a `sandbox.excludedCommands` entry (an excluded command runs outside the sandbox, and an allow rule lets it run without a prompt), a `sandbox.network.allowUnixSockets` or `allowAllUnixSockets` entry (the SSH agent, a container socket), an `allowRead`, `allowWrite` or `additionalDirectories` entry outside the worktree, and no GitHub host (`github.com`, a subdomain of it, `*.githubusercontent.com`) in the merged network allow list or in a `WebFetch(domain:...)` allow rule of those files (unverified: whether such a rule adds its host to the sandbox's allow list). Name in the run report the other allow rules and `sandbox.network.allowedDomains` entries of those files.
5. The probe: one worker with the same launch in a scratch worktree of the project (create `.husky/` there first, and a second scratch worktree of the project beside it before the probe's settings file is written, so that the file names its folder), its spec these steps. Check each result yourself where you can.
   1. Version: as check 1.
   2. The Write and Read tools on a file in the run folder are refused, and no file appears there. The Write refusal names `blockWritesOutsideWorkingDirectories`, which shows the settings file loaded.
   3. Bash `touch` and `cat` on that file fail with `Operation not permitted`.
   4. The Write tool and Bash `touch` on `.claude/settings.json`, `.mcp.json`, `.husky/pre-commit`, `.envrc`, `.npmrc` and `.git` are refused, and Bash `touch` on `<common .git>/hooks/probe`, `<common .git>/config`, `<common .git>/commondir`, `<common .git>/config.worktree`, and `commondir` and `config.worktree` in `<common .git>/worktrees/<id>/` and in the second scratch worktree's folder there (the absolute paths, filled in) fails with `Operation not permitted`. Bash `mv` of the second worktree's folder there to `<its name>.moved` fails and the folder keeps its name. On macOS the message is `Operation not permitted`. On Linux the criterion is the kept name: the folder is a mount point there ([Sandbox on](#sandbox-on)), so the message may be `Device or resource busy` (`EBUSY`) (unverified: not run). A touch or the `mv` that passes there shows that the sandbox does not take the rules that name that folder.
   5. Bash `curl -sS -I https://example.com` is refused.
   6. Bash `env -u CEDARLOOM_ROLE claude -p 'reply ok'` fails.
   7. A write in the worktree and `git add` succeed; `git push origin HEAD:refs/heads/probe/<r>` is refused, `git -C <W> push origin HEAD:refs/heads/probe/<r>` (a form the deny rule does not match) fails at the network: for an HTTPS origin with `CONNECT tunnel failed, response 403` from the sandbox's proxy, for an SSH origin at its connection (unverified: the message). A permission refusal of that call fails this step, since it tests no network bound. Then, as the coordinator, `gitW ls-remote origin refs/heads/probe/<r>` ([Commit and push](#commit-and-push)) prints nothing; commit on the host as [Commit and push](#commit-and-push) says, and run its push with `--dry-run`.

Pass rule: every step as stated, and the probe's report arrives by the runner's Reports, which shows the worker reaches the coordinator from inside the sandbox; no report within `stallMinutes` fails it. Steps 2 and 5 also pass on `dontAsk` alone; without the sandbox, step 3 names don't-ask mode instead of `Operation not permitted` and step 7's `git add` is refused. After the probe, first and without git, remove each file that a passing touch of step 4 made in the shared `.git` (an empty `commondir` there stops every git command in the project) and give a folder that a passing `mv` renamed its name back. Then remove both scratch worktrees, each as an automatic worker's: the `commondir` read of [Commit and push](#commit-and-push) on its folder, then `git --no-replace-objects -C <project path> -c core.hooksPath=/dev/null -c core.fsmonitor=false -c protocol.ext.allow=never worktree remove <worktree path>`. `worktree remove` refuses a worktree with changes, untracked or staged: the probe's file when the probe ended before step 7's commit, a file a passing touch of step 4 made in the worktree. For the probe's worktree only, and once you have read those files, add `--force` after `worktree remove`. The second scratch worktree and every worker's worktree are removed without it. Then delete the branch `probe/<r>`: its commit is the probe's, never pushed.

### Commit and push

The worker stages its change and reports the branch, the staged files and a commit message. The worker can write the refs, replace objects and grafts of the shared `.git`, so these steps take commits from origin, never from local refs or history. It can also write the worktree's folder there, which `<W>/.git` names: before each step and any other git command of yours in `<W>` (Clean up's too), read that folder's `commondir` with the file tool. It holds `../..`, the folder's `config.worktree` is missing or empty, and the shared `.git` has no `commondir`; anything else (git would load configuration, and so commands, the worker wrote) makes the item BLOCKED. An empty `config.worktree` is accepted: while another automatic worker of the project runs a command, the Linux sandbox binds an empty file over each deny path that does not exist, and removes it after the command. The settings file's deny rules keep these closed to the worker; this read is the second check.

Every git command of yours in `<W>`, below and in Clean up, runs as `git --no-replace-objects -C <W> -c core.hooksPath=/dev/null -c core.fsmonitor=false -c protocol.ext.allow=never`, written `gitW` here: a hook (also of a fetch, which writes a ref), a monitor or an `ext::` remote would run worktree code outside the sandbox, so the project's hooks do not run here and its CI checks the change. `policy.mjs` pins the same three. After the runner's Write scope check:

1. `gitW rev-parse HEAD` is a commit of origin: `gh api repos/<owner/repo>/compare/<that sha>...<branch>` (while origin has no such branch, `<default branch>`) gives `identical` or `ahead`. In a merge round (step 5), `gitW rev-parse MERGE_HEAD` is the sha that step merged. Anything else (a worker commit) makes the item BLOCKED.
2. `gitW diff --cached --no-renames --name-only` (in a merge round, against `MERGE_HEAD`) lists the reported files, all in the owned paths. A path under `.github/` is the owner's (workflows, the actions and scripts they call run in CI with the repository's secrets before review): BLOCKED with the question, before the push. The project's own tests and scripts, which CI runs too, are outside this check.
3. Write the message to a file in the run folder with the file tool, then `gitW commit -F <file>`. The commit is signed where the owner's git configuration signs. Before the push, check the commit itself: `git commit` takes its tree from the index's cache and adds a `MERGE_HEAD` file as a parent, both of which the worker can write, so steps 1 and 2 do not prove what it holds.
   Right after the commit, `gitW rev-parse HEAD` once gives `<commit sha>`; the checks and the push take that sha and never resolve `HEAD` again, since the worker can move the ref in between.
   - `gitW cat-file commit <commit sha>` has exactly one `parent` line, the step 1 sha (in a merge round two: that sha, then the merged sha). Read the raw commit, never `rev-list` or `log`: a grafts file the worker wrote changes the parents they show.
   - `gitW diff --no-renames --name-only <step 1 sha> <commit sha>` (in a merge round, against the merged sha) prints the list step 2 accepted.

   Anything else makes the item BLOCKED, and nothing is pushed. Then `gitW push origin <commit sha>:refs/heads/<branch>`. First round: `gh pr create -R <owner/repo> --draft --base <default branch> --head <branch> --title "<your own words>" --body-file <file>`. A new title or body the worker answers with is the coordinator's to set.
4. Before a follow-up, `gitW fetch origin <branch>` and `gitW merge --ff-only <sha>`, the sha `gitW ls-remote origin refs/heads/<branch>` prints: `gh pr update-branch` moves the branch on origin.
5. A conflict with the default branch: the same with `<default branch>` and `merge --no-commit` in place of `--ff-only`, then the follow-up. The worker resolves and stages, and step 3's commit is the merge.
