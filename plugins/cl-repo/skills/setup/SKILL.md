---
name: setup
description: "Sets up or updates a repository's agent setup for Claude Code and Codex: the CedarLoom rules block, the coordinator policy file, the devcontainer configuration and where the agent runs, the project parts of AGENTS.md, other project configuration to remove. Use when the user asks to set up, onboard, update, or audit a project's agent setup."
disable-model-invocation: true
writes: "After you approve its plan: the CedarLoom block (repository rules, where commands run) in `AGENTS.md`, or in `CLAUDE.local.md` for a local setup; `AGENTS.md` (commands, first-class targets, footgun docs, pointers) and `CLAUDE.md` with only `@AGENTS.md`, both committed, where `AGENTS.md` is new or holds the block (into a committed `AGENTS.md` without the block, only the parts you pick, and `CLAUDE.md` stays as it is); when absent, the coordinator's `docs/agents/orchestration.json` and an empty `docs/agents/worker-rules.md`, committed; the CedarLoom labels the repository lacks; `.github/ISSUE_TEMPLATE/work.md` where the repository has no issue templates; the dev container configuration; short footgun docs under `docs/agents/`; and the removals you confirm when the skill lists other agent configuration: skills, plugin and marketplace entries, MCP servers, hooks, other agent rules files and tool folders."
---

# Setting up projects

Run in the repository root. On a repository that already has devcontainer configuration, `AGENTS.md`, the CedarLoom block or `docs/agents/`, every step compares the current state with what it would create and proposes only the differences.

