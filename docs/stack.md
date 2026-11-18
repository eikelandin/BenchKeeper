# Stack

CedarLoom ships as plugins for Claude Code and Codex: [workflow](../plugins/cl-workflow), [repo](../plugins/cl-repo) and [orchestration](../plugins/cl-orchestration), installed together by the [cedarloom](../plugins/cedarloom) bundle. Install steps: [README](../README.md#install).

## Components

| Component | Scope | Purpose |
|---|---|---|
| [Dev Containers](https://code.visualstudio.com/docs/devcontainers/devcontainer-cli) | tooling on host, configuration per repo | project commands run in the container, whose configuration `setup` writes |
| [Ponytail](../README.md#recommended-add-on-ponytail) | recommended add-on, separate plugin | implementation simplicity |
| [workflow](../plugins/cl-workflow/skills/workflow/SKILL.md) | global, Claude + Codex | task kind (software change, docs pass, research) and depth (quick, standard, deep), pre-push correctness review, security review for risky changes; uses installed skills that match a step |

## Contents

| Path | What | Linked as |
|---|---|---|
| [.claude-plugin/marketplace.json](../.claude-plugin/marketplace.json) | the marketplace, read by Claude Code and Codex | `$HOME/.claude/plugins/`, `$HOME/.codex/plugins/` |
| [plugins/cl-repo/rules/project.md](../plugins/cl-repo/rules/project.md) | repository rules (standard level and up) | the CedarLoom block `setup` writes |
| [plugins/cl-orchestration/rules/worker.md](../plugins/cl-orchestration/rules/worker.md) | conduct rules for the workers of a coordinator run | text in every worker spec and subagent brief of `coordinate`; no setup installs it as a rule file |
| `plugins/*/skills/<name>` | the skills, described in [Skills](skills.md); the finding layout of [audit](../plugins/cl-repo/skills/audit/SKILL.md#report), the before-and-after evidence of [improve](../plugins/cl-repo/skills/improve/SKILL.md#steps) and the code steps of [debloat](../plugins/cl-repo/skills/debloat/SKILL.md#steps-code) are in their own files | plugin skills `cl-workflow:<name>`, `cl-repo:<name>` and `cl-orchestration:<name>` |
| [plugins/cl-workflow/agents](../plugins/cl-workflow/agents) | the phase agents the workflow starts at standard and deep (plan, implement, test, review) and per item when research runs items in parallel, each with its effort and tools; the workflow skill passes the model in the call | Claude Code plugin agents `cl-workflow:<role>`; Codex uses general subagents |
| [plugins/cl-workflow/hooks/tier](../plugins/cl-workflow/hooks/tier/register.tsx) | the optional status band ([plugins](plugins.md#the-status-band)) | Claude Code plugin option `tierBand`, off by default |
| [plugins/cl-orchestration/hooks/rotation](../plugins/cl-orchestration/hooks/rotation/register.ts) | clears an idle coordinator above a context threshold and hands its handoff file back after a clear or compaction ([plugins](plugins.md#coordinator-context-rotation)) | Claude Code plugin options `rotateAtTokens` (200000) and `rotateAtPercent` (off); the restore after a compaction as a `SessionStart` command hook (Claude Code and Codex) |
| [plugins/cl-workflow/hooks/ask](../plugins/cl-workflow/hooks/ask/ask.mjs) | refuses the question tool and plan mode outside the window `/cl-workflow:ask` or `/cl-workflow:questions` opens, and sets that window ([plugins](plugins.md#terminal-questions)) | Claude Code plugin hooks, on while the plugin is enabled and hooks are not disabled |
| [plugins/cl-workflow/hooks/role-guard](../plugins/cl-workflow/hooks/role-guard/role-guard.mjs) | denies the merge, release, tag push, default-branch push, repository settings and security, `gh auth`, `git config` write, `git stash` and `claude --bare` commands it recognizes in a session that does not run as the coordinator and in every subagent ([plugins](plugins.md#role-guard)) | Claude Code plugin hook, on while the plugin is enabled and hooks are not disabled; `CEDARLOOM_ROLE=coordinator` lifts it |
| [plugins/cl-repo/skills/debloat/token-budget.mjs](../plugins/cl-repo/skills/debloat/token-budget.mjs) | measures tokens and checks a cut plan for `debloat` | also runs the `token-budget` CI job ([Development](development.md#workflows)) |
| `plugins/*/CHANGELOG.md` | each plugin's changelog (Releases `cedarloom-v*`), see [Releasing](releasing.md) | not linked |

## Principles

- Checks by depth: every change runs the checks and reviews its depth names: the tests of the touched code after each edit, a review before pushing for standard and deep work.
- Long checks last: the full suite, end-to-end tests and builds run once after the last edit, in a subagent that returns only failures and key lines.
- Skills by level: the full flow runs only for deep work. Small changes load one targeted skill.
- One install: one machine setup covers every repository. Each repository adds only its tracker, docs and stack.
