# Diagnose

A bug whose cause is unknown, at standard or deep depth. A bug with a known cause skips this file: a failing test first where the [test rule](SKILL.md#verify) allows one.

1. **Reproduce.** Before any change, one command that shows the symptom and fails (a test, a script, a request). Note the command and its output for the report. No such command can be built (missing data, an account, hardware): name what blocks it and ask; without terminal questions it goes to the task's issue with what you tried, and the task waits.
2. **Narrow.** Read the code path the command runs. Add temporary debug output only where reading does not settle it.
3. **Name the cause** in one sentence, with file and line, that explains every observation from step 1. A change that hides the symptom without an explained cause is no fix.
4. **Fix** the cause and rerun the command from step 1: it passes.
5. **Regression test** where the test rule calls for one: usually the command from step 1 as a test at the layer that owns the behavior, seen failing on the old code.
6. **Clean up.** Remove every debug line and temporary file: the diff holds the fix and its test.

Deep, or risk class high, also:
- Shrink the reproduction until each remaining input and step is needed for the failure.
- Before the first code change, rank three or more hypotheses, each with a prediction that confirms or rules it out, and test them in that order.
- A performance bug: a baseline with the step 1 command before the fix and a run after it, on the same machine.

Gates at every depth:
- Production access, production data, or temporary instrumentation in a production system needs the user's explicit approval before it starts: in the session only while terminal questions are allowed, else in the task's issue (else the report), and that step waits. A safe-default rule never stands in for this approval.
- The report names the reproduction command, the cause and where the regression test is, or why there is none.
