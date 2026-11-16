import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../skills/orchestrating-projects/worker-settings.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd });

// A linked worktree as git lays it out: the worktree's .git file names its folder under the main checkout's .git.
function worktree(name, gitdirLine) {
  const base = mkdtempSync(join(tmpdir(), 'worker-settings-'));
  mkdirSync(join(base, 'main/.git/worktrees', name), { recursive: true });
  mkdirSync(join(base, name));
  writeFileSync(join(base, name, '.git'), gitdirLine(base));
  return base;
}

test('worker-settings: fills the worktree, the shared .git, its worktrees folders and the hosts into the template', () => {
  for (const [name, line] of [
    ['wt', (base) => `gitdir: ${base}/main/.git/worktrees/wt\n`],
    ['wt', () => 'gitdir: ../main/.git/worktrees/wt\n'],
    ['w$$t', (base) => `gitdir: ${base}/main/.git/worktrees/w$$t\n`],
  ]) {
    const base = worktree(name, line);
    mkdirSync(join(base, 'main/.git/worktrees/other'));
    const file = join(base, 'run/settings/1-x.json');
    const { status, stderr } = run([join(base, name), file, 'registry.npmjs.org', '*.pythonhosted.org']);
    assert.equal(status, 0, stderr);
    const settings = JSON.parse(readFileSync(file, 'utf8'));
    const w = `/${base}/${name}`;
    const folders = `/${base}/main/.git/worktrees`;
    assert.deepEqual(settings.permissions.allow, [`Edit(${w}/**)`]);
    assert.deepEqual(settings.permissions.deny.slice(0, 18), [
      `Edit(${w}/.claude/**)`, `Edit(${w}/.mcp.json)`, `Edit(${w}/.vscode/**)`, `Edit(${w}/.idea/**)`,
      `Edit(${w}/.bashrc)`, `Edit(${w}/.zshrc)`, `Edit(${w}/.gitconfig)`,
      `Edit(${w}/.envrc)`, `Edit(${w}/.npmrc)`, `Edit(${w}/.husky/**)`,
      `Edit(/${base}/main/.git/commondir)`, `Edit(/${base}/main/.git/config.worktree)`,
      `Edit(${folders}/*/commondir)`, `Edit(${folders}/other/commondir)`, `Edit(${folders}/${name}/commondir)`,
      `Edit(${folders}/*/config.worktree)`, `Edit(${folders}/other/config.worktree)`, `Edit(${folders}/${name}/config.worktree)`,
    ]);
    assert.deepEqual(settings.sandbox.network, { strictAllowlist: true, allowedDomains: ['registry.npmjs.org', '*.pythonhosted.org'] });
    assert.equal(settings.permissions.defaultMode, 'dontAsk');
  }
});

test('worker-settings: writes no file for a path, a host or a worktree it cannot fill in safely', () => {
  const base = worktree('wt', (b) => `gitdir: ${b}/main/.git/worktrees/wt\n`);
  // A folder under worktrees that no rule can name refuses every worktree beside it, so the pattern-named one has a .git of its own.
  const patterned = worktree('w*t', (b) => `gitdir: ${b}/main/.git/worktrees/w*t\n`);
  mkdirSync(join(patterned, 'main/.git/worktrees/wt'));
  mkdirSync(join(patterned, 'wt'));
  writeFileSync(join(patterned, 'wt/.git'), `gitdir: ${patterned}/main/.git/worktrees/wt\n`);
  mkdirSync(join(base, 'main/.git/modules/sub'), { recursive: true });
  mkdirSync(join(base, 'sub'));
  writeFileSync(join(base, 'sub/.git'), `gitdir: ${base}/main/.git/modules/sub\n`);
  const file = join(base, 'run/settings/1-x.json');
  const inWorktree = [join(base, 'wt/settings.json'), join(base, 'wt/..settings.json')];
  for (const [args, error] of [
    [[join(base, 'wt'), file], /^length at sandbox\.allowedDomains/],
    [[join(base, 'wt'), file, '*'], /^pattern at sandbox\.allowedDomains\[0\]/],
    [[join(base, 'wt'), file, 'localhost'], /^pattern at sandbox\.allowedDomains\[0\]/],
    [[join(patterned, 'w*t'), file, 'registry.npmjs.org'], /is not an absolute path without a pattern character/],
    [[join(patterned, 'wt'), file, 'registry.npmjs.org'], /main\/\.git\/worktrees\/w\*t is not an absolute path without a pattern character/],
    [['wt', file, 'registry.npmjs.org'], /^wt is not an absolute path without a pattern character/],
    [[join(base, 'sub'), file, 'registry.npmjs.org'], /not a linked worktree/],
    // Resolved from here it is the run folder's file, but the launch would read it in the worktree.
    [[join(base, 'wt'), 'run/settings/1-x.json', 'registry.npmjs.org'], /^run\/settings\/1-x\.json is not an absolute path/],
    ...inWorktree.map((inside) => [[join(base, 'wt'), inside, 'registry.npmjs.org'], /^the settings file must lie outside the worktree/]),
  ]) {
    const { status, stderr } = run(args, base);
    assert.equal(status, 1, args.join(' '));
    assert.match(stderr, error, args.join(' '));
    assert.equal([file, ...inWorktree].some((path) => existsSync(path)), false);
  }
});

test('worker-settings --check: passes the file the script wrote, refuses it emptied, unparsable, without its sandbox or with a second one', () => {
  const base = worktree('wt', (b) => `gitdir: ${b}/main/.git/worktrees/wt\n`);
  const file = join(base, 'run/settings/1-x.json');
  const args = [join(base, 'wt'), file, 'registry.npmjs.org'];
  assert.equal(run(args, base).status, 0);
  const written = readFileSync(file, 'utf8');
  const passed = run(['--check', ...args], base);
  assert.equal(passed.status, 0, passed.stderr);
  const withoutSandbox = JSON.parse(written);
  delete withoutSandbox.sandbox;
  // JSON.parse keeps the last of two equal keys; another parser may keep the first.
  const sandboxOffFirst = `{"sandbox":{"enabled":false},${written.slice(1)}`;
  for (const content of ['', written.slice(0, -20), JSON.stringify(withoutSandbox), sandboxOffFirst]) {
    writeFileSync(file, content);
    const { status, stderr } = run(['--check', ...args], base);
    assert.equal(status, 1, JSON.stringify(content.slice(0, 40)));
    assert.match(stderr, /is not the settings file this script writes/);
    assert.equal(readFileSync(file, 'utf8'), content);
  }
});
