import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { appVersion, contentRefusal } from '../src/content.mjs';
import { newer, updateNotice } from '../src/update.mjs';

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

test('runtime dependencies are exact', () => {
  const pkg = json('../package.json');
  for (const [name, v] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) assert.match(v, /^\d+\.\d+\.\d+$/, name);
});

test('update check: shown when newer, silent when off, offline or older', async () => {
  assert.equal(newer('6.1.0', '6.0.9'), true);
  assert.equal(newer('6.0.0', '6.0.0'), false);
  assert.equal(newer('5.9.9', '6.0.0'), false);
  const old = '2020-01-01T00:00:00Z', fresh = new Date(Date.now() - 864e5).toISOString();
  const reply = (version, ok = true, at = old) => async () => ({ ok, json: async () => ({ time: { '6.0.0': old, [version]: at }, versions: { '6.0.0': {}, [version]: {} } }) });
  assert.match(await updateNotice('6.0.0', {}, reply('6.1.0')), /@cedarloom\/app 6\.1\.0 is available .*npx @cedarloom\/app@6\.1\.0/);
  assert.equal(await updateNotice('6.0.0', {}, reply('6.0.0')), null);
  assert.equal(await updateNotice('6.0.0', {}, reply('7.0.0', false)), null);
  assert.equal(await updateNotice('6.0.0', {}, reply('7.0.0-rc.1')), null);
  // The 7-day cooldown of the host tools applies to the notice too, and a time that is no string never counts.
  assert.equal(await updateNotice('6.0.0', {}, reply('6.1.0', true, fresh)), null);
  assert.equal(await updateNotice('6.0.0', {}, reply('6.1.0', true, 5)), null);
  assert.equal(await updateNotice('6.0.0', {}, async () => { throw new Error('offline'); }), null);
  let asked = false;
  assert.equal(await updateNotice('6.0.0', { CEDARLOOM_APP_NO_UPDATE_CHECK: '1' }, async () => { asked = true; }), null);
  assert.equal(asked, false);
});

test('content.json: minApp is not above the app', () => {
  const c = json('../../plugins/cedarloom/content.json');
  assert.equal(c.schemaVersion, 1);
  const plugins = new URL('../../plugins/', import.meta.url);
  // App and content release separately: an app patch release leaves the content version behind and still fits.
  const [major, minor, patch] = appVersion.split('.').map(Number);
  assert.match(c.minApp, /^\d+\.\d+\.\d+$/);
  for (const v of [appVersion, `${major}.${minor}.${patch + 1}`]) assert.equal(contentRefusal(fileURLToPath(new URL('cedarloom/', plugins)), v), null, v);
});
