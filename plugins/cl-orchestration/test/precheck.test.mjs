import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { check, distinct, pickable, projectsOf, report } from '../skills/coordinate/precheck.mjs';

const POLICY = { startLabel: 'agent-ready', trustedAuthors: ['helper[bot]'] };
const issue = (number, extra = {}) => ({ number, author_association: 'OWNER', user: { login: 'owner' }, labels: [{ name: 'agent-ready' }], ...extra });

test('precheck: picks labeled issues by trusted authors that have no open or merged pull request', () => {
  const issues = [
    issue(1),
    issue(2, { author_association: 'NONE', user: { login: 'stranger' } }),
    issue(3, { author_association: 'NONE', user: { login: 'helper[bot]' } }),
    issue(4, { labels: [{ name: 'other' }] }),
    issue(5, { pull_request: {} }),
    issue(6),
    // GitHub compares label names without case.
    issue(7, { labels: [{ name: 'Agent-Ready' }] }),
  ];
  assert.deepEqual(pickable(POLICY, issues, [{ headRefName: 'fix/6-crash' }, { headRefName: 'feat/16-x' }]), [1, 3, 7]);
  assert.deepEqual(pickable({}, issues, []), []);
  assert.deepEqual(pickable(null, issues, []), []);
});

test('precheck: an issue needs every issues.labels entry', () => {
  const policy = { startLabel: 'agent-ready', issues: { labels: ['project-a'] } };
  const issues = [issue(12, { labels: [{ name: 'agent-ready' }, { name: 'project-a' }] }), issue(14)];
  assert.deepEqual(pickable(policy, issues, []), [12]);
});

test('precheck: an issue that waits for the owner, that a worker holds or that the owner parked does not start, also once it carries the start label', () => {
  const issues = [issue(1), issue(2, { labels: [{ name: 'agent-ready' }, { name: 'CL:Needs-Human' }] }), issue(3, { labels: [{ name: 'cl:needs-human' }, { name: 'agent-ready' }] }), issue(4, { labels: [{ name: 'agent-ready' }, { name: 'cl:in-progress' }] }), issue(5, { labels: [{ name: 'agent-ready' }, { name: 'cl:deferred' }] })];
  assert.deepEqual(pickable(POLICY, issues, []), [1]);
});

test('precheck: the command line takes project paths only, so an option of an old schedule fails instead of being read as a path', () => {
  assert.deepEqual(projectsOf(['/a', '/b']), ['/a', '/b']);
  for (const argv of [['--hub=owner/tracker', '/a'], ['--issues-in', 'repo', '/a']]) assert.throws(() => projectsOf(argv), /--hub|--issues-in/);
});

test('precheck: an issue that several projects list starts in none of them', () => {
  const lists = [
    { dir: '/a', tracker: 'owner/tracker', numbers: [12, 14] },
    { dir: '/b', tracker: 'Owner/Tracker', numbers: [14, 15] },
    // The same number in another repository is another issue.
    { dir: '/c', tracker: 'owner/project', numbers: [12, 15] },
  ];
  assert.deepEqual(distinct(lists), {
    lists: [
      { dir: '/a', tracker: 'owner/tracker', numbers: [12] },
      { dir: '/b', tracker: 'Owner/Tracker', numbers: [15] },
      { dir: '/c', tracker: 'owner/project', numbers: [12, 15] },
    ],
    shared: [{ tracker: 'owner/tracker', number: 14, dirs: ['/a', '/b'] }],
  });
});

test('precheck: the command line prints no issue that several projects list, names the project that fails, and exits 0 only with an issue to pick', () => {
  const lists = { '/a': { tracker: 'owner/tracker', numbers: [14, 12] }, '/b': { tracker: 'owner/tracker', numbers: [14] } };
  // An Escape sequence in a folder name and a right-to-left override in a program's message would rewrite the terminal line.
  const odd = `/c${String.fromCodePoint(0x1b)}[2K`;
  const pick = (dir) => { if (!lists[dir]) throw new Error(`no ${String.fromCodePoint(0x202e)}policy\nsecond line`); return lists[dir]; };
  assert.deepEqual(report(['/a', '/b', odd], pick), { out: ['/a: #12'], err: ['/c?[2K: no ?policy', 'several projects: owner/tracker#14 (/a, /b)'], code: 0 });
  assert.deepEqual(report(['/b', '/a'], (dir) => ({ tracker: 'owner/tracker', numbers: lists[dir].numbers.filter((n) => n === 14) })), { out: [], err: ['several projects: owner/tracker#14 (/b, /a)'], code: 1 });
  assert.deepEqual(report(['/a'], () => ({ tracker: 'owner/project', numbers: [31, 7] })), { out: ['/a: #7 #31'], err: [], code: 0 });
  // A field the reader dropped is named, so a policy that changed meaning does not go quiet.
  assert.deepEqual(report(['/a'], () => ({ tracker: 'owner/project', numbers: [], warnings: [{ rule: 'refused', path: 'issues.repository', message: 'is refused' }] })), { out: [], err: ['/a: refused at issues.repository: is refused'], code: 1 });
});

