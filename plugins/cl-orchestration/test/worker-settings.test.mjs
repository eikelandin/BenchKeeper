import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../skills/orchestrating-projects/worker-settings.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

// A linked worktree as git lays it out: the worktree's .git file names its folder under the main checkout's .git.
function worktree(gitdirLine) {
  const base = mkdtempSync(join(tmpdir(), 'worker-settings-'));
  mkdirSync(join(base, 'main/.git/worktrees/wt'), { recursive: true });
  mkdirSync(join(base, 'wt'));
  writeFileSync(join(base, 'wt/.git'), gitdirLine(base));
  return base;
}

test('worker-settings: fills the worktree, its folder under the shared .git and the hosts into the template', () => {
  for (const line of [(base) => `gitdir: ${base}/main/.git/worktrees/wt\n`, () => 'gitdir: ../main/.git/worktrees/wt\n']) {
    const base = worktree(line);
    const file = join(base, 'run/settings/1-x.json');
    const { status, stderr } = run(join(base, 'wt'), file, 'registry.npmjs.org', '*.pythonhosted.org');
    assert.equal(status, 0, stderr);
    const settings = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(settings.permissions.allow, [`Edit(/${base}/wt/**)`]);
    assert.deepEqual(settings.permissions.deny.slice(0, 12), [
      `Edit(/${base}/wt/.claude/**)`, `Edit(/${base}/wt/.mcp.json)`, `Edit(/${base}/wt/.vscode/**)`, `Edit(/${base}/wt/.idea/**)`,
      `Edit(/${base}/wt/.bashrc)`, `Edit(/${base}/wt/.zshrc)`, `Edit(/${base}/wt/.gitconfig)`,
      `Edit(/${base}/wt/.envrc)`, `Edit(/${base}/wt/.npmrc)`, `Edit(/${base}/wt/.husky/**)`,
      `Edit(/${base}/main/.git/worktrees/wt/commondir)`, `Edit(/${base}/main/.git/worktrees/wt/config.worktree)`,
    ]);
    assert.deepEqual(settings.sandbox.network, { strictAllowlist: true, allowedDomains: ['registry.npmjs.org', '*.pythonhosted.org'] });
    assert.equal(settings.permissions.defaultMode, 'dontAsk');
  }
});

test('worker-settings: writes no file for a path, a host or a worktree it cannot fill in safely', () => {
  const base = worktree((b) => `gitdir: ${b}/main/.git/worktrees/wt\n`);
  mkdirSync(join(base, 'w*t'));
  writeFileSync(join(base, 'w*t/.git'), `gitdir: ${base}/main/.git/worktrees/wt\n`);
  mkdirSync(join(base, 'main/.git/objects'));
  const file = join(base, 'run/settings/1-x.json');
  for (const args of [
    [join(base, 'wt'), file],
    [join(base, 'wt'), file, '*'],
    [join(base, 'wt'), file, 'localhost'],
    [join(base, 'w*t'), file, 'registry.npmjs.org'],
    [join(base, 'main'), file, 'registry.npmjs.org'],
    ['wt', file, 'registry.npmjs.org'],
    [join(base, 'wt'), join(base, 'wt/settings.json'), 'registry.npmjs.org'],
  ]) {
    const { status, stderr } = run(...args);
    assert.equal(status, 1, args.join(' '));
    assert.notEqual(stderr, '');
    assert.equal(existsSync(file) || existsSync(join(base, 'wt/settings.json')), false);
  }
});
