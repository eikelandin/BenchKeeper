---
name: plan
description: "Settles one task with you and writes the plan the workflow builds against: goal, scope, depth and risk, the steps, an acceptance table and the open questions."
disable-model-invocation: true
argument-hint: "<task, or the path of a plan to revise>"
when: "On request, for work whose goal, scope or risk is open; headless as the prompt line /cl-workflow:plan <task>."
writes: "One plan file outside the repository; without terminal questions, the open questions in one issue in the tracker the project names. Nothing in the repository."
---

# Plan

Plans one task and edits nothing in the repository. No task given: ask for it, or without terminal questions stop and say it is missing. A task that is quick by step 1 of the [workflow skill](../workflow/SKILL.md) needs no plan: write its depth line and stop.

1. **Questions.** While terminal questions are allowed, settle in rounds: each question with your recommendation, all open ones per round. While they are off, say once that `/cl-workflow:ask` opens them, then follow the questions line of the workflow skill; the plan lists each question settled by recommendation, so `/cl-workflow:plan <plan path>` revises it with the user later.
2. **Explore** read-only as the [plan agent](../../agents/plan.md) does in its steps 1 to 4: `AGENTS.md`, the task's issue when one is named, the code, every place the change must reach.
3. **Settle** goal, scope (in and out), the depth and risk lines (step 1 of the workflow skill and its [risk.md](../workflow/risk.md)), the acceptance table and the counterexample of step 1 of [deep.md](../workflow/deep.md), and at deep depth the decisions an agent does not take alone.
4. **Write** one plan file outside the repository (the session's scratch directory, else the system's temporary folder): the task in one sentence, the depth and risk lines, then the plan agent's return in its order, and last the line `Plan check: none`.
5. **End** with the plan path, the questions still open, and the check it needs: a session that did not write it, which the workflow runs as its plan check ([software.md](../workflow/software.md#phases)) when a build starts from this plan.
