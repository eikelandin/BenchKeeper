import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { costs, costTable, facts, jobs } from '../skills/coordinate/facts.mjs';

const FIXTURES = fileURLToPath(new URL('./fixtures/facts/', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../skills/coordinate/facts.mjs', import.meta.url));
const RUN = join(FIXTURES, 'run');
const NOW = Date.parse('2026-11-13T12:00:00Z');
const COMMANDS = JSON.parse(readFileSync(join(FIXTURES, 'commands.json'), 'utf8'));

// A fake gh and cswap: each argv, the GraphQL query as <query>, prints its fixture, or fails with its exit code as execFileSync throws.
const fake = (commands) => (cmd, args) => {
  const found = commands[[cmd, ...args.map((a) => (a.startsWith('query=') ? 'query=<query>' : a))].join(' ')];
  if (!found) throw Object.assign(new Error(`not faked: ${cmd} ${args.join(' ')}`), { status: 1, stdout: '', stderr: '' });
  const stdout = found.out === undefined ? '' : JSON.stringify(found.out);
  if (found.exit) throw Object.assign(new Error('exit'), { status: found.exit, stdout, stderr: found.stderr ?? '' });
  return stdout;
};
const write = (commands) => facts({ run: RUN, repos: ['octo/app', 'octo/lib'], approvals: ['octo/app'], accounts: true, now: NOW, exec: fake(commands), alive: (pid) => pid === 4242 });

test('facts: job files, gh and cswap output give the expected facts.md', () => {
  assert.equal(write(COMMANDS), readFileSync(join(FIXTURES, 'facts.md'), 'utf8'));
});

test('facts: a failing gh call reads unread in its own section only', () => {
  const text = write({ ...COMMANDS, 'gh pr list -R octo/app --state open --limit 100 --json number,title,headRefOid,mergeable': { exit: 1, stderr: 'HTTP 502' }, 'cswap list --json': { exit: 1 } });
  assert.ok(text.includes('### octo/app\n\nunread\n\n### octo/lib\n'));
  assert.ok(text.includes('| 20 | feat: lib | 9d9d9d9 | UNKNOWN | none | unread | - |'));
  assert.ok(text.includes('## Accounts\n\nunread\n\n## Main'));
  assert.ok(text.includes('| 41 | cl:ready-for-agent | a | 2026-11-13T09:00Z |'));
});

test('facts: without cswap installed the accounts section reads skipped', () => {
  const missing = (cmd, args) => { if (cmd === 'cswap') throw Object.assign(new Error('spawnSync cswap ENOENT'), { code: 'ENOENT' }); return fake(COMMANDS)(cmd, args); };
  const text = facts({ run: RUN, repos: ['octo/app'], accounts: true, now: NOW, exec: missing, alive: (pid) => pid === 4242 });
  assert.ok(text.includes('## Accounts\n\nSkipped: cswap is not installed.\n\n## Main'));
});

test('facts: an open question with an answer an agent recorded or the owner commented on GitHub loses cl:needs-human and gains cl:ready-for-agent; one without an answer or with another login\'s keeps its labels', () => {
  const edits = [];
  const exec = (cmd, args) => { if (args[0] === 'issue' && args[1] === 'edit') edits.push(args.join(' ')); return fake(COMMANDS)(cmd, args); };
  facts({ run: RUN, repos: ['octo/app'], approvals: ['octo/app'], now: NOW, exec });
  assert.deepEqual(edits, [
    'issue edit 41 -R octo/app --remove-label cl:needs-human --add-label cl:ready-for-agent',
    'issue edit 46 -R octo/app --remove-label cl:needs-human --add-label cl:ready-for-agent',
  ]);
  // A failed edit shows in the row, and the next run tries again.
  const failed = write({ ...COMMANDS, 'gh issue edit 41 -R octo/app --remove-label cl:needs-human --add-label cl:ready-for-agent': { exit: 1 } });
  assert.ok(failed.includes('| 41 | cl:needs-human, label edit failed | a | 2026-11-13T09:00Z |'));
});

test('facts: a Head comment that lands between the open and the recent read voids the answer of an open question', () => {
  const key = 'gh issue list -R octo/app --state all --search updated:>=2026-11-12 --limit 200 --json number,state,labels,comments,author,body';
  const recent = COMMANDS[key].out.map((i) => (i.number === 41 ? { ...i, comments: [...i.comments, { author: { login: 'coordinator' }, authorAssociation: 'OWNER', body: 'Head: abc1234', createdAt: '2026-11-13T11:00:00Z' }] } : i));
  const edits = [];
  const exec = (cmd, args) => { if (args[0] === 'issue' && args[1] === 'edit') edits.push(args.join(' ')); return fake({ ...COMMANDS, [key]: { out: recent } })(cmd, args); };
  facts({ run: RUN, repos: ['octo/app'], approvals: ['octo/app'], now: NOW, exec });
  assert.deepEqual(edits, ['issue edit 46 -R octo/app --remove-label cl:needs-human --add-label cl:ready-for-agent']);
});

test('facts: an open question rejected and closed between the open and the recent read gets no label edit and reads closed', () => {
  const key = 'gh issue list -R octo/app --state all --search updated:>=2026-11-12 --limit 200 --json number,state,labels,comments,author,body';
  const recent = COMMANDS[key].out.map((i) => (i.number === 41 ? { ...i, state: 'CLOSED', comments: [{ ...i.comments[0], body: 'Owner answer (2026-11-13): b. Not needed.' }] } : i));
  const edits = [];
  const exec = (cmd, args) => { if (args[0] === 'issue' && args[1] === 'edit') edits.push(args.join(' ')); return fake({ ...COMMANDS, [key]: { out: recent } })(cmd, args); };
  const text = facts({ run: RUN, repos: ['octo/app'], approvals: ['octo/app'], now: NOW, exec });
  assert.deepEqual(edits, ['issue edit 46 -R octo/app --remove-label cl:needs-human --add-label cl:ready-for-agent']);
  assert.ok(text.includes('| 41 | closed | b | 2026-11-13T09:00Z |'));
});

test('facts costs: per merged pull request the summed job cost and the changes rounds, with totals and medians', () => {
  const found = costs({ run: RUN, repos: ['octo/app', 'octo/lib'], since: '2026-11-12', until: '2026-11-13', exec: fake(COMMANDS) });
  assert.equal(costTable(found), `| PR | Merged | Jobs | Cost (USD) | Fix rounds |
|---|---|---|---|---|
| octo/app#15 | 2026-11-12T08:00Z | 1 | 3.00 | 0 |
| octo/app#12 | 2026-11-13T11:45Z | 4 | 4.50 | 2 |

Totals: 2 pull requests, cost 7.50 USD, fix rounds 2.
Medians per pull request: cost 3.75 USD, fix rounds 1.
`);
  assert.throws(() => costs({ run: RUN, repos: ['octo/other'], since: '2026-11-12', until: '2026-11-13', exec: fake(COMMANDS) }), /unread/);
});

test('facts write: a gh that cannot start still writes facts.md, exit 0; a run folder that is a link or outside .cedarloom/runs is refused', () => {
  const home = mkdtempSync(join(tmpdir(), 'facts-'));
  const runs = join(home, '.cedarloom', 'runs');
  mkdirSync(join(runs, 'real'), { recursive: true });
  symlinkSync(join(runs, 'real'), join(runs, 'link'), 'dir');
  mkdirSync(join(home, 'outside'));
  const empty = mkdtempSync(join(tmpdir(), 'no-gh-'));
  const run = (folder) => spawnSync(process.execPath, [SCRIPT, 'write', '--run', folder, '--repo', 'octo/app'], { cwd: home, encoding: 'utf8', env: { ...process.env, PATH: empty } });

  const ok = run('.cedarloom/runs/real');
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(readFileSync(join(runs, 'real', 'facts.md'), 'utf8').includes('### octo/app\n\nunread\n'));
  for (const folder of ['.cedarloom/runs/link', '.cedarloom/runs/link/', 'outside', '.cedarloom/runs/../../outside']) {
    const refused = run(folder);
    assert.equal(refused.status, 2, folder);
    assert.match(refused.stderr, /^refused: /, folder);
  }
  assert.ok(!existsSync(join(home, 'outside', 'facts.md')));
});

test('facts jobs: a jobs folder or a job file that is a link reads as no job, and a job file in a real folder reads', () => {
  const home = mkdtempSync(join(tmpdir(), 'facts-jobs-'));
  const meta = JSON.stringify({ kind: 'work', pr: 5, startedAt: '2026-11-13T09:00:00Z', endedAt: '2026-11-13T10:00:00Z', exit: 0 });
  mkdirSync(join(home, 'elsewhere', 'jobs'), { recursive: true });
  writeFileSync(join(home, 'elsewhere', 'jobs', 'work-5.meta.json'), meta);
  mkdirSync(join(home, 'linked-folder'));
  symlinkSync(join(home, 'elsewhere', 'jobs'), join(home, 'linked-folder', 'jobs'), 'dir');
  assert.deepEqual(jobs(join(home, 'linked-folder')), []);

  mkdirSync(join(home, 'real', 'jobs'), { recursive: true });
  writeFileSync(join(home, 'real', 'jobs', 'work-6.meta.json'), meta);
  symlinkSync(join(home, 'elsewhere', 'jobs', 'work-5.meta.json'), join(home, 'real', 'jobs', 'work-5.meta.json'));
  assert.deepEqual(jobs(join(home, 'real')).map(({ name, state }) => [name, state]), [['work-5', 'unread'], ['work-6', 'done']]);
});

test('facts: a pull request missing from the review threads answer reads unread, not 0', () => {
  const graphql = 'gh api graphql -f query=<query> -f owner=octo -f name=app';
  const text = write({ ...COMMANDS, [graphql]: { out: { data: { repository: { pullRequests: { nodes: [{ number: 16, reviewThreads: { nodes: [] } }] } } } } } });
  assert.ok(text.includes('| 16 | feat: export \\| csv | 6f6f6f6 | MERGEABLE | 1 pass, 1 pending | 0 | approve (review-16) |'));
  assert.ok(text.includes('| 17 | fix: crash on start | 7a7a7a7 | CONFLICTING | 1 pass, 2 fail | unread | - |'));
});