const calls = [];
const stub = (policy, origin = 'git@github.com:owner/project.git') => (dir, cmd, withSettings) => {
  calls.push([cmd, ...withSettings].join(' '));
  // The command without the -c settings the policy reader puts before it.
  const args = withSettings.filter((a, i) => a !== '-c' && withSettings[i - 1] !== '-c');
  if (args[0] === 'fetch') return '';
  if (args[0] === 'ls-remote') return 'c0ffee0000000000000000000000000000000001\tHEAD\n';
  if (args[0] === 'remote') return `${origin}\n`;
  if (args[0] === 'ls-tree') return policy ? 'docs/agents/orchestration.json\n' : '';
  if (args[0] === 'show') return JSON.stringify(policy);
  if (args[0] === 'api') return JSON.stringify([7, 8, 9, 10].map((n) => [issue(n)]));
  // 7: a closed pull request and an open one from a fork, which anyone can open; 8: an open one of the project; 9: a merged one from a fork; 10: a merged one.
  return JSON.stringify([
    { headRefName: 'feat/10-z', state: 'MERGED', isCrossRepository: false },
    { headRefName: 'feat/8-x', state: 'OPEN', isCrossRepository: false },
    { headRefName: 'feat/7-x', state: 'CLOSED', isCrossRepository: false },
    { headRefName: 'fix/7-x', state: 'OPEN', isCrossRepository: true },
    { headRefName: 'fix/9-y', state: 'MERGED', isCrossRepository: true },
  ]);
};

test('precheck: a policy that names another repository lists the project\'s own issues', () => {
  calls.length = 0;
  assert.deepEqual(check('/p', stub({ ...POLICY, issues: { repository: 'owner/other' } })), [7]);
  assert.ok(calls.includes('gh api --paginate --slurp repos/owner/project/issues?state=open&per_page=100&labels=agent-ready'));
  assert.ok(!calls.some((c) => c.includes('owner/other')));
});

test('precheck: reads the policy from the default branch, skips a project without one and names why the reader rejects one', () => {
  calls.length = 0;
  assert.deepEqual(check('/p', stub(POLICY)), [7]);
  assert.ok(calls.includes('git show c0ffee0000000000000000000000000000000001:docs/agents/orchestration.json'));
  // The issues and pull requests are origin's, whatever gh would resolve through an upstream remote or a set default.
  assert.ok(calls.includes('gh api --paginate --slurp repos/owner/project/issues?state=open&per_page=100&labels=agent-ready'));
  assert.ok(calls.includes('gh pr list -R owner/project --state all --limit 1000 --json headRefName,state,isCrossRepository'));
  calls.length = 0;
  assert.deepEqual(check('/p', stub(null)), []);
  assert.ok(!calls.some((c) => c.startsWith('gh')));
  assert.throws(() => check('/p', stub({ ...POLICY, merge: { mode: 'disjont' }, later: true })), /enum at merge\.mode: .+; unknown-key at later: /);
});

