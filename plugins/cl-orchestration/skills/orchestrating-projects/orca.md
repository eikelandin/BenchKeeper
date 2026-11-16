# Orca commands

The `orca` runner ([runners.md](runners.md)) drives Orca. `ORCA` stands for the executable the session resolved and used for `ORCA skills get orchestration`; substitute it, do not run `ORCA` literally. Load that guide first: it is the version-matched source for every command and state, and it wins where this file differs. This file holds only what the guide leaves to the caller: the launch settings, how the skill's outcomes, waits, dialogs and cleanup map onto Orca, and the host limit. Prefer `--json`.

The sections of the [runner interface](runners.md#interface), in this file:

| Section | Here |
| --- | --- |
| Detect | an Orca executable is found and `ORCA skills get orchestration` succeeds |
| Start | [Start the run](#start-the-run) |
| Acknowledgement | [Acknowledgement](#acknowledgement) |
| Reports | [Worker reports](#worker-reports) |
| Questions | [Questions](#questions) |
| Follow-up | the follow-up of [Start the run](#start-the-run); the worker answers as [Worker reports](#worker-reports) says |
| Watch | [Watch](#watch) |
| Dialogs | [A permission dialog](#a-permission-dialog) |
| Write scope | the worktree; supervised, anything else prompts in the worker's terminal ([A permission dialog](#a-permission-dialog)); automatic, the bounds of [Sandbox on](runners.md#sandbox-on) |
| Resume | [Resume](#resume) |
| Clean up | [Clean up](#clean-up) |
| Host limit | [Host limit](#host-limit) |
| Scheduled runs | [Scheduled runs](#scheduled-runs) |

## Start the run

`ORCA orchestration run-create --objective "issue work: <project names>" --json` once, then one start per worker, a batch being one worker.

A Claude Code worker starts in a worktree of its own, then by its project's [mode](runners.md#modes):

```text
ORCA worktree create --name <number>-<slug> --repo path:<project path> --base-branch <default branch> --no-parent --setup run --json
```

Supervised: Orca's own launch, on the host's default Claude Code login. It passes no other launch flag, so the worker runs without `--autocompact 200k` and with prompt suggestions on, and it cannot unset `CEDARLOOM_ROLE`: a worker that inherits the variable passes the role guard as the coordinator. Unverified: which source reaches the worker's terminal, a shell profile, Orca's environment or the `worker-start` call, which runs in the coordinator's environment. So each supervised Claude Code worker measures it. Its spec takes this line after `Acknowledge:`:

```text
Role check: right after the heartbeat, before any other command, run `printenv CEDARLOOM_ROLE`. It must print nothing. A value it prints is Blocked (below): name the variable in the report.
```

After such a report, start no further supervised Claude Code worker in the run and tell the owner: `CEDARLOOM_ROLE` goes on the coordinator's launch line only (`CEDARLOOM_ROLE=coordinator claude`).

```text
ORCA orchestration worker-start --spec-file <filled spec file> --worktree path:<worktree path> --agent claude --model '<model>' --effort <effort> --keep-open --json
```

Automatic: a terminal of its own, so that its launch carries the settings below; `worker-start` has no flag for them, and its `--model` and `--effort` do not combine with `--terminal`. `worker-start` on a session that is not idle yet fails with `agent_unconfigured`, hence the wait:

```text
ORCA terminal create --worktree path:<worktree path> --title <number>-<slug> --command "env -u CEDARLOOM_ROLE CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false claude --autocompact 200k --model '<model>' --effort <effort> --permission-mode dontAsk --settings '<run folder>/settings/<id>.json'" --json
ORCA terminal wait --terminal <terminal> --for tui-idle --timeout-ms 60000 --json
ORCA orchestration worker-start --spec-file <filled spec file> --terminal <terminal> --worktree path:<worktree path> --keep-open --json
```

A Codex worker starts with `ORCA orchestration worker-start --spec-file <filled spec file> --worktree new-top-level --repo path:<project path> --base-branch <default branch> --name <number>-<slug> --agent codex --model "<model>" --effort <effort> --keep-open --json`.

- `--autocompact 200k` caps the worker's context at 200,000 tokens before it compacts, and `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false` turns off the next-prompt suggestions no one reads in a worker terminal. `env` sets the variable in any login shell.
- No permission-bypass flag anywhere in a launch. A supervised worker runs in the default permission mode, with the prompts in its terminal ([A permission dialog](#a-permission-dialog)).
- Automatic is for a Claude Code worker only (a Codex worker of an automatic project runs supervised): write its settings file first ([Sandbox on](runners.md#sandbox-on)), `<id>` being `<number>-<slug>`. Before each such worker, pass [Automatic start](runners.md#automatic-start); the probe worker starts the same way in a worktree `probe-<r>` with the probe as its spec, and is released and its worktree removed after it. A failed check or step runs the project supervised.
- Write the filled spec to a file in the run folder and pass that file with `--spec-file`, so issue text is never read by the shell.
- The model and effort are those of the spec's `Agent:` line, the model as the reader printed it, inside single quotes. Leave out what that line gives as the agent default, and the effort whenever the model is left out.
- An automatic worker takes its task only once its agent reached its idle prompt. A `terminal wait` that times out or ends in another state starts no worker: read its screen once (`ORCA terminal read --terminal <terminal> --screen --json`). Such a start has a worktree and a terminal but no dispatch, so neither `worker-list` nor [Clean up](#clean-up) sees them:
  - A dialog there (a trust question, a login) is the owner's ([SKILL.md](SKILL.md#rules)). Write the issue, the terminal handle and the worktree path into the handoff file's `## Open`, list it for the owner, and count it as a working worker ([Host limit](#host-limit)) until the owner acts.
  - Anything else is a failed start ([SKILL.md](SKILL.md#outcomes)). Close the terminal (`ORCA terminal close --terminal <terminal> --json`); the one retry runs in that worktree with a new terminal, from `terminal create` on, and makes no second worktree.
- `<number>-<slug>` takes the first issue of a batch, for the worktree, the terminal title and `--name`. `worktree create` prints the worktree path; for a Codex worker, `worker-show` gives it.
- When the agent refuses the model, start without `--model` and `--effort` and say so in the report.
- `--repo path:<project path>` is one of the selectors Orca's help lists (`id:`, `name:`, `path:`).
- `--keep-open` keeps the worker's terminal after its report, so that a supervised worker's follow-up reaches the session that did the work while its pull request is in review or merge. `worker-release` ends a supervised worker's. An automatic worker's terminal comes from `terminal create`, and `worker-release` never closes such a pre-existing terminal (`worker-release --help`), so the coordinator closes it at the worker's report ([Clean up](#clean-up)).
- Keep the returned dispatch id and task id per worker with its project, issues, worktree path and branch names (the spec's `<type>/<number>-<slug>`); every later command takes the dispatch id. A supervised follow-up (below) returns a new dispatch id: keep both. `worker-show`, `worker-read`, `send`, `worker-retain` and the stall check take the newest; `worker-release` takes each, newest first, since Orca's release closes only the terminal its own dispatch made, never a reused one (`worker-release --help`; unverified in a live run). `<branch>`, `<default branch>` and `<owner/repo>` in this file are the names of that spec.
- A non-zero exit means no worker: read `failedStage` and `residualResources` before trying again.

A follow-up to a worker of this run, a supervised one still held, an automatic one released at its report ([SKILL.md](SKILL.md#loop), step 3), has its text in a file:

- A supervised Claude Code worker gets it as a new dispatch in its own terminal, `<terminal>` being `terminal.handle` of its `worker-show`:

  ```text
  ORCA orchestration worker-start --spec-file <follow-up file> --terminal <terminal> --worktree path:<worktree path> --keep-open --json
  ```

- An automatic worker was released at its report, its worktree kept ([Clean up](#clean-up)), so its follow-up is a new start: a fresh session in a new terminal of the same worktree, as at the start from `terminal create` on, with its settings file written again and the follow-up file holding the filled spec, then the follow-up. Its old terminal would not take it anyway: Orca recognises that terminal for its first dispatch only.
- A Codex worker gets it as a message:

  ```text
  ORCA orchestration send --to dispatch:<dispatch id> --subject "Follow-up" --body "$(cat <follow-up file>)" --json
  ```

A worker on `fable` that already reported gets no follow-up: release it and start a fresh worker on the branch ([SKILL.md](SKILL.md#rules)). Such a follow-up counts like a start ([Host limit](#host-limit)).

## Acknowledgement

The acknowledgement is the worker's first heartbeat. A missing one sends no mail, so the coordinator sees it at the timer's wake-up ([Watch](#watch)). Orca's rule holds: silence, a startup timeout or `unverifiable` liveness proves nothing and authorizes no stop or retry.

- **Still starting**: `worker-show --full` reports the start not ready yet, or the terminal shows the agent loading or working. Keep waiting; it is no miss.
- **Held at a dialog**: `worker-show --full` reports an `observation.agentWait`, or the terminal shows a dialog. It is the owner's, except a permission dialog with `permissionPrompts` `decline` ([A permission dialog](#a-permission-dialog)).
- **A miss**: at two wake-ups at least 10 minutes apart, `worker-read --source terminal` shows the agent idle at an empty prompt and `worker-read` shows no turn on the task. Then `worker-stop` it. Only when the stop is confirmed, retry once in its worktree, an automatic worker with a new terminal made as at the start:

```text
ORCA orchestration worker-start --task <task id> --retry-of <dispatch id> --worktree path:<worktree path> --terminal <new terminal> --keep-open --json
```

A Codex or supervised Claude Code retry takes `--agent <agent>` and its `--model` and `--effort` in place of `--terminal`. A `stop_unknown`, a refused retry and a second miss go to the owner (unverified: the retry, not tried in a live run).

## Worker reports

A worker settles with one message. The skill's outcomes map to Orca like this:

| Outcome | Message from the worker |
|---|---|
| DONE, and no change needed | `--type worker_done --outcome succeeded` |
| BLOCKED | `--type worker_done --outcome failed` with a subject that starts `BLOCKED:`, after an issue comment |
| NEEDS_REPLAN | `--type worker_done --outcome failed` with a subject that starts `NEEDS_REPLAN:` |
| failed | `--type worker_done --outcome failed`, any other subject |

Orca has no separate blocked or replan message type: such a report is a `worker_done` that failed, which settles the dispatch so the coordinator can release it. The handoff block is the message body. The worker's start message carries its own `send` command; the spec only says what to report.

A batch also sends one `--type status` message per issue, when that issue's pull request is up or the issue ended another way, with the issue's handoff block as its body; its `worker_done` comes once, after the last issue.

A worker answers a follow-up dispatch with its `worker_done`, and a follow-up message with one `--type status` message; either names the head commit it pushed, or for an automatic worker its staged files ([Commit and push](runners.md#commit-and-push)). That id is a claim: read `<head>` yourself ([review-and-merge.md](review-and-merge.md)).

## Questions

A worker asks with `ORCA orchestration ask --question <text>`, which returns at once: the worker ends its turn and Orca wakes it with the answer. The question arrives as a `question` message. Answer it as [Worker questions](SKILL.md#worker-questions) says, by its message id, with the answer in a file:

```text
ORCA orchestration reply --id <message id> --body "$(cat <answer file>)" --json
```

The answer's sources are the default branch's: the policy as the reader prints it now, and `AGENTS.md` read in a scratch clone as [review-and-merge.md](review-and-merge.md#scratch-clone) reads it. An issue without a pull request has no clone yet: make one for the answer, with the two commands of that section.

## Watch

The mail types are `worker_done,escalation,question,status`. Orca wakes the coordinator when mail arrives, a `worker_done`, an `escalation` or a `question`, whatever its agent. A `status` message wakes it too: its terminal is told "You have 1 orchestration message" (unverified: observed, not in Orca's documentation).

How the coordinator waits, by its agent:

- **Any agent.** The coordinator never polls, but for the foreground wait of an agent with no background wake (below), and never runs `check --wait` in the background: a background wait keeps a task alive at every turn end, so the plugin never clears an idle coordinator.
- **Claude Code.** End the turn after starting or messaging workers. At run start, create one recurring session cron (`CronCreate`) every 10 minutes on minutes off the hour (`3-59/10 * * * *`). Its prompt names the run id and the absolute path of this file, and lists the four wake-up checks below, so a wake runs them without reading a file and a silent worker is seen without mail.
  - The cron fires only while the session is idle and survives `/clear`.
  - It expires after 7 days, and an expired cron cannot wake the session, so name its expiry date in the report of each wake and replace it before then.
  - To replace it: at the first wake within 2 days of that date, or when `CronList` no longer shows it, `CronDelete` it and create it again as at run start, with the same schedule and a new expiry date. A run that only waits for new issues (`keepRunning`) then keeps waking with no owner restart.
  - Delete it (`CronDelete`) when the run closes.
  - Without session crons (`CronCreate` missing, or `CLAUDE_CODE_DISABLE_CRON` set), wait as an agent with no background wake does.
- **An agent with no background wake** (Codex, and Claude Code without session crons). It runs `check --wait` for those types with `--timeout-ms 600000` in the foreground, never looped faster than once a minute, and runs the wake-up checks when it returns.

A wait's deadline ([SKILL.md](SKILL.md#waiting)) is checked at a wake: it is a point to report at and ends no run.

At each wake-up, including an empty one, run these in this order; a wake-up that skips them lets a failed or finished worker go unseen:

1. `worker-list --run <run id>` for state, with `--full` because the concise rows carry no `projection`.
2. `gh pr list -R <owner/repo> --head <branch> --state merged --json number,title,mergedAt` for merged PRs.
3. The stall check, and the [acknowledgement](#acknowledgement) of each worker that has none yet.
4. The next step of each pull request that waits for its checks or its default-branch watch ([review-and-merge.md](review-and-merge.md#merge)).

For a row whose `projection.attention.requiresAction` is true:

- Run `ORCA` with its `projection.nextAction.argv` only when that command is `worker-read` or `worker-show`, or `worker-release` for a worker that the release rule lets go ([Clean up](#clean-up)): one whose pull request is in review or merge stays, whatever the row asks.
- Any other next action goes in the report.

Acknowledge a delivery only after its outcome is handled (`check --ack <delivery_id>`).

Liveness, in the guide's terms: `ready` or `unverifiable` is absence, not proof. A worker blocked by a hook or waiting at a prompt stays `ready`, so a state watcher never fires for it. For the stall check, compare the time of the last commit on its branch, its PR and its last message with `stallMinutes`; when exceeded, `worker-read` its last output. Proof that it stopped without a report is a final agent turn that ended with no `worker_done`. Then `worker-stop` it and handle it as blocked; act on the `nextAction` that `worker-list` gives for the stopped dispatch, by the rule above, before releasing it. Without that proof, keep waiting.

## A permission dialog

An automatic worker shows none: under `dontAsk` a call that would prompt is denied. A dialog in its terminal (a trust question, a login) is the owner's.

At the stall check, with `permissionPrompts` `decline`, decline a permission dialog of a Claude Code worker, only from Bash or Zsh (below), and only when both of these show it:

```text
ORCA orchestration worker-show --dispatch <dispatch id> --json --full
ORCA orchestration worker-read --dispatch <dispatch id> --source terminal --limit 50 --json
```

`worker-show` must report an `observation.agentWait`: Orca saw the worker parked at a prompt only a person can answer. Null means it saw none, and a missing field that it did not look: neither is a dialog. The terminal read is the screen, not the transcript, and must show a tool call waiting for approval, not a trust dialog, a login or a question; a read Orca refuses means no terminal, so no decline. Then send one Escape, `<terminal>` being `terminal.handle` of that `worker-show`:

```text
ORCA terminal send --terminal <terminal> --text $'\x1b'
```

Escape declines the call in Claude Code (unverified: observed, not documented).

- `$'\x1b'` is the Escape byte in Bash and Zsh only (`ORCA terminal send --help` names the two). A shell without that quoting, dash for example, hands Orca the characters `$\x1b`, and Orca would type them into the dialog.
- So decline only when the shell that runs your commands is one of the two: `echo "$BASH_VERSION$ZSH_VERSION"`, run the way you run the `send`, prints a version number there, and an empty line or its own text in another shell. From any other shell send nothing: the worker stays blocked for the owner.
- The command takes no `--enter`: with it Orca makes the Escape inert.
- Send nothing else to the terminal, no Enter, letter, number or text.
- Then read the terminal again with the `worker-read --source terminal` command of this section. While the dialog still shows, send nothing more: the worker is blocked for the owner.

Once the dialog is gone, send the message that names the declined call and tells the worker to change the approach or report BLOCKED (it also restarts a turn the Escape interrupted):

```text
ORCA orchestration send --to dispatch:<dispatch id> --subject "Declined" --body "$(cat <message file>)" --json
```

A worker on another agent stays `block` (unverified: which key declines its dialog).

## Resume

The CedarLoom plugin hands the handoff file back after a `/clear` or compaction only in the session its `Session:` line names, for a Claude Code or a Codex coordinator (Codex once its hook is trusted, and after a compaction only: a Codex `/clear` starts a new session id).

- When that Claude Code coordinator ends a turn idle (no background task; a session cron does not count) above the plugin option `rotateAtTokens`, 200,000 tokens by default, the plugin clears it with `/clear` and submits a prompt to run the Resume steps.
- `rotateAtPercent` above 0 sets a percent of the context window instead, and both at 0 turn it off.
- Without the file, or for another session, the plugin neither hands it back nor clears.

The file's Resume section holds these steps, in this order, with the run id and the absolute path of this skill's folder filled in:

1. `ORCA orchestration check --json`, always first: it returns the mail that arrived meanwhile. Orca types a wake only once per unread message, and a wake can merge into the resume prompt. Act on its output only after step 2.
2. Read `<skill folder>/SKILL.md` and `<skill folder>/orca.md` in full, then the reference file that the mail of step 1 or the Next section's step needs. A `/clear` empties the context, the skill included, and a compaction returns only the start of it. Take the hub and `<issues in>` from the `Hub:` line, as [Names](SKILL.md#names) says.
3. When `check` said no run is bound: `ORCA orchestration run-use --id <run id> --json`, then `check` again.
4. `ORCA orchestration run-current --json`
5. `ORCA orchestration task-list --ready --brief --json`
6. `ORCA orchestration inbox --terminal run:<run id> --limit 50 --json`: the mail already handled.
7. Claude Code only: `CronList`. When it no longer shows the run's stall-check cron (a restarted process loses it), or that cron expires within 2 days, replace it as the Watch section of `<skill folder>/orca.md` says.

## Clean up

```text
ORCA orchestration worker-release --dispatch <dispatch id> --json
ORCA worktree rm --worktree path:<worktree path> --run-hooks --json
```

The second command removes a supervised worker's worktree; an automatic worker's goes as the worktree list below says. `--run-hooks` runs the project's `orca.yaml` archive script before the removal. When the removal fails on that script, remove the containers below first and run it again. After the removal, list what is left (`podman ps -aq --filter label=devcontainer.local_folder=<worktree path>`, or `docker`) and remove those containers with `rm -f`.

A worker whose terminal a person typed in gets no cleanup ([SKILL.md](SKILL.md#rules) has the rule). With Orca, such a worker's `worker-read` output shows input that neither a `send` nor a dispatch of the coordinator (the start, a follow-up) carried. Keep it with `ORCA orchestration worker-retain --dispatch <dispatch id> --json`: no stop, no release, no worktree removal. The coordinator's own Escape ([A permission dialog](#a-permission-dialog)) does not make a terminal a person's. Orca's `send` is the runner's message command and, with a follow-up dispatch, the only way into a worker terminal ([SKILL.md](SKILL.md#rules) has the rule).

Release:

- Release only a settled worker, so stop an idle worker that sent no report before releasing it.
- A supervised worker with a pull request is released after the merge, or once the pull request is left for the owner, not before: the release also ends `--keep-open`.
- An automatic worker is released as soon as its report arrives, before Commit and push and before the next worktree of its project is made ([Sandbox on](runners.md#sandbox-on)); the release keeps its worktree. `worker-release` alone closes nothing here: by its help it never closes a pre-existing terminal, such as the one `terminal create` made, and it still exits 0, so the session in that terminal keeps running (not run). So run `worker-release`, then `ORCA terminal close --terminal <terminal> --json`. The worker counts as released once `ORCA terminal list --worktree path:<worktree path> --json` no longer lists that terminal. Do the same for each follow-up's terminal. When the close fails or the terminal is still listed, make no further worktree in that project for the rest of the run, and name the worker, its terminal and the project's waiting issues in the report ([Sandbox on](runners.md#sandbox-on)). Unverified: whether a process the worker detached from its terminal outlives the close.
- `worker-read` still returns a released worker's output.

The worktree:

- `ORCA worktree rm` is for a supervised worker's worktree only, never for an automatic worker's, the probe's two scratch worktrees included. Orca runs its own git commands for the removal, without the pins and the `commondir` read of [Commit and push](runners.md#commit-and-push), and `--run-hooks` runs the archive script, all outside the sandbox: a hook, a monitor or an `orca.yaml` that the worker wrote in its worktree could run there. Unverified: which git commands Orca runs in the worktree, and whether it reads `orca.yaml` from the worktree or from the main checkout (`ORCA worktree rm --help` states neither).
- `ORCA worktree rm` also tries to delete the checked-out local branch (Orca keeps it when it predates the worktree or its changes are not provably merged). Run it only with `deleteMergedBranch` true, and while `git -C <worktree path> branch --show-current` prints a branch of the spec whose pull request is merged: a batch's worktree holds one of several.
- Never remove a blocked worker's worktree.
- In the other cases (an automatic worker, no merge allowed, `deleteMergedBranch` false, another or an unmerged branch checked out), remove the worktree with `git -C <project path> worktree remove <worktree path>`, which leaves the branch (an entry Orca's worktree list keeps: below). For an automatic worker, first the `commondir` read of [Commit and push](runners.md#commit-and-push), then the command with the pins of its `gitW`: `git --no-replace-objects -C <project path> -c core.hooksPath=/dev/null -c core.fsmonitor=false -c protocol.ext.allow=never worktree remove <worktree path>`. The removal runs `git status` in the worktree, which can run a hook or a monitor of the worktree, and `-c` reaches that child process too. Its archive script does not run: its containers go by the listing above.
- The remote branch, a batch's other local branches and the local branch an automatic worker's worktree leaves: [SKILL.md](SKILL.md#clean-up), step 3.

Before the coordinator turn ends, `ORCA orchestration worker-list --run <run id> --terminal-state reclaimable --json` returns no worker. The same list with `--terminal-state retained` shows the kept-open workers ([Host limit](#host-limit)): each settled one in it (`outcome` other than `in_progress`) is a supervised worker whose pull request is in review or merge, or a worker whose terminal a person typed in. An automatic worker is not kept open after its report. It can still appear in that list (unverified: which state Orca gives a dispatch whose terminal it did not make), and it counts as released once its terminal close is confirmed, as Release says. Every other settled worker is released, retained or removed above. `worker-release` removes no worktree, and an automatic worker's stays after its release until its pull request is merged or left for the owner. So a worktree still listed by `ORCA worktree list` past that point (for a worker without a pull request, past its settling), a blocked worker's aside, is the step above not run, unless git no longer has it: `git -C <project path> worktree list --porcelain` prints no `worktree <worktree path>` line and the folder is gone. Such an entry is Orca's record alone (unverified: whether Orca drops it after `git worktree remove`, not measured): leave it, never run `ORCA worktree rm` on an automatic worker's entry, and name its path in the report.

## Host limit

The limit is machine-wide, and `worker-list` covers one run (the bound one unless `--run` is given). Count the rows whose `outcome` is `in_progress` in every run that `ORCA orchestration run-list` shows, before every start: a kept-open worker's terminal state is `retained` also while it works (observed with Orca 1.4.254), so that state does not tell the working ones. A start held at a dialog in the handoff file's `## Open` ([Start the run](#start-the-run)) counts as working too.

A follow-up puts a worker that already reported back to work (an automatic worker's is a new start in its worktree, [Start the run](#start-the-run)), so it counts like a start for `hostWorkerLimit` and `workersPerProject`: count before it too. When a cap is full the follow-up waits, and no start in that project (for `hostWorkerLimit`: on the machine) comes before it ([SKILL.md](SKILL.md#loop), step 5): otherwise steady new issues keep the slot, and the pull request never merges. Count each worker with a follow-up it has not answered yet as working, whatever its row says (unverified: whether such a worker's row shows `in_progress` again).

## Scheduled runs

The rules of a scheduled run for any runner: [recurring-runs.md](recurring-runs.md). With Orca:

```text
ORCA automations create --name <name> --trigger <cron> --provider <claude|codex> --repo path:<coordinator project> --precheck "node <skill folder>/precheck.mjs <its arguments in SKILL.md, Loop>" --prompt "<the skill invocation>" --json
ORCA automations runs --id <automation id> --limit 5 --json
```

- The precheck's exit 0 starts the run; any other exit records a skipped run (`status` `skipped_precheck`).
- Without `--workspace`, Orca makes a new worktree per run, which is the disposable worktree an unattended run needs.
- One live session per automation: the scheduled session first lists `automations runs` and ends at once when an earlier run of the same automation still has a live terminal. Tell a live run by `terminalPtyId` and the terminal's state, not by `status` (unverified: which `status` values mean a run is still going).
