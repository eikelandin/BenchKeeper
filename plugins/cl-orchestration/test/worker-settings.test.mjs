import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { supervisedSettings } from '../skills/coordinate/worker-settings.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/coordinate/worker-settings.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd });

// A linked worktree as git lays it out: the worktree's .git file names its folder under the main checkout's .git. The real path, since the rules take the shared .git's (the macOS temporary folder is a link).
function worktree(name, gitdirLine) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'worker-settings-')));
  mkdirSync(join(base, 'main/.git/worktrees', name), { recursive: true });
  mkdirSync(join(base, name));
  writeFileSync(join(base, name, '.git'), gitdirLine(base));
  return base;
}

test('worker-settings: fills the worktree, the shared .git, its worktrees folders and the hosts into the template', () => {
  for (const [name, line, project = 'main'] of [
    ['wt', (base) => `gitdir: ${base}/main/.git/worktrees/wt\n`],
    ['wt', () => 'gitdir: ../main/.git/worktrees/wt\n'],
    // Another spelling of the project's own folder passes, in the .git file or as the project path, and the rules take the real path.
    ['wt', (base) => `gitdir: ${base}/alias/.git/worktrees/wt\n`],
    ['wt', (base) => `gitdir: ${base}/main/.git/worktrees/wt\n`, 'alias'],
    ['w$$t', (base) => `gitdir: ${base}/main/.git/worktrees/w$$t\n`],
  ]) {
    const base = worktree(name, line);
    symlinkSync(join(base, 'main'), join(base, 'alias'));
    mkdirSync(join(base, 'main/.git/worktrees/other'));
    const file = join(base, 'run/settings/1-x.json');
    const { status, stderr } = run([join(base, name), join(base, project), file, 'registry.npmjs.org', '*.pythonhosted.org']);
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
    assert.deepEqual(settings.sandbox.network, { strictAllowlist: true, allowLocalBinding: false, allowedDomains: ['registry.npmjs.org', '*.pythonhosted.org'] });
    // On macOS the sandbox blocks only creating, removing and renaming the worktree's .git file, not writing it in place.
    assert.deepEqual(settings.sandbox.filesystem, { disabled: false, denyWrite: [`${base}/${name}/.git`] });
    for (const key of ['allowAppleEvents', 'allowNestedUserNamespaces', 'enableWeakerNestedSandbox', 'enableWeakerNetworkIsolation']) assert.equal(settings.sandbox[key], false, key);
    assert.equal(settings.permissions.defaultMode, 'dontAsk');
    assert.equal(settings.permissions.disableBypassPermissionsMode, 'disable');
    assert.deepEqual(settings.sandbox.credentials.files[0], { path: '~/.ssh', mode: 'deny' });
    assert.deepEqual(settings.sandbox.credentials.envVars.slice(-3), [{ name: 'ORCA_PAIRING_CODE', mode: 'deny' }, { name: 'ORCA_REMOTE_PAIRING', mode: 'deny' }, { name: 'ORCA_AGENT_SESSION_SPAWN_TOKEN', mode: 'deny' }]);
  }
});

