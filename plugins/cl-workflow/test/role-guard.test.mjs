import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../hooks/role-guard/role-guard.mjs', import.meta.url));
const ASK = fileURLToPath(new URL('../hooks/ask/ask.mjs', import.meta.url));
// The hook asks git about the folder it runs in; a GIT_DIR of a surrounding git hook must not answer for it.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && key !== 'CEDARLOOM_ROLE'));

// trunk: checked out, the remote's default branch (origin/HEAD), with the tag release-candidate and the branch deps-1.2.3.
// feature: a repository on the branch feat/x whose remote's default branch is trunk.
// fresh: a repository on the branch feat/y whose remote origin, the bare repository develop with the default branch develop, was never fetched.
// fork: a repository on the branch develop that pushes to its remote upstream (develop, never fetched); origin's default branch is trunk.
let trunk;
let feature;
let fresh;
let develop;
let fork;
const repo = (branch) => {
  const dir = mkdtempSync(join(tmpdir(), 'role-guard-'));
  const git = (...args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { env: ENV });
  git('init', '-q', '-b', branch);
  git('commit', '-q', '--allow-empty', '-m', 'x');
  return { dir, git };
};
const withRemoteHead = (r) => {
  r.git('update-ref', 'refs/remotes/origin/trunk', 'HEAD');
  r.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
  return r;
};
before(() => {
  const t = withRemoteHead(repo('trunk'));
  t.git('tag', 'release-candidate');
  t.git('branch', 'deps-1.2.3');
  trunk = t.dir;
  feature = withRemoteHead(repo('feat/x')).dir;
  develop = mkdtempSync(join(tmpdir(), 'role-guard-'));
  execFileSync('git', ['init', '-q', '--bare', '-b', 'develop', develop], { env: ENV });
  const f = repo('feat/y');
  f.git('remote', 'add', 'origin', develop);
  fresh = f.dir;
  const k = withRemoteHead(repo('develop'));
  k.git('remote', 'add', 'upstream', develop);
  k.git('update-ref', 'refs/remotes/upstream/develop', 'HEAD');
  k.git('branch', '-q', '--set-upstream-to=upstream/develop');
  fork = k.dir;
});
after(() => {
  for (const dir of [trunk, feature, fresh, develop, fork]) rmSync(dir, { recursive: true, force: true });
});

const run = (input, role, home, env) =>
  spawnSync(process.execPath, [HOOK], { input, env: { ...ENV, ...(role !== undefined && { CEDARLOOM_ROLE: role }), ...(home && { HOME: home, USERPROFILE: home }), ...env }, encoding: 'utf8' });
