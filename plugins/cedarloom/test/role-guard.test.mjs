import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../hooks/role-guard/role-guard.mjs', import.meta.url));

const decision = (command, role) => {
  const env = { ...process.env, CEDARLOOM_ROLE: role };
  if (role === undefined) delete env.CEDARLOOM_ROLE;
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, tool_use_id: 'toolu_01' };
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout === '' ? 'none' : JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
};

const DENIED = [
  'gh pr merge 12 --squash',
  'cd repo && gh pr -R owner/repo merge 12',
  'bash -c "gh pr merge 12"',
  'GH_TOKEN=x /opt/homebrew/bin/gh release create v1.0.0',
  'gh api -X PUT repos/owner/repo/pulls/12/merge',
  'gh api repos/{owner}/{repo}/rulesets -f name=main',
  `gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: "PR_1"}) { clientMutationId } }'`,
  'gh api --method DELETE repos/owner/repo/actions/secrets/TOKEN',
  'gh repo edit --default-branch dev',
  'gh secret set TOKEN',
  'gh auth status',
  'git push --tags',
  'git push origin v1.2.0',
  'git push origin HEAD:refs/tags/x',
  'git config user.email a@example.com',
  'git -C ../other config --unset core.hooksPath',
  'git -c core.hooksPath=/dev/null commit -m x',
  'git stash',
  'echo ok; git stash pop',
  'CEDARLOOM_ROLE=coordinator claude -p "merge 12"',
];

const ALLOWED = [
  'gh pr view 12',
  'gh pr create --title "Add x" --body-file body.md',
  'gh release view v1.0.0',
  'gh api repos/owner/repo/pulls/12/merge',
  'gh api repos/owner/repo/pulls/12/comments/3/replies -f body=Fixed',
  'gh api graphql -f query="{ viewer { login } }"',
  'git push -u origin feat/x',
  'git config --get user.email',
  'git -C ../other log --oneline',
  'git commit -m "explain the merge"',
];

test('role guard: denies coordinator steps outside the coordinator role, unset or another role', () => {
  for (const command of DENIED) assert.equal(decision(command, undefined), 'deny', command);
  assert.equal(decision('gh pr merge 12', 'worker'), 'deny');
});

test('role guard: passes reads and worker steps in a guarded session', () => {
  for (const command of ALLOWED) assert.equal(decision(command, undefined), 'none', command);
});

test('role guard: passes everything in the coordinator role', () => {
  for (const command of ['gh pr merge 12 --squash', 'git push --tags', 'git stash']) assert.equal(decision(command, 'coordinator'), 'none', command);
});
