# Stack

CedarLoom 0.1 ships as plugins for Claude Code and Codex ([workflow](../plugins/cl-workflow), [repo](../plugins/cl-repo) and [orchestration](../plugins/cl-orchestration), installed together by the [cedarloom](../plugins/cedarloom) bundle). Install steps: [README](../README.md#install).

## Components

| Component | Scope | Purpose |
|---|---|---|
| [Dev Containers](https://code.visualstudio.com/docs/devcontainers/devcontainer-cli) | tooling on host, configuration per repo | project commands run in the container, whose configuration `setup` writes |
| [Ponytail](../README.md#optional-ponytail), optional | Ponytail is optional and not installed by CedarLoom; the status band shows its level only when it is installed | implementation simplicity |
| [workflow](../plugins/cl-workflow/skills/workflow/SKILL.md) | global, Claude + Codex | task kind (software change, docs pass, research) and depth (quick, standard, deep), pre-push correctness review, security review for risky changes; uses installed skills that match a step |

## Contents

| Path | What | Linked as |
|---|---|---|
| [.claude-plugin/marketplace.json](../.claude-plugin/marketplace.json) | the marketplace, read by Claude Code and Codex | `$HOME/.claude/plugins/`, `$HOME/.codex/plugins/` |
| [plugins/cl-repo/rules/project.md](../plugins/cl-repo/rules/project.md) | repository rules (standard level and up) | the CedarLoom block `setup` writes |
| [plugins/cl-orchestration/rules/worker.md](../plugins/cl-orchestration/rules/worker.md) | conduct rules for the workers of a coordinator run | text in every worker spec and subagent brief of `coordinate`; no setup installs it as a rule file |
| [plugins/cl-repo/skills/setup](../plugins/cl-repo/skills/setup/SKILL.md) | set up or update one repo: devcontainer, the project parts of AGENTS.md with footgun docs (`docs/agents/`), stack skills, other configuration to remove | plugin skill `cl-repo:setup` |
| [plugins/cl-workflow/skills/workflow](../plugins/cl-workflow/skills/workflow/SKILL.md) | task kind and depth, then the playbook for software changes, docs passes or research, batch mode, long checks at the end | plugin skill `cl-workflow:workflow` |
| [plugins/cl-workflow/agents](../plugins/cl-workflow/agents) | the phase agents the workflow starts at standard and deep (plan, implement, test, review) and per item when research runs items in parallel, each with its effort and tools; the workflow skill passes the model in the call | Claude Code plugin agents `cl-workflow:<role>`; Codex uses general subagents |
| [plugins/cl-workflow/hooks/tier](../plugins/cl-workflow/hooks/tier/register.tsx) | the optional status band in the Claude Code terminal and desktop app: project, branch, Ponytail's level only when Ponytail is installed, the last test run and lint or type check with the edits since, ASK while terminal questions are allowed ([plugins](plugins.md#the-status-band)) | Claude Code plugin option `tierBand`, off by default |
| [plugins/cl-orchestration/hooks/rotation](../plugins/cl-orchestration/hooks/rotation/register.ts) | clears an idle coordinator of `coordinate` above a context threshold and hands its handoff file back after a clear or compaction; only in the session whose id that file names ([plugins](plugins.md#coordinator-context-rotation)) | Claude Code plugin options `rotateAtTokens` (200000) and `rotateAtPercent` (off); the restore after a compaction as a `SessionStart` command hook (Claude Code and Codex) |
| [plugins/cl-workflow/skills/ask](../plugins/cl-workflow/skills/ask/SKILL.md) | allows terminal questions for a while (`for 30m`, `until HH:MM`, `off`) | plugin skill `/cl-workflow:ask`, user-invoked |
| [plugins/cl-workflow/skills/questions](../plugins/cl-workflow/skills/questions/SKILL.md) | asks the open owner questions of this repository and the local queue in batches, records each answer, keeps deferred ones out of the queue, and allows terminal questions for the session | plugin skill `/cl-workflow:questions`, user-invoked |
| [plugins/cl-workflow/hooks/ask](../plugins/cl-workflow/hooks/ask/ask.mjs) | refuses the question tool and plan mode outside the window `/cl-workflow:ask` or `/cl-workflow:questions` opens, sets that window, adds one line on the mode at session start ([plugins](plugins.md#terminal-questions)) | Claude Code plugin hooks, on while the plugin is enabled and hooks are not disabled |
| [plugins/cl-workflow/hooks/role-guard](../plugins/cl-workflow/hooks/role-guard/role-guard.mjs) | denies the merge, release, tag push, default-branch push, repository settings and security, `gh auth`, `git config` write, `git stash` and `claude --bare` commands it recognizes in a session that does not run as the coordinator and in every subagent; a command written to get around it can pass ([plugins](plugins.md#role-guard)) | Claude Code plugin hook, on while the plugin is enabled and hooks are not disabled; `CEDARLOOM_ROLE=coordinator` lifts it |
| [plugins/cl-repo/skills/maintain](../plugins/cl-repo/skills/maintain/SKILL.md) | the Maintain pass on request: dead code and duplicates, dependency cycles, test audit by mutation, debt, dependency audit, version pins, docs drift, unused skills | plugin skill `cl-repo:maintain` |
| [plugins/cl-orchestration/skills/coordinate](../plugins/cl-orchestration/skills/coordinate/SKILL.md) | the coordinator on request: workers on labeled issues, projects in parallel, each pull request reviewed by a fresh reviewer, merge and cleanup by each repository's written policy | plugin skill `cl-orchestration:coordinate` |
| [plugins/cl-repo/skills/audit](../plugins/cl-repo/skills/audit/SKILL.md) | reports findings in agent instructions (one rule file included), docs or code with `file:line`, the exact quote, a pattern and a confidence; changes nothing | plugin skill `/cl-repo:audit`, user-invoked |
| [plugins/cl-repo/skills/improve](../plugins/cl-repo/skills/improve/SKILL.md) | turns audit findings into one diff per finding and applies the approved ones, with the text before and after as evidence | plugin skill `/cl-repo:improve`, user-invoked |
| [plugins/cl-repo/skills/debloat](../plugins/cl-repo/skills/debloat/SKILL.md) | measures tokens, keeps protected text and cuts whole lines from a plan its script checks ([token-budget.mjs](../plugins/cl-repo/skills/debloat/token-budget.mjs)); in code, removes what the repository's checks prove unused | plugin skill `/cl-repo:debloat`, user-invoked; the script also runs the `token-budget` CI job |
| `plugins/*/CHANGELOG.md` | each plugin's changelog (Releases `cedarloom-v*`), see [Releasing](releasing.md) | not linked |

## How this stack was selected

- Checks by depth: every change runs the checks and reviews its depth names: the tests of the touched code after each edit, a review before pushing for standard and deep work.
- Long checks last: the full suite, end-to-end tests and builds run once after the last edit, in a subagent that returns only failures and key lines.
- Simplicity: [Ponytail](../README.md#optional-ponytail) steers the agent to the smallest complete change. Ponytail is optional and not installed by CedarLoom; the status band shows its level only when it is installed.
- Skills by level: the full flow runs only for deep work. Small changes load one targeted skill.
- One install: one machine setup covers every repository. Each repository adds only its tracker, docs and stack.
