---
name: workflow
description: "Picks the workflow and depth for a task: a software change, a docs pass, research, or a batch of tasks on one branch, each at quick, standard or deep depth, with the checks and reviews each needs. Use before the first edit in a repository, before issue or pull request work, and before research with two or more items."
writes: "The depth line `Depth: <depth> (<reason>)` and the risk line `Risk: <class> (<reason>)` before the first edit; through its playbooks commits and a pull request in the project's convention."
---

# Workflow

Every depth:
- Before the first edit, state the assumptions you work from and the check that proves each step done (a test, a command, a screenshot); loop until those checks pass, and stop and report on the stuck signals of step 6 of [the implement agent](../../agents/implement.md).
- Keep validation at trust boundaries, error handling that prevents data loss, and security checks.
- A step here or in the playbooks that asks or waits on the user does so in the session only while the user allows terminal questions. Otherwise its questions go with your recommendations into one issue per task in the issue tracker the project names, else the report; take each recommendation that is safe and reversible (an item without one waits), and go on.
- An installed skill may run a step of this skill or its playbooks in more detail (diagnosis, a test first, prototypes, interface design): these texts set its floor and gates and win where the two differ. Reviews, research notes and pull request text follow these playbooks.

1. **Classify.** Kind: software change, docs pass (several documents or product copy checked against the code; a one-file rewrite with no claim about code is a quick software change), research, or a mix (one item per kind). Each item gets one depth, whatever its kind:

   | Depth | When |
   |---|---|
   | quick | the diff fits in one sentence; a question the code answers |
   | standard | one behavior, or a refactor that keeps behavior, approach clear; at least standard: a bug, a dependency major or security advisory, a review-thread follow-up, a log line that logs user data |
   | deep | several behaviors, a new capability, an uncertain approach, or a risky change; always deep: a schema migration, infrastructure as code, a performance change, a refactor across modules or with a changed interface |

   - Risky: authentication, permissions, secrets, input validation, production data, deploy or production configuration, an irreversible action.
   - Which depth, first match: the user's depth for the task; the `Depth:` line of a coordinator's spec; your pick from the table above. A `Depth minimum:` line in `AGENTS.md` raises your pick to that depth, and a risky change raises it to deep.
   - A software change also gets its risk class and the `Risk:` line ([risk.md](risk.md)). The class raises your pick too: high to deep, medium to standard.
   - Several requests in one prompt: a depth for each.
   - Before the first edit or command, write the depth line `Depth: <depth> (<reason>)`: the change type's name from the [change-type table](#change-types), `research` or `docs pass`, or a few words when none fits, and `risky` when it is (`Depth: deep (new auth flow; risky)`).
   - Unsure between two depths: take the deeper one.
   - The work grows past its depth: say so, write a new depth line, and run the skipped steps before the next edit.

