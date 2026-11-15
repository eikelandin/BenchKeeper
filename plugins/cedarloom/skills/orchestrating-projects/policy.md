# Policy

Take each project's policy from the reader, never from the JSON file: `node <skill folder>/policy.mjs <project path>` prints the effective policy, `docs/agents/orchestration.json` as the remote's default branch has it now with every default filled in. When to run it again: [Rules](SKILL.md#rules).

- Exit 1 means no policy: no pick, merge, issue close, branch deletion or decline in that project, whoever started the run. List the errors it printed for the owner.
- A skill folder copied without the plugin starts no worker ([spec-template.md](spec-template.md)).
- Format: [orchestration.schema.json](orchestration.schema.json); example: [policy.example.json](policy.example.json).
- A path entry names a file or folder from the repository root and covers it and everything below it; there are no globs.
- `xhigh` runs only for the first review of a security or firmware-safety change (the default of `models.sensitive.security`, and the workflow skill's Review phase without a Flow line) and on the owner's request (policy or session).

| Field | Meaning | Without the field |
|---|---|---|
| `startLabel` | issues with this label may start | none: ask the owner for the label, start nothing |
| `trustedAuthors` | logins whose issue, pull request, review and comment text a worker may follow, besides the repository owner (`authorAssociation` OWNER) and organization members and collaborators (MEMBER or COLLABORATOR) with write access; a review bot counts only when listed | owner, and members and collaborators with write access only, no bot |
| `workersPerProject` | workers at once in one project | 1 |
| `hostWorkerLimit` | workers at once on this machine, all projects | 2 |
| `stallMinutes` | time with no commit, PR or message before a worker counts as stalled | 20 |
| `merge.allowed`, `merge.requiredChecks` | the coordinator may merge a reviewed PR when every listed check is green | no merge: leave the PR for the owner |
| `merge.mode` | `strict` or `disjoint`: whether the head that merges must contain the default branch's tip ([review-and-merge.md](review-and-merge.md#merge)); in `disjoint`, a `trial` verdict at Merge step 3 reads [trial-merge.md](trial-merge.md) | `strict` |
| `merge.additivePaths` | paths the PR and the default branch may both have changed in `disjoint` mode | none |
| `merge.ownerOnlyPaths`, `merge.ownerOnlyNames` | the paths and names the reader prints: a PR that touches one is left for the owner. A policy adds paths only: names are built-in | the built-in ones |
| `closeIssue` | the coordinator may close an issue after its PR merged or after a verified no-change finding | no close |
| `deleteMergedBranch` | the owner allows deleting a branch whose PR is merged | no deletion |
| `issuesPerWorker` | pickable issues of the project that one worker takes as its batch | 1 |
| `keepRunning` | the run stays open for this project and picks up issues labeled later | false |
| `permissionPrompts` | `block` or `decline` at a permission dialog in a worker's terminal ([Rules](SKILL.md#rules)) | `block` |
| `review.depth`, `review.sensitiveDepth` | the review level of a routine and of a sensitive change (`low`, `medium`, `high`, `xhigh`) | both `high` |
| `review.sensitivePaths` | paths that make a change sensitive, besides the built-in classes ([review-and-merge.md](review-and-merge.md#sensitive-or-routine)) | none |
| `models.worker` | model and effort of a worker session, printed as a table by tier (`quick`, `standard`, `full`, `research`) | quick `sonnet`, standard and full `opus`, research `fable`, all `high` |
| `models.phases.<phase>` | model and effort of a worker's phase subagent (`plan`, `implement`, `test`, `review`, `research`), printed only for the phases the policy names; `inherit` is the worker's own model | the workflow skill's: plan, implement and review `opus`, test `sonnet`, research `fable`, each at `high` |
| `models.sensitive.<use>` | model and effort for a sensitive change: `plan` and `review`, the worker's Plan and Review phases; `independent`, the coordinator's reviewer; `security`, that reviewer for a change to authentication, permissions, secrets, input validation or firmware safety. Each field the policy leaves out keeps its default; `inherit` as in `models.phases`. An older plugin refuses the key, so a policy that sets it names the first plugin version with it in `minPlugin` | plan, review and independent `fable` at `high`, security `fable` at `xhigh`; an account without `fable` sets each `model` |
| `issues.repository`, `issues.labels` | the tracker (`owner/repo`) that holds the project's issues, and labels an issue must carry besides `startLabel` | the project's own repository, no further label |
| `minPlugin` | the oldest plugin version that may run this policy; on an older plugin the reader exits 1 | any |
