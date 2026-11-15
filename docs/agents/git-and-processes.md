# Git and child processes

Read this before changing code that runs git or another program. Each item names what goes wrong. The plugins run programs through `sh` in [policy.mjs](../../plugins/cl-orchestration/skills/orchestrating-projects/policy.mjs), with an argv and a cleaned git environment; reuse it instead of writing a new runner.

## Child processes

- **No shell.** Pass an argv to `spawn` or `execFile`, never a command string: through a shell, a branch name or a path becomes a command.
- **Windows console windows.** Every spawn that opens a console sets `windowsHide: true`.
- **Program lookup.** Spawn a program by its file, never by its bare name: Windows looks for a bare name in the child's working folder, often a project, before PATH. Look it up in the absolute folders of PATH only.
- **Stopping a process tree.** Windows has no POSIX signals: `kill()` ends the program at once and leaves its children running. End the tree with `taskkill /T /F` from System32, and only while the child has not exited, since Windows may give its process ID to another process.
- **A child that ignores SIGTERM** keeps its caller waiting: a timeout kills with `SIGKILL`.
- **Environment.** Pass the child only the variables it needs. Windows names ignore case (`PATH` is `Path` there); elsewhere `path` is another variable. On Windows a child also needs the system, profile and temp folders: without `SystemRoot` it can fail to load system components (https://docs.python.org/3/library/subprocess.html#popen-constructor).

## Git

- **The caller's `GIT_*` variables** point git at another repository (`GIT_DIR` is set when CedarLoom runs inside a hook) or add configuration: drop them, and turn off prompts so git fails instead of waiting (`childEnv` in [policy.mjs](../../plugins/cl-orchestration/skills/orchestrating-projects/policy.mjs)).
- **Configuration of the repository or the user** can run hooks, an fsmonitor, maintenance or any transport, and a server can offer bundles or stall a transfer. `-c` flags win over every configuration file; they also check every object and end a stalled transfer. Hooks defined as `hook.<name>` (git 2.54) run even when `core.hooksPath` points at the null device: turn each off through `GIT_CONFIG_*`.
- **Text from git, a server or another program** shown in a terminal can move the cursor or rewrite a line: escape control and bidirectional characters first.

## Files

- **Case and device names.** macOS and Windows file systems join names that differ only in case, and Windows opens a device for a name such as `con` or `nul`. Name files in one case and behind a prefix.
- **Links and FIFOs.** An open follows a symbolic link and waits on a FIFO. Reads that must do neither open with `O_NOFOLLOW` and `O_NONBLOCK`. Windows has neither flag, and making a link there takes admin rights or developer mode.
- **Flushing a folder** fails on Windows, which cannot open one; NTFS journals the rename instead.

The plugin tests run on Linux and macOS only (`plugin-tests` in [checks.yml](../../.github/workflows/checks.yml)): a Windows-only branch has no CI run.