2. **Settle.** Standard and deep: when goal, scope or result is open, grill the user in rounds (each question with your recommendation, all open ones per round) until goal, scope, acceptance criteria and risks are settled; a settled request skips the grill. Then explore read-only, as the plan phase where [software.md](software.md#phases) runs phases (Claude Code: in plan mode, only while terminal questions are allowed). Without terminal questions: go on with the plan.

   A plan or spec for this task with an acceptance table (from `/cl-workflow:plan`, a coordinator or the user) settles it: skip this step and the Plan phase and build against that plan. It never lowers the depth or the risk class, and the plan check still runs unless the plan records one.
3. **Run the playbook.**
   - Software change at quick depth: this file is the whole playbook (the steps below, [Change types](#change-types), [Verify](#verify)).
   - Standard and deep, and any risky change: also [software.md](software.md), deep also [deep.md](deep.md).
   - Docs pass: [docs.md](docs.md). Research: [research.md](research.md).
   - Branches, commits and pull requests follow the project's own convention (`AGENTS.md`, a contributing guide, the history). Where it names none, commit subjects and pull request titles follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/): a squash merge makes the title the commit subject.
   - A pull request body opens with one or two sentences on what changes and why, then holds the key decisions (structure, storage, deployment, rejected options) and the sections Testing (commands and results), Risk (as [risk.md](risk.md) says, then what could break, who is affected) and How to revert.
   - Two or more independent items that each need more than a few files or searches: one subagent per item in parallel, then one merged report. Smaller items run in this session.

   The playbooks hold the detail; these are the steps, in order:

   | Depth | Software change | Review before pushing | Research |
   |---|---|---|---|
   | quick | edit, fast checks after each edit; verify; commit | none | read the code |
   | standard | settle; plan check; existing tests of the touched code; implement, a new test only where the [test rule](#verify) calls for one, written first; verify, review before pushing | one correctness pass (`/code-review high`) | one pass, checked |
   | deep | settle, spec with acceptance table; plan check; existing tests; ticket by ticket, a new test first only where the [test rule](#verify) calls for one; verify and run it; review in rounds ([deep.md](deep.md)) | review rounds (`/code-review xhigh`) | one subagent per item, checked |

4. **Batch** when the user asks for it or names several tasks for one branch: the tasks run one after another, each at quick depth with no per-task review. Give each task its depth first (step 1): a task that is risky or above quick is not batched and runs at its own depth. Step 5 and the reviews then run once for the whole branch.
5. **Long checks last.**
   - Fast checks (types, lint, the tests of the touched code) after each edit.
   - The full suite, end-to-end and browser tests and builds run once, after the last edit, in a subagent that returns only failures and key lines.
   - Reviews start then and follow the playbook of the depth, including its remediation and re-review rounds.
   - A long check writes to a log file and is read by its failures and last lines.
   - Read-only lookups and mechanical reading (file searches, log and CI output, inventories, pull request status) run in a subagent on `sonnet` at `medium` that edits no file (Claude Code: `cl-workflow:gather`), on `haiku` only for a bounded lookup whose whole input stays under 100,000 tokens.
   - Fixes follow the project's commit convention, and failed checks rerun.
   - Waiting for pull request checks: watch them in the background (GitHub: `gh pr checks --watch --interval 30`; a host without a watch command: one until-loop Monitor, 30 seconds or slower), never a leading `sleep`.
6. **Report done** with each check's command and result, a "steps skipped" line naming the checklist steps not run (or "none") and what was not checked. After a merge or when the next task is unrelated, suggest a new session (`/clear` in Claude Code).

## Sessions on `fable`

A session that itself runs on `fable` follows these defaults, which the user or the spec can change:
- works one ticket and ends with that ticket's handoff (a coordinator's worker: the handoff block of its spec);
- hands off at a task boundary once its context holds 100,000 to 150,000 tokens;
- goes on only in a new session started from that handoff, never by resuming this one;
- waits on no other session, and starts one subagent at a time, waiting only on the one that runs its own current step.

## Change types

The check before done, per change type; the change type names the depth line. Never run a check that changes shared or production systems (`terraform apply`, `kubectl apply`, `helm upgrade`, migrations against shared databases).

| Change | Check before done |
|---|---|
| Docs, typo | docs build |
| Config value | tests, schema or lint |
| Tests only, log line | |
| Dependency patch or minor | full suite, package audit |
| UI tweak | browser check, screenshot baselines updated only for intended changes |
| UI behavior in an existing flow | end-to-end and accessibility tests |
| Bug | known cause: a failing test first, where the [test rule](#verify) allows one. Unknown: diagnose the cause first ([diagnose.md](diagnose.md)) |
| Refactor | suite unchanged and passing |
| Dependency major or security advisory | changelog read, full suite, package audit |
| CI workflow | `actionlint` |
| Feature, performance | performance: benchmark before and after on the same machine |
| Infrastructure as code | `fmt -check`, `validate`, `plan`; `ansible-lint --check --diff`; `kubeconform`, `kubectl diff`; `helm lint`, `helm template` |
| Schema migration | expand and contract, migrate a throwaway database |
| Production data fix | dry run on a copy, the user runs it |
| Auth, permissions, secrets, input validation | tests for denied paths |
| Review-thread follow-up on an open pull request | the fix verified, each thread answered |
| CI fix | the failing check rerun |
| Merge conflict | resolved the way the repository's conventions say, checks rerun |
| Live-system change or incident | backup first, verify live, record in the repository docs |

A follow-up commit on an open pull request keeps its depth and needs no workflow reload or new depth line.

## Verify

- Run the project's own build, types, lint and tests where `AGENTS.md` says, and run what you changed (Claude Code: `/verify`). UI changes also get a browser check next to the UI tests (the `webapp-testing` skill where installed).
- A failing test: diagnose first (code, test or environment) and fix the cause. Edit a test only when it is wrong or the requirement changed, and say so in the pull request.
- Test rule: no tests by default. Add one only when it meets all three:
  - it fails if the change is reverted;
  - it hardcodes its expected values (never computed by production code, locale files or mocks);
  - it runs at the single layer that owns the behavior.
- A new test is written before the code it covers and seen failing for the reason the change addresses; a test that passes at once proves nothing.
- One slice at a time: one test, the code that makes it pass, then the next. The slices are the rows of the plan's acceptance table, where there is one.
- Leave untested: copy or translations, CSS classes, constants, third-party libraries, private state, timing and call counts. A test like that is deleted when touched, not updated. Coverage is no target.
- The project's own test rules in `AGENTS.md` win.
- Browser and build output (`test-results/`, screenshots) is git-ignored or deleted.

After a compaction, read this skill and the playbook of the current depth again before the next step.
