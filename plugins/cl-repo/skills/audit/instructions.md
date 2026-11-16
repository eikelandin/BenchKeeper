# Lens: agent instructions

## Patterns

| Pattern | The text | Action |
| --- | --- | --- |
| contradiction | Two lines that cannot both be followed. Cite both; `git blame` shows the newer one. | rewrite or remove; flag when one of them is a prohibition |
| vague | Names no observable behavior ("write clean code"): no concrete action, file, command or threshold an agent can act on or check. Test: would the agent act differently without the line? | rewrite or remove |
| enforceable | A rule a formatter, linter, hook, permission setting or CI check can enforce. | move to the tool; keep at most a pointer |
| restates | Says what the code, the config or a linked doc already says, with no instruction: languages, versions, the scripts of a package file, a folder listing. | remove; cite the source |
| duplicate | The same rule in two files that load together. | remove one; cite the copy that stays |
| dead reference | A path, command, script, skill or agent name that no longer exists. | rewrite or remove |
| history | How the file or rule came to be, dates, "we used to". | remove |
| time-sensitive | "Until March", version numbers and model names that drift. | rewrite or remove |
| wrong freedom | A step list for a task that needs judgment, or loose guidance for a fragile operation that needs the exact command. | rewrite or add |
| misplaced | An always-loaded file carries what only some paths or tasks need. | move to a path-scoped rule, a skill or a linked doc |
| trigger text | A skill or agent description that does not say what it does and when, is in the first person or lists keywords. | rewrite; the rewrite keeps every trigger and boundary sentence ("Use when", "Use only when", "Do not use", "Prefer ... over") |
| hook | A hook command whose path does not exist, a matcher that matches no tool, a "must always" rule with no hook behind it, prose that repeats what a hook enforces. | rewrite, add or remove |

Size is a signal for where to look, not a finding: a CLAUDE.md above 200 lines, a SKILL.md above 500 lines, a description above 1,024 characters. An `@` import does not lower the context cost of the importing file. Only the descriptions of skills the model can start and of agents are listed in every session (`measure` prints them as listed tokens); the description of a skill with `disable-model-invocation: true` costs nothing until the skill runs.

## One rule file

When the target is one rule file (CLAUDE.md, AGENTS.md, a rule file), collect its candidates for contradiction, vague, enforceable and restates with this pass first, then go on with the other patterns:

1. Number every line from 1, blank lines included (`nl -ba`).
2. Apply the prompt below to the numbered text, using only that text: the line numbers in findings are those numbers. One line can carry more than one kind.
3. Each item of the answer is a candidate for step 5 of the skill, its kind the pattern; a finding carries its `why` and its `fix` on its Why line.

```text
Below is one instruction file that a coding agent loads at the start of every session, with line numbers. Review it; do not read files or run commands.
Report only these problems:
- contradiction: two lines that cannot both be followed (name both lines).
- vague: a line an agent cannot act on or check, because it names no concrete action, file, command or threshold.
- enforceable: a line a formatter, linter, hook or CI check could enforce instead of the agent.
- restates: a line that only describes what the agent can read from the code or config itself (languages, versions, folders, scripts), with no instruction.
A line that is specific and gives its reason is fine; report nothing for it. Report nothing else.
Answer with one JSON object and nothing else: {"findings": [{"kind": "...", "lines": [n], "why": "one short sentence", "fix": "one short sentence"}]}. An empty list when nothing applies.

FILE
```

The prompt is checked against the fixtures in `test/fixtures/audit/` of this plugin by a unit test with a recorded answer. When the prompt changes, run `bash test/fixtures/audit/live.sh claude` (or `codex`) in this plugin's folder by hand against a real agent, and record its answers with `--record` once every fixture passes. CI never calls an agent.

## Not findings

- A line that is specific and gives its reason, for the four kinds of [One rule file](#one-rule-file).
- Context only the author knows: project facts, reasons, constraints of the environment.
- A prohibition that guards against a failure that still occurs.
- The exact command or script of a fragile operation.
- A rule repeated at the point of use in a file that loads alone (a subagent prompt, a skill).
- A deliberate recap at the end of a long file.
- Urgent wording in trigger text.
- A trigger or boundary sentence in a listed description, however long the description is.
