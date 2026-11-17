import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offences, scan } from './plugin-boundary.mjs';

const P = 'plugins/one';
const names = (path, text) => offences(`${P}/${path}`, text, P);

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

test('Orca is found in cl-workflow and cl-repo, and passes in cl-orchestration and the cedarloom bundle', () => {
  const orca = (path, text) => offences(path, text, path.split('/').slice(0, 2).join('/'));
  assert.deepEqual(orca('plugins/cl-workflow/skills/a/SKILL.md', 'Run `orca task-create --spec-file spec.md`.'), ['orca-only-orchestration']);
  assert.deepEqual(orca('plugins/cl-repo/hooks/a.mjs', 'const handle = process.env.ORCA_TERMINAL_HANDLE;'), ['orca-only-orchestration']);
  assert.deepEqual(orca('plugins/cl-repo/hooks/a.mjs', 'const client = new OrcaClient();'), ['orca-only-orchestration']);
  assert.deepEqual(orca('plugins/cl-repo/hooks/a.mjs', 'const handle = process.env.CEDARLOOM_ORCA_HANDLE;'), ['orca-only-orchestration']);
  assert.deepEqual(orca('plugins/cl-repo/hooks/a.mjs', 'if (isOrcaWorker()) return;'), ['orca-only-orchestration']);
  assert.deepEqual(orca('plugins/cl-repo/hooks/a.mjs', 'const useOrca = true; const in_orca = true;'), ['orca-only-orchestration']);
  assert.deepEqual(orca('plugins/cl-repo/hooks/a.mjs', 'const trip = majorca_trip; // Majorca'), []);
  assert.deepEqual(names('a.md', 'Runs in Orca.'), ['orca-only-orchestration']);
  assert.deepEqual(orca('plugins/cl-orchestration/skills/coordinate/orca.md', 'Orca opens a terminal; read `$ORCA_TERMINAL_HANDLE`.'), []);
  assert.deepEqual(orca('plugins/cedarloom/.claude-plugin/plugin.json', '{"description": "Installs cl-orchestration, which runs workers in Orca."}'), []);
});

test('scan reads tracked files of every folder under plugins, skips binaries and the changelog, and checks matcher prefixes against the plugin name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cl-boundary-'));
  try {
    for (const folder of ['plugins/one/skills', 'plugins/two/hooks', 'plugins/two/.claude-plugin']) mkdirSync(join(dir, folder), { recursive: true });
    writeFileSync(join(dir, 'plugins/two/.claude-plugin/plugin.json'), '{"name": "two"}');
    writeFileSync(join(dir, 'plugins/two/hooks/own.json'), '{"hooks": {"UserPromptSubmit": [{"matcher": "^two:(ask)$"}]}}');
    writeFileSync(join(dir, 'plugins/two/hooks/copied.json'), '{"hooks": {"UserPromptSubmit": [{"matcher": "startup"}, {"matcher": "^one:(ask)$"}]}}');
    writeFileSync(join(dir, 'plugins/one/skills/a.md'), 'See [two](../../two/b.mjs).');
    writeFileSync(join(dir, 'plugins/two/b.mjs'), "import x from '../one/c.mjs';");
    writeFileSync(join(dir, 'plugins/two/CHANGELOG.md'), '[one](../one/c.mjs)');
    writeFileSync(join(dir, 'plugins/two/logo.png'), Buffer.from([0, 46, 46, 47, 111, 110, 101, 47, 99]));
    writeFileSync(join(dir, 'README.md'), '[one](../one/c.mjs)');
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['add', '.'], { cwd: dir });
    assert.deepEqual(scan(dir), {
      'plugins/one/skills/a.md': ['import-outside'],
      'plugins/two/b.mjs': ['import-outside'],
      'plugins/two/hooks/copied.json': ['matcher-prefix'],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
