# The claude-code runner

Workers are background agents of the coordinator's own session (the `Agent` tool with `run_in_background`), each in a worktree the coordinator creates under the run folder. They run in the coordinator's process, with its permission mode, permission grants, sandbox, working directories, environment and credentials: nothing but the spec and the [Write scope](#write-scope) check keeps a worker inside its worktree.

## Detect

None: the runner is always available.

## Start

Preconditions, checked before the first worker; when one fails, start nothing and tell the owner which:

- The coordinator session runs in the default (Manual) permission mode. A background agent runs in the main session's mode when that is bypass, accept edits or auto, so a coordinator started otherwise gives every worker that mode without any bound.
- The run folder and every project's main checkout, its `.git` included, lie in the session's working directories (the folder it started in, or one added with `--add-dir`): a worker's commits write the shared `.git`.

Per worker:

1. `git -C <project path> fetch origin`, then `git -C <project path> worktree add --detach <run folder>/worktrees/<number>-<slug> origin/<default branch>`. The worker creates or checks out its branches there, as the spec's Branch line says. `<number>-<slug>` takes the first issue of a batch.
2. Fill the spec with that worktree as its checkout and without its Acknowledge line ([spec-template.md](spec-template.md)), and write it to a file in the run folder.
3. Start the worker: `Agent` with `run_in_background: true`, `model` the alias of the spec's model (the tool takes no full model id) and `effort` the spec's effort, the description `<number>-<slug>`, and the prompt "Your task is the spec in <spec file>. Read it whole before anything else." Issue text stays in the file.
4. Keep the returned agent id per worker with its project, issues, worktree path and branch names.

`CEDARLOOM_ROLE` cannot be unset for a worker, since it shares the coordinator's environment; the role guard treats every subagent as a non-coordinator anyway.

## Acknowledgement

The agent id the `Agent` call returns is the acknowledgement. A call that returns an error started no worker: retry once, and a second error goes to the owner.

## Reports

The worker's final result arrives as its completion notification and is its report: the first word is `DONE`, `BLOCKED` or `NEEDS_REPLAN`, followed by the handoff block; any other result is failed. A batch reports once, with one handoff block per issue in place of the status messages.

## Questions

None: a worker cannot ask while it works. What it may not decide it reports as `BLOCKED` with the question. Answer such a question as [Worker questions](SKILL.md#worker-questions) says and send the answer as a [Follow-up](#follow-up); an answer that is the owner's keeps the issue blocked.

## Follow-up

`SendMessage` to the worker's agent id, in your own words, resumes it with its context, also after it reported. Its next final result names the head commit it pushed; read `<head>` yourself ([review-and-merge.md](review-and-merge.md)).

## Watch

End the turn after starting or messaging workers: each completion notification wakes the coordinator. For the stall check, create at run start one recurring session cron (`CronCreate`) every 10 minutes on minutes off the hour (`3-59/10 * * * *`); its prompt names the run id and the absolute path of this file and lists the wake-up checks below. Name its expiry (7 days) in each report, replace it within 2 days of that date or when `CronList` no longer shows it, and delete it when the run closes.

At each wake-up, in this order:

1. The completion notifications that arrived, and which workers still run.
2. `gh pr list -R <owner/repo> --head <branch> --state merged --json number,title,mergedAt` for merged PRs.
3. The stall check ([SKILL.md](SKILL.md#outcomes)): a worker still running past `stallMinutes` may wait at a permission prompt in this session ([Dialogs](#dialogs)).
4. The next step of each pull request that waits for its checks or its default-branch watch ([review-and-merge.md](review-and-merge.md#merge)).

## Dialogs

Supervised only: every worker runs in this session's default permission mode, and its permission prompts appear in this session, naming the worker. They are the owner's: the coordinator answers none. A grant that lasts beyond one call applies to the whole session, the coordinator's included. `permissionPrompts` `decline` does not apply, since there is no worker terminal.

## Write scope

The worker may write only its worktree. Nothing enforces that: the role guard is advisory. So the coordinator checks after the fact:

- At Start, per project main checkout, record `git -C <project path> status --porcelain --ignored` and `shasum -a 256` of `.git/config` and of each file under `.git/hooks`, in the run folder.
- After each report, compare each main checkout with that record (not with a clean state, so the owner's own uncommitted work blocks nothing); check that the worktree of every other worker that is not running shows the `git status --porcelain` and `HEAD` it had at that worker's report; and check that the handoff file is the coordinator's last write.
- A difference ends the reporting worker's issue as BLOCKED for the owner, whatever its report said: name the paths, change nothing back, and start no new worker in that project until the owner answers.

## Resume

Background agents end with the coordinator's process (unverified: whether they survive a `/clear`). After a restart, each worker of the handoff file that no longer runs gets a fresh worker on its branch, in its worktree, with the existing-branch form of the spec's Branch line. The plugin never clears a coordinator while a background agent runs.

## Clean up

Stop a worker that still runs (`TaskStop` with its id). A worker that reported needs no release; it is done once no follow-up can come. Remove the worktree with `git -C <project path> worktree remove <worktree path>`, which leaves the branch, as [Clean up](SKILL.md#clean-up) step 2 allows.

## Host limit

At most `hostWorkerLimit` workers run at once, and fewer than the session's limit of running subagents (20 unless `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` sets another), which the workers' own phase subagents may share (unverified). A worker with a follow-up it has not answered counts as running.

## Scheduled runs

None.
