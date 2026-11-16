<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/cedarloom-dark.svg">
    <img src="brand/cedarloom-light.svg" alt="CedarLoom" width="400">
  </picture>
</p>

# CedarLoom

CedarLoom gives Claude Code a workflow: it sizes the planning, checks and review of each task to its risk, sets up and maintains your repositories for agents, and runs issue work across several projects from one coordinator session. It installs as Claude Code plugins from a marketplace; there is no app or package to run.

## Requirements

- [Claude Code](https://code.claude.com/docs/en/setup) 2.1.295 or later.
- [Node.js](https://nodejs.org/) on the PATH: the plugins' hooks run `node`. CI runs the plugin tests on Node.js 22.
- Git and the [GitHub CLI](https://cli.github.com/) (`gh`) for setting up repositories and for coordinating issue work.
- Optional, for `cl-orchestration`: [Orca](https://github.com/stablyai/orca) with its `orchestration` skill, to run each worker in a terminal of its own; without it, or with the [runner](plugins/cl-orchestration/skills/orchestrating-projects/runners.md) `claude-code` set, the coordinator runs its workers as background agents of its own session. Run unattended workers in Claude Code's [sandbox](https://code.claude.com/docs/en/sandboxing) or a dev container with a network allow-list: it limits what a misled worker can reach or send.

## Install

In a Claude Code session, add the marketplace on its `stable` branch, which moves to each release, then install the bundle:

```text
/plugin marketplace add CedarLoom/cedarloom#stable
/plugin install cedarloom@cedarloom
```

The install dialog asks for a scope: user scope enables the plugins in every project on the machine. Run `/reload-plugins`, or start a new session, and type `/cl-workflow:` to see the commands.

The same from a shell:

```sh
claude plugin marketplace add CedarLoom/cedarloom#stable
claude plugin install cedarloom@cedarloom
```

To install one plugin instead of the bundle, name it: `/plugin install cl-workflow@cedarloom`. `cl-orchestration` installs `cl-workflow` with it.

Codex reads the same marketplace. In Codex, `cl-orchestration` gives the skill text; its coordinator starts workers only in Claude Code. Codex installs no dependencies, so add each plugin you want, `cl-workflow` before `cl-orchestration`:

```sh
codex plugin marketplace add CedarLoom/cedarloom@stable
codex plugin add cl-workflow@cedarloom
codex plugin add cl-setup@cedarloom
codex plugin add cl-orchestration@cedarloom
```

The hooks of `cl-workflow` do not run in Codex ([The plugins](docs/plugins.md)).

## What each plugin gives

| Plugin | Gives you | Commands you type |
|---|---|---|
| `cedarloom` | The bundle: installs the three plugins below together. | none of its own |
| `cl-workflow` | The `workflow` skill, which the agent starts before the first edit: it picks the task kind (software change, docs pass, research) and the depth (quick, standard, deep), then runs the planning, test, review and verify agents that depth needs. Hooks that keep terminal questions and plan mode off unless you allow them, a role guard that keeps merges, releases and pushes to the default branch with the coordinator, and an optional status band. | `/cl-workflow:plan <task>` settles one task and writes the plan. `/cl-workflow:ask` allows terminal questions for a while. `/cl-workflow:questions` asks you the open question issues in batches and records each answer. `/cl-workflow:workflow` starts the workflow by hand. |
| `cl-setup` | Skills that set up and maintain a repository: agent instructions, the dev container, the coordinator's policy file, a maintenance pass and reviews of rules files and docs. Each change is a plan item you approve first. | `/cl-setup:setting-up-projects`, `/cl-setup:maintaining-repos`, `/cl-setup:reviewing-rules`, `/cl-setup:audit`, `/cl-setup:improve`, `/cl-setup:debloat` |
| `cl-orchestration` | A coordinator that works labeled issues of several projects in parallel with worker jobs, has a fresh reviewer check each pull request, merges only where the repository's written policy allows, and resumes from a handoff file after a clear or compaction. | `/cl-orchestration:orchestrating-projects` with the project paths |

The role guard refuses merges, releases and pushes to the default branch in every session without `CEDARLOOM_ROLE=coordinator` in its environment, your own sessions included. Start only the coordinator's session with it, for example `CEDARLOOM_ROLE=coordinator claude` ([The plugins](docs/plugins.md)).

## Typical flow

1. [Install](#install) the `cedarloom` bundle; `cl-workflow` plus `cl-setup` is enough without the coordinator. Update with the commands under [Update](#update).
2. Once per repository, start a session there (`cd <repo>`, then `claude`) and run `/cl-setup:setting-up-projects`. It also writes the coordinator's policy, `docs/agents/orchestration.json`, whose `startLabel` names the label that lets the coordinator start an issue ([policy](plugins/cl-orchestration/skills/orchestrating-projects/policy.md)). The coordinator starts nothing until that file is on the default branch.
3. Per task, without the coordinator:
   - Describe the task: the workflow picks the kind and the depth. Start a bigger one with `/cl-workflow:plan <task>`, and run `/cl-workflow:ask` to let the agent ask you questions in the terminal for a while.
   - Keep the repository in shape with `/cl-setup:maintaining-repos`, and run `/cl-setup:audit`, `/cl-setup:improve` and `/cl-setup:debloat` on its instructions, docs or code.
4. Per issue, with the coordinator (needs `cl-orchestration`):
   - Label the issues with the `startLabel`.
   - In a terminal (an Orca terminal for Orca workers), run `CEDARLOOM_ROLE=coordinator claude` in the default permission mode, then `/cl-orchestration:orchestrating-projects <project paths>`. It starts a worker per issue through its [runner](plugins/cl-orchestration/skills/orchestrating-projects/runners.md) and a fresh reviewer per pull request, merges as the repository's policy allows, and resumes from the handoff file after a clear or compaction. Releases and tags stay yours; the role guard lets no other session merge or release.
   - Where the coordinator's questions go: [Hub repository](#hub-repository).

## Hub repository

One GitHub repository, often private, that can hold the work items and owner questions of all projects, so internal text stays out of product repositories.

| Setting | Where | Default |
| --- | --- | --- |
| `hub` (`owner/name`) | option of `cl-workflow` and `cl-orchestration` (`/plugin configure <plugin>@cedarloom` or `/config`) | none |
| `issuesIn` (`repo` or `hub`) | option of `cl-orchestration` | `repo` |
| `issues.tracker` (`repo` or `hub`), per project | the project's policy file | `issuesIn` |

Public repositories never mention the hub; the coordinator closes hub issues after the merge. Questions go to the tracker if private, else the hub, else the local queue `.cedarloom/questions/`. Details: [The plugins](docs/plugins.md#hub-repository).

## Update

Marketplaces other than Anthropic's have auto-update off, so a plugin changes only when you update it, and only when its version changed in a release ([Claude Code docs](https://code.claude.com/docs/en/discover-plugins#keep-plugins-updated)).

```sh
claude plugin marketplace update cedarloom
claude plugin update cl-workflow@cedarloom
```

Repeat the second line for each installed plugin, or in a session open `/plugin`, go to the Marketplaces tab, select `cedarloom` and choose Update marketplace to update them all. The same marketplace menu turns auto-update on. A running session keeps the version it loaded: run `/reload-plugins` or start a new session.

## Uninstall

```text
/plugin uninstall cedarloom@cedarloom
/plugin marketplace remove cedarloom
```

Removing the marketplace uninstalls every plugin installed from it. Files the skills wrote into your repositories stay, for example `AGENTS.md`, `docs/agents/orchestration.json` and the `.cedarloom/runs` folder: delete them yourself if you no longer want them.

## Not in 0.1

The command-line tool and the browser app are planned for 0.2.

## More

- [The plugins](docs/plugins.md): the hooks, their settings and their limits
- [Skills](docs/skills.md): what each skill does, who starts it and what it writes
- [Restart-safe coordinator](docs/restart-safe-coordinator.md): keeping one coordinator run through usage limits and restarts
- [Stack](docs/stack.md): the components CedarLoom works with and why
- [How to report a vulnerability](SECURITY.md). This repository takes no issues: see the [issue policy](docs/agents/issue-tracker.md).

## License

The code and documentation are under the [ISC license](LICENSE). Copied third-party material keeps its own license. The CedarLoom name and logos are not: see [their terms](LICENSES/LicenseRef-Brand.txt). [`REUSE.toml`](REUSE.toml) maps every file to its license.
