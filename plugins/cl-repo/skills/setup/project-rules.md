# CedarLoom block

The block holds every line of [rules/project.md](../../rules/project.md) as it stands, then the line under Where commands run for the project's answer, as one list.

## Where commands run

- `container`: The agent runs inside the dev container (`.devcontainer/`): start it with `devcontainer exec --workspace-folder . <agent>`. Installs, builds, lint, tests and local MCP or browser tools run there too.
- `host-agent`: The agent, Git and file edits run on the host. Installs, builds, lint, tests and local MCP or browser tools run in the dev container: prefix `devcontainer exec --workspace-folder .`, compound commands as `devcontainer exec --workspace-folder . sh -lc '...'`. If the container cannot start, report it and stop that command.
- `sandbox`: The agent runs in a Docker Sandboxes microVM (`sbx`) with its own container engine. Installs, builds and tests run inside it.
- `host`: no line.
