import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('.claude-plugin/plugin.json', root), 'utf8'));

// Claude Code fills `${user_config.KEY}` in with this plugin's own options, never cl-workflow's, and only in a
// skill's body: approvals.md, which the coordinator reads as a file, must leave the hub to SKILL.md.
test('options: every one the skills read is declared here, and read only in a SKILL.md body', () => {
  const reads = [];
  for (const file of readdirSync(new URL('skills/', root), { recursive: true }).filter((f) => f.endsWith('.md'))) {
    const body = readFileSync(new URL(`skills/${file}`, root), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
    for (const [, key] of body.matchAll(/\$\{user_config\.(\w+)\}/g)) reads.push(`${file.replaceAll('\\', '/')} ${key}`);
  }
  assert.deepEqual(reads, ['orchestrating-projects/SKILL.md hub']);
  for (const read of reads) assert.ok(manifest.userConfig[read.split(' ')[1]], read);
});

test('hub: a fresh install has no hub, so approvals go to the project tracker', () => {
  const { type, default: value, required } = manifest.userConfig.hub;
  assert.deepEqual({ type, value, required }, { type: 'string', value: '', required: undefined });
});
