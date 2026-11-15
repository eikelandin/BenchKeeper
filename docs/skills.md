# Skills

What each skill does, who starts it, when it runs and what it writes, so you can pick one without reading its `SKILL.md`. The tables come from each skill's front matter and from `plugins/cedarloom/library/library.json`; CI fails when this page differs from them (`node .github/scripts/skills-doc.mjs` rewrites it).

## BenchKeeper's skills

The BenchKeeper plugin installs these eight in Claude Code and Codex at every level. A skill that "you" start never starts on its own.

<!-- generated:skills -->
| Skill | What it is for | Started by | When it runs | What it writes |
| --- | --- | --- | --- | --- |
| [ask](../plugins/cedarloom/skills/ask/SKILL.md) | Allows terminal questions (the question tool and plan mode) in this Claude Code session for a while: 30 minutes, a span, until a time, or off again. | you: `/benchkeeper:ask` (Codex `$benchkeeper:ask`) | On request, while you sit at the terminal and want the agent to ask you, for example to grill a plan. | One file per Claude Code process in the plugin's data folder (ask/<process id>.json, the window's end); off deletes it. |
| [maintaining-repos](../plugins/cedarloom/skills/maintaining-repos/SKILL.md) | Runs a repository-wide maintenance pass: dead code, duplicates, unused options and dependencies, dependency cycles, test audit by mutation, shortcut debt, dependency audit, version pins, docs drift, instruction-file audit, unused skills, repository hygiene. | you: `/benchkeeper:maintaining-repos` (Codex `$benchkeeper:maintaining-repos`) | On request, on a clean working tree. | Nothing until you approve the findings (Edit and Write are off), apart from the verdicts in the project's local knowledge base and the `.cedarloom-app/` line in `.git/info/exclude` that keeps it local; then the commits of each approved change under `workflow`. |
| [operating-benchkeeper](../plugins/cedarloom/skills/operating-benchkeeper/SKILL.md) | Manages the BenchKeeper setup of this machine or a repository through the benchkeeper CLI alone, without the web UI: plan, review the diff, apply with --yes, read the JSON, undo a run, run doctor and verify, update one project. | the agent, or you with `/benchkeeper:operating-benchkeeper` | Use when asked to install, update, check, change or undo the BenchKeeper setup, or to read its state (projects, skills, packs, history, settings, rules) from the command line. | What the `benchkeeper` commands you approve write: rules, skills, settings and project setup files, each run recorded for `benchkeeper undo`. |
| [orchestrating-projects](../plugins/cedarloom/skills/orchestrating-projects/SKILL.md) | Runs a coordinator for parallel autonomous issue work: workers on labeled issues with the projects in parallel, each pull request reviewed by a fresh reviewer, merged only where the repository's written policy allows, cleaned up, then the next issues started. | you: `/benchkeeper:orchestrating-projects` (Codex `$benchkeeper:orchestrating-projects`) | Start it on request with the project paths. | Specs, prompts, approvals, handoff copies and scratch clones in `.cedarloom-app/runs/<run id>/` and the coordinator's handoff file `.cedarloom-app/runs/handoff.md`, deleted when the run closes, and a `.cedarloom-app/runs` line in `.git/info/exclude` when git does not ignore it yet; the ref `refs/cedarloom-app/policy` in each project; reviewed draft pull requests marked ready; the worktrees and containers of finished workers removed; approval issues in the hub repository, without a hub in the project's tracker, never in a public repository; issue and pull request comments; a merge of the default branch into a pull request's branch, merges, issue closes and local and remote branch deletions only where the project's `docs/agents/orchestration.json` allows; one Escape into a worker's terminal where that policy sets `permissionPrompts` to `decline`; the digest file `digests/<date>.md` when the owner asks for one or the run closes with decisions taken on the owner's behalf that it does not list, committed or posted as one issue comment only when the owner asks, never to a public repository. Workers write the branches and pull requests. |
| [questions](../plugins/cedarloom/skills/questions/SKILL.md) | Asks you the open question issues of the hub repository in batches with the question tool, records each answer on its issue, and keeps the ones you defer out of the queue. | you: `/benchkeeper:questions` (Codex `$benchkeeper:questions`) | On request, while you sit at the terminal to answer the open questions; it allows terminal questions for the rest of the session. | A comment and new labels on each issue you answer or defer, in the hub repository, and the deferred label there when the hub lacks it; the window file /benchkeeper:ask keeps, open for the rest of the session. |
| [reviewing-rules](../plugins/cedarloom/skills/reviewing-rules/SKILL.md) | Reviews one rule file such as CLAUDE.md or AGENTS.md for contradictions, vague lines, lines a tool could enforce and lines that restate the code or config. | you: `/benchkeeper:reviewing-rules` (Codex `$benchkeeper:reviewing-rules`) | On request, after you wrote or changed a rule file. | Nothing: a list of findings in the conversation. Each is a suggestion; you decide what to change. |
| [setting-up-projects](../plugins/cedarloom/skills/setting-up-projects/SKILL.md) | Sets up or updates a repository's agent setup for Claude Code and Codex: the CedarLoom rules block, the coordinator policy file, the devcontainer configuration and where the agent runs, the project parts of AGENTS.md, other project configuration to remove. | you: `/benchkeeper:setting-up-projects` (Codex `$benchkeeper:setting-up-projects`) | Use when the user asks to set up, onboard, update, or audit a project's agent setup. | After you approve its plan: the CedarLoom block (repository rules, where commands run) in `AGENTS.md`, or in `CLAUDE.local.md` for a local setup; `AGENTS.md` (commands, first-class targets, footgun docs, pointers) and `CLAUDE.md` with only `@AGENTS.md`, both committed, where `AGENTS.md` is new or holds the block (into a committed `AGENTS.md` without the block, only the parts you pick, and `CLAUDE.md` stays as it is); when absent, the coordinator's `docs/agents/orchestration.json` and an empty `docs/agents/worker-rules.md`, committed; the dev container configuration; short footgun docs under `docs/agents/`; and the removals you confirm when the skill lists other agent configuration: skills, plugin and marketplace entries, MCP servers, hooks, other agent rules files and tool folders. |
| [workflow](../plugins/cedarloom/skills/workflow/SKILL.md) | Picks the workflow and depth for a task: a software change, a docs pass, research, or a batch of tasks on one branch, each at quick, standard or deep depth, with the checks and reviews each needs. | the agent, or you with `/benchkeeper:workflow` | Use before the first edit in a repository, before issue or pull request work, and before research with two or more items. | The depth line `Depth: <depth> (<reason>)` and the risk line `Risk: <class> (<reason>)` before the first edit; through its playbooks commits and a pull request in the project's convention. |

