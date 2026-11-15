# Git and child processes

Read this before changing plugin code that runs git or another program. Each item names what goes wrong and, where the plugins have it, the code that already avoids it; reuse that code instead of writing a new runner.

## Child processes

- **No shell.** Pass an argv to `spawn` or `execFile`, never a command string: through a shell, a branch name or a path becomes a command (`sh` in `plugins/cl-orchestration/skills/orchestrating-projects/policy.mjs`).
- **Program lookup.** Spawn a program by its file, never by its bare name: Windows looks for a bare name in the child's working folder, often a project, before PATH. `gitProgram` in `plugins/*/hooks/git-program.mjs` finds git in the absolute folders of PATH only.
- **A child that hangs** keeps the hook or script waiting: give each call a `timeout` (`run` in `plugins/cl-orchestration/hooks/rotation/restore.mjs`).
- **Environment.** Pass the child only the variables it needs. Windows names ignore case (`PATH` is `Path` there); elsewhere `path` is another variable. On Windows a child also needs the system, profile and temp folders: without `SystemRoot` it can fail to load system components (https://docs.python.org/3/library/subprocess.html#popen-constructor).

## Git

- **The caller's `GIT_*` variables** point git at another repository (`GIT_DIR` is set when a plugin script runs inside a git hook) or add configuration: drop them, and turn off prompts so git fails instead of waiting. `childEnv` in `plugins/cl-orchestration/skills/orchestrating-projects/policy.mjs` drops the repository variables, and inside a hook the `GIT_CONFIG_*` ones.
- **Configuration of the repository or the user** can run hooks, an fsmonitor, maintenance or any transport. `-c` flags win over every configuration file (`-c core.fsmonitor=false` in `plugins/cl-orchestration/hooks/rotation/restore.mjs`). Hooks defined as `hook.<name>` (git 2.54) run even when `core.hooksPath` points at the null device.
- **Text from git, a server or another program** shown in a terminal can move the cursor or rewrite a line: escape control and bidirectional characters first (`escaped` in `plugins/cl-orchestration/skills/orchestrating-projects/policy.mjs`).

## Files

- **Case and device names.** macOS and Windows file systems join names that differ only in case, and Windows opens a device for a name such as `con` or `nul`.
- **Links and FIFOs.** An open follows a symbolic link and waits on a FIFO. Reads that must do neither open with `O_NOFOLLOW` and `O_NONBLOCK` (`plugins/cl-orchestration/skills/orchestrating-projects/facts.mjs`). Windows has neither flag, and making a link there takes admin rights or developer mode.

The plugin tests run on Linux and macOS (`plugin-tests` in `.github/workflows/checks.yml`); no CI job runs them on Windows.
