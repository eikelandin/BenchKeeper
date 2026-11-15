import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('.claude-plugin/plugin.json', root), 'utf8'));

// Claude Code fills `${user_config.KEY}` in only in a skill's body, and the plugins reference names no other plugin's
// options there: approvals.md, which the coordinator reads as a file, must leave the hub to SKILL.md.
test('options: every one the skills read is declared here, and read only in a SKILL.md body', () => {
  const reads = [];
  for (const file of readdirSync(new URL('skills/', root), { recursive: true }).filter((f) => f.endsWith('.md'))) {
    const body = readFileSync(new URL(`skills/${file}`, root), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
    for (const [, key] of body.matchAll(/\$\{user_config\.(\w+)\}/g)) reads.push(`${file.replaceAll('\\', '/')} ${key}`);
  }
  assert.deepEqual(reads, ['orchestrating-projects/SKILL.md hub', 'orchestrating-projects/SKILL.md issuesIn']);
  for (const read of reads) assert.ok(manifest.userConfig[read.split(' ')[1]], read);
});

// A compaction re-attaches only the first 5,000 tokens of an invoked skill; 15,000 bytes is that at 3 bytes per token.
test('hub: the coordinator still has the hub after a compaction', () => {
  const skill = readFileSync(new URL('skills/orchestrating-projects/SKILL.md', root), 'utf8');
  const at = Buffer.byteLength(skill.slice(0, skill.indexOf('${user_config.hub}')), 'utf8');
  assert.ok(at > 0 && at < 15000, `the hub rule starts at byte ${at}`);
});
