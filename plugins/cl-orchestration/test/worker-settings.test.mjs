import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { supervisedSettings } from '../skills/orchestrating-projects/worker-settings.mjs';

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
    // The worker rules that Bash(gh *), Bash(git push *), WebFetch and the .claude deny already match are left out; Edit rules stay ask, so the sandbox leaves .git to git.
    assert.deepEqual(settings.permissions.deny.slice(-13), [
      'mcp__*', 'Bash(gh *)', 'Bash(git push *)', 'Read(.env)', 'Read(.env.*)', 'Read(secrets/**)',
      'Bash(rm -r*)', 'Bash(rm -R*)', 'Bash(rm -fr*)', 'Bash(rm -fR*)', 'Bash(rm * -r*)', 'Bash(rm * -R*)', 'Bash(rm *--recursive*)',
    ]);
    assert.deepEqual(settings.permissions.ask, [`Edit(${w}/.github/**)`, 'Edit(//**/.git)', 'Edit(//**/.git/**)']);
    assert.deepEqual(settings.sandbox.network, { strictAllowlist: true, allowedDomains: ['registry.npmjs.org', '*.pythonhosted.org'] });
    assert.equal(settings.permissions.defaultMode, 'dontAsk');
    assert.equal(settings.permissions.disableBypassPermissionsMode, 'disable');
    assert.deepEqual(settings.sandbox.credentials.files[0], { path: '~/.ssh', mode: 'deny' });
  }
});

test('worker-settings --supervised: writes the worker rules without a host path into the worktree, never over another file', () => {
  const base = worktree('wt', (b) => `gitdir: ${b}/main/.git/worktrees/wt\n`);
  const args = ['--supervised', join(base, 'wt')];
  const file = join(base, 'wt/.claude/settings.local.json');
  const exclude = join(base, 'main/.git/info/exclude');
  mkdirSync(join(base, 'main/.git/info'));
  writeFileSync(exclude, '*.log');
  const written = run(args, base);
  assert.equal(written.status, 0, written.stderr);
  const { permissions } = JSON.parse(readFileSync(file, 'utf8'));
  // No ask list: where Orca answers the worker's prompts, an ask match runs.
  assert.deepEqual(Object.keys(permissions), ['deny']);
  // A rule that ends in :* is a prefix rule, so the : refspec deny must end otherwise.
  assert.ok(permissions.deny.includes('Bash(gh pr merge *)') && permissions.deny.includes('Bash(git push * :**)') && permissions.deny.includes('Read(.env)'));
  assert.ok(permissions.deny.includes('Bash(git push *)') && permissions.deny.includes('Bash(gh pr create *)') && permissions.deny.includes('Bash(gh pr comment *)'));
  assert.deepEqual(permissions.deny.slice(-5), ['Edit(/.claude/**)', 'Edit(/.github/**)', 'Edit(//**/.git)', 'Edit(//**/.git/**)', 'WebFetch']);
  assert.equal(run(args, base).status, 0);
  assert.equal(readFileSync(exclude, 'utf8'), '*.log\n/.claude/settings.local.json\n');
  const checked = run(['--check', ...args], base);
  assert.equal(checked.status, 0, checked.stderr);
  writeFileSync(exclude, '');
  const unexcluded = run(['--check', ...args], base);
  assert.equal(unexcluded.status, 1);
  assert.match(unexcluded.stderr, /does not list \/\.claude\/settings\.local\.json/);
  assert.equal(run(args, base).status, 0);
  assert.equal(readFileSync(exclude, 'utf8'), '/.claude/settings.local.json\n');
  for (const content of ['{"permissions":{}}\n', '']) {
    writeFileSync(file, content);
    const { status, stderr } = run(['--check', ...args], base);
    assert.equal(status, 1);
    assert.match(stderr, /is not the settings file this script writes/);
    const rewrite = run(args, base);
    assert.equal(rewrite.status, 1);
    assert.match(rewrite.stderr, /exists with other content: not overwritten/);
    assert.equal(readFileSync(file, 'utf8'), content);
  }
  const relativePath = run(['--supervised', 'wt'], base);
  assert.equal(relativePath.status, 1);
  assert.match(relativePath.stderr, /^wt is not an absolute path/);
  // The main checkout, whose .git is a folder, and a mistyped path are no linked worktree; a stale .git names a shared .git that is gone.
  mkdirSync(join(base, 'stale'));
  writeFileSync(join(base, 'stale/.git'), `gitdir: ${base}/gone/.git/worktrees/stale\n`);
  for (const [folder, error] of [['main', /EISDIR/], ['no/such/wt', /ENOENT/], ['stale', /ENOENT/]]) {
    const { status, stderr } = run(['--supervised', join(base, folder)], base);
    assert.equal(status, 1, folder);
    assert.match(stderr, error, folder);
    assert.equal(existsSync(join(base, folder, '.claude')), false, folder);
  }
  assert.equal(existsSync(join(base, 'gone')), false);
  // Links a repository can commit: .claude to a folder outside the worktree, the file itself to a path that does not exist yet.
  mkdirSync(join(base, 'outside'));
  for (const name of ['linked', 'dangling']) {
    mkdirSync(join(base, 'main/.git/worktrees', name));
    mkdirSync(join(base, name));
    writeFileSync(join(base, name, '.git'), `gitdir: ${base}/main/.git/worktrees/${name}\n`);
  }
  symlinkSync(join(base, 'outside'), join(base, 'linked/.claude'));
  mkdirSync(join(base, 'dangling/.claude'));
  symlinkSync(join(base, 'outside/target.json'), join(base, 'dangling/.claude/settings.local.json'));
  for (const [folder, error] of [['linked', /\.claude is a link: not written or read/], ['dangling', /EEXIST/]]) {
    const { status, stderr } = run(['--supervised', join(base, folder)], base);
    assert.equal(status, 1, folder);
    assert.match(stderr, error, folder);
    assert.deepEqual(readdirSync(join(base, 'outside')), [], folder);
  }
});

