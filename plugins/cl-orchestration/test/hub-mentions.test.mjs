import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { hubMentions, mentions } from '../skills/orchestrating-projects/hub-mentions.mjs';

const HEAD = 'ffeeddccbbaa99887766554433221100ffeeddcc';
const clean = {
  title: 'fix: keep the cache on reload',
  body: 'The cache survives a reload.',
  headRefName: 'fix/cache-reload',
  commits: [{ oid: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', message: 'fix: keep the cache on reload' }],
};
// The REST answers for a pull request: its own record, and its commits page by page as --slurp gives them.
const rest = (commits, total = commits.length) => ({
  pr: { title: clean.title, body: clean.body, head: { ref: clean.headRefName, sha: commits.at(-1).sha }, commits: total },
  pages: [commits.slice(0, 100), commits.slice(100)].filter((page) => page.length),
});
const commit = (sha, message) => ({ sha, commit: { message } });

test('hub mentions: a pull request that names the hub anywhere, its URLs too, is refused part by part, in any case', () => {
  const named = {
    title: 'fix: owner/tracker#12',
    body: 'Closes https://github.com/owner/tracker/issues/12',
    headRefName: 'fix/OWNER/TRACKER/12',
    commits: [...clean.commits, { oid: HEAD, message: 'chore: tidy\n\nSee owner/tracker#12.' }],
  };
  assert.deepEqual(mentions('Owner/Tracker', named), ['title', 'body', 'branch', 'commit ffeeddccbbaa']);
});

test('hub mentions: encoded forms and the name before an issue number are hits, a longer name is none', () => {
  const hits = ['https://github.com/search?q=repo%3Aowner%2Ftracker', 'repo%253Aowner%252Ftracker', 'owner&#47;tracker', 'owner&#x2F;tracker', 'owner&sol;tracker', 'owner\\/tracker', 'see tracker#12', 'owner/tracker.git', 'Read owner/tracker.',
    'Clone it from https://github.com/owner/tracker.git.', 'Run git clone git@github.com:owner/tracker.git. Then build.', 'The task list is _owner/tracker_.', 'See __owner/tracker__ for the task.', 'https://github.com/owner/tracker.wiki.git'];
  for (const body of hits) assert.deepEqual(mentions('owner/tracker', { ...clean, body }), ['body'], body);
  const others = ['owner/tracker-cli', 'owner/tracker_x', 'owner/tracker.github.io', 'myowner/tracker', 'other/tracker#12', 'Bugtracker#12', 'Follows owner/project#3.'];
  for (const body of others) assert.deepEqual(mentions('owner/tracker', { ...clean, body }), [], body);
});

test('hub mentions: a text encoded more than three times over is no answer', () => {
  // 125,000 layers in 250 kB, as a commit message may hold.
  assert.throws(() => mentions('owner/tracker', { ...clean, body: `owner%${'25'.repeat(125000)}2Ftracker` }), /encoded more than 3 times over/);
});

test('hub mentions: a hub that is not a plain owner/name refuses every pull request', () => {
  for (const hub of ['', '${user_config.hub}', 'https://github.com/owner/tracker', 'owner/tracker ', 'owner']) assert.throws(() => mentions(hub, clean), /plain owner\/name/, hub);
});

test('hub mentions: every commit is read in full, page by page, and a count or head that differs is no answer', () => {
  // 101 commits: the second page holds the head, whose subject GitHub's headline cuts at 69 characters.
  const commits = [...Array.from({ length: 100 }, (_, i) => commit(`${String(i).padStart(4, '0')}${'0'.repeat(36)}`, 'chore: tidy')), commit(HEAD, 'fix: keep the cache on reload after the session restores it (owner/tracker#12)')];
  const answer = ({ pr, pages }) => {
    const asked = [];
    const run = (dir, cmd, args) => { asked.push([cmd, ...args].join(' ')); return JSON.stringify(args.includes('--paginate') ? pages : pr); };
    return { run, asked };
  };
  const { run, asked } = answer(rest(commits));
  assert.deepEqual(hubMentions('owner/tracker', 'owner/project', '7', run), ['commit ffeeddccbbaa']);
  assert.deepEqual(asked, ['gh api repos/owner/project/pulls/7', 'gh api --paginate --slurp repos/owner/project/pulls/7/commits?per_page=100']);
  // GitHub lists 250 commits at most: a longer pull request reads fewer than it counts.
  assert.throws(() => hubMentions('owner/tracker', 'owner/project', '7', answer(rest(commits, 251)).run), /read 101 of the pull request's 251 commits/);
  const moved = rest(commits);
  moved.pr.head.sha = 'b'.repeat(40);
  assert.throws(() => hubMentions('owner/tracker', 'owner/project', '7', answer(moved).run), /not among them/);
});

test('hub mentions: the command line exits 0 clean, 1 on a hit, 2 when it cannot tell', () => {
  const script = fileURLToPath(new URL('../skills/orchestrating-projects/hub-mentions.mjs', import.meta.url));
  const bin = mkdtempSync(join(tmpdir(), 'bk-hub-mentions-'));
  const run = (gh, ...args) => {
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\n${gh}\n`, { mode: 0o755 });
    return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  };
  const answers = (commits) => {
    const { pr, pages } = rest(commits);
    writeFileSync(join(bin, 'pr.json'), JSON.stringify(pr));
    writeFileSync(join(bin, 'commits.json'), JSON.stringify(pages));
    return `case "$*" in *--paginate*) cat '${bin}/commits.json' ;; *) cat '${bin}/pr.json' ;; esac`;
  };
  const args = ['owner/tracker', 'owner/project', '7'];
  assert.equal(run(answers([commit(HEAD, 'fix: keep the cache on reload')]), ...args).status, 0);
  const hit = run(answers([commit(HEAD, 'fix: owner/tracker#12')]), ...args);
  assert.deepEqual([hit.status, hit.stdout], [1, 'names the hub: commit ffeeddccbbaa\n']);
  assert.equal(run('exit 1', ...args).status, 2);
  assert.equal(run('echo not json', ...args).status, 2);
  const gh = answers([commit(HEAD, 'fix: owner/tracker#12')]);
  for (const bad of [['', 'owner/project', '7'], ['owner/tracker', 'owner/project', 'x'], ['owner/tracker', 'owner/project']]) assert.equal(run(gh, ...bad).status, 2, bad.join(' '));
});
