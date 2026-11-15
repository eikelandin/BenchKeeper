import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { differences, growth, offences, scan } from './plugin-boundary.mjs';

const P = 'plugins/one';
const names = (path, text) => offences(`${P}/${path}`, text, P);

test('names of the app are found in text of any kind', () => {
  assert.deepEqual(names('a.md', 'Run `npx benchkeeper@6 doctor`.'), ['app-package']);
  assert.deepEqual(names('a.md', 'Run `npx -y @cedarloom/app@0 plan`.'), ['app-npx', 'app-package']);
  assert.deepEqual(names('a.json', '{"command": "benchkeeper:ask"}'), ['app-package']);
  assert.deepEqual(names('a.md', 'State lives in .cedarloom-app/runs.'), ['app-state']);
  assert.deepEqual(names('a.mjs', 'const home = process.env.CEDARLOOM_APP_HOME;'), ['app-state']);
  assert.deepEqual(names('a.json', '{ "minApp": "6.27.0" }'), ['app-state']);
});

test('the app\'s successor packages and its cedarloom command are found, the plugin name in prose and commands is not', () => {
  assert.deepEqual(names('a.md', 'Run `npx @cedarloom/cli doctor`.'), ['app-package']);
  assert.deepEqual(names('a.mjs', "spawnSync('npx', ['-y', '@cedarloom/cli', 'doctor']);"), ['app-package']);
  assert.deepEqual(names('a.md', 'Run `cedarloom doctor --json`.'), ['app-package']);
  assert.deepEqual(names('a.sh', 'pnpm dlx cedarloom plan'), ['app-package']);
  assert.deepEqual(names('a.md', 'CedarLoom picks the tier. Run `/cedarloom:workflow`.\n{"name": "cedarloom"}'), []);
});

test('paths into the app are found, the bot account app/dependabot is not', () => {
  assert.deepEqual(names('a.md', 'see app/test/fixtures/x'), ['app-path']);
  assert.deepEqual(names('a.sh', 'cd app && npm test'), ['app-path']);
  assert.deepEqual(names('a.sh', 'npm --prefix app run smoke'), ['app-path']);
  assert.deepEqual(names('a.sh', 'npm --prefix=app test'), ['app-path']);
  assert.deepEqual(names('a.sh', 'node "$ROOT/app/scripts/content.mjs"'), ['app-path']);
  assert.deepEqual(names('a.sh', '$2 == "app/dependabot" || $2 == "app/renovate"'), []);
  assert.deepEqual(names('a.md', 'a web app or desktop app, not the happy/path, in /Applications/Claude.app/Contents'), []);
});

test('a path that climbs out of the plugin is found in a file of any kind', () => {
  assert.deepEqual(names('x/a.md', '[fixtures](../../../x/fixtures/y)'), ['import-outside']);
  assert.deepEqual(names('x/a.sh', 'node ../../../x/cli.mjs'), ['import-outside']);
  assert.deepEqual(names('a.json', '{"command": "node ${CLAUDE_PLUGIN_ROOT}/../x/hook.mjs"}'), ['import-outside']);
  assert.deepEqual(names('x/a.mjs', "const cli = resolve(here, '../../../x/cli.mjs');"), ['import-outside']);
  assert.deepEqual(names('x/a.mjs', 'const m = await import(`../../../${name}.mjs`);'), ['import-outside']);
  assert.deepEqual(names('a.md', '[guide](docs/../../two/guide.md)'), ['import-outside']);
  assert.deepEqual(names('a.md', '[guide](docs/a/../b/guide.md)'), []);
  assert.deepEqual(names('x/y/a.md', 'See [the library](../../library/README.md) and ${CLAUDE_PLUGIN_ROOT}/hooks/a.mjs.'), []);
});

test('imports must stay inside the plugin or name a Node built-in or the Claude Code module', () => {
  assert.deepEqual(names('x/a.mjs', "import { x } from '../../../app/src/y.mjs';"), ['app-path', 'import-outside']);
  assert.deepEqual(names('x/a.mjs', "import { x } from '../../../shared/y.mjs';"), ['import-outside']);
  assert.deepEqual(names('x/a.mjs', "const m = await import('../../../../lib/y.mjs');"), ['import-outside']);
  assert.deepEqual(names('x/a.cjs', "const m = require('left-pad');"), ['import-outside']);
  assert.deepEqual(names('x/a.mjs', "const u = new URL('../../../../x.json', import.meta.url);"), ['import-outside']);
  assert.deepEqual(names('x/a.mjs', "import { x } from '../../../two/y.mjs';"), ['import-outside']);
  assert.deepEqual(
    names('x/a.ts', "import { a } from './b.mjs';\nimport { c } from '../types';\nimport fs from 'node:fs';\nimport type { R } from 'claude-code';\nimport { t } from 'claude-code/testing';\nconst u = new URL('../b.json', import.meta.url);"),
    [],
  );
  assert.deepEqual(names('x/a.mjs', 'console.log("copy from \'cache\' failed"); // see from \'x\''), []);
  assert.deepEqual(names('x/a.mjs', "export {\n  x,\n} from 'left-pad';"), ['import-outside']);
  assert.deepEqual(names('view.jsx', "import x from 'left-pad';"), ['import-outside']);
  assert.deepEqual(names('a.mjs', "import fs from 'node:fs'; import x from 'left-pad';"), ['import-outside']);
  assert.deepEqual(names('a.mjs', 'const message = "import \'cache\' failed"; // require(\'x\')\n/* import \'y\' */ const t = `import \'z\'`;'), []);
  assert.deepEqual(names('a.mjs', "const m = await import(/* chunk */ 'left-pad');"), ['import-outside']);
});

