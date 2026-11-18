# Deep

Parentheses name the kind of skill that runs a step when installed; one only the user starts is suggested, then wait. None installed: do the step directly.

1. Settle the spec: the decisions an agent does not take on its own (deployment target, data storage, module boundaries, core types and interfaces; without terminal questions they go into the task's issue (else the report), and the task waits while other work goes on), terms and decisions recorded (a domain-modeling skill).
   - Add an acceptance table: per requirement the instrument (test, command, screenshot), the wrong implementation it rejects, and where the result is observed.
   - The design names one plausible counterexample (an input or state that breaks the obvious approach) and how the design handles it.
2. Several sessions of work: one ticket per slice that is useful and testable on its own and fits one pull request, where the project tracks work (a ticket skill, user-started), each with acceptance criteria. A part that only works together with another belongs in that part's ticket. Work too big to see the way yet: suggest `/cl-workflow:plan`, which the user starts.
3. Build ticket by ticket: the existing tests of the touched code first, then a test first at the agreed seams where the [test rule](SKILL.md#verify) calls for one (a TDD skill; an implementation skill when the user starts one). A step only a person can take (an account, a key, a console setting): walk the user through it (a walkthrough skill); secrets stay a risky change.
4. Verify against the acceptance table, review the branch against the spec, the review before pushing from [software.md](software.md), then the pull request. After a session that went sideways, suggest a retro skill the user starts.

The build drifts from the plan (another design or scope), or a result cannot be explained against it: stop, add the cause to the plan, and ask the user whether to discard this task's unpushed branch and restart in a fresh context. Without terminal questions: keep the branch, report the cause and stop.

## Review rounds

The reviewer is a fresh session that does not edit (a subagent; Claude Code: `cl-workflow:review` where available, with the model and effort of the Review phase in [software.md](software.md#phases)). A review or re-review whose context was compacted is void: split its scope into parts that together cover all of it and review each part afresh. The review counts only when every part is done and none is void. A finding whose only fix would add a layer, an option, a guard or a test, each for a case that cannot happen, is dropped before the report; a Blocking finding, a finding on validation where data enters, or a missing test the [test rule](SKILL.md#verify) calls for is never dropped. A defect the change neither made nor exposed is a follow-up listed in the pull request, not a finding, unless it is Blocking.

Findings carry a class:
- **Blocking**: wrong behavior, security, data loss, an acceptance row unmet.
- **Important**: a likely defect, a missing test the [test rule](SKILL.md#verify) calls for, or code the code rules in the repository's instructions (the CedarLoom block or an `AGENTS.md` Code section) reject: a guard for a case that cannot happen, a layer or option for one user that the task does not call for, a parallel copy of existing logic, code under a new test that reaches for time, randomness or I/O directly.
- **Minor**: style, naming. Minor findings are listed in the pull request, not fixed in a round.

A review with a Blocking or Important finding is a round:
- Risky change, first round (trial): before the fix, a fresh verifier on `opus` at `high` that did not write the code or the review (Claude Code: `cl-workflow:verify`) marks each Blocking and Important finding confirmed or disputed with evidence. A disputed finding goes with its evidence to the re-review unfixed.
- One remediation pass checks each finding first, fixes the ones that hold, and answers one it disproves with evidence instead of a change.
- A scoped re-review by a fresh subagent (Claude Code: `cl-workflow:recheck`) reads only the changed lines and the findings, and keeps or drops each disputed one. It runs on the review's model at `high`; after a review on `fable`, on `opus`, unless the fix changes security or safety logic.

1. First round with findings: remediation, then re-review.
2. Second round with findings: remediation, then re-review.
3. After the second round with findings, the phase they come from reruns on a stronger model or a higher effort (`xhigh` only where the spec or the user asks for it), as [software.md](software.md#phases) says for a stuck implement phase. With no step left, the question goes to the user at once.
4. A third round with findings is a question for the user (replan or split the work), never a fourth round.

An independent reviewer on another agent (Codex `codex exec --sandbox read-only`, or Claude Code for a Codex session) is an option; default off.
