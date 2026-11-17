// Each plugin of the marketplace installs alone into an empty Claude Code config and brings exactly its dependencies;
// the bundle brings all of them. Needs the `claude` binary: CI always has it, elsewhere the tests skip.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const marketplace = JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf8'));
const hasClaude = spawnSync('claude', ['--version'], { stdio: 'ignore' }).status === 0;
const skip = !hasClaude && !process.env.CI;

const EXPECTED = {
  'cl-workflow': ['cl-workflow@cedarloom'],
  'cl-repo': ['cl-repo@cedarloom'],
  'cl-orchestration': ['cl-orchestration@cedarloom', 'cl-workflow@cedarloom'],
  cedarloom: ['cedarloom@cedarloom', 'cl-orchestration@cedarloom', 'cl-repo@cedarloom', 'cl-workflow@cedarloom'],
};

for (const { name } of marketplace.plugins) {
  const installed = EXPECTED[name];
  test(`${name} installs alone into an empty config with its dependencies, all enabled`, { skip }, () => {
    assert.ok(installed, `no expected install set for ${name}`);
    const home = mkdtempSync(join(tmpdir(), 'plugin-install-'));
    const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, '.claude'), DISABLE_AUTOUPDATER: '1' };
    const claude = (...args) => {
      const out = spawnSync('claude', ['plugin', ...args], { cwd: home, env, encoding: 'utf8', timeout: 120_000 });
      assert.equal(out.status, 0, `claude plugin ${args.join(' ')}\n${out.stdout}${out.stderr}`);
      return out.stdout;
    };
    try {
      claude('marketplace', 'add', root);
      claude('install', `${name}@${marketplace.name}`);
      // The array starts on its own line; a notice a fresh config prints first stays out of the parse.
      const out = claude('list', '--json');
      // A plugin the calling session loads inline shows up too; only this marketplace's plugins are under test.
      const list = JSON.parse(out.slice(out.search(/^\[/m))).filter((p) => p.id.endsWith(`@${marketplace.name}`));
      assert.deepEqual(list.map((p) => p.id).sort(), installed);
      for (const p of list) assert.equal(p.enabled, true, p.id);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
}
