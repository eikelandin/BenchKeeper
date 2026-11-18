import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SKIP, pins } from './version-pins.mjs';

test('plugin install lines that name a release tag get the plugins version; app commands and prose stay', () => {
  const text = 'claude plugin marketplace add o/r#cedarloom-v0.1.0, codex plugin marketplace add o/r@cedarloom-v0.1.0. npx @cedarloom/app@0.1.0 and --branch app-v0.1.0 stay; the tag cedarloom-v0.1.0 in prose stays.';
  assert.equal(pins(text, '0.2.0'), 'claude plugin marketplace add o/r#cedarloom-v0.2.0, codex plugin marketplace add o/r@cedarloom-v0.2.0. npx @cedarloom/app@0.1.0 and --branch app-v0.1.0 stay; the tag cedarloom-v0.1.0 in prose stays.');
});

test('files under plugins/ are not rewritten: their pins name the 0.x minor range', () => {
  assert.ok(SKIP.test('plugins/cl-repo/skills/setup/SKILL.md'));
  assert.ok(!SKIP.test('README.md'));
});

