import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { exportScript, fill, genericDir } from '../src/automations.mjs';
import { context } from '../src/runner.mjs';
import { automationTemplate, initRepo } from './helpers.mjs';

const template = () => automationTemplate('daily-digest');

// The precheck in the template folder with a fake gh on PATH that logs its arguments and prints the number of changed
// items its list reports (pr and issue answers by repository). It runs in cwd, by default a folder that is no repository
// and so has no origin, like an installed precheck in the project folder.
function precheck(values, answers = {}, digestAge = null, cwd = null) {
  const bin = mkdtempSync(join(tmpdir(), 'bk-dd-bin-'));
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\necho "$@" >> '${bin}/log'\ncase "$*" in\n${Object.entries(answers).map(([k, n]) => `  *"${k}"*) echo ${n} ;;\n`).join('')}  *) echo 0 ;;\nesac\n`, { mode: 0o755 });
  const file = join(bin, 'digest.md');
  if (digestAge != null) {
    writeFileSync(file, 'old digest\n');
    const t = Date.now() / 1000 - digestAge;
    utimesSync(file, t, t);
  }
  // An installed precheck names its helper by absolute path and runs in the project folder.
  const command = fill(template(), { file, ...values }).precheck.replace('daily-digest/precheck.sh', `"${join(genericDir, 'daily-digest/precheck.sh')}"`);
  const r = spawnSync('sh', ['-c', command], { cwd: cwd ?? bin, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  let log = '';
  try { log = readFileSync(join(bin, 'log'), 'utf8'); } catch {}
  return { code: r.status, log: log.trim().split('\n').filter(Boolean) };
}

test('daily-digest: the precheck writes nothing to GitHub', () => {
  const helper = readFileSync(join(genericDir, 'daily-digest/precheck.sh'), 'utf8');
  assert.doesNotMatch(helper, /\bgh (pr|issue) (create|comment|edit|close|reopen|merge|review|lock|delete)\b|\bgh api\b|\bgit\b[^\n]*\bpush\b|\bgh (label|release|repo|secret|variable|workflow) /);
  assert.doesNotMatch(helper, /--method|-X /);
});

test('daily-digest precheck: a committed, unchanged digest starts at its commit author time, not its mtime', { skip: process.platform === 'win32' && 'sh precheck' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'bk-dd-repo-'));
  const git = initRepo(dir);
  const file = join(dir, 'digest.md');
  writeFileSync(file, 'digest\n');
  git('add', 'digest.md');
  git('commit', '-qm', 'digest', '--date=2020-01-02T03:04:05Z');
  const r = precheck({ file });
  assert.equal(r.code, 1);
  assert.match(r.log[0], / --search updated:>=2020-01-02T03:04:05Z /);
});

test('daily-digest precheck: runs without a digest, then only when a pull request or an issue changed since it', { skip: process.platform === 'win32' && 'sh precheck' }, () => {
  assert.deepEqual(precheck({}), { code: 0, log: [] }, 'no digest yet: no gh call');
  const quiet = precheck({ repos: 'o/a,o/b' }, {}, 3600);
  assert.equal(quiet.code, 1);
  assert.equal(quiet.log.length, 4, 'pr and issue per repository');
  assert.match(quiet.log[0], /^pr list --repo o\/a --state all --search updated:>=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ --json number --jq length$/);
  const own = precheck({ issue: '12' }, {}, 3600);
  assert.match(own.log[1], /^issue list --state all --search \S+ --json number --jq map\(select\(\.number \| tostring != "12"\)\) \| length$/, 'the digest issue does not start the next run');
  assert.match(precheck({ repos: 'o/b', issue: '12' }, {}, 3600).log[1], /^issue list --repo o\/b .* --jq length$/, 'issue 12 of another repository still counts');
  assert.match(quiet.log[3], /^issue list --repo o\/b /);
  assert.equal(precheck({ repos: 'o/a,o/b' }, { 'issue list --repo o/b': 2 }, 3600).code, 0);
  const here = precheck({}, { 'pr list --state': 1 }, 3600);
  assert.deepEqual([here.code, here.log.length], [0, 1], 'empty repos, no origin: the default repository of gh, no --repo');
  const fork = mkdtempSync(join(tmpdir(), 'bk-dd-fork-'));
  initRepo(fork)('remote', 'add', 'origin', 'git@github.com:Owner/Fork.git');
  const forked = precheck({ issue: '12' }, {}, 3600, fork).log;
  assert.match(forked[0], /^pr list --repo owner\/fork --state all --search /, 'empty repos: the origin repository, not the default one of gh');
  assert.match(forked[1], /^issue list --repo owner\/fork .* --jq map\(select\(\.number \| tostring != "12"\)\) \| length$/, 'the digest issue is still left out');
  for (const origin of ['ssh://git@ssh.github.com:443/Owner/Fork.git', 'git@GitHub.com:Owner/Fork.git']) {
    const dir = mkdtempSync(join(tmpdir(), 'bk-dd-origin-'));
    initRepo(dir)('remote', 'add', 'origin', origin);
    assert.match(precheck({}, {}, 3600, dir).log[0] ?? '', /^pr list --repo owner\/fork --state all /, origin);
  }
  const alias = mkdtempSync(join(tmpdir(), 'bk-dd-alias-'));
  initRepo(alias)('remote', 'add', 'origin', 'git@github-work:o/r.git');
  const aliased = precheck({ repos: 'o/r,x/y', issue: '12' }, {}, 3600, alias).log.map((l) => l.replace(/ --state .* --jq /, ' '));
  const noTwelve = 'map(select(.number | tostring != "12")) | length';
  assert.deepEqual(aliased, [`pr list --repo o/r ${noTwelve}`, `issue list --repo o/r ${noTwelve}`, `pr list --repo x/y ${noTwelve}`, `issue list --repo x/y ${noTwelve}`], 'an origin that names no GitHub repository: the digest issue is left out of every listed repository');
  const gitlab = mkdtempSync(join(tmpdir(), 'bk-dd-gitlab-'));
  initRepo(gitlab)('remote', 'add', 'origin', 'git@gitlab.com:team/proj.git');
  assert.match(precheck({}, {}, 3600, gitlab).log[0], /^pr list --state all /, 'empty repos, an origin off github.com: gh\'s default, never its owner/name as a GitHub repository');
  assert.equal(precheck({}, { 'pr list': 'error' }, 3600).code, 1, 'a failing gh skips the run');
});

test('daily-digest precheck: with YYYY-MM-DD in file, the last digest is the file with the latest date in its name', { skip: process.platform === 'win32' && 'sh precheck' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'bk-dd-days-'));
  const file = join(dir, 'digests/YYYY-MM-DD.md');
  assert.deepEqual(precheck({ file }), { code: 0, log: [] }, 'no folder: no digest yet');
  mkdirSync(join(dir, 'digests'));
  writeFileSync(join(dir, 'digests/README.md'), 'not a digest\n');
  assert.deepEqual(precheck({ file }), { code: 0, log: [] }, 'no dated file: no digest yet');
  const day = (name, time) => {
    writeFileSync(join(dir, 'digests', name), 'digest\n');
    utimesSync(join(dir, 'digests', name), new Date(time), new Date(time));
  };
  day('2026-11-10.md', '2026-11-10T08:00:00Z');
  const r = precheck({ file });
  assert.equal(r.code, 1);
  assert.match(r.log[0], / --search updated:>=2026-11-10T08:00:00Z /, 'no file for today: the last day with one sets the start');
  day('2026-11-09.md', '2026-11-11T09:00:00Z');
  assert.match(precheck({ file }).log[0], / --search updated:>=2026-11-10T08:00:00Z /, 'the latest date in the name, not the latest change');
});

// The filled hook of the template, run as Claude Code runs a shell-form hook, on one Bash call in a project whose origin
// is Owner/Repo; the decision it prints, or null for none. The hook process starts in the project folder and the input's
// cwd names the call's folder: with nested, a checkout inside the project with that origin. input: the raw JSON in place
// of the one built from command. head: the branch origin/HEAD points to, at the project's first commit. setup: runs with
// the project's git and folder before the call.
function guard(command, values = {}, { nested, input, head, setup } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bk-dd-guard-'));
  const git = initRepo(dir);
  git('remote', 'add', 'origin', 'git@github.com:Owner/Repo.git');
  if (head) {
    git('update-ref', `refs/remotes/origin/${head}`, 'HEAD');
    git('symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${head}`);
  }
  setup?.(git, dir);
  const cwd = nested ? join(dir, 'vendor/pub') : dir;
  if (nested) { mkdirSync(cwd, { recursive: true }); initRepo(cwd)('remote', 'add', 'origin', `git@github.com:${nested}.git`); }
  const hook = fill(template(), { mode: 'act', commit: 'true', issue: '7', ...values }).hook.replace('daily-digest/guard.sh', `"${join(genericDir, 'daily-digest/guard.sh')}"`);
  input ??= JSON.stringify({ hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command, description: 'git add -- digests/2026-11-12.md' } });
  const r = spawnSync('sh', ['-c', hook], { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, input, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout === '' ? null : JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
}

test('daily-digest hook: allows only the exact dated write commands of step 5, denies every other form', { skip: process.platform === 'win32' && 'sh hook' }, () => {
  const add = 'git add -- digests/2026-11-12.md', commit = 'git commit -m "docs: daily digest" -- digests/2026-11-12.md';
  const comment = 'gh issue comment 7 --repo Owner/Repo --body-file digests/2026-11-12.md';
  for (const c of [add, commit, comment, 'gh issue comment 7 --repo owner/repo --body-file digests/2024-02-29.md']) assert.equal(guard(c), 'allow', c);
  for (const c of [
    'git add -- digests/2026-11-12.md README.md', // a second path
    'git add -- digests/2026-11-12.md\tREADME.md', // a tab
    'git add -- digests/2026-11-12.md${IFS}README.md',
    'git commit -m "docs: daily digest" -- digests/../2026-11-12.md',
    'git commit -m "docs: daily digest" -- digests/sub/2026-11-12.md',
    `${comment} --repo other/repo --body-file README.md`, // a second --repo
    'gh issue comment 7 --repo other/repo --body-file digests/2026-11-12.md',
    'gh issue comment 8 --repo Owner/Repo --body-file digests/2026-11-12.md',
    'git add -- digests/notes.md', 'git add -- digests/2026-02-30.md', 'git add -- digests/2025-02-29.md', 'git add -- digests/2026-13-01.md',
    `${add} && git add -- README.md`, 'git commit -am "docs: daily digest"', 'git "add" -- README.md', 'GIT add -- README.md',
  ]) assert.equal(guard(c), 'deny', c);
  assert.equal(guard(add, { mode: 'report' }), 'deny', 'report mode writes nothing');
  assert.equal(guard(commit, { commit: 'false' }), 'deny');
  assert.equal(guard(comment, { issue: '' }), 'deny');
  assert.equal(guard('gh issue comment 7 --repo someorg/public --body-file digests/2026-11-12.md', {}, { nested: 'someorg/public' }), 'deny', 'the origin of the project, not of the current folder');
  assert.equal(guard(null, {}, { input: JSON.stringify({ tool_input: { command: 'curl x', x: { command: add } } }) }), 'deny', 'a second command key');
  for (const c of ['gh pr list --state all --json number', 'git log -1 --format=%s -- digests/2026-11-12.md', 'date +%F', 'gh pr view 3 --json comments,commits', 'gh issue list --repo org/add-ons --state open']) assert.equal(guard(c), null, c);
});

test('daily-digest hook: denies every git or gh call that is neither an exact form of step 5 nor a read-only command', { skip: process.platform === 'win32' && 'sh hook' }, () => {
  for (const c of [
    'git -C . add -A',
    'git -c core.x=y commit -am hi',
    'gh -R acme/proj issue comment 7 --body-file x.md',
    'git push origin HEAD:main',
    'gh api repos/Owner/Repo/issues/7/comments -f body=x',
    'gh pr merge 3',
    'gh pr review 3 --approve',
    '/usr/bin/git push origin HEAD:main',
    'env git push origin HEAD:main',
    'git status && git push origin HEAD:main',
    'git log; gh pr merge 3',
    'git log -1 --output=AGENTS.md',
    "git log -1 '--output=AGENTS.md'",
    "git log -1 --out''put=AGENTS.md", // the shell joins the pieces of a word
    `git log "'" ; touch x ; "'"`, // a single quote inside double quotes opens nothing
    `git log "'" "$(touch x)" "'"`,
    'git fetch --upload-pack=touch origin main',
    'git fetch',
    'gh pr list --search "$(gh pr merge 3)"',
  ]) assert.equal(guard(c), 'deny', c);
  for (const c of [
    'git fetch origin main', 'git rev-list --left-right --count origin/main...HEAD', 'git remote get-url origin', 'git status --porcelain -- digests/2026-11-12.md', "git log -1 --format='%h %s; done'",
    'gh repo view Owner/Repo --json visibility,defaultBranchRef', 'gh pr list --repo Owner/Repo --state merged --search "merged:>=2026-11-11"',
  ]) assert.equal(guard(c), null, c);
  for (const c of ['git log -1 *', 'g\\it push origin HEAD:release', "gi''t push origin HEAD:release", '"g"it add -- README.md']) assert.equal(guard(c), 'deny', c);
});

test('daily-digest hook: allows the push only of the one digest commit on the default branch', { skip: process.platform === 'win32' && 'sh hook' }, () => {
  const push = 'git push origin HEAD:main';
  const commit = (git, dir, name, subject) => {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), `${name}\n`);
    git('add', '-A');
    git('commit', '-qm', subject);
  };
  const digest = (git, dir) => commit(git, dir, 'digests/2026-11-12.md', 'docs: daily digest');
  const work = (git, dir) => { for (const n of [1, 2, 3]) commit(git, dir, `f${n}.txt`, `wip ${n}`); };
  assert.equal(guard(push, {}, { head: 'main', setup: digest }), 'allow', 'the push of step 5 to the default branch');
  for (const [why, setup] of [
    ['nothing ahead', () => {}],
    ['work commits ahead', work],
    ['work commits and the digest commit ahead', (git, dir) => { work(git, dir); digest(git, dir); }],
    ['the digest commit with another file', (git, dir) => { writeFileSync(join(dir, 'other.md'), 'x\n'); digest(git, dir); }],
    ['the digest file under another subject', (git, dir) => commit(git, dir, 'digests/2026-11-12.md', 'wip')],
    ['another file under the digest subject', (git, dir) => commit(git, dir, 'notes.md', 'docs: daily digest')],
    ['work commits ahead on another branch', (git, dir) => { git('switch', '-qc', 'feat/wip'); work(git, dir); }],
    ['the digest commit on another branch', (git, dir) => { git('switch', '-qc', 'feat/wip'); digest(git, dir); }],
    ['behind origin', (git, dir) => { commit(git, dir, 'f1.txt', 'theirs'); git('update-ref', 'refs/remotes/origin/main', 'HEAD'); git('reset', '-q', '--hard', 'HEAD~1'); digest(git, dir); }],
  ]) assert.equal(guard(push, {}, { head: 'main', setup }), 'deny', why);
  assert.equal(guard('git push origin HEAD:release', {}, { head: 'main', setup: digest }), 'deny', 'a branch other than the default');
  assert.equal(guard(push, { commit: 'false' }, { head: 'main', setup: digest }), 'deny');
  assert.equal(guard(push, {}, { head: 'main', setup: digest, nested: 'someorg/public' }), 'deny', 'a push from a nested checkout');
  assert.equal(guard(null, {}, { head: 'main', setup: digest, input: JSON.stringify({ tool_input: { command: push } }) }), 'deny', 'no cwd in the input');
});

