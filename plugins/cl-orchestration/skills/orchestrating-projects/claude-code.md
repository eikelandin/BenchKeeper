# The claude-code runner

Workers are background agents of the coordinator's own session (the `Agent` tool with `run_in_background`), each in a worktree the coordinator creates under the run folder. They run in the coordinator's process, with its permission mode, permission grants, sandbox, working directories, environment and credentials: nothing but the spec and the [Write scope](#write-scope) check keeps a worker inside its worktree. They also load the coordinator folder's `CLAUDE.md`, settings and hooks, not those of the worker's project: the spec's Repository rules line has the worker read its project's instructions, and that project's `.claude` settings and hooks do not apply.

## Detect

The session is Claude Code: `Agent` with `run_in_background`, `SendMessage`, `TaskStop` and `CronCreate` are among its tools.

## Start

Before the first worker, tell the owner that the run needs the default (Manual) permission mode for its whole length and that you do not check it: a background agent runs in the main session's mode when that is bypass, accept edits or auto, so a coordinator started or switched otherwise gives every worker that mode without any bound. No tool reads the mode; a start in bypass mode shows in your system prompt (then start nothing), a switch during the run does not.

Preconditions, checked before the first worker; when one fails, start nothing and tell the owner which:

- The run folder and every project's main checkout, its `.git` included, lie in the session's working directories (the folder it started in, or one added with `--add-dir`): a worker's commits write the shared `.git`.
- Session crons work (`CLAUDE_CODE_DISABLE_CRON` is not set): without them nothing runs the stall check ([Watch](#watch)).

Per worker:

1. `git -C <project path> fetch origin`, then `git -C <project path> worktree add --detach <run folder>/worktrees/<owner>-<repo>-<number>-<slug> origin/<default branch>`, from `<owner/repo>` and the first issue of a batch. A retry, replan or resume of the same issue reuses that worktree when `git -C <project path> worktree list` prints its path, and adds none. The worker creates or checks out its branches there, as the spec's Branch line says.
2. Fill the spec with that worktree's path and without its Acknowledge line ([spec-template.md](spec-template.md)), and write it to a file in the run folder.
3. Start the worker: `Agent` with `run_in_background: true`, `model` the alias of the spec's model (the tool takes no full model id) and `effort` the spec's effort, the description `<owner>-<repo>-<number>-<slug>`, and the prompt "Your task is the spec in <spec file>. Read it whole before anything else." Issue text stays in the file.
4. Keep the returned agent id per worker with its project, issues, worktree path and branch names in the handoff file.

`CEDARLOOM_ROLE` cannot be unset for a worker, since it shares the coordinator's environment; the role guard treats every subagent as a non-coordinator anyway.

## Acknowledgement

The agent id the `Agent` call returns is the acknowledgement. A call that returns an error started no worker: retry once, and a second error goes to the owner.

## Reports

The worker's final result arrives as its completion notification and is its report: the first word is `DONE`, `BLOCKED` or `NEEDS_REPLAN`, followed by the handoff block; any other result is failed. A batch reports once, with one handoff block per issue in place of the status messages. The final result of a turn that a [Follow-up](#follow-up) started is the answer to it, not a new report.

## Questions

None: a worker cannot ask while it works, so a point it may not decide ends it with `NEEDS_REPLAN`, as its spec's Needs replan line says.

## Follow-up

`SendMessage` to the worker's agent id, in your own words, resumes it with its context, also after it reported. Its next final result names the head commit it pushed; read `<head>` yourself ([review-and-merge.md](review-and-merge.md)).

## Watch

End the turn after starting or messaging workers: each completion notification wakes the coordinator. For the stall check, create at run start one recurring session cron (`CronCreate`) every 10 minutes on minutes off the hour (`3-59/10 * * * *`); its prompt names the run id and the absolute path of this file and lists the wake-up checks below. Name its expiry (7 days) in each report, replace it within 2 days of that date or when `CronList` no longer shows it, and delete it when the run closes.

At each wake-up, in this order:

1. The completion notifications that arrived, and which workers still run.
2. `gh pr list -R <owner/repo> --head <branch> --state merged --json number,title,mergedAt` for merged PRs.
3. The stall check ([SKILL.md](SKILL.md#outcomes)): a worker that ends sends this session its report or the error it failed on, so one without that message has not ended and keeps waiting; past `stallMinutes` it may wait at a permission prompt in this session ([Dialogs](#dialogs)). Its last output is its transcript, `agent-<agent id>.jsonl` in `~/.claude/projects/<project>/<session id>/subagents/` ([subagents](https://code.claude.com/docs/en/sub-agents)).
4. The next step of each pull request that waits for its checks or its default-branch watch ([review-and-merge.md](review-and-merge.md#merge)).

## Dialogs

Supervised only: every worker runs in this session's default permission mode, and its permission prompts appear in this session, naming the worker. They are the owner's: the coordinator answers none. A grant that lasts beyond one call applies to the whole session, the coordinator's included. `permissionPrompts` `decline` does not apply, since there is no worker terminal.

## Write scope

The worker may write only its worktree. Nothing enforces that: the role guard is advisory. So the coordinator checks after the fact:

- At Start, per project main checkout, record in the run folder `git -C <project path> status --porcelain --ignored`, `git -C <project path> config --local --list | grep -v -e '^branch\.' -e '^submodule\.'` (making and deleting branches writes the `branch.` lines, `git submodule update --init` in a worktree the `submodule.` lines) and `shasum -a 256` of each file under `.git/hooks`.
- After each report, compare each main checkout with that record (not with a clean state, so the owner's uncommitted work at Start blocks nothing; an edit the owner makes there later shows as a difference); check that the worktree of every other worker that is not running shows the `git status --porcelain` and `HEAD` it had at that worker's report; and check the run files (specs, threads, handoff file, merge log, config listings: every file under `.cedarloom/runs` outside the `worktrees` and `clones` folders): each holds the `shasum -a 256` you recorded at your own last write of it, and none appeared that you did not write. Hash the handoff file without its status block, which the plugin's hooks rewrite.
- A difference ends the reporting worker's issue as BLOCKED for the owner, whatever its report said: name the paths and the workers still running, any of whom may have made it, change nothing back, and start no new worker in that project until the owner answers. A difference already named to the owner blocks no later report; once the owner answered, take that checkout's record again.
- Workers can write the scratch and trial clones in `clones/`, so under this runner a clone does not keep out a replace ref, a hook or a setting a worker puts there ([review-and-merge.md](review-and-merge.md)).
- In the main checkouts the check sees paths that appear, vanish or change status, not a new edit to a file that was already changed or ignored: it catches mistakes, not a worker set on hiding a write.

## Resume

Background agents end with the coordinator's process (unverified: whether they survive a `/clear`). After a restart, recreate the stall-check cron when `CronList` does not show it ([Watch](#watch)). Each worker of the handoff file that had not reported gets a fresh worker on its branch, in its worktree, with the existing-branch form of the spec's Branch line; a worker that reported stays settled, and its follow-up goes by `SendMessage` to its agent id when the session was resumed, else to such a fresh worker. The plugin never clears a coordinator while a background agent runs.

## Clean up

Stop a worker that still runs (`TaskStop` with its id), a batch's worker only after its report ([Batches](spec-template.md#batches)). A worker that reported needs no release; it is done once no follow-up can come. Remove the worktree with `git -C <project path> worktree remove <worktree path>`, which leaves the branch, as [Clean up](SKILL.md#clean-up) step 2 allows. When the run closes, a worktree that stays (a blocked worker's, or one with unpushed work) keeps the run folder's `worktrees` folder, and an issue BLOCKED keeps the Write scope record and its handoff copy, to which you add its outcome and any project hold: delete the other run files only, and name each kept worktree and file in the report.

## Host limit

At most `hostWorkerLimit` workers run at once, and fewer than the session's limit of running subagents (20 unless `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` sets another), which the workers' own phase subagents may share (unverified). A worker with a follow-up it has not answered counts as running.

## Scheduled runs

None.
