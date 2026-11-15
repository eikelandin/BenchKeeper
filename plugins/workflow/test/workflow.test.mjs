import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (name) => readFileSync(new URL(`../skills/workflow/${name}`, import.meta.url), 'utf8');
const skill = read('SKILL.md');
const software = read('software.md');

test('workflow: a quick software change needs only SKILL.md', () => {
  // Picking the depth needs every change type, so the whole table and Verify live in SKILL.md, and only there.
  for (const row of ['| Docs, typo |', '| Bug |', '| Feature, performance |', '| CI fix |']) assert.ok(skill.includes(row), row);
  assert.match(skill, /^## Change types$/m);
  assert.match(skill, /^## Verify$/m);
  assert.doesNotMatch(software, /^## (Change types|Verify)$/m);
  // Every line that links the playbooks is about standard or deep work.
  const linking = skill.split('\n').filter((l) => /\]\((software|deep)\.md/.test(l));
  assert.ok(linking.length > 0);
  for (const line of linking) assert.match(line, /Standard and deep|^ *\| deep \|/, line);
  // A risky change keeps the review before pushing in software.md, whatever depth the user picked.
  assert.match(skill, /Standard and deep, and any risky change: also \[software\.md\]/);
});

test('workflow: the depth table keeps the change-type floors', () => {
  // The two-column rows of step 1; the steps table of step 3 has more cells.
  const when = (depth) => skill.match(new RegExp(`^ *\\| ${depth} \\| ([^|\\n]*) \\|$`, 'm'))?.[1] ?? '';
  assert.match(when('standard'), /at least standard: a bug,/);
  assert.match(when('deep'), /always deep: a schema migration,/);
});
