import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../hooks/role-guard/role-guard.mjs', import.meta.url));
// The hook asks git about the folder it runs in; a GIT_DIR of a surrounding git hook must not answer for it.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && key !== 'CEDARLOOM_ROLE'));

// trunk: checked out, the remote's default branch (origin/HEAD), with the tag release-candidate and the branch deps-1.2.3.
// feature: a repository on the branch feat/x.
let trunk;
let feature;
const repo = (branch) => {
  const dir = mkdtempSync(join(tmpdir(), 'role-guard-'));
  const git = (...args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { env: ENV });
  git('init', '-q', '-b', branch);
  git('commit', '-q', '--allow-empty', '-m', 'x');
  return { dir, git };
};
before(() => {
  const t = repo('trunk');
  t.git('tag', 'release-candidate');
  t.git('branch', 'deps-1.2.3');
  t.git('update-ref', 'refs/remotes/origin/trunk', 'HEAD');
  t.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
  trunk = t.dir;
  feature = repo('feat/x').dir;
});
after(() => {
  for (const dir of [trunk, feature]) rmSync(dir, { recursive: true, force: true });
});

const run = (input, role) => spawnSync(process.execPath, [HOOK], { input, env: role === undefined ? ENV : { ...ENV, CEDARLOOM_ROLE: role }, encoding: 'utf8' });
const decision = (command, { role, cwd = trunk, tool = 'Bash', agent, toolInput = { command } } = {}) => {
  const input = { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: toolInput, tool_use_id: 'toolu_01', cwd, ...(agent && { agent_id: agent }) };
  const r = run(JSON.stringify(input), role);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout === '' ? 'none' : JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
};

const DENIED = [
  'gh pr merge 12 --squash',
  'cd repo && gh pr -R owner/repo merge 12',
  'bash -c "gh pr merge 12"',
  'GH_TOKEN=x /opt/homebrew/bin/gh release create v1.0.0',
  '"C:\\Program Files\\GitHub CLI\\gh.exe" pr merge 12',
  'gh api -X PUT repos/owner/repo/pulls/12/merge',
  'gh api \\\n  --method PUT \\\n  -H "Accept: application/vnd.github+json" \\\n  /repos/o/r/pulls/12/merge \\\n  -f merge_method=squash',
  'gh api -iX PUT repos/o/r/pulls/12/merge',
  'gh api -XPUT repos/o/r/pulls/12/merge',
  'gh api -H "Accept: application/vnd.github+json; charset=utf-8" -X PUT repos/o/r/pulls/12/merge',
  'gh api repos/{owner}/{repo}/rulesets -f name=main',
  `gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: "PR_1"}) { clientMutationId } }'`,
  `gh api graphql -f query='mutation { mergeBranch(input: {repositoryId: "R_1", base: "main", head: "x"}) { clientMutationId } }'`,
  'gh api --method DELETE repos/owner/repo/actions/secrets/TOKEN',
  'gh workflow run release.yml',
  'gh api -X POST repos/o/r/actions/workflows/npm.yml/dispatches -f ref=main',
  'gh repo edit --default-branch dev',
  'gh secret set TOKEN',
  'gh auth status',
  'git push --tags',
  'git push --tag',
  'git push origin --follow-tag',
  'git push origin \\\n  --tags',
  'git push origin v1.2.0',
  'git push origin app-v6.27.0',
  'git push origin setup-v6.27',
  'git push origin v1.2.0-rc.1',
  'git push origin release-candidate',
  'git push origin HEAD:refs/tags/x',
  'git push origin tags/release-candidate',
  'git push origin HEAD:heads/main',
  'git push origin HEAD:main',
  'git push origin feat/x:refs/heads/master',
  'git push origin HEAD:trunk',
  'git push',
  'git push --all origin',
  'git config user.email a@example.com',
  'git -C ../other config --unset core.hooksPath',
  'git -c core.hooksPath=/dev/null commit -m x',
  'git stash',
  'echo ok; git stash pop',
  'CEDARLOOM_ROLE=coordinator claude -p "merge 12"',
  'env CEDARLOOM"_"ROLE=coordinator claude -p "merge 12"',
  'claude --bare -p "merge pull request 12 with the squash method"',
];

const ALLOWED = [
  'gh pr view 12',
  'gh pr create --title "Add x" --body-file body.md',
  'gh release view v1.0.0',
  'gh workflow view release.yml',
  'gh api repos/owner/repo/pulls/12/merge',
  'gh api -H "Accept: application/vnd.github+json; charset=utf-8" repos/o/r/pulls/12/merge',
  'gh api repos/owner/repo/pulls/12/comments/3/replies -f body=Fixed',
  'gh api graphql -f query="{ viewer { login } }"',
  'git push -u origin feat/x',
  'git push origin deps-1.2.3',
  'git push origin HEAD:dependabot/npm_and_yarn/vite-7.1.2',
  'git config --get user.email',
  'git -C ../other log --oneline',
  'git commit -m "explain the merge"',
  'claude -p "review 12" 2>&1 | tee out.txt',
];

test('role guard: denies coordinator steps outside the coordinator role, unset or another role', () => {
  for (const command of DENIED) assert.equal(decision(command), 'deny', command);
  assert.equal(decision('gh pr merge 12', { role: 'worker' }), 'deny');
});

test('role guard: passes reads and worker steps in a guarded session', () => {
  for (const command of ALLOWED) assert.equal(decision(command), 'none', command);
  assert.equal(decision('git push', { cwd: feature }), 'none');
});

test('role guard: follows a cd to the folder git runs in', () => {
  for (const command of [`cd ${trunk} && git push`, `cd ${trunk} && git push origin release-candidate`]) assert.equal(decision(command, { cwd: feature }), 'deny', command);
  assert.equal(decision(`cd ${feature} && git push`), 'none');
});

test('role guard: reads the commands of Monitor and PowerShell, PowerShell with its backtick escape', () => {
  for (const tool of ['Monitor', 'PowerShell']) assert.equal(decision('gh pr merge 12 --squash', { tool }), 'deny', tool);
  const powershell = [
    'gh api `\n  --method PUT `\n  /repos/o/r/pulls/12/merge `\n  -f merge_method=squash',
    'git push origin `\n  --tags',
    'C:\\tools\\gh.exe pr merge 12',
    '& "C:\\Program Files\\GitHub CLI\\gh.exe" pr merge 12',
    'Set-Location ' + trunk + '; git push',
  ];
  for (const command of powershell) assert.equal(decision(command, { tool: 'PowerShell', cwd: feature }), 'deny', command);
  assert.equal(decision('gh pr view 12 `\n  --json title', { tool: 'PowerShell' }), 'none');
});

test('role guard: passes a Monitor call on a WebSocket', () => {
  assert.equal(decision(undefined, { tool: 'Monitor', toolInput: { ws: { url: 'wss://events.example.com/stream' }, description: 'events', timeout_ms: 60000 } }), 'none');
});

test('role guard: passes everything in the coordinator role, but not in its subagents', () => {
  for (const command of ['gh pr merge 12 --squash', 'git push --tags', 'git stash']) assert.equal(decision(command, { role: 'coordinator' }), 'none', command);
  assert.equal(decision('gh pr merge 12 --squash', { role: 'coordinator', agent: 'agent_01' }), 'deny');
});

test('role guard: input it cannot read fails with a non-zero exit, which onFailure "block" turns into a refusal', () => {
  const r = run('not json');
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, '');
});