test('daily-digest export: the run\'s settings hold the hook on Bash calls, and it decides there', { skip: process.platform === 'win32' && 'sh export' }, () => {
  const ctx = context({ home: mkdtempSync(join(tmpdir(), 'bk-dd-export-')) });
  const project = mkdtempSync(join(tmpdir(), 'bk-dd-project-'));
  initRepo(project)('remote', 'add', 'origin', 'https://github.com/Owner/Repo.git');
  const bin = mkdtempSync(join(tmpdir(), 'bk-dd-bin-'));
  // The stand-in claude runs the PreToolUse hook of --settings in a shell, as Claude Code does, on the command in PROBE.
  writeFileSync(join(bin, 'claude'), `#!/usr/bin/env node
const a = process.argv, h = JSON.parse(a[a.indexOf('--settings') + 1]).hooks.PreToolUse[0];
const out = require('node:child_process').execSync(h.hooks[0].command, { shell: '/bin/sh', input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: process.env.PROBE } }) });
require('node:fs').writeFileSync('decision', h.matcher + ' ' + JSON.parse(out).hookSpecificOutput.permissionDecision);
`, { mode: 0o755 });
  const script = join(project, 'digest.sh');
  writeFileSync(script, exportScript(ctx, 'daily-digest', { values: { mode: 'act', commit: 'true' }, dir: project }));
  const decision = (PROBE) => {
    execFileSync('sh', [script], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PROBE } });
    return readFileSync(join(project, 'decision'), 'utf8');
  };
  assert.doesNotMatch(readFileSync(script, 'utf8'), /guard\.sh \*\)/, 'the run itself never calls the hook');
  assert.equal(decision('git add -- digests/2026-11-12.md'), 'Bash allow');
  assert.equal(decision('git add -- digests/2026-11-12.md README.md'), 'Bash deny');
});