## Matt Pocock's skills

The `matt-pocock` pack installs his plugin (skill list of version 1.3.1). Claude Code installs it from the official marketplace, which pins it to one commit ([marketplace.json](https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json)); the pin moves when that marketplace updates it. Skills you start run as `/mattpocock-skills:<name>` (Codex `$mattpocock-skills:<name>`); the agent starts the others on its own, and you can start them too.

| Skill | Started by | What it does |
| --- | --- | --- |
| `ask-matt` | you | Routes you to the skill or flow that fits your situation. |
| `diagnosing-bugs` | the agent or you | A diagnosis loop for hard bugs and performance regressions. |
| `grill-with-docs` | you | Interviews you to sharpen a plan or design and writes ADRs and glossary entries as it goes. |
| `triage` | you | Moves issues and external pull requests through triage roles and writes agent-ready briefs. |
| `improve-codebase-architecture` | you | Scans for deepening opportunities, reports them as an HTML page, then grills through the one you pick. |
| `setup-matt-pocock-skills` | you | Sets up the issue tracker, triage labels and domain doc layout in `docs/agents/`, once per repository. |
| `tdd` | the agent or you | Test-driven development, red-green-refactor. |
| `to-spec` | you | Turns the conversation into a spec on the issue tracker. |
| `to-tickets` | you | Breaks a plan or spec into tracer-bullet tickets with their blocking edges. |
| `wayfinder` | you | Plans work too big for one session as decision tickets and resolves them one by one. |
| `implement` | you | Implements a piece of work from a spec or tickets. |
| `implement-spec` | you | Implements the result of `to-spec` and `to-tickets`. |
| `prototype` | the agent or you | Builds a throwaway prototype to answer a design question. |
| `research` | the agent or you | Investigates a question against primary sources and writes the findings to a Markdown file. |
| `domain-modeling` | the agent or you | Builds the domain model: `GLOSSARY.md` and ADRs. |
| `codebase-design` | the agent or you | Shared vocabulary for designing deep modules and their seams. |
| `code-review` | the agent or you | Reviews changes since a fixed point against the repository's standards and the issue or spec. |
| `pr` | the agent or you | Writes a pull request body. |
| `retro` | you | A retrospective on a coding session. |
| `wizard` | the agent or you | Generates an interactive bash wizard for steps only a human can do. |
| `grill-me` | you | Interviews you to sharpen a plan or design. |
| `grilling` | the agent or you | Grills you about a plan, decision or idea. |
| `handoff` | you | Compacts the conversation into a handoff document for another agent. |
| `teach` | you | Teaches you a skill or concept within this workspace. |
| `to-questionnaire` | you | Turns an open decision into a questionnaire for someone else to fill in. |
| `wait-what` | you | Re-pitches the last message when it did not land. |
| `writing-for-agents` | the agent or you | Writing skills, `AGENTS.md` and `CLAUDE.md` for agents. |
<!-- /generated:skills -->

Skills installed per project (packs and single skills): [the library catalog](../plugins/cedarloom/library/README.md).