test('worker-settings --supervised: writes the worker rules without a host path into the worktree, never over another file', () => {
  const base = worktree('wt', (b) => `gitdir: ${b}/main/.git/worktrees/wt\n`);
  const project = join(base, 'main');
  const args = ['--supervised', join(base, 'wt'), project];
  const file = join(base, 'wt/.claude/settings.local.json');
  const exclude = join(base, 'main/.git/info/exclude');
  mkdirSync(join(base, 'main/.git/info'));
  writeFileSync(exclude, '*.log');
  const written = run(args, base);
  assert.equal(written.status, 0, written.stderr);
  const { permissions } = JSON.parse(readFileSync(file, 'utf8'));
  // Deny rules only, beside the key: deny rules hold in auto mode and in Manual, and auto mode drops broad allow rules.
  assert.deepEqual(Object.keys(permissions), ['deny', 'disableBypassPermissionsMode']);
  assert.equal(permissions.disableBypassPermissionsMode, 'disable');
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
  // The last one is an earlier version's rule file: the deny list without disableBypassPermissionsMode.
  for (const content of ['{"permissions":{}}\n', '', `${JSON.stringify({ permissions: { deny: permissions.deny } }, null, 2)}\n`]) {
    writeFileSync(file, content);
    const { status, stderr } = run(['--check', ...args], base);
    assert.equal(status, 1);
    assert.match(stderr, /is not the settings file this script writes/);
    const rewrite = run(args, base);
    assert.equal(rewrite.status, 1);
    assert.match(rewrite.stderr, /exists with other content: not overwritten/);
    assert.equal(readFileSync(file, 'utf8'), content);
  }
  const relativePath = run(['--supervised', 'wt', project], base);
  assert.equal(relativePath.status, 1);
  assert.match(relativePath.stderr, /^wt is not an absolute path/);
  // The main checkout, whose .git is a folder, and a mistyped path are no linked worktree; a stale .git names a shared .git that is gone.
  mkdirSync(join(base, 'stale'));
  writeFileSync(join(base, 'stale/.git'), `gitdir: ${base}/gone/.git/worktrees/stale\n`);
  for (const [folder, error] of [['main', /EISDIR/], ['no/such/wt', /ENOENT/], ['stale', /not a linked worktree of that project/]]) {
    const { status, stderr } = run(['--supervised', join(base, folder), project], base);
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
  for (const [folder, error] of [['linked', /\.claude is a link: not written or read/], ['dangling', /settings\.local\.json is a link: not written or read/]]) {
    const { status, stderr } = run(['--supervised', join(base, folder), project], base);
    assert.equal(status, 1, folder);
    assert.match(stderr, error, folder);
    assert.deepEqual(readdirSync(join(base, 'outside')), [], folder);
  }
  // A link to a file with the same text, elsewhere in the worktree, is outside the rule file's own Edit(/.claude/**) deny.
  mkdirSync(join(base, 'main/.git/worktrees/same'));
  mkdirSync(join(base, 'same/.claude'), { recursive: true });
  writeFileSync(join(base, 'same/.git'), `gitdir: ${base}/main/.git/worktrees/same\n`);
  writeFileSync(join(base, 'same/rules.json'), readFileSync(join(base, 'wt/.claude/settings.local.json'), 'utf8'));
  symlinkSync(join(base, 'same/rules.json'), join(base, 'same/.claude/settings.local.json'));
  for (const extra of [[], ['--check']]) {
    const { status, stderr } = run([...extra, '--supervised', join(base, 'same'), project], base);
    assert.equal(status, 1, extra.join(' '));
    assert.match(stderr, /settings\.local\.json is a link: not written or read/, extra.join(' '));
  }
});

test('worker-settings --supervised: writes no rule file when the shared .git cannot take the exclude line', () => {
  for (const [layout, error] of [
    [(info) => mkdirSync(join(info, 'exclude'), { recursive: true }), /EISDIR/],
    [(info) => writeFileSync(info, ''), /ENOTDIR/],
  ]) {
    const base = worktree('wt', (b) => `gitdir: ${b}/main/.git/worktrees/wt\n`);
    layout(join(base, 'main/.git/info'));
    const { status, stderr } = run(['--supervised', join(base, 'wt'), join(base, 'main')], base);
    assert.equal(status, 1);
    assert.match(stderr, error);
    assert.equal(existsSync(join(base, 'wt/.claude')), false);
  }
});

test('worker-settings --supervised: appends the exclude line through no link', () => {
  for (const [layout, error] of [
    [(base) => symlinkSync(join(base, 'outside'), join(base, 'main/.git/info')), /info is a link: not written/],
    [(base) => {
      mkdirSync(join(base, 'main/.git/info'));
      symlinkSync(join(base, 'outside/target.json'), join(base, 'main/.git/info/exclude'));
    }, /ELOOP/],
  ]) {
    const base = worktree('wt', (b) => `gitdir: ${b}/main/.git/worktrees/wt\n`);
    mkdirSync(join(base, 'outside'));
    writeFileSync(join(base, 'outside/target.json'), '{"permissions":{}}\n');
    layout(base);
    const { status, stderr } = run(['--supervised', join(base, 'wt'), join(base, 'main')], base);
    assert.equal(status, 1);
    assert.match(stderr, error);
    assert.deepEqual(readdirSync(join(base, 'outside')), ['target.json']);
    assert.equal(readFileSync(join(base, 'outside/target.json'), 'utf8'), '{"permissions":{}}\n');
    assert.equal(existsSync(join(base, 'wt/.claude')), false);
  }
});

test('worker-settings --supervised: reads the exclude file through no link and refuses a hard link', () => {
  const written = worktree('wt', (b) => `gitdir: ${b}/main/.git/worktrees/wt\n`);
  assert.equal(run(['--supervised', join(written, 'wt'), join(written, 'main')], written).status, 0);
  const rules = readFileSync(join(written, 'wt/.claude/settings.local.json'), 'utf8');
  for (const [link, error] of [[symlinkSync, /exclude is a link: not written or read/], [linkSync, /exclude has another name \(a hard link\)/]]) {
    const base = worktree('wt', (b) => `gitdir: ${b}/main/.git/worktrees/wt\n`);
    mkdirSync(join(base, 'wt/.claude'));
    writeFileSync(join(base, 'wt/.claude/settings.local.json'), rules);
    mkdirSync(join(base, 'main/.git/info'));
    writeFileSync(join(base, 'listed'), '/.claude/settings.local.json\n');
    link(join(base, 'listed'), join(base, 'main/.git/info/exclude'));
    const modes = link === linkSync ? [['--check'], []] : [['--check']];
    for (const extra of modes) {
      const { status, stderr } = run([...extra, '--supervised', join(base, 'wt'), join(base, 'main')], base);
      assert.equal(status, 1, `${link.name} ${extra}`);
      assert.match(stderr, error, `${link.name} ${extra}`);
    }
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
  // A worker can rewrite its worktree's .git file to name any folder it can write: one in the worktree, reached through a link the sandbox's temporary folder can hold, the worktree itself, or a folder under another .git's worktrees.
  symlinkSync(join(base, 'link'), join(base, 'alias'));
  for (const [name, named] of [
    ['own', 'own/inner/.git/worktrees/own'], ['link', 'alias/inner/.git/worktrees/link'], ['self', 'self/worktrees/self'], ['fake', 'elsewhere/.git/worktrees/fake'],
  ]) {
    mkdirSync(join(base, name), { recursive: true });
    mkdirSync(join(base, named), { recursive: true });
    writeFileSync(join(base, name, '.git'), `gitdir: ${base}/${named}\n`);
  }
  // Git follows a link before it applies a `..`: a link in the worktree's own folder, or directly under worktrees, leads to a folder the worker made; and a missing folder or a file under worktrees.
  mkdirSync(join(base, 'elsewhere/a/fake/sub'), { recursive: true });
  mkdirSync(join(base, 'elsewhere/evil'));
  mkdirSync(join(base, 'main/.git/worktrees/dotdot'));
  symlinkSync(join(base, 'elsewhere/a/fake/sub'), join(base, 'main/.git/worktrees/dotdot/L'));
  symlinkSync(join(base, 'elsewhere/evil'), join(base, 'main/.git/worktrees/evil'));
  writeFileSync(join(base, 'main/.git/worktrees/afile'), '');
  for (const [name, named] of [['dotdot', 'main/.git/worktrees/dotdot/L/..'], ['evil', 'main/.git/worktrees/evil'], ['missing', 'main/.git/worktrees/missing'], ['afile', 'main/.git/worktrees/afile']]) {
    mkdirSync(join(base, name));
    writeFileSync(join(base, name, '.git'), `gitdir: ${base}/${named}\n`);
  }
  // A project whose worktrees folder is a link to the real project's.
  mkdirSync(join(base, 'linkedproj/.git'), { recursive: true });
  symlinkSync(join(base, 'main/.git/worktrees'), join(base, 'linkedproj/.git/worktrees'));
  // A worktree in a folder named worktrees, as in <repo>/.claude/worktrees/<name>, naming itself.
  const nested = join(base, 'repo/.claude/worktrees/nested');
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(nested, '.git'), 'gitdir: .\n');
  const project = join(base, 'main');
  const file = join(base, 'run/settings/1-x.json');
  const inWorktree = [join(base, 'wt/settings.json'), join(base, 'wt/..settings.json')];
  const forged = [...['own', 'link', 'self', 'fake', 'dotdot', 'evil', 'missing', 'afile'].map((name) => join(base, name)), nested];
  for (const [args, error] of [
    ...forged.flatMap((folder) => [
      [[folder, project, file, 'registry.npmjs.org'], /\.git names no folder under .*main\/\.git\/worktrees: not a linked worktree of that project/],
      [['--supervised', folder, project], /\.git names no folder under .*main\/\.git\/worktrees: not a linked worktree of that project/],
    ]),
    [[join(base, 'wt'), project, file], /^length at sandbox\.allowedDomains/],
    [[join(base, 'wt'), project, file, '*'], /^pattern at sandbox\.allowedDomains\[0\]/],
    [[join(base, 'wt'), project, file, 'localhost'], /^pattern at sandbox\.allowedDomains\[0\]/],
    [[join(patterned, 'w*t'), join(patterned, 'main'), file, 'registry.npmjs.org'], /is not an absolute path without a pattern character/],
    [[join(patterned, 'wt'), join(patterned, 'main'), file, 'registry.npmjs.org'], /main\/\.git\/worktrees\/w\*t is not an absolute path without a pattern character/],
    [['wt', project, file, 'registry.npmjs.org'], /^wt is not an absolute path without a pattern character/],
    [[join(base, 'wt'), 'main', file, 'registry.npmjs.org'], /^main is not an absolute path/],
    [[join(base, 'sub'), project, file, 'registry.npmjs.org'], /not a linked worktree of that project/],
    [[join(base, 'wt'), join(base, 'linkedproj'), file, 'registry.npmjs.org'], /names no folder under .*linkedproj\/\.git\/worktrees: not a linked worktree of that project/],
    // The project path names a linked worktree, whose .git is a file.
    [[join(base, 'wt'), join(base, 'wt'), file, 'registry.npmjs.org'], /names no folder under .*wt\/\.git\/worktrees: not a linked worktree of that project/],
    // Resolved from here it is the run folder's file, but the launch would read it in the worktree.
    [[join(base, 'wt'), project, 'run/settings/1-x.json', 'registry.npmjs.org'], /^run\/settings\/1-x\.json is not an absolute path/],
    ...inWorktree.map((inside) => [[join(base, 'wt'), project, inside, 'registry.npmjs.org'], /^the settings file must lie outside the worktree/]),
  ]) {
    const { status, stderr } = run(args, base);
    assert.equal(status, 1, args.join(' '));
    assert.match(stderr, error, args.join(' '));
    assert.equal([file, ...inWorktree, ...forged.map((folder) => join(folder, '.claude'))].some((path) => existsSync(path)), false);
  }
  assert.equal(existsSync(join(base, 'repo/.claude/info')), false);
});

test('worker-settings --check: passes the file the script wrote, refuses it emptied, unparsable, without its sandbox or with a second one', () => {
  const base = worktree('wt', (b) => `gitdir: ${b}/main/.git/worktrees/wt\n`);
  const file = join(base, 'run/settings/1-x.json');
  const args = [join(base, 'wt'), join(base, 'main'), file, 'registry.npmjs.org'];
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
