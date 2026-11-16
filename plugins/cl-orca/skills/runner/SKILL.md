---
name: runner
description: "The orca runner of the orchestrating-projects coordinator: its Detect step and its runner file. Use when that coordinator chooses its runner, or works, resumes or cleans up through the orca runner."
user-invocable: false
writes: "Nothing itself: the coordinator writes what orchestrating-projects lists."
---

# Orca runner

This skill gives the coordinator of `/cl-orchestration:orchestrating-projects` the `orca` runner, as that skill's `runners.md` describes runner plugins. It starts nothing on its own.

## Detect

Read-only: an Orca executable is found, and `<that executable> skills get orchestration` succeeds. Anything else: this runner does not answer.

## Runner file

Once the run takes the `orca` runner, read [orca.md](orca.md) in full. Its table maps each section of the runner interface to its heading there. This skill's folder is the `<runner folder>` that orca.md names.
