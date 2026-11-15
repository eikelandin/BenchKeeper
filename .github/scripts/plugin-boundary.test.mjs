import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { differences, offences, scan } from './plugin-boundary.mjs';

const P = 'plugins/one';
const names = (path, text) => offences(`${P}/${path}`, text, P);

test('names of the app are found in text of any kind', () => {
  assert.deepEqual(names('a.md', 'Run `npx benchkeeper@6 doctor`.'), ['app-package']);
  assert.deepEqual(names('a.md', 'Run `npx -y @cedarloom/app@0 plan`.'), ['app-package']);
  assert.deepEqual(names('a.json', '{"command": "benchkeeper:ask"}'), ['app-package']);
  assert.deepEqual(names('a.md', 'State lives in .cedarloom-app/runs.'), ['app-state']);
  assert.deepEqual(names('a.mjs', 'const home = process.env.CEDARLOOM_APP_HOME;'), ['app-state']);
});

test('paths into the app are found, the bot account app/dependabot is not', () => {
  assert.deepEqual(names('a.md', 'see app/test/fixtures/x'), ['app-path']);
  assert.deepEqual(names('a.sh', 'cd app && npm test'), ['app-path']);
  assert.deepEqual(names('a.sh', 'npm --prefix app run smoke'), ['app-path']);
  assert.deepEqual(names('a.sh', '$2 == "app/dependabot" || $2 == "app/renovate"'), []);
  assert.deepEqual(names('a.md', 'a web app or desktop app, not the happy/path'), []);
});

test('imports must stay inside the plugin or name a Node built-in or the Claude Code module', () => {
  assert.deepEqual(names('x/a.mjs', "import { x } from '../../../app/src/y.mjs';"), ['import-outside']);
  assert.deepEqual(names('x/a.mjs', "import { x } from '../../../shared/y.mjs';"), ['import-outside']);
  assert.deepEqual(names('x/a.mjs', "const m = await import('../../../../lib/y.mjs');"), ['import-outside']);
  assert.deepEqual(names('x/a.cjs', "const m = require('left-pad');"), ['import-outside']);
  assert.deepEqual(names('x/a.mjs', "const u = new URL('../../../../x.json', import.meta.url);"), ['import-outside']);
  assert.deepEqual(names('x/a.mjs', "import { x } from '../../../two/y.mjs';"), ['import-outside']);
  assert.deepEqual(
    names('x/a.ts', "import { a } from './b.mjs';\nimport { c } from '../types';\nimport fs from 'node:fs';\nimport type { R } from 'claude-code';\nimport { t } from 'claude-code/testing';\nconst u = new URL('../b.json', import.meta.url);"),
    [],
  );
});

test('a difference is named for a new reference and for an allow entry that no longer matches', () => {
  assert.deepEqual(differences({ 'p/a.md': ['app-path'], 'p/b.md': ['app-package'] }, { 'p/a.md': ['app-path'], 'p/c.md': ['app-state'] }), [
    'p/b.md: app-package is a new reference to the app or a path outside the plugin',
    'p/c.md: app-state no longer matches: remove it from plugin-boundary-allow.json',
  ]);
});

test('scan reads tracked files of every folder under plugins, skips binaries and the changelog', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bk-boundary-'));
  try {
    for (const folder of ['plugins/one/skills', 'plugins/two']) mkdirSync(join(dir, folder), { recursive: true });
    writeFileSync(join(dir, 'plugins/one/skills/a.md'), 'npx benchkeeper doctor');
    writeFileSync(join(dir, 'plugins/two/b.mjs'), "import x from '../one/c.mjs';");
    writeFileSync(join(dir, 'plugins/two/CHANGELOG.md'), 'benchkeeper');
    writeFileSync(join(dir, 'plugins/two/logo.png'), Buffer.from([0, 98, 101, 110, 99, 104, 107, 101, 101, 112, 101, 114]));
    writeFileSync(join(dir, 'README.md'), 'benchkeeper');
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['add', '.'], { cwd: dir });
    assert.deepEqual(scan(dir), { 'plugins/one/skills/a.md': ['app-package'], 'plugins/two/b.mjs': ['import-outside'] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
