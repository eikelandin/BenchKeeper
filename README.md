<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/cedarloom-dark.svg">
    <img src="brand/cedarloom-light.svg" alt="CedarLoom" width="400">
  </picture>
</p>

# CedarLoom

CedarLoom gives Claude Code a workflow: it sizes the planning, checks and review of each task to its risk, sets up and maintains your repositories for agents, and runs issue work across several projects from one coordinator session. It installs as plugins from a marketplace; there is no app or package to run.

## Requirements

- [Claude Code](https://code.claude.com/docs/en/setup) 2.1.323 or later, the minimum for every CedarLoom feature.
- [Node.js](https://nodejs.org/) on the PATH: the plugins' hooks run `node`. CI runs the plugin tests on Node.js 22.
- Git and the [GitHub CLI](https://cli.github.com/) (`gh`), for setting up repositories and coordinating issue work.
- For `cl-orchestration`: [Orca](https://github.com/stablyai/orca) 1.4.259 or later ([release](https://github.com/stablyai/orca/releases/tag/v1.4.259)), which runs each worker in a terminal of its own. The coordinator starts workers only through Orca and reads its `orchestration` guide with `orca skills get orchestration`. Run unattended workers in Claude Code's [sandbox](https://code.claude.com/docs/en/sandboxing) or a dev container with a network allow-list: it limits what a misled worker can reach or send.

## Install

In a Claude Code session, add the marketplace on its `stable` branch, which moves to each release, then install the bundle:

```text
/plugin marketplace add CedarLoom/cedarloom#stable
/plugin install cedarloom@cedarloom
```

The install dialog asks for a scope: user scope enables the plugins in every project on the machine. Run `/reload-plugins` or start a new session, then type `/cl-workflow:` to see the commands.

The same from a shell:

```sh
claude plugin marketplace add CedarLoom/cedarloom#stable
claude plugin install cedarloom@cedarloom
```

To install one plugin instead of the bundle, name it: `/plugin install cl-workflow@cedarloom`. `cl-orchestration` installs `cl-workflow` with it.

Codex reads the same marketplace. There `cl-orchestration` gives the skill text only: its coordinator starts workers in Claude Code. Codex installs no dependencies, so add each plugin you want, `cl-workflow` before `cl-orchestration`:

```sh
codex plugin marketplace add CedarLoom/cedarloom@stable
codex plugin add cl-workflow@cedarloom
codex plugin add cl-repo@cedarloom
codex plugin add cl-orchestration@cedarloom
```

The hooks of `cl-workflow` do not run in Codex ([The plugins](docs/plugins.md)).

## What each plugin gives

| Plugin | Gives you | Commands you type |
|---|---|---|
| `cedarloom` | The bundle: installs the three plugins below together. | none of its own |
| `cl-workflow` | The `workflow` skill, which the agent starts before the first edit: it picks the task kind (software change, docs pass, research) and the depth (quick, standard, deep), then runs the planning, test, review and verify agents that depth needs. Hooks that keep terminal questions and plan mode off unless you allow them, a role guard that refuses merges, releases and pushes to the default branch outside the coordinator's session, and an optional status band. | `/cl-workflow:plan <task>` settles one task and writes the plan. `/cl-workflow:ask` allows terminal questions for a while. `/cl-workflow:questions` asks you the open question issues in batches and records each answer. `/cl-workflow:workflow` starts the workflow by hand. |
| `cl-repo` | Skills that set up and maintain a repository: agent instructions, the dev container, the coordinator's policy file, a maintenance pass and audits of rule files, docs and code. Each change is a plan item you approve first. | `/cl-repo:setup`, `/cl-repo:maintain`, `/cl-repo:audit`, `/cl-repo:improve`, `/cl-repo:debloat` |
| `cl-orchestration` | A coordinator that works labeled issues of several projects in parallel with worker jobs, has a fresh reviewer check each pull request, merges only where the repository's written policy allows, and resumes from a handoff file after a clear or compaction. | `/cl-orchestration:coordinate` with the project paths |

The role guard is a hook, not a boundary: a command written to get around it can pass, so rulesets on the default branch and a token without those rights stay the binding layer ([The plugins](docs/plugins.md#role-guard)).

## Recommended add-on: Ponytail

[Ponytail](https://github.com/DietrichGebert/ponytail) is a separate plugin, recommended with CedarLoom, that steers the agent to write only what the task needs. CedarLoom works without it and does not install it, and the status band shows its level only when it is installed. In Claude Code, install it from its own marketplace, as two separate prompts:

```text
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

For other agents, follow its own README.

## Typical flow

1. [Install](#install) the `cedarloom` bundle; `cl-workflow` plus `cl-repo` is enough without the coordinator.
2. Once per repository, run `claude` there and then `/cl-repo:setup`. It also writes the coordinator's policy, `docs/agents/orchestration.json`, whose `startLabel` names the label that lets the coordinator start an issue ([policy](plugins/cl-orchestration/skills/coordinate/policy.md)). The coordinator starts nothing until that file is on the default branch.
3. Per task, without the coordinator:
   - Describe the task: the workflow picks the kind and the depth. Start a bigger one with `/cl-workflow:plan <task>`, and run `/cl-workflow:ask` to let the agent ask you questions in the terminal for a while.
   - Keep the repository in shape with `/cl-repo:maintain`, and run `/cl-repo:audit`, `/cl-repo:improve` and `/cl-repo:debloat` on its instructions, docs or code.
4. Per issue, with the coordinator (needs `cl-orchestration`):
   - Label the issues with the `startLabel` (`cl:ready-for-agent` by default).
   - In a terminal (an Orca terminal for Orca workers), run `CEDARLOOM_ROLE=coordinator claude` in the default permission mode, then `/cl-orchestration:coordinate <project paths>`. It starts a worker per issue through [Orca](plugins/cl-orchestration/skills/coordinate/orca.md) and a fresh reviewer per pull request. Releases and tags stay yours.
   - Its questions go to the project's repository as issues when it has issues on, else to a local queue; `/cl-workflow:questions` asks them. Where they go, the labels and why a private repository is recommended: [owner questions](docs/plugins.md#owner-questions).

## Update

Marketplaces other than Anthropic's have auto-update off, so a plugin changes only when you update it and its version changed in a release ([Claude Code docs](https://code.claude.com/docs/en/discover-plugins#keep-plugins-updated)).

```sh
claude plugin marketplace update cedarloom
claude plugin update cl-workflow@cedarloom
```

Repeat the second line for each installed plugin. In a session you can instead open `/plugin`, go to the Marketplaces tab, select `cedarloom` and choose Update marketplace to update them all; the same menu turns auto-update on. A running session keeps the version it loaded: run `/reload-plugins` or start a new session.

## Uninstall

```text
/plugin uninstall cedarloom@cedarloom
/plugin marketplace remove cedarloom
```

Removing the marketplace uninstalls every plugin installed from it. Files the skills wrote into your repositories stay (for example `AGENTS.md`, `docs/agents/orchestration.json` and the `.cedarloom/runs` folder): delete them yourself if you no longer want them.

## More

- [The plugins](docs/plugins.md): the hooks, their settings and their limits
- [Skills](docs/skills.md): what each skill does, who starts it and what it writes
- [Stack](docs/stack.md): the components CedarLoom works with
- [How to report a vulnerability](SECURITY.md)

## License

The code and documentation are under the [ISC license](LICENSE). The CedarLoom name and logos are not: see [their terms](LICENSES/LicenseRef-Brand.txt). [`REUSE.toml`](REUSE.toml) maps every file to its license.
