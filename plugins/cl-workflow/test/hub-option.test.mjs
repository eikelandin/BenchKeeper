import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('.claude-plugin/plugin.json'));
// Claude Code substitutes options in the skill's body, not in its front matter or the files it links.
const body = read('skills/questions/SKILL.md').replace(/^---\n[\s\S]*?\n---\n/, '');

test('hub: an optional string option, empty by default, so a fresh install has no hub', () => {
  const { type, default: value, required } = manifest.userConfig.hub;
  assert.deepEqual({ type, value, required }, { type: 'string', value: '', required: undefined });
});

test('hub: the questions skill reads the hub from the option alone and stops without one', () => {
  const rule = body.split('\n').find((line) => line.startsWith('`<hub>` below'));
  assert.ok(rule?.includes('taken only from the plugin option `hub`, here `${user_config.hub}`,'), rule);
  assert.ok(rule.includes('empty or anything else means no hub is set'), rule);
  assert.ok(rule.includes('When no hub is set, say so in one line'), rule);
  assert.doesNotMatch(body, /cedarloom-hub\.md/);
});