Process: plan first, then apply. Its questions and approvals go to the user in the session only while the user allows terminal questions; otherwise the Read only phase puts them with your recommendations into the plan, and the run stops before Apply.
- **Read only.** Run every section below up to [Other configuration](#6-other-configuration-ask) as detection and comparison, including their questions (agent selection, stack confirmation, steps marked "ask"). Write, install, and remove nothing. Do not build or start a container.
- **Plan.** One list of files created, changed, or removed, each with its new text or diff (the block and the policy file among them), packages added to the image, container build or rebuild, integrations enabled or disabled, labels created on the hosted repository, and skipped steps with the reason. Mark destructive items: overwriting or removing files, config entries, or skills, and removing or rebuilding a container. Ask: apply all, a subset, or cancel.
- **Apply.** Apply only approved items, including container launch and verification. Right before each destructive item, show the diff or list and ask again.
- **Review and report.** Run [Review](#7-review), then [Report](#8-report).

Never run sudo or AUR installs (give the user the command). Project steps only: change nothing at user scope (the user's settings, rules, plugins and skills). When a user-scope step is needed (the CedarLoom plugin is missing for a selected agent, for example), stop and give the user the command.

## Agent selection

Detect `claude` and `codex` with `command -v`, ask which installed agents the user uses for this project (Claude Code, Codex, both, or neither), and reuse an explicit selection already given for this project in the session. Do not install agent CLIs or infer usage from installation. Report missing requested agents. If none are selected, stop without changes.

Scope every step, including updates and cleanup, to selected agents; leave unselected agents' files and integrations in place.

## 1. Stack

Identify languages, frameworks, and infrastructure tools from build files, dependency manifests, config files, and file extensions. Count only technologies the repository contains code or config for (not ones its docs merely mention), and skip a language with fewer than about 10 files unless it is the main one. Show the list. The user confirms or edits it.

## 2. Where the agent runs (ask)

A block that already has a line of [Where commands run](project-rules.md#where-commands-run) gives the answer. Without one, ask, recommending the first:
- `container`: the agent and the project commands run in the dev container.
- `host-agent`: the agent on the host, project commands in the dev container.
- `sandbox`: a Docker Sandboxes microVM (`sbx`, untested) runs the agent, its builds and tests.
- `host`: no container.

For `container` and `host-agent`, follow [devcontainer.md](devcontainer.md). Otherwise skip it.

## 3. The CedarLoom block

The block is the text [project-rules.md](project-rules.md) describes, between a line `<!-- cedarloom start -->` and a line `<!-- cedarloom end -->`. Its text is the file's, never edited by hand; the repository's own rules go outside it.

- Shared: in `AGENTS.md`, committed, where the repository has no `AGENTS.md` or its `AGENTS.md` holds the block, or the user picks "the whole block, committed" in [AGENTS.md and CLAUDE.md](#4-agentsmd-and-claudemd).
- Local, otherwise: in `CLAUDE.local.md`, when Claude Code is selected. It starts with `@AGENTS.md` unless `CLAUDE.md` already imports it, and gets a line in `$(git rev-parse --git-path info/exclude)` unless `git check-ignore -q CLAUDE.local.md` succeeds. An exclude line does not ignore a tracked file: when `git ls-files --error-unmatch CLAUDE.local.md` succeeds, write nothing and ask the user how to proceed. A local setup gives Codex no block: say so in the report.
- An existing CedarLoom block: change only the text between its markers.
- Another rules block from an earlier setup (an HTML comment marker pair ending in `project start` and `project end`) counts as the block and is replaced in its place, markers included.

## 4. AGENTS.md and CLAUDE.md

A repository without an `AGENTS.md`, or whose `AGENTS.md` holds the block, gets both, committed. `AGENTS.md`, short, in this order:
1. `## Commands`: the real install, build, test, lint, format and run commands, and the changed-files check the block's push rule names (the command CI runs for the changed files, or the closest local one). Verify each where the block says commands run, when local, read-only, and under a minute; never run network, SSH, or deploy commands merely to verify documentation.
2. The block.
3. `## Every change considers`: the first-class targets every change keeps working (platforms, runtimes, entry points such as a CLI, a server or a UI, browsers or devices, languages), then one link per risky area to a short footgun doc (for example git and child processes, platform paths). Link an existing doc; write a missing one under `docs/agents/`, a few lines on what goes wrong and how to avoid it, only for a risk the code shows.
4. `## Pointers`: `docs/agents/` (domain, issue tracker, triage labels), the styleguide and design tokens of a project with a UI, and other docs an agent needs. Link deeper docs instead of copying them.

Conventions found in the code that differ from the stack defaults go in one line each under Commands or Pointers. One line under Pointers names the convention for commit subjects and pull request titles: the project's own (a contributing guide, the history), else [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). No project summary or layout. Update: compare each part, fix failing or changed commands, and after asking remove a project summary or layout section and hand-written lines that repeat or contradict a rule of the block. The workflow skill reads a `Depth minimum:` line and no `Default tier:` line: after asking, turn a hand-written `Default tier: <tier>` line into `Depth minimum: <depth>` outside the block, with `full` as `deep`.

`CLAUDE.md` beside that `AGENTS.md`, when Claude Code is selected: exactly `@AGENTS.md`. Claude Code reads `AGENTS.md` on its own only without a `CLAUDE.md`, and the import keeps one source of instructions (https://code.claude.com/docs/en/memory). Move any other content into `AGENTS.md` first, after asking.

A repository that commits an `AGENTS.md` without the block: merge nothing into it unasked, and leave `CLAUDE.md` as it is.
- Compare the block's rules and the layout above with the file's own text: rules the file lacks, rules that say something else, sections it lacks. Show the user those differences.
- Ask with the question tool which of them to merge into `AGENTS.md`: multiSelect, one option per difference or group of rules, plus "the whole block, committed". Each option says what merging it changes for the repository's other contributors.
- Write only what the user picks, outside the block, as items of the plan. With uncommitted changes in `AGENTS.md`, ask the user to commit them first, so `git restore AGENTS.md` undoes only the picked parts before a commit. The whole block picked: the shared setup. Otherwise the block stays local.

## 5. Coordinator policy

The coordinator (`cl-orchestration:coordinate`) starts and merges nothing in a project without `docs/agents/orchestration.json` on its default branch. When the file is absent, propose it as a plan item with these answers (ask, recommending the first value named), and an empty `docs/agents/worker-rules.md` (extra rules for the coordinator's workers) when that is absent too. Both are committed in a shared and in a local setup, and from then on both are the owner's to edit: never propose a change to an existing one.

- `startLabel`: the label that lets the coordinator start an issue, `cl:ready-for-agent` unless the user names another.
- `merge.allowed`: `false`, the user merges; `true` lets the coordinator merge a reviewed pull request. With `true`, `merge.requiredChecks` lists check names that run on pull requests, taken from a recent one (`gh pr checks <n> --json name --jq '.[].name'`), never a job that runs only on pushes to the default branch, and only those the user keeps.
- `closeIssue`: `true`, a worker's pull request closes its issue when merged, by anyone, and the coordinator closes one left open; `false` leaves that to the user.
- `trustedAuthors`: none, or the review bots the user names whose comments workers may follow.

Write `{"schemaVersion": 2}` with these fields, two-space indented and with a final newline, and leave every other field to its default: the Policy section of `cl-orchestration:coordinate` (the cl-orchestration plugin, when installed) lists each field and its default.

The label set, with the policy's `startLabel` (an existing file's, else the answer above) in place of `cl:ready-for-agent`. `<owner/repo>` below is the repository `git remote get-url origin` names, so a fork's clone never reaches its upstream. Read only lists the repository's labels (`gh label list -R <owner/repo> --limit 1000 --json name`); each missing one is a plan item, and Apply creates the approved ones with `gh label create <name> -R <owner/repo> --description "<meaning>"` (GitHub takes 100 characters or fewer: [create a label](https://docs.github.com/rest/issues/labels#create-a-label)), naming one it could not create in the report with that command:
- `cl:plan`: CedarLoom may read and plan the issue and ask on it; it does not start work.
- `cl:ready-for-agent`: the coordinator may start the issue.
- `cl:needs-human`: a question or approval waits for the owner.
- `cl:in-progress`: a worker holds the issue, so it never starts twice.
- `cl:deferred`: the owner parked it: it does not start and the question queue skips it.
- `cl:follow-up`: found during other work, sized for one pull request; the owner chooses whether it starts.
- `cl:triage`: filed through the issue template; the owner reads it before adding another label.
- Rejected work is closed as not planned, with no label.

Where the repository has no `.github/ISSUE_TEMPLATE` folder and its owner has no default issue templates (`gh api repos/<owner>/.github/contents/.github/ISSUE_TEMPLATE` answers 404), propose [issue-templates/work.md](issue-templates/work.md) as `.github/ISSUE_TEMPLATE/work.md` as a plan item (the policy's, where that one is proposed), committed. It labels a new issue `cl:triage`, never `startLabel`: on a public repository anyone can file through it.

## 6. Other configuration (ask)

List everything agent-related in the project that the plan does not create or keep:
- skills in `.claude/skills/` and `.agents/skills/`, and copies of skills a global plugin already provides
- plugin and marketplace entries in `.claude/settings*.json` (`enabledPlugins`, `extraKnownMarketplaces`)
- MCP servers in `.mcp.json` and `.codex/config.toml`
- hooks in `.claude/settings*.json`, `.codex/hooks.json` and the `[hooks]` table of `.codex/config.toml`
- other agent rules files (for example `GEMINI.md`, `.cursorrules`, `.github/copilot-instructions.md`)
- spec or workflow tool folders with their skills and CI entries (for example `openspec/`, `.specify/`)
- an `AGENTS.override.md`: Codex reads it instead of `AGENTS.md`. Remove a rules block in it; the file goes when nothing else is in it. When the user's own lines remain, ask, recommending the first: move them into `AGENTS.md` outside the block and remove the override, or keep the override with the CedarLoom block added

For each item, say what it is and whether it still works, checked in its execution environment: host hooks on the host, container launchers through `devcontainer exec`. A missing host binary does not make a container launcher dead. A removed skill listed in `skills-lock.json` loses its entry there too, and the file goes when no entry is left. A tool folder with open work: propose moving the open items into the issue tracker first. `AGENTS.md` and `CLAUDE.md` are updated in [AGENTS.md and CLAUDE.md](#4-agentsmd-and-claudemd), never removed.

## 7. Review

After the apply step, give the diff (`git diff` against the default branch plus untracked files, and in a local setup the ignored files from `git status --ignored`) and the plan to a review subagent (Claude Code: the Agent tool, Codex: a subagent). It reports each failed item with the file and line:
- Every command and tool named in the touched `AGENTS.md` files exists where that file says it runs (container or host). Instructions for a tool whose skills or binary this run removed are gone.
- Statements in `AGENTS.md` that the run checked (commands, test status, build output, reproducibility) match what the checks showed.
- Each link in a touched `AGENTS.md` resolves. An `AGENTS.md` that holds the block has Commands, the block, Every change considers and Pointers in that order, and `CLAUDE.md` is exactly `@AGENTS.md`. A committed `AGENTS.md` without the block: its diff holds only the parts the user picked, and `CLAUDE.md` is unchanged.
- The text between the block's markers is the one [project-rules.md](project-rules.md) gives for the chosen answer, and the block appears once in the file. No rules block from an earlier setup remains in `AGENTS.md`, `CLAUDE.local.md` or `AGENTS.override.md`. A local `CLAUDE.local.md` is ignored by git.
- A new `docs/agents/orchestration.json` is valid JSON and holds `schemaVersion` 2 and only the fields above, with the values the user approved.
- A folder `AGENTS.md` or `CLAUDE.md` added inside a docs or site source folder is excluded from that build (for example `exclude_docs` in MkDocs).
- Each removal left no folder or lock entry.
- The branch merges cleanly into the default branch. Otherwise merge the default branch in and resolve the conflicts before pushing.

Fix the findings within the approved plan. Report the others.

## 8. Report

Give a table of each changed file, the items removed, and steps skipped with the reason. Include the container launch result and the project checks run inside it. Report MCP/browser connections as verified, unavailable, skipped, or untested. Then give launch commands for selected host agents and the container command prefix. With a new policy file: once it is on the default branch, `node <coordinate skill folder>/policy.mjs .` prints the policy the coordinator will use.
