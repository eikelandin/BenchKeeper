import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SKIP, pins, playwrightDrift } from './version-pins.mjs';

test('plugin install lines that name a release tag get the plugins version; app commands and prose stay', () => {
  const text = 'claude plugin marketplace add o/r#cedarloom-v0.1.0, codex plugin marketplace add o/r@cedarloom-v0.1.0. npx @cedarloom/app@6.27.0 and --branch app-v6.27.0 stay; the tag cedarloom-v0.1.0 in prose stays.';
  assert.equal(pins(text, '0.2.0'), 'claude plugin marketplace add o/r#cedarloom-v0.2.0, codex plugin marketplace add o/r@cedarloom-v0.2.0. npx @cedarloom/app@6.27.0 and --branch app-v6.27.0 stay; the tag cedarloom-v0.1.0 in prose stays.');
});

test('files under plugins/ are not rewritten: their pins name the 0.x minor range', () => {
  assert.ok(SKIP.test('plugins/cl-setup/skills/setting-up-projects/SKILL.md'));
  assert.ok(!SKIP.test('README.md'));
});

test('a package whose @playwright/test differs from the dev container is reported', () => {
  const dockerfile = 'npm i -g @playwright/mcp@0.0.83 && npm i -g playwright@1.64.1';
  const pkg = (v) => ({ devDependencies: { '@playwright/test': v } });
  assert.deepEqual(playwrightDrift(dockerfile, { 'web/package.json': pkg('1.64.1'), 'docs/package.json': pkg('1.64.1') }), { image: '1.64.1', drift: [] });
  assert.deepEqual(playwrightDrift(dockerfile, { 'web/package.json': pkg('1.64.1'), 'docs/package.json': pkg('1.65.0') }).drift, ['docs/package.json']);
  assert.deepEqual(playwrightDrift('npm i -g playwright@1.64.1-beta.0', { 'web/package.json': pkg('1.64.1') }).drift, ['web/package.json']);
  assert.equal(playwrightDrift('# was playwright@1.64.1\nRUN npm i -g playwright@1.65.0', {}).image, '1.65.0');
  assert.equal(playwrightDrift('  # RUN npm i -g playwright@1.64.1\nRUN npm i -g playwright@1.65.0', {}).image, '1.65.0');
  assert.equal(playwrightDrift('no version', { 'web/package.json': pkg('1.64.1') }).image, undefined);
  // Docker drops comment lines, then joins continued lines: the version may sit on a later line of the same RUN.
  assert.equal(playwrightDrift('RUN npm i -g --ignore-scripts \\\n  # playwright@1.64.0 was here\n  playwright@1.65.0 && true', {}).image, '1.65.0');
  assert.equal(playwrightDrift('RUN npm i -g --ignore-scripts \\\r\n  # playwright@1.64.0 was here\r\n  playwright@1.65.0 && true', {}).image, '1.65.0');
});