const decision = (command, { role, cwd = trunk, tool = 'Bash', agent, home, env, toolInput = { command } } = {}) => {
  const input = { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: toolInput, tool_use_id: 'toolu_01', cwd, ...(agent && { agent_id: agent }) };
  const r = run(JSON.stringify(input), role, home, env);
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
  `gh api graphql -f query='mutation { mergePull'"Request"'(input: {pullRequestId: "PR_1"}) { clientMutationId } }'`,
  `gh api /graphql -f query='mutation { mergePullRequest(input: {pullRequestId: "PR_1"}) { clientMutationId } }'`,
  `gh api https://api.github.com/graphql -f query='mutation { mergePullRequest(input: {pullRequestId: "PR_1"}) { clientMutationId } }'`,
  ...['graphql#x', 'graphql/', 'graphql//', 'GRAPHQL'].map((path) => `gh api '${path}' -f query='mutation { mergePullRequest(input: {pullRequestId: "PR_1"}) { clientMutationId } }'`),
  `gh api graphql -f query='mutation { createCommitOnBranch(input: {branch: {repositoryNameWithOwner: "o/r", branchName: "main"}, message: {headline: "x"}, expectedHeadOid: "1", fileChanges: {additions: [{path: "README.md", contents: "aGk="}]}}) { commit { oid } } }'`,
  "gh api -X PUT 'repos/o/r/pulls/12/%6Derge?x=%zz'",
  'gh api -X PATCH repos/acme/graphql -F archived=true',
  'gh api -X PUT repos/o/r/contents/README.md -f message=x -f content=aGk=',
  'gh api -X PUT repos/o/r/contents/.github/workflows/ci.yml -f message=x -f content=aGk=',
  'gh api --method DELETE repos/o/r/contents/README.md -f message=x -f sha=1',
  'gh api -X POST repos/o/r/merge-upstream -f branch=main',
  'gh api --method DELETE repos/owner/repo/actions/secrets/TOKEN',
  'gh workflow run release.yml',
  'gh api -X POST repos/o/r/actions/workflows/npm.yml/dispatches -f ref=main',
  'gh repo edit --default-branch dev',
  'gh repo sync o/fork --force',
  'gh secret set TOKEN',
  'gh auth status',
  'git push --tags',
  'git push --tag',
  'git push origin --follow-tag',
  'git push origin \\\n  --tags',
  'git push origin v1.2.0',
  'git push origin app-v0.1.0',
  'git push origin setup-v0.1',
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
  'gh api repos/o/r/contents/README.md',
  'gh api repos/o/r/contents/my.graphql',
  'gh api repos/acme/contents/issues/123/comments -f body=done',
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

// Known passes: the guard reads the current branch before the command runs, so a switch to the default branch earlier in the
// same command text is not seen; the ruleset on the default branch refuses these pushes. A fix moves them to the denied forms.
test('role guard: known passes, a push of the current branch after a switch to the default branch in the same command', () => {
  const bash = [
    'git checkout main && git push',
    'git switch main && git merge --ff-only feat/x && git push',
    'git checkout main && git pull && git merge feat/x && git push origin HEAD',
    'git checkout main; git push -u origin HEAD',
    'git branch -M main && git push -u origin HEAD',
    'git checkout -B main && git push',
    `cd ${feature} && git checkout main && git merge feat/x && git push`,
  ];
  for (const command of bash) assert.equal(decision(command, { cwd: feature }), 'none', command);
  assert.equal(decision('git checkout main && git merge feat/x && git push', { tool: 'PowerShell', cwd: feature }), 'none');
});

test('role guard: follows a cd to the folder git runs in', () => {
  for (const command of [`cd ${trunk} && git push`, `cd ${trunk} && git push origin release-candidate`]) assert.equal(decision(command, { cwd: feature }), 'deny', command);
  assert.equal(decision(`cd ${feature} && git push`), 'none');
});

test('role guard: a push names its branch unless its folder is the session folder or one leading cd to an existing folder', () => {
  const unresolved = [
    'cd "$(git rev-parse --show-toplevel)" && git push',
    'cd "$CLAUDE_PROJECT_DIR" && git push',
    'cd nosuchdir; git push',
    `pushd ${feature} && git status && popd && git push`,
    `cd ${feature} && git status && cd - && git push`,
    `(cd ${feature} && git status) && git push`,
    `echo "cd ${feature}; ls" && git push`,
    `false && cd ${feature}; git push`,
    `cd ${feature} & git push`,
    `true | cd ${feature}; git push`,
    `<<EOF\ncd ${feature}\nEOF\ngit push`,
    // The home folder of these runs is the parent of the feature repository.
    `cd '~/${basename(feature)}'; git push`,
    'git -C "$CLAUDE_PROJECT_DIR" push',
    'cd "$CLAUDE_PROJECT_DIR" && git push origin HEAD',
    'cd "$CLAUDE_PROJECT_DIR" && git push origin trunk',
    `cd ${feature} && git status && cd - && git push origin release-candidate`,
  ];
  for (const command of unresolved) assert.equal(decision(command, { home: dirname(feature) }), 'deny', command);
  for (const command of ['Set-Location $PSScriptRoot; git push', `Push-Location ${feature}; git status; Pop-Location; git push`, `{cd ${feature}}; git push`]) assert.equal(decision(command, { tool: 'PowerShell' }), 'deny', command);
  assert.equal(decision(`{ cd ${trunk}; }; git push`, { cwd: feature }), 'deny');
  const named = [
    'cd "$(git rev-parse --show-toplevel)" && git push origin feat/x',
    'cd "$CLAUDE_PROJECT_DIR" && git push -u origin feat/x',
    `pushd ${feature} && git status && popd && git push origin feat/x`,
    `(cd ${feature} && git push origin HEAD:feat/x)`,
  ];
  for (const command of named) assert.equal(decision(command), 'none', command);
  assert.equal(decision(`Push-Location ${feature}; git status; Pop-Location; git push origin feat/x`, { tool: 'PowerShell' }), 'none');
});

test('role guard: denies a push to a remote whose default branch it cannot read: a URL, a path, a remote never fetched', () => {
  for (const command of [`git push ${develop} develop`, 'git push origin develop', 'git push https://example.com/o/r.git feat/y']) assert.equal(decision(command, { cwd: fresh }), 'deny', command);
  for (const command of ['git push --repo=https://example.com/o/r.git', 'git push --rep=https://example.com/o/r.git']) assert.equal(decision(command, { cwd: feature }), 'deny', command);
  assert.equal(decision('git push', { cwd: fork }), 'deny');
  // The session folder is no repository, and git runs in a folder the guard cannot read.
  assert.equal(decision('cd "$CLAUDE_PROJECT_DIR" && git push origin feat/y', { cwd: dirname(fresh) }), 'deny');
  // The session folder is no repository, and git runs in the repository --git-dir names.
  for (const command of [`git --git-dir=${feature}/.git push origin HEAD:trunk`, `git --git-dir ${feature}/.git push origin HEAD:trunk`]) {
    assert.equal(decision(command, { cwd: dirname(fresh) }), 'deny', command);
  }
  // The session folder is no repository yet: the same command creates it before the push.
  const created = ['git clone https://example.com/o/r.git . && git push origin HEAD:develop', 'git init && git fetch https://example.com/o/r.git develop && git push https://example.com/o/r.git FETCH_HEAD:develop'];
  for (const command of created) assert.equal(decision(command, { cwd: dirname(fresh) }), 'deny', command);
  // The session folder reads the default branch trunk, but git pushes from the repository GIT_DIR or --git-dir names.
  const other = [`git --git-dir=${fresh}/.git push origin HEAD:develop`, `GIT_DIR=${fresh}/.git git push origin HEAD:develop`, `env GIT_DIR=${fresh}/.git git push origin HEAD:develop`];
  for (const command of other) assert.equal(decision(command), 'deny', command);
  assert.equal(decision(`$env:GIT_DIR = '${fresh}/.git'; git push origin HEAD:develop`, { tool: 'PowerShell' }), 'deny');
});

test('role guard: a push that names no remote is checked against the remote git pushes to', () => {
  const r = withRemoteHead(repo('feat/z'));
  r.git('remote', 'add', 'fork', develop);
  try {
    r.git('config', 'remote.pushDefault', 'fork');
    assert.equal(decision('git push', { cwd: r.dir }), 'deny');
    r.git('config', '--unset', 'remote.pushDefault');
    r.git('config', 'branch.feat/z.pushRemote', 'fork');
    assert.equal(decision('git push', { cwd: r.dir }), 'deny');
    r.git('config', 'branch.feat/z.pushRemote', 'origin');
    assert.equal(decision('git push', { cwd: r.dir }), 'none');
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
  // With no push settings, git pushes to the sole remote, whatever its name.
  const sole = repo('feat/z');
  sole.git('remote', 'add', 'upstream', develop);
  sole.git('update-ref', 'refs/remotes/upstream/develop', 'HEAD');
  sole.git('symbolic-ref', 'refs/remotes/upstream/HEAD', 'refs/remotes/upstream/develop');
  try {
    assert.equal(decision('git push', { cwd: sole.dir }), 'none');
  } finally {
    rmSync(sole.dir, { recursive: true, force: true });
  }
});

test('role guard: reads the commands of Monitor and PowerShell, PowerShell with its backtick escape', () => {
  for (const tool of ['Monitor', 'PowerShell']) assert.equal(decision('gh pr merge 12 --squash', { tool }), 'deny', tool);
  const powershell = [
    'gh api `\n  --method PUT `\n  /repos/o/r/pulls/12/merge `\n  -f merge_method=squash',
    'git push origin `\n  --tags',
    'C:\\tools\\gh.exe pr merge 12',
    '& "C:\\Program Files\\GitHub CLI\\gh.exe" pr merge 12',
    'Set-Location ' + trunk + '; git push',
    'foreach ($n in 12) {gh pr merge $n}',
    "$env:cedarloom_role='coordinator'; claude -p x",
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

test('role guard: only the session where the user typed /cl-workflow:questions writes into the local question queue', () => {
  const data = mkdtempSync(join(tmpdir(), 'role-guard-'));
  const env = { CLAUDE_PLUGIN_DATA: data, CLAUDE_PID: '4242' };
  const typed = (command_name) => spawnSync(process.execPath, [ASK], { input: JSON.stringify({ hook_event_name: 'UserPromptExpansion', command_name, command_args: '', session_id: 's', cwd: trunk }), env: { ...ENV, ...env }, encoding: 'utf8' }).status;
  const answer = { file_path: '.cedarloom/questions/project-1.md', old_string: 'Status: open', new_string: 'Status: answered' };
  const calls = [
    ['Edit', answer],
    ['Write', { file_path: join(trunk, '.CedarLoom', 'Questions', 'project-2.md'), content: 'Status: open' }],
    ['Bash', { command: "sed -i 's/open/answered/' .cedarloom/questions/project-1.md" }],
  ];
  const decide = (opts) => calls.map(([tool, toolInput]) => decision(undefined, { tool, toolInput, env, ...opts }));
  // Every session, the coordinator's included, until the user types the command; a window /cl-workflow:ask opened does not count.
  for (const role of [undefined, 'worker', 'coordinator']) assert.deepEqual(decide({ role }), ['deny', 'deny', 'deny'], role);
  assert.equal(typed('cl-workflow:ask'), 0);
  assert.deepEqual(decide({}), ['deny', 'deny', 'deny']);
  assert.equal(typed('cl-workflow:questions'), 0);
  assert.deepEqual(decide({}), ['none', 'none', 'none']);
  // The window is the process's, so a subagent of that session stays out.
  assert.deepEqual(decide({ agent: 'agent_01' }), ['deny', 'deny', 'deny']);
  // No session writes the window files, which would open the window for itself.
  const forged = join(data, 'ask', '4242.json');
  for (const opts of [{}, { role: 'coordinator' }]) {
    assert.equal(decision(undefined, { tool: 'Write', toolInput: { file_path: forged, content: '{}' }, env, ...opts }), 'deny');
    assert.equal(decision(`echo '{}' > ~/x/${basename(data)}/ask/4242.json`, { env, ...opts }), 'deny');
  }
  // Edits anywhere else pass, also in a guarded session.
  assert.equal(decision(undefined, { tool: 'Edit', toolInput: { ...answer, file_path: '.cedarloom/runs/handoff.md' }, env }), 'none');
  assert.equal(decision(undefined, { tool: 'Edit', toolInput: { ...answer, file_path: 'docs/questions/a.md' } }), 'none');
});

test('role guard: a command reaches the queue or the window files through a cd, a redirection, a copy, a link, quotes or .. too', () => {
  const data = mkdtempSync(join(tmpdir(), 'role-guard-'));
  const session = mkdtempSync(join(tmpdir(), 'role-guard-'));
  mkdirSync(join(session, '.cedarloom', 'questions'), { recursive: true });
  const env = { CLAUDE_PLUGIN_DATA: data, CLAUDE_PID: '4242' };
  const denied = [
    "cd .cedarloom/questions && sed -i 's/open/answered/' project-1.md",
    'cd .cedarloom/questions; echo "Owner answer (2026-11-15): a." >> project-1.md',
    'cd .cedarloom && echo x > questions/project-1.md',
    'cp answer.md .cedarloom/questions && echo done',
    'mv .cedarloom/questions .cedarloom/q',
    'rm -r .cedarloom/questions; mkdir -p .cedarloom',
    'ln -s .cedarloom/questions q',
    'cat ".cedarloom/questions"/project-1.md',
    'echo x >> .cedarloom/"questions"/project-1.md',
    'echo x >> .cedarloom/./questions/project-1.md',
    'echo x >> .cedarloom/runs/../questions/project-1.md',
    'echo x >> .cedar\\loom/questions/project-1.md',
    'echo x >> .cedarloom/*/project-1.md',
    `cd ${data}/ask && echo x > 4242.json`,
    `cp w.json "${data}/ask"/4242.json`,
    `echo x > ${data}/x/../ask/4242.json`,
  ];
  for (const command of denied) assert.equal(decision(command, { cwd: session, env }), 'deny', command);
  for (const command of denied.slice(0, 2)) assert.equal(decision(command, { cwd: session, env, role: 'coordinator' }), 'deny', command);
  // PowerShell decodes with its own escape, and the backslash separates folders.
  for (const command of ['cd .cedarloom\\questions; Set-Content project-1.md x', 'Add-Content .cedarloom\\runs\\..\\questions\\project-1.md x', 'Set-Location .cedarloom; Add-Content questions\\project-1.md x']) {
    assert.equal(decision(command, { tool: 'PowerShell', cwd: session, env }), 'deny', command);
  }
  // A command with more cds than the guard follows.
  assert.equal(decision(`${Array.from({ length: 64 }, (_, i) => `cd d${i}`).join(' && ')} && ls`, { cwd: session, env }), 'deny');
  // A session whose folder is the queue writes there with any path.
  assert.equal(decision("sed -i 's/open/answered/' project-1.md", { cwd: join(session, '.cedarloom', 'questions'), env }), 'deny');
  assert.equal(decision('/bin/sh /tmp/answer.sh', { cwd: join(session, '.cedarloom', 'questions'), env }), 'deny');
  assert.equal(decision(undefined, { tool: 'Write', toolInput: { file_path: 'project-1.md', content: 'x' }, cwd: join(session, '.cedarloom', 'questions'), env }), 'deny');
  // A session started with the command would hold the flag, in any role.
  const versioned = ['npx -y @anthropic-ai/claude-code@latest -p "/cl-workflow:questions"', 'npx @anthropic-ai/claude-code@2.1.300 -p /questions', 'pnpm dlx @anthropic-ai/claude-code@latest -p /questions'];
  for (const role of [undefined, 'coordinator']) {
    assert.equal(decision('claude -p "/cl-workflow:questions"', { cwd: session, env, role }), 'deny', role);
    assert.equal(decision("echo '/questions' | claude -p", { cwd: session, env, role }), 'deny', role);
    // npx names the package with a version, and a Windows npm install starts claude through a script file.
    for (const command of versioned) assert.equal(decision(command, { cwd: session, env, role }), 'deny', `${role}: ${command}`);
    for (const command of ['claude.cmd -p /questions', 'claude.ps1 -p /questions', 'claude.bat -p /questions']) assert.equal(decision(command, { tool: 'PowerShell', cwd: session, env, role }), 'deny', `${role}: ${command}`);
  }
  // Names that only look alike pass, as do wildcard pairs, cd chains and prose that reach neither folder.
  const alike = [
    'cd docs && echo x > questions.md',
    'grep -rn /cl-workflow:questions plugins',
    'cat .cedarloom/questions-old/a.md',
    'grep -n "/questions" CLAUDE.md',
    'grep -rn "/cl-workflow:questions" plugins/cl-workflow/hooks/claude-code.json',
    'ls */*',
    'du -sh */*',
    'ls plugins/*/*',
    'cat packages/*/*/package.json',
    'rm -rf dist/*/*',
    'for d in */*; do echo $d; done',
    "find . -path '*/*' -name x",
    'npx prettier --check "**/*"',
    'npx eslint "src/**/*"',
    "cat > docs/setup.md <<'EOF'\nRun cd web before npm ci.\nThen cd .. and start again.\nUse cd packages/ui for the UI tests.\nEOF",
    Array.from({ length: 6 }, (_, i) => `cd p${i} && make && cd ..`).join(' && '),
    'cd a && cd b && cd c && cd d && cd e && cd f && cd g && ls',
  ];
  for (const command of alike) assert.equal(decision(command, { cwd: session, env }), 'none', command);
  assert.equal(decision('Get-ChildItem *\\*', { tool: 'PowerShell', cwd: session, env }), 'none');
});

test('role guard: every path field of the edit tools is read, resolved from the session folder', () => {
  const data = mkdtempSync(join(tmpdir(), 'role-guard-'));
  const env = { CLAUDE_PLUGIN_DATA: data, CLAUDE_PID: '4242' };
  const edit = (toolInput, opts) => decision(undefined, { tool: 'Edit', toolInput, env, ...opts });
  // The coordinator's main session skips the role rules, so only the queue rule refuses these.
  assert.equal(decision(undefined, { tool: 'MultiEdit', toolInput: { file_path: '.cedarloom/questions/project-1.md', edits: [] }, env, role: 'coordinator' }), 'deny');
  assert.equal(decision(undefined, { tool: 'NotebookEdit', toolInput: { notebook_path: '.cedarloom/questions/a.ipynb', new_source: 'x' }, env, role: 'coordinator' }), 'deny');
  assert.equal(decision(undefined, { tool: 'NotebookEdit', toolInput: { file_path: 'docs/a.ipynb', notebook_path: '.cedarloom/questions/a.ipynb', new_source: 'x' }, env }), 'deny');
  assert.equal(edit({ old_string: 'a', new_string: 'b' }), 'deny');
  assert.equal(edit({ file_path: 7, old_string: 'a', new_string: 'b' }), 'deny');
  assert.equal(edit({ file_path: './questions/project-1.md', old_string: 'a', new_string: 'b' }, { cwd: join(trunk, '.cedarloom') }), 'deny');
  assert.equal(edit({ file_path: join(data, 'x', '..', 'ask', '4242.json'), old_string: 'a', new_string: 'b' }), 'deny');
  // The window files under a plugin data folder named with a trailing / or a /./.
  for (const named of [`${data}/`, `${data}/./`]) {
    assert.equal(decision(undefined, { tool: 'Write', toolInput: { file_path: join(data, 'ask', '4242.json'), content: '{}' }, env: { ...env, CLAUDE_PLUGIN_DATA: named } }), 'deny', named);
  }
});

test('role guard: input it cannot read exits 2, which blocks the call', () => {
  for (const input of ['', 'not json', 'null']) {
    const r = run(input);
    assert.equal(r.status, 2, input);
    assert.equal(r.stdout, '', input);
  }
});

// root reads a folder without permissions, so the lookup does not throw.
test('role guard: a command it fails to read exits 2, which blocks the call', { skip: process.getuid?.() === 0 && 'runs as root' }, () => {
  // A folder without permissions makes the lookup of a cd target inside it throw.
  const locked = mkdtempSync(join(tmpdir(), 'role-guard-'));
  chmodSync(locked, 0o000);
  try {
    const r = run(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: `cd ${locked}/x && gh pr merge 12` }, cwd: trunk }));
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
  } finally {
    chmodSync(locked, 0o700);
  }
});
