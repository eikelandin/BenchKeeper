# Orca commands

The coordinator starts and reaches its workers only through Orca. `ORCA` stands for the executable the session resolved and used for `ORCA skills get orchestration`; substitute it, do not run `ORCA` literally. Load that guide first: it is the version-matched source for every command and state, and it wins where this file differs. This file holds only what the guide leaves to the caller: the launch settings, how the coordinator's outcomes, waits, dialogs and cleanup map onto Orca, and the host limit. Prefer `--json`.

## Start the run

The start condition of every run, checked before `run-create` and again at [Resume](#resume); when one of these fails, start nothing and tell the owner which one and why:

1. The session is Claude Code.
2. An Orca executable is found, and `ORCA skills get orchestration` succeeds.
3. `ORCA status --json` prints `result.runtime.appVersion`, the version of the running Orca app, at [1.4.259](https://github.com/stablyai/orca/releases/tag/v1.4.259) or later: three numbers `<major>.<minor>.<patch>`, compared number by number. A missing field means Orca is not running, or too old. `0.0.0-dev` and a value of any other form fail too. `ORCA --version` shows the installed CLI, not the running app: it goes into the message to the owner and never admits a start.

`ORCA orchestration run-create --objective "issue work: <project names>" --json` once, then one start per worker, a batch being one worker. Right after `run-create`, a coordinator in a chat names its chat once: `ORCA chat rename --name 'Coordinator: <project names>'`. Outside a chat Orca refuses it (`Missing required --session: this is not running inside a chat`, Orca 1.4.259), so a coordinator in a terminal skips it.

A Claude Code worker starts in a worktree of its own, then by its project's [mode](modes.md#modes):

```text
ORCA worktree create --name <number>-<slug> --repo path:<project path> --base-branch <default branch> --no-parent --setup run --json
```

Supervised: a terminal the coordinator makes, on the host's default Claude Code login, so that its launch carries `--permission-mode auto`. Orca's own launch adds the flag of Orca's agent permission setting, the user's choice in Orca's Settings, Agents, Agent Permissions, which Orca ships at "full-access" (Orca 1.4.254), and that adds `--dangerously-skip-permissions` for Claude Code; `worker-start` takes no permission flag, and its `--model` and `--effort` do not combine with `--terminal` (`ORCA orchestration worker-start --help`, Orca 1.4.259). So no Claude Code worker starts through Orca's own launch. The `--permission-mode` flag wins over every settings file's `permissions.defaultMode` ([permission modes](https://code.claude.com/docs/en/permission-modes)), so a user's `"defaultMode": "bypassPermissions"` does not reach the worker. Where auto mode is not available to the session (a model without it, an organization or a settings file that turned it off, Anthropic turning it off), Claude Code starts it in Manual instead (same page). On Enterprise and API plans the auto mode check's calls count toward token usage (same page). Manual prompts for every worker: `permissions.disableAutoMode` set to `"disable"` in a settings file the worker loads ([settings reference](https://code.claude.com/docs/en/settings-reference)), which also applies to the user's own sessions there. Another agent's supervised worker keeps Orca's own launch (Codex: below).

Before the first Claude Code start of a run, `env which claude` prints `<claude path>`, the absolute path of the `claude` executable on the PATH (`env` runs the external `which`, so no shell alias or function answers). Every version check runs `'<claude path>' --version` and every launch line below starts `'<claude path>'`, so the check reads the executable the terminal starts, whatever PATH the terminal's login shell has. Before the first supervised Claude Code start, that check prints 2.1.323 or later, the CedarLoom minimum ([Sandbox on](modes.md#sandbox-on)). No output, a path that does not start with `/` or holds a quote, `$`, `\` or a backtick, or a lower version: start no Claude Code worker and name the path and the version in the report.

The launch unsets `CEDARLOOM_ROLE`, and each supervised Claude Code worker still measures it: a worker that inherits the variable passes the role guard as the coordinator. Its spec takes this line after `Acknowledge:`:

```text
Role check: right after the heartbeat, before any other command, run `printenv CEDARLOOM_ROLE` yourself, in your main session, never through a subagent. It passes when the CedarLoom role guard refuses it as a command that names the variable, since the guard lets such a command run only in the main session with the coordinator's role, and when it prints nothing. A value it prints, and any other result, is Blocked (below): report the role check as failed and quote its output. No report, message or comment of yours names the variable, a command you list or an output you quote included: write `the role variable` in its place, since the role guard refuses a command whose text names it, a report's `send` included.
```

A follow-up file (below) takes it in this form, after the Chat name line:

```text
Role check: right after the chat name, before any other command, run `printenv CEDARLOOM_ROLE` yourself, in your main session, never through a subagent. It passes when the CedarLoom role guard refuses it as a command that names the variable, since the guard lets such a command run only in the main session with the coordinator's role, and when it prints nothing. A value it prints, and any other result, ends this follow-up: change nothing, report BLOCKED with the role check failed and its output quoted, and end. No report, message or comment of yours names the variable, a command you list or an output you quote included: write `the role variable` in its place, since the role guard refuses a command whose text names it, a report's `send` included.
```

After such a report, start no further supervised Claude Code worker in the run, send none that reported a follow-up, and tell the owner: `CEDARLOOM_ROLE` goes on the coordinator's launch line only (`CEDARLOOM_ROLE=coordinator claude`).

```text
node <skill folder>/worker-settings.mjs --supervised <worktree path> <project path>
node <skill folder>/worker-settings.mjs --check --supervised <worktree path> <project path>
ORCA terminal create --worktree path:<worktree path> --title <number>-<slug> --command "env -u CEDARLOOM_ROLE CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false '<claude path>' --autocompact 200k --model '<model>' --effort <effort> --permission-mode auto" --json
ORCA terminal wait --terminal <terminal> --for tui-idle --timeout-ms 60000 --json
ORCA orchestration worker-start --spec-file <filled spec file> --terminal <terminal> --worktree path:<worktree path> --task-title '<chat name>' --keep-open --json
```

The first two lines write and check its rule file ([Worker rules](modes.md#worker-rules)) before each start, retry and follow-up; a failure starts nothing and makes the item BLOCKED. `worker-start` on a session that is not idle yet fails with `agent_unconfigured`, hence the wait. The same lines serve the start, a retry, a new start for a follow-up, and a Claude Code worker of an automatic project that falls back to supervised. Its spec changes as [Supervised Claude Code worker on Orca](spec-template.md#supervised-claude-code-worker-on-orca) says, and takes this line after the role check:

```text
Rule file: `.claude/settings.local.json` in this worktree is the coordinator's. Never stage, commit, change or delete it.
```

Automatic: a terminal of its own as well, its launch carrying `--permission-mode dontAsk` and the settings below:

```text
ORCA terminal create --worktree path:<worktree path> --title <number>-<slug> --command "env -u CEDARLOOM_ROLE CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false '<claude path>' --autocompact 200k --model '<model>' --effort <effort> --permission-mode dontAsk --settings '<run folder>/settings/<id>.json'" --json
ORCA terminal wait --terminal <terminal> --for tui-idle --timeout-ms 60000 --json
ORCA orchestration worker-start --spec-file <filled spec file> --terminal <terminal> --worktree path:<worktree path> --task-title '<chat name>' --keep-open --json
```

A Codex worker starts with `ORCA orchestration worker-start --spec-file <filled spec file> --worktree new-top-level --repo path:<project path> --base-branch <default branch> --name <number>-<slug> --agent codex --model "<model>" --effort <effort> --task-title '<chat name>' --keep-open --json`.

- `--autocompact 200k` caps the worker's context at 200,000 tokens before it compacts, and `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false` turns off the next-prompt suggestions no one reads in a worker terminal. `env` sets the variable in any login shell, and it runs the binary at `<claude path>`, never a shell alias or function named `claude` (one that adds `--dangerously-skip-permissions`, say): keep `env` first in every form of the line.
- No launch line in this file carries a permission-bypass flag. A Codex worker gets the flag of Orca's agent permission setting (Orca 1.4.254; under "full-access", `--dangerously-bypass-approvals-and-sandbox`, which also turns off Codex's sandbox). A Claude Code worker's `terminal create --command` line, supervised or automatic, is the coordinator's alone: that setting adds nothing to it.
- Older Claude Code versions could start a session that asks for auto mode in a mode that allows more ([changelog](https://code.claude.com/docs/en/changelog)), hence the version check above.
- Automatic is for a Claude Code worker only (a Codex worker of an automatic project takes the [fallback](#fallback-to-supervised)): write its settings file first ([Sandbox on](modes.md#sandbox-on)), `<id>` being `<number>-<slug>`. Before each such worker, pass [Automatic start](modes.md#automatic-start); the probe worker starts the same way in a worktree `probe-<r>` with the probe as its spec, and is released and its worktree removed after it. The `--check` read of check 2 is the last command before every `terminal create` of an automatic worker, a retry and a follow-up included, and the launch's `--settings` takes the same absolute path as that read: a relative one would name a file in the worktree. A failed check or probe step takes the [fallback](#fallback-to-supervised), except a failed `--check` read of an item, which makes that item BLOCKED and starts no worker.
- Write the filled spec to a file in the run folder and pass that file with `--spec-file`, so issue text is never read by the shell.
- The model and effort are those of the spec's `Agent:` line, the model as the reader printed it, inside single quotes. Leave out what that line gives as the agent default, and the effort whenever the model is left out.
- A Claude Code worker takes its task only once its agent reached its idle prompt. A `terminal wait` that times out or ends in another state starts no worker: read its screen once (`ORCA terminal read --terminal <terminal> --screen --json`). Such a start has a worktree and a terminal but no dispatch, so neither `worker-list` nor [Clean up](#clean-up) sees them:
  - A dialog there (a trust question, a login) is the owner's ([SKILL.md](SKILL.md#rules)). Write the issue, the terminal handle and the worktree path into the handoff file's `## Open`, list it for the owner, and count it as a working worker ([Host limit](#host-limit)) until the owner acts.
  - Anything else is a failed start ([SKILL.md](SKILL.md#outcomes)). Close the terminal (`ORCA terminal close --terminal <terminal> --json`); the one retry runs in that worktree with a new terminal, from the settings or rule file and its `--check` read on, and makes no second worktree.
- `<chat name>` is the spec's ([spec-template.md](spec-template.md)): `--task-title` names the worker's task in Orca with it, and the spec's Chat name line names its chat. An automatic worker runs no Orca command, so its chat keeps the name Orca gives it.
- `<number>-<slug>` takes the first issue of a batch, for the worktree, the terminal title and `--name`. `worktree create` prints the worktree path; for a Codex worker, `worker-show` gives it.
- When the agent refuses the model, start without `--model` and `--effort` and say so in the report.
- `--repo path:<project path>` is one of the selectors Orca's help lists (`id:`, `name:`, `path:`).
- A Claude Code worker's start and retry keep `--keep-open`, without which Orca releases a worker about 2 minutes after its accepted `worker_done` (`autoReleaseAt` in `worker-show` and `worker-list`, `worker-release --help`). Its terminal comes from `terminal create`, and `worker-release` never closes such a pre-existing terminal (`worker-release --help`), so the coordinator closes it: an automatic worker's at its report, a supervised one's once its pull request is merged or left for the owner, which keeps its session for follow-ups ([Clean up](#clean-up)). A Codex worker starts in a new worktree, which Orca keeps open after its report whatever the flag (`worker-start --help`), until `worker-release`.
- Keep the returned dispatch id and task id per worker with its project, issues, worktree path and branch names (the spec's `<type>/<number>-<slug>`); every later command takes the dispatch id. A follow-up `send` that Orca turns into a task (below) returns a new task id and dispatch id: keep both. `worker-show`, `worker-read`, `send`, `worker-retain` and the stall check take the newest; `worker-release` takes each, newest first, and an older one already released reports `already_released` (observed with Orca 1.4.259). `<branch>`, `<default branch>` and `<owner/repo>` in this file are the names of that spec.
- A non-zero exit means no worker: read `failedStage` and `residualResources` before trying again.

A follow-up to a worker of this run, a supervised one, an automatic one released at its report ([SKILL.md](SKILL.md#loop), step 3), has its text in a file. A follow-up to a worker that runs Orca commands starts with the spec's Chat name line, its role `fixer`:

- A supervised worker, Claude Code or Codex, gets it as a message to its newest dispatch, a Claude Code one only while it is kept open (below). Orca makes a reported or released worker's message a follow-up task, which it reports with `worker_done` (Orca's guide):

  ```text
  ORCA orchestration send --to dispatch:<dispatch id> --subject "Follow-up" --body "$(cat <follow-up file>)" --json
  ```

  A supervised Claude Code worker gets it only in place, in the session its launch started. Before each follow-up, write its rule file and read it with `--check` again, as before its start ([Worker rules](modes.md#worker-rules)): a failure sends nothing and makes the item BLOCKED. Its follow-up file carries the Role check line in its follow-up form (above). Then confirm that `ORCA terminal list --worktree path:<worktree path> --json` lists the worker's terminal, that `worker-show` reads the newest dispatch as unreleased, that `worker-read` shows no person's input ([Clean up](#clean-up)), and that `ORCA orchestration worker-read --dispatch <dispatch id> --source terminal --limit 50 --json` shows Claude Code's input box with `auto mode on` in its status bar ([permission modes](https://code.claude.com/docs/en/permission-modes)). The read's last non-empty line decides: it must be that status bar, and a shell prompt there, also below an earlier status bar, is an agent that exited (unverified: that the read shows the status bar, and as its last line). Only then `send`, and the expected answer is `delivery` `follow_up` with the worker's own terminal, the one `terminal create` returned, as its `terminal` (unverified: that the answer names it), delivered into the same session (unverified for a worker in a terminal). A `follow_up` is accepted as in place only when the answer names that terminal, or names none and `terminal.handle` of `worker-show` of the new dispatch is that terminal (unverified: that `worker-show` names the terminal a follow-up dispatch went to), and `terminal list` still lists it. Every other `follow_up` (another terminal named, none named, the worker's own no longer listed, a read that fails) may run in a tab where a person resumed the worker's conversation (below), so the worker counts as one whose terminal a person typed in ([Clean up](#clean-up)): `worker-retain` the new dispatch, with no stop, close, release, retry or new start, write it into the handoff file's `## Open` as such a worker (the issue, the kept dispatch id, the terminal named, if any, and the worktree path), tell the owner at once, and the item waits for the owner (unverified: `worker-retain` on such a dispatch, not tried in a live run). When the checks before the `send` find the worker released or its terminal gone, send nothing: the follow-up is a new start with the lines above in the same worktree, the follow-up file holding the filled spec, then the follow-up, as for an automatic worker (below). When the read shows no auto mode, send nothing either, and stop the worker only on proof that no dialog holds it and no turn runs: `worker-show --full` reports `observation.agentWait` as null, the field present (a missing one means Orca did not look: [A permission dialog](#a-permission-dialog)), and the read ends in a shell prompt, or shows the agent idle at an empty prompt, neither loading nor working, with another mode in its status bar. Then `worker-stop` its newest dispatch unless that one already reported, and once the stop is confirmed close its terminal (`ORCA terminal close --terminal <terminal> --json`, confirmed by `terminal list`) and `worker-release` it, then make that new start. Its commits and changes stay for the new worker to review. A stop or close that is not confirmed starts nothing: name the worker and its terminal in the report, and the item waits for the owner. Without that proof nothing is stopped or closed, and the follow-up waits with the item: a dialog, listed for the owner yet or not, is handled as Held at a dialog says ([Acknowledgement](#acknowledgement)), and any other screen, a worker in a turn included, is read again at the next wake-up.

  A reopened or fresh-started session is never accepted. A resumed Claude Code session can start in another mode than the launch line gave: a session that ended in Manual resumes in the `defaultMode` of a settings file when one takes effect, and flags on the resume line override the stored mode ([sessions](https://code.claude.com/docs/en/sessions)); how Orca's reopen builds its line is not documented. So when a `send` returns `delivery` `reopened` or `started_fresh`, `worker-stop` that new dispatch at once, and once the stop is confirmed close its terminal when `worker-show` names one, and the worker's earlier terminal when `terminal list` still lists it (`ORCA terminal close --terminal <terminal> --json`, confirmed by `terminal list`), `worker-release` it, then make a new start with the lines above, as for a released worker. Its commits and changes stay for the new worker to review; name the event in the report. Orca delivers a terminal worker's follow-up in place only while the agent runs in its live terminal; otherwise it closes the leftover shell and reopens the worker through its own launch, or delivers a `follow_up` into a tab where a person resumed the worker's conversation (Orca 1.4.259, `src/main/runtime/rpc/methods/orchestration/worker/follow-up/worker-follow-up-choice.ts` lines 80-99, 115-147 and 189-205). The terminal read before the `send` sees an agent that exited; one that exits after that read is still reopened, so the check makes this rare, not impossible.

  A worker still working, a batch on its next issue, gets the message when its turn ends, with no follow-up task.

  A refused `send` sent nothing. Send it again after `worker_unverifiable` once `worker-show` reads the worker; after `worker_not_restartable` or `worker_workspace_gone` the follow-up is a new start by [SKILL.md](SKILL.md#loop), step 3.
- An automatic worker was released at its report, its worktree kept ([Clean up](#clean-up)), so its follow-up is a new start: a fresh session in a new terminal of the same worktree, as at the start, with its settings file written again and read with `--check`, the follow-up file holding the filled spec, then the follow-up. Its old terminal would not take it anyway: Orca recognises a released worker's terminal for its first dispatch only. Where Workspace Cleanup removed that worktree, the follow-up is a new start by [SKILL.md](SKILL.md#loop), step 3.

A worker on `fable` that already reported gets no follow-up: release it and start a fresh worker on the branch ([SKILL.md](SKILL.md#rules)) by [SKILL.md](SKILL.md#loop), step 3. Such a follow-up counts like a start ([Host limit](#host-limit)).

### Fallback to supervised

An automatic project whose [Automatic start](modes.md#automatic-start) failed runs supervised for the rest of the run, and so does a Codex worker of an automatic project. Such a worker starts as a supervised one (above) and has none of the automatic bounds (no sandbox, no network allow list, no `dontAsk`, no settings file): a Claude Code one runs in auto mode with the worktree rule file of [Worker rules](modes.md#worker-rules), as every supervised one does, and a Codex one with Orca's agent permission setting, under the shipped "full-access" with no permission prompt. For a failed start, write in the handoff's `Mode:` line and the report the project, the failed check or step, and that its workers run without the automatic bounds, its Claude Code workers in auto mode, or after a failed version check that none starts ([Start the run](#start-the-run)). A Codex worker leaves its project's `Mode:` line as it is: the report names that worker and that it runs without the automatic bounds under Orca's setting.

## Acknowledgement

The acknowledgement is the worker's first heartbeat; an automatic worker sends none ([Worker reports](#worker-reports)). A missing one sends no mail while the worker idles at its prompt, so the coordinator sees it at the timer's wake-up ([Watch](#watch)); a worker that ends a turn, exits or is lost without `worker_done` is mailed as an escalation ([Stops](#stops)). Orca's rule holds: silence, a startup timeout or `unverifiable` liveness proves nothing and authorizes no stop or retry.

- **Still starting**: `worker-show --full` reports the start not ready yet, or the terminal shows the agent loading or working. Keep waiting; it is no miss.
- **Held at a dialog**: `worker-show --full` reports an `observation.agentWait`, or the terminal shows a dialog. It is the owner's ([A permission dialog](#a-permission-dialog)).
- **The mode**: at the acknowledgement of a supervised Claude Code worker, `worker-read --source terminal` ([A permission dialog](#a-permission-dialog)) shows `auto mode on` in its status bar. A start that shows another mode is a Manual start: the report names it so, never as auto mode. A start held at a dialog shows no status bar: read its mode once the dialog is gone.
- **A miss**: at two wake-ups at least 10 minutes apart, `worker-read --source terminal` shows the agent idle at an empty prompt and `worker-read` shows no turn on the task. Then `worker-stop` it. Only when the stop is confirmed, retry once in its worktree, a Claude Code worker with its old terminal closed (`ORCA terminal close --terminal <terminal> --json`) unless the stop reported `processAction` `closed_agent_terminal`, its settings file (supervised: its rule file) written again and read with `--check`, then a new terminal made as at the start:

```text
ORCA orchestration worker-start --task <task id> --retry-of <dispatch id> --worktree path:<worktree path> --terminal <new terminal> --keep-open --json
```

A Codex retry takes `--agent codex` and its `--model` and `--effort` in place of `--terminal`. A `stop_unknown`, a refused retry and a miss after the item's one retry go to the owner (unverified: the retry, not tried in a live run).

## Stops

Orca mails an `escalation` when a worker's turn ends, or its process ends, without `worker_done`. Its subject says which, and its payload names `dispatchId`, `handle` and `stopReason` (`finished`, `errored`, `needs-input`, `exited` or `lost`); the body says when Orca already closed the dispatch as failed and names the retry command (Orca 1.4.259, `src/main/runtime/orchestration/workers/turn-stops/worker-turn-stop-report.ts`, lines 20, 64-70 and 136-149). By Orca's guide, `finished`, `errored` or `needs-input` is a worker that stopped (steer it with `send`, stop and retry it, or tell the owner), and `exited` or `lost` one that is gone (retry it or tell the owner). The escalation is the proof that it stopped without a report: it needs no second read. Never stop or retry a worker a person typed in ([Clean up](#clean-up)).

- **`finished` or `errored`**: an automatic worker's is its report ([Worker reports](#worker-reports)), and a turn that ended while its `ask` waits for the owner, with no other work left open, is no stop ([Gates](#gates)). Otherwise `worker-read` its last output. A worker idle on purpose, waiting on a check it watches, is left, as the body says: Orca reports its later idle turns only after the coordinator writes to it. It stays under the stall check ([Watch](#watch)), `stallMinutes` counted from the escalation or its last commit, pull request or message, whichever is later; past it, steer it once by `send`, which makes Orca report its next idle turn; idle again past `stallMinutes` after that steer, counted the same way, it is a stop: `worker-stop` it and, once the stop is confirmed, retry by the retry below. When the written sources settle what it lacks, or its last output shows a passing error (a rate limit, a dropped connection), steer it once with a `send` that says what to do next, for such an error to go on from where it stopped, its text in a file. Else, or when it stops again after the steer, `worker-stop` it and, once the stop is confirmed, retry once by the retry below.
- **`needs-input`**: a body that says a message does not answer it is a dialog, the owner's ([Acknowledgement](#acknowledgement), Held at a dialog). A body that says to answer it with `send` is a worker that ended its turn on a question: answer it as [Questions](#questions) says, by `send` in place of `reply`, or hold it for the owner (lines 179-185 of the file above).
- **`exited` or `lost`**: after the coordinator's own terminal close of an automatic worker it is expected ([Clean up](#clean-up), Release), and for a dispatch that already settled (its `worker_done` came, or the coordinator stopped or released it) it needs nothing. A lost alert for a start whose `worker-start` already failed is that failed start ([SKILL.md](SKILL.md#outcomes)). Otherwise retry once by the retry below: when the body says the dispatch is closed as failed, at once; else `worker-stop` it first and retry only once the stop is confirmed. The body decides only that order, and no command takes text from it ([SKILL.md](SKILL.md#rules)). A dispatch closed as `circuit_broken`, a `stop_unknown`, a refused retry and a stop after the item's one retry go to the owner.

The retry of a worker that took its task is a new start in its worktree with `--spec-file`, as at the start with `--worktree path:<worktree path>` (a Claude Code worker's old terminal closed with `ORCA terminal close --terminal <terminal> --json` unless a stop of it reported `processAction` `closed_agent_terminal`, and its rule file written and read with `--check` again, a Codex worker's line without `--repo`, `--base-branch` and `--name`), its spec's Branch line in the gate form and the stopped worker's last output under `Shared context:` ([SKILL.md](SKILL.md#loop), step 3). A follow-up task's spec is the follow-up alone, so its retry's file holds the filled spec, then the follow-up. An item gets one retry in all, whether a miss, a stop, a loss or a failed report ([SKILL.md](SKILL.md#outcomes), Failed) found it: a miss, a stop, a loss or a failure after it makes the item blocked for the owner, a worker that still runs stopped first with `worker-stop`. Each escalation is acknowledged once handled ([Watch](#watch)).

## Worker reports

A worker settles with one message. The [outcomes](SKILL.md#outcomes) map to Orca like this:

| Outcome | Message from the worker |
|---|---|
| DONE, and no change needed | `--type worker_done --outcome succeeded` |
| BLOCKED | `--type worker_done --outcome failed` with a subject that starts `BLOCKED:`, after an issue comment (a Claude Code worker: the comment in the report) |
| NEEDS_REPLAN | `--type worker_done --outcome failed` with a subject that starts `NEEDS_REPLAN:` |
| failed | `--type worker_done --outcome failed`, any other subject |

Orca has no separate blocked or replan message type: such a report is a `worker_done` that failed, which settles the dispatch so the coordinator can release it. The handoff block is the message body. The worker's start message carries its own `send` command; the spec only says what to report.

An automatic worker runs no Orca command ([Sandbox on](modes.md#sandbox-on)): from inside the sandbox `ORCA orchestration send` and `ask` fail with `runtime_unavailable`, since the CLI reads `orca-runtime.json` in the home folder, which the read block closes. Neither that file nor Orca's socket is opened to the worker: the file holds Orca's one auth token, with which `ORCA terminal create --command` runs any command on the host outside the sandbox. So its report is its final answer, its first word the outcome ([spec-template.md](spec-template.md#automatic-mode)). Its turn ends with no `worker_done`, and Orca raises the escalation `Worker stopped without reporting`, which carries that answer as the last output (not documented); `ORCA orchestration worker-read --dispatch <dispatch id> --json` returns it too, and is the read where the escalation cuts it short. That escalation is the expected end of every automatic worker, not a stall or a miss: the escalation alone starts no retry, and the outcome of the final answer decides. Map its first word to the outcomes as the table does; a final answer without an outcome word is failed. It never asks: a question comes as a BLOCKED report ([Gates](#gates)).

A batch also sends one `--type status` message per issue, when that issue's pull request is up (a Claude Code worker: its change committed) or the issue ended another way, with the issue's handoff block as its body; its `worker_done` comes once, after the last issue.

A supervised worker answers a follow-up with the `worker_done` of the follow-up task, and one it got while still working with one `--type status` message. Either names its head commit, which a Claude Code worker committed for the coordinator to push and a Codex worker pushed ([Commit and push](modes.md#commit-and-push)). An automatic worker's follow-up is a new start, and its report names its staged files ([Commit and push](modes.md#commit-and-push)). That id is a claim: read `<head>` yourself ([review-and-merge.md](review-and-merge.md)).

## Questions

A worker asks with `ORCA orchestration ask --question <text>`, which returns at once: the worker ends its turn and Orca wakes it with the answer. The question arrives as a `question` message. Answer it as [Worker questions](SKILL.md#worker-questions) says, by its message id, with the answer in a file:

```text
ORCA orchestration reply --id <message id> --body "$(cat <answer file>)" --json
```

The answer's sources are the default branch's: the policy as the reader prints it now, and `AGENTS.md` read in a scratch clone as [review-and-merge.md](review-and-merge.md#scratch-clone) reads it. An issue without a pull request has no clone yet: make one for the answer, with the two commands of that section.

## Gates

By ask and reply, in supervised mode ([Gates](modes.md#gates)):

| | Supervised |
| --- | --- |
| Which questions | each question that the written sources do not settle; for an owner-only decision, only the sources of [Owner-only decisions](SKILL.md#owner-only-decisions) |
| The worker | asks ([Questions](#questions)) and waits |
| While it waits | send no reply; once its turn ended while its `ask`, or a `needs-input` question held for the owner ([Stops](#stops)), waits for the owner, with no other work left open, it does not count as working until the reply ([Host limit](#host-limit)), and that turn is no stall ([Watch](#watch)) |
| After the answer | once a slot is free, `reply --id <message id>` with the chosen option in a file, as [Questions](#questions) says |

Automatic: the worker never asks ([Worker reports](#worker-reports)). An owner-only question is a `BLOCKED` report with the question, and its answer a new start in its worktree, as [Gates](modes.md#gates) says.

Both modes: an item held for the owner before its start gets an Orca gate on a decision task, and one held after its worker settled a gate on its item task ([Tasks and gates](#tasks-and-gates)). A worker that works or waits on its `ask` gets none: Orca refuses a gate while a worker of the task is active (`task_not_startable`, observed with Orca 1.4.259).

## Tasks and gates

Each item has one Orca task, its item task: the task its first `worker-start` returns, for a batch one task for all its issues. Keep its id and status in the handoff file. It records the first start's status and the item's gates for Resume, not the item's end: after a continuation it keeps the status restored after its gate; the outcome still comes from the report ([Worker reports](#worker-reports)). A follow-up and every later start make a task of their own and leave the item task as it is: a `send` to a worker whose item task was `blocked` made a new task and left that one `blocked` (observed with Orca 1.4.259).

What Orca does (observed with Orca 1.4.259):

- `gate-create` sets the task `blocked`, also a `completed` task whose worker reported; `gate-resolve` sets it `ready`, never `completed`.
- A task turns `completed` at its worker's `worker_done`, before review and merge.
- `worker-stop` of a worker that sent no `worker_done` leaves its task `blocked`, not `failed`.
- `worker-start` refuses `--task` together with `--spec-file`, so a start that brings an answer uses `--spec-file` and makes a task of its own.

Read from Orca 1.4.259's source, not run: `task-update` without `--result` keeps the stored result; `task-update --status failed` is accepted from `ready`; a gate on a `failed` task is accepted.

The coordinator never starts a worker on a task because Orca lists it `ready`, as the loop of Orca's guide does, and never on a task titled `Decision:`. Put each title and question in single quotes, in your own words, as an approval's title ([approvals.md](approvals.md#labels-and-title)), and each answer as its option label. Write the handoff file after each step below and before each `gate-resolve`. A refused command of this section goes into the report with its error; the approval still holds the item, the outcome of a final answer stands, and nothing is stopped, retried or started because of it.

### A hold before the start

An issue held for a `design` answer ([SKILL.md](SKILL.md#risk-class)) gets a decision task with a gate once its approval is filed. Its item task comes at its start, as for any item: its spec needs the worktree, the mode and the batch of that start.

```text
ORCA orchestration task-create --spec-file <file with the approval's What line> --task-title 'Decision: <title>' --json
ORCA orchestration gate-create --task <decision task id> --question '<title>' --json
```

The decision task turns `blocked` (observed with Orca 1.4.259). On the answer, in one turn: `ORCA orchestration gate-resolve --id <gate id> --resolution '<option label>' --json`, which makes it `ready`, then `ORCA orchestration task-update --id <decision task id> --status completed --result '<option label>' --json` when the answer starts the work, else the same with `--status failed`. The item goes on as the answer says ([The answer](approvals.md#the-answer)).

### A gate after a report

A report or merge step that needs the owner (a BLOCKED report with an owner question, a merge outside `merge.allowed` or above `merge.autoMergeMax`, an owner-only file or a release) gets a gate, for an approval still open then, once the item's worker settled: its `worker_done` arrived, or an automatic worker's release is confirmed (below). Write the item task's status into the approval's line ([approvals.md](approvals.md#once-per-pull-request-and-gate)) first, then:

```text
ORCA orchestration gate-create --task <item task id> --question '<title>' --json
```

An item task with a pending gate gets no second one: a second approval for it, another issue of its batch, names the same gate and the status the first one recorded, and the gate is resolved once the last of them is answered. A later head that voids an answer ([The answer](approvals.md#the-answer), The head) gets a new gate the same way once that head's worker settled.

On the answer, or once a wake-up check sees the pull request merged: `gate-resolve` as above (the item task turns `ready`), then in the same turn `ORCA orchestration task-update --id <item task id> --status <status from the approval's line> --json`, with no `--result`, so the worker's result stays and no item task stays `ready` without a worker. Then the line changes as [The answer](approvals.md#the-answer), The Orca gate, says, and the item goes on as [Gates](modes.md#gates) says. A pull request closed without a merge leaves its gate pending and its line in `## Open`, and each report names it until the owner answers the approval.

### An automatic worker's task

An automatic worker sends no `worker_done`, so nothing settles its task: the item task for its first start, the start's own task for each later one. Once its release is confirmed ([Clean up](#clean-up), Release), set that task by its final answer: `ORCA orchestration task-update --id <task id> --status completed --result DONE --json` for DONE, else `--status failed` with the outcome word (`BLOCKED`, `NEEDS_REPLAN`, `failed`) as the result. Unverified: the task's status after that release, and that Orca accepts the update there (read from Orca 1.4.259's source, not run). After a `worker-stop` of a worker that sent no `worker_done`, its task was `blocked` and `task-update --status completed` was accepted (observed with Orca 1.4.259).

## Watch

The mail types are `worker_done,escalation,question,status`. Orca wakes the coordinator when mail arrives, a `worker_done`, an `escalation` or a `question`. A `status` message wakes it too: its terminal is told "You have 1 orchestration message" (unverified: observed, not in Orca's documentation).

How the coordinator waits:

- **Always.** The coordinator never polls, but for the foreground wait without session crons (below), and never runs `check --wait` in the background: a background wait keeps a task alive at every turn end, so the plugin never clears an idle coordinator.
- **With session crons.** End the turn after starting or messaging workers. At run start, create one recurring session cron (`CronCreate`) every 10 minutes on minutes off the hour (`3-59/10 * * * *`). Its prompt names the run id and the absolute path of this file, and lists the four wake-up checks below, so a wake runs them without reading a file and a silent worker is seen without mail.
  - The cron fires only while the session is idle and survives `/clear`.
  - It expires after 7 days, and an expired cron cannot wake the session, so name its expiry date in the report of each wake and replace it before then.
  - To replace it: at the first wake within 2 days of that date, or when `CronList` no longer shows it, `CronDelete` it and create it again as at run start, with the same schedule and a new expiry date. A run that only waits for new issues (`keepRunning`) then keeps waking with no owner restart.
  - Delete it (`CronDelete`) when the run closes.
- **Without session crons** (`CronCreate` missing, or `CLAUDE_CODE_DISABLE_CRON` set). It runs `check --wait` for those types with `--timeout-ms 600000` in the foreground, never looped faster than once a minute, and runs the wake-up checks when it returns.

A wait's deadline ([SKILL.md](SKILL.md#waiting)) is checked at a wake: it is a point to report at and ends no run.

At each wake-up, including an empty one, run these in this order; a wake-up that skips them lets a failed or finished worker go unseen:

1. `worker-list --run <run id>` for state, with `--full` because the concise rows carry no `projection`.
2. `gh pr list -R <owner/repo> --head <branch> --state merged --json number,title,mergedAt` for merged PRs.
3. The stall check, and the [acknowledgement](#acknowledgement) of each worker that has none yet.
4. The next step of each pull request that waits for its checks or its default-branch watch ([review-and-merge.md](review-and-merge.md#merge)).

For a row whose `projection.attention.requiresAction` is true:

- Run `ORCA` with its `projection.nextAction.argv` only when that command is `worker-read` or `worker-show`, or `worker-release` for a worker that the release rule lets go, a Claude Code worker's only after its terminal close ([Clean up](#clean-up)): a Codex or supervised Claude Code worker whose pull request is in review or merge stays, whatever the row asks.
- Any other next action goes in the report.

Acknowledge a delivery only after its outcome is handled (`check --ack <delivery_id>`).

Liveness, in the guide's terms: `ready` or `unverifiable` is absence, not proof. A worker blocked by a hook or waiting at a prompt stays `ready`, so a state watcher never fires for it. An escalation for a stop, exit or loss is proof enough and goes by [Stops](#stops); the stall check is for a worker silent past `stallMinutes` with no such escalation still unhandled (a worker [Stops](#stops) left idle is checked as that section says). For the stall check, compare the time of the last commit on its branch, its PR and its last message with `stallMinutes`; when exceeded, `worker-read` its last output. Proof that it stopped without a report is a final agent turn that ended with no `worker_done` and not while its `ask`, or a `needs-input` question held for the owner, waits for the owner, with no other work left open ([Gates](#gates)); an automatic worker's final turn is its report ([Worker reports](#worker-reports)), so it has stopped without one only when no final answer is there. Then `worker-stop` it and handle it as blocked; act on the `nextAction` that `worker-list` gives for the stopped dispatch, by the rule above, before releasing it. Without that proof, keep waiting.

## A permission dialog

An automatic worker shows none: under `dontAsk` a call that would prompt is denied. A dialog in its terminal (a trust question, a login) is the owner's.

A worker that Orca's own launch starts in a structured (chat) session shows none either: it has no terminal, and Orca answers its prompts by its agent permission setting ([Start the run](#start-the-run)), so nothing here declines a call. A supervised Claude Code worker runs in a coordinator-made terminal, in auto mode or in Manual where auto mode is unavailable, and can show one ([Start the run](#start-the-run)); an automatic worker runs in `dontAsk` and shows none.

In auto mode a single block of the auto mode check refuses one action, and the worker carries on with nothing shown. After 3 blocks in a row or 20 in total auto mode pauses and Claude Code prompts again; approving the prompted action resumes auto mode. A dialog also shows for an ask rule in the user's settings, for the first Read, Grep or Glob call on a path outside the working directories, and for every unlisted action in Manual ([permission modes](https://code.claude.com/docs/en/permission-modes)). With `permissionPrompts` `block`, list the dialog for the owner, and the item waits. Its approval says to answer once ("Yes"), never "Yes, and don't ask again" or another standing answer: that saves an allow rule in `.claude/settings.local.json` at the main checkout's root, which applies to every later worker of the project and to the user's own sessions there ([settings](https://code.claude.com/docs/en/settings#where-claude-code-keeps-the-local-file-in-a-git-repository)), and a narrow allow rule stays in effect in auto mode.

A supervised Claude Code worker on Orca shows no status bar while a permission dialog is open: the dialog takes the prompt area, so its terminal does not show its mode then (observed in a live run). `permissionPrompts` `decline` is accepted and acts as `block`: no dialog of any worker is declined.

Orca also shows such a dialog as an approval of its own. One nobody answers closes after about 90 seconds as "closed without an answer" while the dialog stays open in the worker's terminal, and from then on an approve or deny through Orca no longer reaches the worker (observed, not documented). The coordinator answers neither ([SKILL.md](SKILL.md#rules)): the dialog stays listed for the owner as with `block`, and the item waits.

## Resume

The CedarLoom plugin hands the handoff file back after a `/clear` or compaction only in the session its `Session:` line names, a Claude Code coordinator ([Start the run](#start-the-run)).

- When that Claude Code coordinator ends a turn idle (no background task; a session cron does not count) above the plugin option `rotateAtTokens`, 200,000 tokens by default, the plugin clears it with `/clear` and submits a prompt to run the Resume steps.
- `rotateAtPercent` above 0 sets a percent of the context window instead, and both at 0 turn it off.
- Where Claude Code's built-in guard loads, there is no idle clear, only the hand-back, and the context grows until auto-compaction, or to the window limit when auto-compaction is off.
- Without the file, or for another session, the plugin neither hands it back nor clears.

The file's Resume section holds these steps, in this order, with the run id and the absolute path of this skill's folder filled in:

1. The start condition of [Start the run](#start-the-run) again: when it fails, start nothing and tell the owner which one failed and why. Then `ORCA orchestration check --json`, before any other `orchestration` command: it returns the mail that arrived meanwhile. Orca types a wake only once per unread message, and a wake can merge into the resume prompt. Act on its output only after step 2.
2. Read `<skill folder>/SKILL.md` and `<skill folder>/orca.md` in full, then the reference file that the mail of step 1 or the Next section's step needs. A `/clear` empties the context, the skill included, and a compaction returns only the start of it.
3. When `check` said no run is bound: `ORCA orchestration run-use --id <run id> --json`, then `check` again.
4. `ORCA orchestration run-current --json`
5. `ORCA orchestration task-list --ready --brief --json` and `ORCA orchestration gate-list --status pending --json`. A `ready` task gets no worker for being listed ([Tasks and gates](#tasks-and-gates)). A task whose gate is resolved while the handoff file shows no step after it (a coordinator that stopped between `gate-resolve` and the next command) gets that next step now, by the answer the handoff file records; a pending gate whose answer it records gets its `gate-resolve` and that step; a decision task it records with no gate gets its `gate-create`, and a `design` approval it records with no decision task gets its `task-create` and `gate-create`. Name in the report a pending gate that no line of `## Open` records. A gate no longer pending whose answer `## Decisions` does not record is no answer: nothing starts or is released by it, the approval stays open, and the report names it; never run `gate-resolve` on a gate that is not pending (Orca accepts it and sets the task `ready` again).
6. `ORCA orchestration inbox --terminal run:<run id> --limit 50 --json`: the mail already handled.
7. With session crons: `CronList`. When it no longer shows the run's stall-check cron (a restarted process loses it), or that cron expires within 2 days, replace it as the Watch section of `<skill folder>/orca.md` says.

## Clean up

```text
ORCA orchestration worker-release --dispatch <dispatch id> --json
ORCA worktree rm --worktree path:<worktree path> --run-hooks --json
```

The second command removes a supervised worker's worktree; an automatic worker's goes as the worktree list below says. Before it, delete a supervised Claude Code worker's rule file, `<worktree path>/.claude/settings.local.json`: the file is ignored, not untracked (unverified: whether an ignored file blocks the removal). Orca does not force the removal: any untracked file blocks it (`Failed to delete worktree at <worktree>. ?? .env`, Orca 1.4.254). Then leave the worktree, never pass `--force` or delete the file, and name the path and the files in the report. `--run-hooks` runs the project's `orca.yaml` archive script before the removal. When the removal fails on that script, remove the containers below first and run it again. After the removal, list what is left (`podman ps -aq --filter label=devcontainer.local_folder=<worktree path>`, or `docker`) and remove those containers with `rm -f`.

A worker whose terminal a person typed in gets no cleanup ([SKILL.md](SKILL.md#rules) has the rule). It gets no follow-up either: its pull request's findings go to the owner. With Orca, such a worker's `worker-read` output shows input that neither a `send`, a dispatch of the coordinator (the start, a follow-up) nor its `terminal create --command` launch line carried. Keep it with `ORCA orchestration worker-retain --dispatch <dispatch id> --json`: no stop, no release, no worktree removal. At the wake-up for each report of a supervised Claude Code worker, `worker-read` it first and run `worker-retain` when it shows such input; once it is released, nothing further is done and its worktree stays. The owner's answer to a dialog there, in that terminal or through Orca's approval ([A permission dialog](#a-permission-dialog)), leaves the worker the coordinator's; any other text typed there makes it a person's (unverified: whether `worker-read` shows such an answer as input). Orca's `send` is the coordinator's message command and, with the starts of [Start the run](#start-the-run), the only way into a worker terminal ([SKILL.md](SKILL.md#rules) has the rule).

Release:

- Release only a settled worker, so stop an idle worker that sent no report (for an automatic worker, no final answer) before releasing it.
- A supervised Claude Code worker stays open for follow-ups ([Start the run](#start-the-run)) and is released once its pull request is merged or left for the owner, or earlier when a step needs it released ([SKILL.md](SKILL.md#outcomes), Blocked; [Clean up](SKILL.md#clean-up), step 1; a fresh start on its branch). A worker a person typed in gets none, so `worker-read` it again right before the release, as at its report. Its release is an automatic worker's (below): `terminal close`, confirmed by `terminal list`, then `worker-release`, which reports `retained`; Orca then marks the dispatch failed with `Terminal closed by operator request`, which changes no outcome. When the close fails or the terminal is still listed, keep its rule file and worktree, and name the worker and its terminal in the report.
- A Codex worker with a pull request is released after the merge, or once the pull request is left for the owner, not before.
- An automatic worker is released as soon as its report arrives, before Commit and push and before the next worktree of its project is made ([Sandbox on](modes.md#sandbox-on)); the release keeps its worktree. `worker-release` alone closes nothing here: by its help it never closes a pre-existing terminal, such as the one `terminal create` made. So run `ORCA terminal close --terminal <terminal> --json`, then `worker-release`, which reports `retained` (Orca 1.4.254). The worker counts as released once `ORCA terminal list --worktree path:<worktree path> --json` no longer lists that terminal. Orca then marks the dispatch failed with `Terminal closed by operator request` and escalates it as lost (Orca 1.4.259): that is expected and changes neither the outcome its final answer gave nor the release. Do the same for each follow-up's terminal. When the close fails or the terminal is still listed, make no further worktree in that project for the rest of the run, and name the worker, its terminal and the project's waiting issues in the report ([Sandbox on](modes.md#sandbox-on)). Unverified: whether a process the worker detached from its terminal outlives the close.
- `worker-read` still returns a released worker's output.

The worktree:

- `ORCA worktree rm` is for a supervised worker's worktree only, never for an automatic worker's, the probe's two scratch worktrees included. Orca runs its own git commands for the removal, without the pins and the `commondir` read of [Commit and push](modes.md#commit-and-push), and `--run-hooks` runs the archive script, all outside the sandbox: a hook, a monitor or an `orca.yaml` that the worker wrote in its worktree could run there. Unverified: which git commands Orca runs in the worktree, and whether it reads `orca.yaml` from the worktree or from the main checkout (`ORCA worktree rm --help` states neither).
- `ORCA worktree rm` keeps the local branch, also with `--force`, unless `--delete-branch` is passed, which the command above does not (`ORCA worktree rm --help`, Orca 1.4.259; the branches stayed with Orca 1.4.254). An older host keeps its own branch policy and prints a warning: name such a warning in the report.
- Never remove a blocked worker's worktree.
- An automatic worker's worktree goes with `git -C <project path> worktree remove <worktree path>`, which leaves the branch (an entry Orca's worktree list keeps: below): first the `commondir` read of [Commit and push](modes.md#commit-and-push), then the command with the pins of its `gitW`: `git --no-replace-objects -C <project path> -c core.hooksPath=/dev/null -c core.fsmonitor=false -c protocol.ext.allow=never worktree remove <worktree path>`. The removal runs `git status` in the worktree, which can run a hook or a monitor of the worktree, and `-c` reaches that child process too. Its archive script does not run: its containers go by the listing above.
- A worktree that Orca's Workspace Cleanup already removed counts as removed: `git -C <project path> worktree list --porcelain` prints no `worktree <worktree path>` line and the folder is gone. Run no `ORCA worktree rm` for it; its containers still go by the listing above. Workspace Cleanup is an Orca setting with every rule off by default, and it spares a workspace active in the last hour or with a running terminal, a live agent, uncommitted changes, unpushed commits or, by default, ignored files such as a rule file (Orca 1.4.259, `src/shared/workspace-cleanup/workspace-cleanup-policy.ts` lines 54-63, `src/shared/workspace-cleanup/workspace-cleanup-evaluation.ts` lines 9, 65-77 and 180-186).
- The remote branch and the local branches either removal leaves: [SKILL.md](SKILL.md#clean-up), step 3.

Before the coordinator turn ends, `ORCA orchestration worker-list --run <run id> --terminal-state reclaimable --json` returns no worker but a worker whose terminal a person typed in, which stays (above). The same list with `--terminal-state retained` shows the kept-open workers ([Host limit](#host-limit)): each settled one in it (`outcome` other than `in_progress`) is a Codex or supervised Claude Code worker whose pull request is in review or merge, or a worker whose terminal a person typed in. An automatic worker is not kept open after its report. It, and a supervised Claude Code worker after its release, can still appear in that list, its dispatch marked failed once its terminal is closed (Release), and it counts as released once its terminal close is confirmed, as Release says. Every other settled worker is released, retained or removed above. `worker-release` removes no worktree, and an automatic worker's stays after its release until its pull request is merged or left for the owner. So a worktree still listed by `ORCA worktree list` past that point (for a worker without a pull request, past its settling), a blocked worker's, or one whose removal an untracked file blocked (above), aside, is the step above not run, unless git no longer has it: `git -C <project path> worktree list --porcelain` prints no `worktree <worktree path>` line and the folder is gone. Such an entry is Orca's record alone (unverified: whether Orca drops it after `git worktree remove`, not measured): leave it, never run `ORCA worktree rm` on an automatic worker's entry, and name its path in the report.

## Host limit

The limit is machine-wide, and `worker-list` covers one run (the bound one unless `--run` is given). Count the rows whose `outcome` is `in_progress` in every run that `ORCA orchestration run-list` shows, before every start: a kept-open worker's terminal state is `retained` also while it works (observed with Orca 1.4.254), so that state does not tell the working ones. An automatic or supervised Claude Code worker whose terminal close is confirmed (Release) does not count, whatever its row shows; for a row of another run, or one this run has no record of, the close is confirmed when `ORCA terminal list --json` no longer lists its terminal. Orca then marks its dispatch failed (Release, observed with Orca 1.4.259). A start held at a dialog in the handoff file's `## Open` ([Start the run](#start-the-run)) counts as working too; a worker whose last turn ended while its `ask`, or a `needs-input` question held for the owner ([Stops](#stops)), waits for the owner, with no other work left open ([Gates](#gates)), does not, until its reply; one that works on counts.

A follow-up puts a worker that already reported back to work (an automatic worker's is a new start in its worktree, [Start the run](#start-the-run)), so it counts like a start for `hostWorkerLimit` and `workersPerProject`: count before it too. When a cap is full the follow-up waits, and no start in that project (for `hostWorkerLimit`: on the machine) comes before it ([SKILL.md](SKILL.md#loop), step 5): otherwise steady new issues keep the slot, and the pull request never merges. Count each worker with a follow-up it has not answered yet as working, whatever its row says (unverified: whether such a worker's row shows `in_progress` again).

## Scheduled runs

The rules of a scheduled run: [recurring-runs.md](recurring-runs.md). With Orca:

```text
ORCA automations create --name <name> --trigger <cron> --provider claude --repo path:<coordinator project> --precheck "node <skill folder>/precheck.mjs <its arguments in SKILL.md, Loop>" --prompt "<the skill invocation>" --json
ORCA automations runs --id <automation id> --limit 5 --json
```

- The precheck's exit 0 starts the run; any other exit records a skipped run (`status` `skipped_precheck`).
- Without `--workspace`, Orca makes a new worktree per run, which is the disposable worktree an unattended run needs.
- One live session per automation: the scheduled session first lists `automations runs` and ends at once when an earlier run of the same automation still has a live terminal. Tell a live run by `terminalPtyId` and the terminal's state, not by `status` (unverified: which `status` values mean a run is still going).
