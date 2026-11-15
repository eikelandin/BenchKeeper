import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SKIP, nodeDrift, pins, playwrightDrift, pnpmDrift } from './version-pins.mjs';

test('plugin install lines that name a release tag get the plugins version; app commands and prose stay', () => {
  const text = 'claude plugin marketplace add o/r#cedarloom-v0.1.0, codex plugin marketplace add o/r@cedarloom-v0.1.0. npx @cedarloom/app@6.27.0 and --branch app-v6.27.0 stay; the tag cedarloom-v0.1.0 in prose stays.';
  assert.equal(pins(text, '0.2.0'), 'claude plugin marketplace add o/r#cedarloom-v0.2.0, codex plugin marketplace add o/r@cedarloom-v0.2.0. npx @cedarloom/app@6.27.0 and --branch app-v6.27.0 stay; the tag cedarloom-v0.1.0 in prose stays.');
});

test('files under plugins/ are not rewritten: their pins name the 0.x minor range', () => {
  assert.ok(SKIP.test('plugins/cl-setup/skills/operating-cedarloom-app/SKILL.md'));
  assert.ok(!SKIP.test('README.md'));
});

test('a package whose @playwright/test differs from the dev container is reported', () => {
  const dockerfile = 'npm i -g @playwright/mcp@0.0.83 && npm i -g playwright@1.64.1';
  const pkg = (v) => ({ devDependencies: { '@playwright/test': v } });
  assert.deepEqual(playwrightDrift(dockerfile, { 'web/package.json': pkg('1.64.1'), 'packages/ui/package.json': pkg('1.64.1') }), { image: '1.64.1', drift: [] });
  assert.deepEqual(playwrightDrift(dockerfile, { 'web/package.json': pkg('1.64.1'), 'packages/ui/package.json': pkg('1.65.0') }).drift, ['packages/ui/package.json']);
  assert.deepEqual(playwrightDrift('npm i -g playwright@1.64.1-beta.0', { 'web/package.json': pkg('1.64.1') }).drift, ['web/package.json']);
  assert.equal(playwrightDrift('# was playwright@1.64.1\nRUN npm i -g playwright@1.65.0', {}).image, '1.65.0');
  assert.equal(playwrightDrift('  # RUN npm i -g playwright@1.64.1\nRUN npm i -g playwright@1.65.0', {}).image, '1.65.0');
  assert.equal(playwrightDrift('no version', { 'web/package.json': pkg('1.64.1') }).image, undefined);
});

test('the dev container pnpm must equal the pnpm .github/pnpm pins for CI', () => {
  const dockerfile = '# RUN npm i -g pnpm@12.0.0 was here\nRUN npm i -g --ignore-scripts --prefix /usr/local pnpm@12.16.1 && npm cache clean --force';
  assert.deepEqual(pnpmDrift(dockerfile, '12.16.1'), { image: '12.16.1', drift: false });
  assert.deepEqual(pnpmDrift(dockerfile, '12.17.0'), { image: '12.16.1', drift: true });
  assert.deepEqual(pnpmDrift('no pnpm', '12.16.1'), { image: undefined, drift: true });
  // Docker drops comment lines, then joins continued lines: the version may sit on a later line of the same RUN.
  assert.equal(pnpmDrift('RUN npm i -g --ignore-scripts \\\n  # pnpm@11.0.0 was here\n  pnpm@12.16.1 && npm cache clean --force', '12.16.1').image, '12.16.1');
  assert.equal(pnpmDrift('RUN npm i -g --ignore-scripts \\\r\n  # pnpm@11.0.0 was here\r\n  pnpm@12.16.1 && npm cache clean --force', '12.16.1').image, '12.16.1');
});

test('the dev container Node must equal NODE_VERSION of cedarloom.yml', () => {
  const dockerfile = '# node:26.12.0-bookworm-slim was here\nFROM docker.io/library/node:26.13.0-bookworm-slim@sha256:bc0a AS base\nRUN true';
  const workflow = 'env:\n  # Bumped by hand\n  NODE_VERSION: 26.13.0\n  TYPOS_VERSION: 1.51.1\n';
  assert.deepEqual(nodeDrift(dockerfile, workflow), { image: '26.13.0', ci: '26.13.0', drift: false });
  assert.deepEqual(nodeDrift(dockerfile, workflow.replace('26.13.0', '26.14.0')), { image: '26.13.0', ci: '26.14.0', drift: true });
  // A FROM line without the tag's suffix, or none at all, is drift too: the check must not pass silently.
  assert.equal(nodeDrift('FROM docker.io/library/node:26.13.0@sha256:bc0a', workflow).drift, true);
  assert.equal(nodeDrift('FROM docker.io/library/node:26.13.0-bookworm-slim', 'env: {}').drift, true);
  // Quotes and a trailing comment around NODE_VERSION do not count.
  for (const line of ['NODE_VERSION: "26.13.0"', "NODE_VERSION: '26.13.0'  # bumped by hand", 'NODE_VERSION: 26.13.0 # bumped by hand']) {
    assert.equal(nodeDrift(dockerfile, `env:\n  ${line}\n`).ci, '26.13.0', line);
  }
});