test('precheck: a member or collaborator counts only with write access to the repository, and a failed lookup starts nothing', () => {
  const by = (number, author_association, login) => issue(number, { author_association, user: { login } });
  // A managed user's login ends in _<shortcode>.
  const issues = [by(1, 'MEMBER', 'reader'), by(2, 'COLLABORATOR', 'reader'), by(3, 'MEMBER', 'writer'), by(4, 'COLLABORATOR', 'maintainer'), by(5, 'COLLABORATOR', 'admin'), by(6, 'OWNER', 'owner'), by(7, 'MEMBER', 'mona_acme')];
  // The REST API gives the maintain role as write.
  const roles = { reader: 'read', writer: 'write', maintainer: 'write', admin: 'admin', mona_acme: 'write' };
  const asked = [];
  const run = (fails) => (dir, cmd, args) => {
    if (args[0] !== 'api') return stub(POLICY)(dir, cmd, args);
    if (args[1] === '--paginate') return JSON.stringify([issues]);
    asked.push(args.join(' '));
    if (fails) throw new Error('HTTP 502');
    return JSON.stringify({ permission: roles[args[1].split('/')[4]] });
  };
  assert.deepEqual(check('/p', run(false), {}), [3, 4, 5, 6, 7]);
  assert.ok(asked.includes('api repos/owner/project/collaborators/reader/permission'));
  assert.throws(() => check('/p', run(true), {}), /HTTP 502/);
});

test('precheck: an origin on another host than gh\'s fails instead of listing the github.com repository of the same path', () => {
  for (const origin of ['https://gitlab.com/owner/project.git', 'git@gitlab.com:owner/project.git', 'ssh://git@gitlab.com:2222/owner/project']) {
    calls.length = 0;
    assert.throws(() => check('/p', stub(POLICY, origin), {}), { message: /^origin's URL names the host gitlab\.com, and gh asks github\.com:/ }, origin);
    assert.ok(!calls.some((c) => c.startsWith('gh')), origin);
  }
  // An ssh alias names no host, ssh.github.com is github.com's own, and GH_HOST names the host gh asks.
  assert.deepEqual(check('/p', stub(POLICY, 'work:owner/project'), {}), [7]);
  assert.deepEqual(check('/p', stub(POLICY, 'ssh://git@ssh.github.com:443/owner/project.git'), {}), [7]);
  assert.deepEqual(check('/p', stub(POLICY, 'https://gitlab.com/owner/project.git'), { GH_HOST: 'gitlab.com' }), [7]);
  assert.throws(() => check('/p', stub(POLICY), { GH_HOST: 'gitlab.com' }), { message: /^origin's URL names the host github\.com, and gh asks gitlab\.com:/ });
});

test('precheck: an origin whose host cannot be compared with gh\'s fails, and an ssh alias passes', () => {
  const fails = (origin, why) => {
    calls.length = 0;
    assert.throws(() => check('/p', stub(POLICY, origin), {}), why, origin);
    assert.ok(!calls.some((c) => c.startsWith('gh')), origin);
  };
  // A local path and a file: URL name no host: gh would list the github.com repository of the same path.
  for (const origin of ['/srv/git/owner/project.git', '../owner/project', 'file:///srv/git/owner/project.git', 'file://github.com/owner/project', 'C:/git/owner/project']) fails(origin, /local path/);
  // git and curl end the host at the #, so the fetch goes to evil.example.
  fails('https://evil.example#@github.com/owner/project', /evil\.example/);
  fails('https://evil.example?@github.com/owner/project', /evil\.example/);
  fails('https://evil.example@other.example@github.com/owner/project', /./);
  fails('git@github.com-work.evil.example:owner/project.git', /evil\.example/);
  // The error names the host and nothing of a credential.
  for (const origin of ['https://user:s3cret@gitlab.com/owner/project.git', 'https://user:s3@cret@gitlab.com/owner/project.git', 'https://user:s3/cret@gitlab.com/owner/project.git']) {
    fails(origin, (e) => !/s3|cret|user/.test(e.message));
  }
  // An alias of ~/.ssh/config: a name without a dot, or gh's host with a suffix, as in the accounts of one user.
  for (const origin of ['git@github.com-work:owner/project.git', 'github.com-work:owner/project', 'git@work:owner/project.git']) assert.deepEqual(check('/p', stub(POLICY, origin), {}), [7], origin);
});

test('precheck and policy: started through a symlinked folder they still run, so no project means exit 1, not a silent 0', () => {
  // Exit 0 means "there is an issue to pick" or "here is the policy": a guard that skipped the command line would start every scheduled run.
  const real = realpathSync(fileURLToPath(new URL('../skills/coordinate', import.meta.url)));
  const link = join(mkdtempSync(join(tmpdir(), 'cl-precheck-')), 'link');
  symlinkSync(real, link, 'dir');
  for (const dir of [real, link]) for (const script of ['precheck.mjs', 'policy.mjs']) assert.equal(spawnSync(process.execPath, [join(dir, script)]).status, 1, join(dir, script));
});
