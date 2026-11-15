import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('.claude-plugin/plugin.json'));
const SKILL = 'skills/orchestrating-projects/';

// A plugin's skills see only its own options, so the coordinator declares the hub itself next to cl-workflow's.
test('hub: an optional string option, empty by default, so a fresh install has no hub', () => {
  const { type, default: value, required } = manifest.userConfig.hub;
  assert.deepEqual({ type, value, required }, { type: 'string', value: '', required: undefined });
});

// Claude Code substitutes options in the skill's body only, so approvals.md defers to SKILL.md for the value.
test('hub: SKILL.md reads it from the option, approvals.md files without one in the project tracker', () => {
  const skill = read(`${SKILL}SKILL.md`).replace(/^---\n[\s\S]*?\n---\n/, '');
  const approvals = read(`${SKILL}approvals.md`);
  assert.match(skill, /taken only from the plugin option `hub`, here `\$\{user_config\.hub\}`,/);
  assert.doesNotMatch(approvals, /user_config|cedarloom-hub\.md/);
  assert.match(approvals, /^1\. \*\*The hub\.\*\* .*\[SKILL\.md\]\(SKILL\.md#owner-decisions\) reads from the plugin option `hub`/m);
  assert.match(approvals, /^2\. \*\*No hub set\*\*: the project's tracker, `issues\.repository`, else `<owner\/repo>`\.$/m);
});
