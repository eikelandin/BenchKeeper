# Lens: agent instructions

For CLAUDE.md, AGENTS.md, rule files, skills, agents, commands, prompts and hook configuration.

## Patterns

| Pattern | The text | Action |
| --- | --- | --- |
| contradiction | Two lines that cannot both be followed. Cite both; `git blame` shows the newer one. | rewrite or remove; flag when one of them is a prohibition |
| vague | Names no observable behavior ("write clean code"). Test: would the agent act differently without the line? | rewrite or remove |
| enforceable | A rule a formatter, linter, hook, permission setting or CI check can enforce. | move to the tool; keep at most a pointer |
| restates | Says what the code, the config or a linked doc already says: the scripts of a package file, a folder listing. | remove; cite the source |
| duplicate | The same rule in two files that load together. | remove one; cite the copy that stays |
| dead reference | A path, command, script, skill or agent name that no longer exists. | rewrite or remove |
| history | How the file or rule came to be, dates, "we used to". | remove |
| time-sensitive | "Until March", version numbers and model names that drift. | rewrite or remove |
| wrong freedom | A step list for a task that needs judgment, or loose guidance for a fragile operation that needs the exact command. | rewrite or add |
| misplaced | An always-loaded file carries what only some paths or tasks need. | move to a path-scoped rule, a skill or a linked doc |
| trigger text | A skill or agent description that does not say what it does and when, is in the first person or lists keywords. | rewrite; the rewrite keeps every trigger and boundary sentence ("Use when", "Use only when", "Do not use", "Prefer ... over") |
| hook | A hook command whose path does not exist, a matcher that matches no tool, a "must always" rule with no hook behind it, prose that repeats what a hook enforces. | rewrite, add or remove |

Size is a signal for where to look, not a finding: a CLAUDE.md above 200 lines, a SKILL.md above 500 lines, a description above 1,024 characters. An `@` import does not lower the context cost of the importing file. Only the descriptions of skills the model can start and of agents are listed in every session (`measure` prints them as listed tokens); the description of a skill with `disable-model-invocation: true` costs nothing until the skill runs.

## Not findings

- Context only the author knows: project facts, reasons, constraints of the environment.
- A prohibition that guards against a failure that still occurs.
- The exact command or script of a fragile operation.
- A rule repeated at the point of use in a file that loads alone (a subagent prompt, a skill).
- A deliberate recap at the end of a long file.
- Urgent wording in trigger text.
- A trigger or boundary sentence in a listed description, however long the description is.