test('a package runner call of @cedarloom/app is found in any form, a call of its installed command is not', () => {
  assert.deepEqual(names('a.md', 'Run `npx @cedarloom/app@0.1 <command>`.'), ['app-npx', 'app-package']);
  assert.deepEqual(names('a.toml', 'precheck = "k=$(npx --yes @cedarloom/app knowledge show --json)"'), ['app-npx', 'app-package']);
  for (const runner of ['bunx', 'bun x', 'pnpx', 'pnpm dlx', 'npm exec --', 'yarn dlx']) assert.deepEqual(names('a.sh', `${runner} @cedarloom/app plan`), ['app-npx', 'app-package'], runner);
  assert.deepEqual(names('a.md', 'Run `npx @cedarloom/app-ui`.'), ['app-package']);
  assert.deepEqual(names('a.md', 'When `command -v cedarloom-app` finds it, run `cedarloom-app plan`.'), ['app-state']);
});

test('a package runner call of @cedarloom/app fails even when the allow list names it', () => {
  assert.deepEqual(differences({ 'p/a.md': ['app-npx', 'app-package'] }, { 'p/a.md': ['app-npx', 'app-package'] }), [
    'p/a.md: app-npx runs a package from the registry: call the installed command when `command -v` finds it',
  ]);
});

test('a difference is named for a new reference and for an allow entry that no longer matches', () => {
  assert.deepEqual(differences({ 'p/a.md': ['app-path'], 'p/b.md': ['app-package'] }, { 'p/a.md': ['app-path'], 'p/c.md': ['app-state'] }), [
    "p/b.md: app-package is a new reference to the app, a path outside the plugin or another plugin's matcher prefix",
    'p/c.md: app-state no longer matches: remove it from plugin-boundary-allow.json',
  ]);
});

test('the allow list may not hold more pairs than the base branch\'s, a renamed file keeps its count', () => {
  const base = { 'p/a.md': ['app-path', 'app-state'] };
  assert.deepEqual(growth({ 'p/b.md': ['app-path', 'app-state'] }, base), []);
  assert.deepEqual(growth({ 'p/a.md': ['app-path', 'app-state'], 'p/c.md': ['app-package'] }, base), [
    'plugin-boundary-allow.json lists 3 pairs, more than the 2 of the base branch: remove the new reference instead of listing it',
  ]);
  assert.deepEqual(growth({ 'p/c.md': ['app-package'] }, null), []);
});

test('scan reads tracked files of every folder under plugins, skips binaries and the changelog, and checks matcher prefixes against the plugin name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bk-boundary-'));
  try {
    for (const folder of ['plugins/one/skills', 'plugins/two/hooks', 'plugins/two/.claude-plugin']) mkdirSync(join(dir, folder), { recursive: true });
    writeFileSync(join(dir, 'plugins/two/.claude-plugin/plugin.json'), '{"name": "two"}');
    writeFileSync(join(dir, 'plugins/two/hooks/own.json'), '{"hooks": {"UserPromptSubmit": [{"matcher": "^two:(ask)$"}]}}');
    writeFileSync(join(dir, 'plugins/two/hooks/copied.json'), '{"hooks": {"UserPromptSubmit": [{"matcher": "startup"}, {"matcher": "^one:(ask)$"}]}}');
    writeFileSync(join(dir, 'plugins/one/skills/a.md'), 'npx benchkeeper doctor');
    writeFileSync(join(dir, 'plugins/two/b.mjs'), "import x from '../one/c.mjs';");
    writeFileSync(join(dir, 'plugins/two/CHANGELOG.md'), 'benchkeeper');
    writeFileSync(join(dir, 'plugins/two/logo.png'), Buffer.from([0, 98, 101, 110, 99, 104, 107, 101, 101, 112, 101, 114]));
    writeFileSync(join(dir, 'README.md'), 'benchkeeper');
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['add', '.'], { cwd: dir });
    assert.deepEqual(scan(dir), {
      'plugins/one/skills/a.md': ['app-package'],
      'plugins/two/b.mjs': ['import-outside'],
      'plugins/two/hooks/copied.json': ['matcher-prefix'],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
