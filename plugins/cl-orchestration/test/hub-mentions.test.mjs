import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hubMentions, mentions } from '../skills/orchestrating-projects/hub-mentions.mjs';

const clean = {
  title: 'fix: keep the cache on reload',
  body: 'The cache survives a reload.',
  headRefName: 'fix/cache-reload',
  commits: [{ oid: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', messageHeadline: 'fix: keep the cache on reload', messageBody: '' }],
};

test('hub mentions: a pull request that names the hub anywhere, its URLs too, is refused part by part', () => {
  const named = {
    title: 'fix: owner/hub#12',
    body: 'Closes https://github.com/Owner/Hub/issues/12',
    headRefName: 'fix/owner/hub-12',
    commits: [...clean.commits, { oid: 'ffeeddccbbaa99887766554433221100ffeeddcc', messageHeadline: 'chore: tidy', messageBody: 'See owner/hub#12.' }],
  };
  assert.deepEqual(mentions('owner/hub', named), ['title', 'body', 'branch', 'commit ffeeddccbbaa']);
});

test('hub mentions: a clean pull request passes, and another repository of the same owner is no hit', () => {
  assert.deepEqual(mentions('owner/hub', clean), []);
  assert.deepEqual(mentions('owner/hub', { ...clean, body: 'Follows owner/project#3.' }), []);
  const asked = [];
  assert.deepEqual(hubMentions('owner/hub', 'owner/project', '7', (dir, cmd, args) => { asked.push([cmd, ...args].join(' ')); return JSON.stringify(clean); }), []);
  assert.deepEqual(asked, ['gh pr view 7 -R owner/project --json title,body,headRefName,commits']);
});
