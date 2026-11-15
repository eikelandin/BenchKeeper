import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('.claude-plugin/plugin.json', root), 'utf8'));

// Claude Code fills `${user_config.KEY}` in with this plugin's own options, and only in skill and agent bodies.
test('options: every one the Markdown reads is declared here, and read only where Claude Code fills it in', () => {
  const reads = [];
  for (const dir of ['skills', 'agents']) {
    for (const file of readdirSync(new URL(`${dir}/`, root), { recursive: true }).filter((f) => f.endsWith('.md'))) {
      const body = readFileSync(new URL(`${dir}/${file}`, root), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
      for (const [, key] of body.matchAll(/\$\{user_config\.(\w+)\}/g)) reads.push(`${dir}/${file.replaceAll('\\', '/')} ${key}`);
    }
  }
  assert.deepEqual(reads, ['skills/questions/SKILL.md hub']);
  for (const read of reads) assert.ok(manifest.userConfig[read.split(' ')[1]], read);
});

test('hub: a fresh install has no hub, and the option may stay empty', () => {
  const { type, default: value, required } = manifest.userConfig.hub;
  assert.deepEqual({ type, value, required }, { type: 'string', value: '', required: undefined });
});