test('worker-settings --supervised: writes no rule file when the shared .git cannot take the exclude line', () => {
  for (const [layout, error] of [
    [(info) => mkdirSync(join(info, 'exclude'), { recursive: true }), /EISDIR/],
    [(info) => writeFileSync(info, ''), /ENOTDIR/],
  ]) {
    const base = worktree('wt', (b) => `gitdir: ${b}/main/.git/worktrees/wt\n`);
    layout(join(base, 'main/.git/info'));
    const { status, stderr } = run(['--supervised', join(base, 'wt')], base);
    assert.equal(status, 1);
    assert.match(stderr, error);
    assert.equal(existsSync(join(base, 'wt/.claude')), false);
  }
});

test('worker-settings: refuses a rule file with a key besides deny or a rule that is no string', () => {
  for (const rules of [{ deny: [], ask: ['Bash(git push *)'] }, { deny: ['Bash(git push *)', 1] }]) {
    assert.throws(() => supervisedSettings(rules), /must hold one key, deny, with a list of rule strings/, JSON.stringify(rules));
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
  // A worker can rewrite its worktree's .git file to name a shared .git it made in the worktree, or the worktree itself.
  for (const [name, named] of [['own', 'own/inner/.git/worktrees/own'], ['self', 'self/worktrees/self']]) {
    mkdirSync(join(base, named), { recursive: true });
    writeFileSync(join(base, name, '.git'), `gitdir: ${base}/${named}\n`);
  }
  const file = join(base, 'run/settings/1-x.json');
  const inWorktree = [join(base, 'wt/settings.json'), join(base, 'wt/..settings.json')];
  for (const [args, error] of [
    [[join(base, 'own'), file, 'registry.npmjs.org'], /own\/\.git names a shared \.git inside the worktree/],
    [[join(base, 'self'), file, 'registry.npmjs.org'], /self\/\.git names a shared \.git inside the worktree/],
    [['--supervised', join(base, 'own')], /own\/\.git names a shared \.git inside the worktree/],
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
    assert.equal([file, ...inWorktree, join(base, 'own/.claude')].some((path) => existsSync(path)), false);
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
