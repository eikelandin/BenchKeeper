# Recurring runs

A scheduled run starts a session only when there is work, so a tick with nothing to do costs no session. Read this file before you set up or run a scheduled or unattended run, with any runner; the runner's commands are in its Scheduled runs section ([runners.md](runners.md)).

- Pick, the caps (`workersPerProject`, `hostWorkerLimit`), merge by `merge.*` and one fix worker per failing head commit of a worker's PR are deterministic checks: a script decides them, not a model session. The script takes the policy from the reader ([policy.md](policy.md)).
- A scheduled session starts only after its precheck exits 0, and never while a session of the same schedule is alive. The sample [precheck.mjs](precheck.mjs) (arguments as in [SKILL.md](SKILL.md#loop)) exits 0 when a project has an issue to pick and prints which; it starts and merges nothing.
- To see why it starts nothing in a project, run `node <skill folder>/policy.mjs <project path>`: it prints the effective policy, or with exit 1 the policy's errors.
- An unattended run starts each worker in a disposable worktree.
