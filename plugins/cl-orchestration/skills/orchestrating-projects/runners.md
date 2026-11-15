# Runners

A runner starts the workers, carries messages between them and the coordinator, and cleans them up. [SKILL.md](SKILL.md) is runner-neutral: where it needs one of the steps below, it links to the runner's section.

## Choosing the runner

The coordinator chooses once, when the run starts, and writes the name into the handoff file's `Runner:` line. A resumed run keeps the runner of that line.

1. **Run argument.** `--runner <name>` before the project paths.
2. **Plugin option.** `runner`, as [SKILL.md](SKILL.md) reads it: empty means auto.
3. **Auto.** Run the Detect step of every runner below but claude-code, and of every runner plugin `cl-<name>` whose model-only skill `cl-<name>:runner` is available. Exactly one answers: that runner. More than one: start nothing and ask the owner to set `runner`, since no order between them holds. None: claude-code when its Detect step answers, else start nothing and tell the owner that no runner answered.

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
| Dialogs | What happens to a permission prompt. |
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
