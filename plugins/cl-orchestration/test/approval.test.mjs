import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { answer, missing } from '../skills/coordinate/approval.mjs';

const SKILL = '../skills/coordinate/';
const WHAT = 'What: Approve the design of the streamed export (plan: docs/plans/export.md).';
const MERGES = '| Merges | the coordinator after green checks; .github stays for the owner |';
const COST = '| Cost | 2 worker sessions, about 3 hours (unverified) |';
const STREAM = '| (a) Stream the export (Recommended) | Both PRs start | More code to review |';
const HOLD = '| (b) Hold | Nothing changes | The export stays slow |';
const RECOMMENDED = 'Recommended: (a) Stream the export, because its memory use stays flat for any row count';
const WHY = 'Why now: issue 12 waits on it.';
const FILLED = `${WHAT}

Context: Exports of more than 200,000 rows fail, as the export builds the whole file in memory.

| Option | Impact | Trade-off |
|---|---|---|
${STREAM}
${HOLD}

${RECOMMENDED}
Source: docs/plans/export.md
Confidence: high
${WHY}

| Approval | |
|---|---|
| Work if approved | 2 PRs, each under 1,000 lines, in owner/project; the reader first |
| Runs on | opus xhigh; phases: plan opus high, implement opus high, test sonnet high, review opus high, depth xhigh |
| Review | fresh reviewer per PR at xhigh, plus the security review |
${MERGES}
| Owner steps | none |
${COST}
| Undo | revert each PR |

Answer: comment "a", "b" or free text, or run /cl-workflow:questions
`;

// A variant must differ from the filled text, or its case would pass on the text that passes.
const swap = (from, to) => { assert.ok(FILLED.includes(from), from); return FILLED.replace(from, to); };
const NO_COST = swap(`${COST}\n`, '');
const APPROVAL = FILLED.slice(FILLED.indexOf('| Approval | |'), FILLED.indexOf('\n\nAnswer:'));

const CASES = [
  ['the filled text', FILLED, []],
  ['CRLF line endings', FILLED.replaceAll('\n', '\r\n'), []],
  ['an escaped pipe in a cell', swap('(a) Stream the export (Recommended)', '(a) Stream the export \\| CSV (Recommended)'), []],
  ['a URL autolink in a cell', swap('| Undo | revert each PR |', '| Undo | revert each PR, see <https://example.com/plan> |'), []],
  ['no Cost row', NO_COST, ['Cost']],
  ['an empty Merges cell', swap(MERGES, '| Merges | |'), ['Merges']],
  ['a placeholder left in Runs on', swap('test sonnet high', 'test <model effort>'), ['Runs on']],
  ['a cell without a letter or digit', swap(COST, '| Cost | ? |'), ['Cost']],
  ['a cell that only defers', swap(COST, '| Cost | TBD |'), ['Cost']],
  ['an entity as a cell', swap(COST, '| Cost | &nbsp; |'), ['Cost']],
  ['an HTML comment as a cell', swap(COST, '| Cost | <!-- tbd --> |'), ['Cost']],
  ['an HTML comment over two lines as a cell', swap(COST, '| Cost | <!-- 2 worker\nsessions --> |'), ['Cost']],
  ['a link without text as a cell', swap(COST, '| Cost | [](x) |'), ['Cost']],
  ['a deferral in bold', swap(COST, '| Cost | **TBD** |'), ['Cost']],
  ['a deferral with a full stop', swap(COST, '| Cost | tbd. |'), ['Cost']],
  ['a cell that says todo', swap(COST, '| Cost | TODO |'), ['Cost']],
  ['a closing tag as a cell', swap(COST, '| Cost | </b> |'), ['Cost']],
  ['a deferral in brackets', swap(COST, '| Cost | (TBD) |'), ['Cost']],
  ['a deferral as a link text', swap(COST, '| Cost | [TBD](x) |'), ['Cost']],
  ['a deferral as a link text whose target holds a bracket', swap(COST, '| Cost | [TBD](x]y) |'), ['Cost']],
  ['a deferral after a zero-width space', swap(COST, '| Cost | ​TBD |'), ['Cost']],
  ['the Approval table inside a multi-line HTML comment', swap(APPROVAL, `<!--\n${APPROVAL}\n-->`),
    ['Work if approved', 'Runs on', 'Review', 'Merges', 'Owner steps', 'Cost', 'Undo']],
  ['a Recommended line that names another option than the first', swap(RECOMMENDED, 'Recommended: (b) Hold, because nothing else changes'), ['Recommended']],
  ['a second Recommended line that names another option', swap(RECOMMENDED, `${RECOMMENDED}\nRecommended: (b) Hold, because nothing else changes`), ['Recommended']],
  ['no Recommended line', swap(`${RECOMMENDED}\n`, ''), ['Recommended']],
  ['no Context line', swap('Context: Exports', 'Exports'), ['Context']],
  ['no Source line', swap('Source: docs/plans/export.md\n', ''), ['Source']],
  ['a placeholder as Confidence', swap('Confidence: high', 'Confidence: <high, medium or low>'), ['Confidence']],
  ['no Answer line', swap('Answer: comment', 'Comment'), ['Answer']],
  ['a second Approval table with an empty row', `${FILLED}\n| Approval | |\n|---|---|\n| Cost | |\n`, ['Cost']],
  ['a row twice, once empty', swap(COST, `| Cost | |\n${COST}`), ['Cost']],
  ['no What line', swap(`${WHAT}\n`, ''), ['What']],
  ['a placeholder as What', swap(WHAT, 'What: <the decision in one sentence>'), ['What']],
  ['no Why now line', swap(`${WHY}\n`, ''), ['Why now']],
  ['a placeholder as Why now', swap(WHY, 'Why now: <what waits on it>'), ['Why now']],
  ['one option row', swap(`${HOLD}\n`, ''), ['Options']],
  ['no option marked', swap(' (Recommended)', ''), ['Options']],
  ['the marked option not first', swap(`${STREAM}\n${HOLD}`, `${HOLD}\n${STREAM}`), ['Options']],
  ['two options marked', swap('| (b) Hold |', '| (b) Hold (Recommended) |'), ['Options']],
  ['a placeholder in the options table', swap('| More code to review |', '| <trade-off> |'), ['Options']],
  ['an option without Impact', swap(HOLD, '| (b) Hold | | The export stays slow |'), ['Options']],
  ['an option without Trade-off', swap(HOLD, '| (b) Hold | Nothing changes | |'), ['Options']],
  ['two options with one label', swap('| (b) Hold |', '| (a) Hold |'), ['Options']],
  ['two options with one label in two cases', swap('| (b) Hold |', '| (A) Hold |'), ['Options']],
  ['an option without a label', swap('| (b) Hold |', '| Hold |'), ['Options']],
  ['front matter left in', `---\nlabels: cl:needs-human\n---\n\n${FILLED}`, ['Front matter']],
  // Every part of the template holds a placeholder: the Answer line depends on where the issue lands.
  ['the unfilled template', readFileSync(new URL(`${SKILL}approval-template.md`, import.meta.url), 'utf8'),
    ['What', 'Context', 'Recommended', 'Source', 'Confidence', 'Work if approved', 'Runs on', 'Review', 'Merges', 'Owner steps', 'Cost', 'Undo', 'Options', 'Why now', 'Answer']],
];

// A comment as `gh issue view --json comments` prints it.
const said = (body, createdAt, authorAssociation = 'OWNER') => ({ author: { login: 'owner' }, authorAssociation, body, createdAt });

for (const [name, text, expected] of CASES) test(`approval: ${name} lacks ${expected.join(', ') || 'nothing'}`, () => assert.deepEqual(missing(text), expected));

test('approval: the command line exits 0 for a filled approval and 1 with the missing row on stderr', () => {
  const script = fileURLToPath(new URL(`${SKILL}approval.mjs`, import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'cl-approval-'));
  mkdirSync(join(dir, '.cedarloom/runs/r1'), { recursive: true });
  const run = (name, text, ...mode) => { writeFileSync(join(dir, '.cedarloom/runs/r1', name), text); return spawnSync(process.execPath, [script, ...mode, `.cedarloom/runs/r1/${name}`], { cwd: dir, encoding: 'utf8' }); };
  assert.equal(run('filled.md', FILLED).status, 0);
  const lacking = run('no-cost.md', NO_COST);
  assert.equal(lacking.status, 1);
  assert.match(lacking.stderr, /\bCost\b/);
  // The answer of a filed approval: printed with exit 0, a format character of its text escaped; exit 1 while there is none.
  const answered = run('answered.json', JSON.stringify({ body: FILLED, comments: [said('Owner answer (2026-11-11): b. Hold\u202E it.', '2026-11-11T10:00:00Z')] }), 'answer');
  assert.equal(answered.status, 0, answered.stderr);
  assert.ok(!answered.stdout.includes('\u202E'));
  assert.deepEqual(JSON.parse(answered.stdout), { option: 'b', text: 'Hold\u202E it.', at: '2026-11-11T10:00:00Z' });
  const open = run('open.json', JSON.stringify({ body: FILLED, comments: [] }), 'answer');
  assert.deepEqual([open.status, open.stdout], [1, '']);
  // No answer yet is exit 1; a file that cannot be read as an issue is exit 2, so that an error never reads as "keep waiting".
  const errors = [run('cut.json', '{ "comments": [', 'answer'), run('no-body.json', '{ "comments": [] }', 'answer'), run('other.json', '{ "labels": [] }', 'answer'), spawnSync(process.execPath, [script, 'answer', join(dir, 'absent.json')], { encoding: 'utf8' }), spawnSync(process.execPath, [script, 'answer'], { cwd: dir, encoding: 'utf8' })];
  for (const r of errors) {
    assert.deepEqual([r.status, r.stdout], [2, '']);
    assert.equal(r.stderr.trim().split('\n').length, 1, r.stderr);
  }
});

const HEAD = `Head: ${'a'.repeat(40)}\n\nThe worker fixed both findings.`;
const FIRST = said('Owner answer (2026-11-10): b. Not before the release.', '2026-11-10T09:00:00Z');
const SECOND = said('Owner answer (2026-11-11): a. Go ahead, and keep the old flag.', '2026-11-11T10:00:00Z');
const GO = { option: 'a', text: 'Go ahead, and keep the old flag.', at: '2026-11-11T10:00:00Z' };
const WORDS = FILLED.replace('| (a) Stream the export (Recommended) |', '| (ok) Stream the export (Recommended) |').replace('| (b) Hold |', '| (hold) Hold |');
const ANSWERS = [
  ['an owner\'s answer is read', [said('The plan looks fine to me.', '2026-11-11T09:00:00Z', 'COLLABORATOR'), SECOND], GO],
  ['a member\'s answer is read when the member has write access', [{ ...SECOND, authorAssociation: 'MEMBER' }], GO, FILLED, (login) => login === 'owner'],
  ['a member\'s answer without write access is none', [{ ...SECOND, authorAssociation: 'MEMBER' }], null, FILLED, () => false],
  ['a collaborator\'s answer is none', [{ ...SECOND, authorAssociation: 'COLLABORATOR' }], null],
  ['an answer with a head comment after it is none', [SECOND, said(HEAD, '2026-11-11T11:00:00Z')], null],
  ['a collaborator\'s head comment after an answer voids nothing', [SECOND, { ...said(HEAD, '2026-11-11T11:00:00Z', 'COLLABORATOR'), author: { login: 'stranger' } }], GO],
  ['the head comment of the approval\'s author as a collaborator voids the answer', [SECOND, said(HEAD, '2026-11-11T11:00:00Z', 'COLLABORATOR')], null],
  ['an answer after the head comment is read', [said(HEAD, '2026-11-11T08:00:00Z'), SECOND], GO],
  ['the newest of two answers is read', [FIRST, SECOND], GO],
  ['an answer without free text is read', [said('Owner answer (2026-11-11): a', '2026-11-11T10:00:00Z')], { option: 'a', text: '', at: '2026-11-11T10:00:00Z' }],
  ['no comments are no answer', [], null],
  ['the answer text later in a comment is none', [said('As I wrote: Owner answer (2026-11-11): a. Go ahead.', '2026-11-11T10:00:00Z')], null],
  ['a later comment that quotes an answer does not hide the answer', [SECOND, said('Thanks. You wrote: Owner answer (2026-11-10): b.', '2026-11-11T12:00:00Z')], GO],
  ['comments out of order are read by their time', [SECOND, FIRST], GO],
  ['an option\'s name alone is none', [said('Stream the export', '2026-11-11T10:00:00Z')], null],
  ['a letter alone is read, in any case', [said('B', '2026-11-11T10:00:00Z')], { option: 'b', text: '', at: '2026-11-11T10:00:00Z' }],
  ['a label alone is read', [FIRST, said('(a)', '2026-11-11T10:00:00Z')], { option: 'a', text: '', at: '2026-11-11T10:00:00Z' }],
  ['a label or letter with a full stop is read', [said(' (B).\n', '2026-11-11T10:00:00Z')], { option: 'b', text: '', at: '2026-11-11T10:00:00Z' }],
  ['a letter that two labels share in two cases is none', [said('a', '2026-11-11T10:00:00Z')], null, FILLED.replace('| (b) Hold |', '| (A) Hold |')],
  ['a letter whose label is also the Kelvin sign is none', [said('k', '2026-11-11T10:00:00Z')], null, FILLED.replace('| (a) Stream the export (Recommended) |', '| (k) Stream the export (Recommended) |').replace('| (b) Hold |', '| (K) Hold |')],
  ['a label of more than one character is read', [said('(OK)', '2026-11-11T10:00:00Z')], { option: 'ok', text: '', at: '2026-11-11T10:00:00Z' }, WORDS],
  ['the bare text of a label of more than one character is none', [said('ok', '2026-11-11T10:00:00Z')], null, WORDS],
  ['a label of an option table inside an HTML comment is none', [said('c', '2026-11-11T10:00:00Z')], null,
    FILLED.replace('| Option |', '<!--\n| Option | What happens |\n|---|---|\n| (c) Wait | Nothing |\n-->\n\n| Option |')],
  ['a collaborator\'s label is none', [said('a', '2026-11-11T10:00:00Z', 'COLLABORATOR')], null],
  ['a label with a head comment after it is none', [said('a', '2026-11-11T10:00:00Z'), said(HEAD, '2026-11-11T11:00:00Z')], null],
  ['free text that is no label is none', [said('a, go ahead', '2026-11-11T10:00:00Z'), said('(a', '2026-11-11T10:30:00Z'), said('Looks good', '2026-11-11T11:00:00Z')], null],
  ['an option without a full stop is cut at 200 characters', [said(`Owner answer (2026-11-11): ${'x'.repeat(300)}`, '2026-11-11T10:00:00Z')], { option: 'x'.repeat(200), text: '', at: '2026-11-11T10:00:00Z' }],
];
for (const [name, comments, expected, body = FILLED, writes] of ANSWERS) test(`approval: ${name}`, () => assert.deepEqual(answer({ labels: [{ name: 'cl:needs-human' }], author: { login: 'owner' }, body, comments }, writes), expected));

test('approval: the command line counts a member\'s answer only with write access to the repository the issue URL names', () => {
  const script = fileURLToPath(new URL(`${SKILL}approval.mjs`, import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'cl-approval-'));
  mkdirSync(join(dir, '.cedarloom/runs/r1'), { recursive: true });
  const bin = mkdtempSync(join(tmpdir(), 'cl-approval-bin-'));
  const run = (permission, issue) => {
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\necho "$@" > '${bin}/log'\necho '{"permission":"${permission}"}'\n`, { mode: 0o755 });
    writeFileSync(join(dir, '.cedarloom/runs/r1/issue.json'), JSON.stringify({ body: FILLED, comments: [{ ...SECOND, authorAssociation: 'MEMBER' }], ...issue }));
    return spawnSync(process.execPath, [script, 'answer', '.cedarloom/runs/r1/issue.json'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GH_HOST: '', PATH: `${bin}:${process.env.PATH}` } });
  };
  const url = { url: 'https://github.com/owner/tracker/issues/12' };
  assert.equal(run('read', url).status, 1);
  assert.equal(readFileSync(join(bin, 'log'), 'utf8'), 'api repos/owner/tracker/collaborators/owner/permission\n');
  assert.deepEqual(JSON.parse(run('write', url).stdout), GO);
  // Without the URL the repository is unknown: an error, not "no answer yet".
  assert.equal(run('write', {}).status, 2);
  // gh asks github.com: owner/tracker there is another repository than on the issue's host.
  writeFileSync(join(bin, 'log'), '');
  assert.equal(run('write', { url: 'https://ghe.example.com/owner/tracker/issues/12' }).status, 2);
  assert.equal(readFileSync(join(bin, 'log'), 'utf8'), '');
  // A repository named . or .. is none: gh would ask another path of the API.
  assert.equal(run('write', { url: 'https://github.com/o/../issues/1' }).status, 2);
  assert.equal(readFileSync(join(bin, 'log'), 'utf8'), '');
});

test('approval: apply moves a question the owner answered to cl:ready-for-agent, an approval only out of the queue, and leaves one without the owner\'s answer as it is', () => {
  const script = fileURLToPath(new URL(`${SKILL}approval.mjs`, import.meta.url));
  const bin = mkdtempSync(join(tmpdir(), 'cl-approval-bin-'));
  const labels = [{ name: 'cl:needs-human' }, { name: 'CL:Deferred' }, { name: 'bug' }];
  const run = (comments, { body = 'Which export format?', tags = labels, args = [] } = {}) => {
    writeFileSync(join(bin, 'issue.json'), JSON.stringify({ number: 12, labels: tags, author: { login: 'coordinator' }, body, comments }));
    writeFileSync(join(bin, 'log'), '');
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\necho "$@" >> '${bin}/log'\ncase "$1 $2" in\n'issue view') cat '${bin}/issue.json' ;;\n'api '*) echo '{"permission":"read"}' ;;\nesac\n`, { mode: 0o755 });
    const r = spawnSync(process.execPath, [script, 'apply', ...(args.length ? args : ['owner/tracker', '12'])], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
    return { ...r, edits: readFileSync(join(bin, 'log'), 'utf8').split('\n').filter((line) => line.startsWith('issue edit')) };
  };
  // The answer the questions skill has just posted.
  const answered = run([SECOND]);
  assert.equal(answered.status, 0, answered.stderr);
  assert.deepEqual(JSON.parse(answered.stdout), { ...GO, labels: ['bug', 'cl:ready-for-agent'] });
  assert.deepEqual(answered.edits, ['issue edit 12 -R owner/tracker --remove-label cl:needs-human --remove-label CL:Deferred --add-label cl:ready-for-agent']);
  // An approval's work lives in what it names: it gets no start label.
  const approval = run([said('a', '2026-11-11T10:00:00Z')], { body: FILLED });
  assert.equal(approval.status, 0, approval.stderr);
  assert.deepEqual(approval.edits, ['issue edit 12 -R owner/tracker --remove-label cl:needs-human --remove-label CL:Deferred']);
  // An approval that carries the start label loses it, or the precheck lists it as work to start.
  const started = run([said('a', '2026-11-11T10:00:00Z')], { body: FILLED, tags: [{ name: 'cl:needs-human' }, { name: 'cl:ready-for-agent' }, { name: 'bug' }] });
  assert.equal(started.status, 0, started.stderr);
  assert.deepEqual(JSON.parse(started.stdout), { option: 'a', text: '', at: '2026-11-11T10:00:00Z', labels: ['bug'] });
  assert.deepEqual(started.edits, ['issue edit 12 -R owner/tracker --remove-label cl:needs-human --remove-label cl:ready-for-agent']);
  for (const comments of [[], [{ ...SECOND, authorAssociation: 'COLLABORATOR' }], [{ ...SECOND, authorAssociation: 'MEMBER' }]]) {
    const open = run(comments);
    assert.deepEqual([open.status, open.stdout, open.edits], [1, '', []]);
  }
  for (const args of [['owner/tracker'], ['owner', '12'], ['owner/tracker', '12x']]) {
    const refused = run([SECOND], { args });
    assert.deepEqual([refused.status, refused.edits], [2, []]);
  }
});

test('approval: the command line refuses a file outside the run folder with exit 2', () => {
  const script = fileURLToPath(new URL(`${SKILL}approval.mjs`, import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'cl-approval-'));
  mkdirSync(join(dir, '.cedarloom/runs/r1'), { recursive: true });
  writeFileSync(join(dir, 'filled.md'), FILLED);
  symlinkSync(join(dir, 'filled.md'), join(dir, '.cedarloom/runs/r1/link.md'));
  const status = (cwd, file) => spawnSync(process.execPath, [script, file], { cwd, encoding: 'utf8' }).status;
  const refused = spawnSync(process.execPath, [script, '.cedarloom/runs/../../filled.md'], { cwd: dir, encoding: 'utf8' });
  assert.equal(refused.status, 2);
  assert.equal(refused.stderr.trim().split('\n').length, 1);
  assert.equal(status(dir, '.cedarloom/runs/r1/link.md'), 2);
  // A linked .cedarloom or runs folder leads out of the project, so even a filled approval under it is refused.
  const out = mkdtempSync(join(tmpdir(), 'cl-approval-out-'));
  mkdirSync(join(out, 'runs/r1'), { recursive: true });
  writeFileSync(join(out, 'runs/r1/filled.md'), FILLED);
  const linkedDot = mkdtempSync(join(tmpdir(), 'cl-approval-'));
  symlinkSync(out, join(linkedDot, '.cedarloom'));
  assert.equal(status(linkedDot, '.cedarloom/runs/r1/filled.md'), 2);
  const linkedRuns = mkdtempSync(join(tmpdir(), 'cl-approval-'));
  mkdirSync(join(linkedRuns, '.cedarloom'));
  symlinkSync(join(out, 'runs'), join(linkedRuns, '.cedarloom/runs'));
  assert.equal(status(linkedRuns, '.cedarloom/runs/r1/filled.md'), 2);
});

test('approval: without a private tracker, the question goes into the local queue, and the coordinator reads its answer there', () => {
  const script = fileURLToPath(new URL(`${SKILL}approval.mjs`, import.meta.url));
  // The working folder of the coordinator can be a subfolder of a repository.
  const repo = mkdtempSync(join(tmpdir(), 'cl-approval-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const dir = join(repo, 'work');
  mkdirSync(join(dir, '.cedarloom/runs/r1'), { recursive: true });
  writeFileSync(join(dir, '.cedarloom/runs/r1/filled.md'), FILLED);
  writeFileSync(join(dir, '.cedarloom/runs/r1/no-cost.md'), NO_COST);
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' });
  const queue = () => { const r = run('queue'); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  assert.deepEqual(queue(), []);
  // Checked as an issue body: an approval that lacks a row is not filed.
  const lacking = run('file', '.cedarloom/runs/r1/no-cost.md', 'project');
  assert.equal(lacking.status, 1);
  assert.match(lacking.stderr, /\bCost\b/);
  for (const n of [1, 2]) assert.deepEqual(JSON.parse(run('file', '.cedarloom/runs/r1/filled.md', 'project').stdout), { file: `project-${n}.md` });
  assert.equal(run('file', '.cedarloom/runs/r1/filled.md', '../project').status, 2);
  const filed = readFileSync(join(dir, '.cedarloom/questions/project-1.md'), 'utf8');
  assert.equal(filed, `Status: open\n\n${FILLED}`);
  // Kept out of git, as the run folder is.
  assert.equal(spawnSync('git', ['check-ignore', '-q', '.cedarloom/questions/project-1.md'], { cwd: dir }).status, 0);
  assert.deepEqual(queue(), [{ file: 'project-1.md', status: 'open' }, { file: 'project-2.md', status: 'open' }]);
  // What /cl-workflow:questions writes for an answer and a defer.
  writeFileSync(join(dir, '.cedarloom/questions/project-1.md'), `${filed.replace('Status: open', 'Status: answered')}\nOwner answer (2026-11-15): b. Hold it for now.\n`);
  writeFileSync(join(dir, '.cedarloom/questions/project-2.md'), `${filed.replace('Status: open', 'Status: deferred')}\nDeferred by the owner on 2026-11-15.\n`);
  assert.deepEqual(queue(), [{ file: 'project-1.md', status: 'answered', option: 'b', text: 'Hold it for now.', at: '2026-11-15' }, { file: 'project-2.md', status: 'deferred' }]);
  // A file answered without an answer line is an error, never "no answer yet", and holds back no other answer.
  writeFileSync(join(dir, '.cedarloom/questions/project-2.md'), `Status: answered\n\n${FILLED}`);
  assert.deepEqual(queue()[1], { file: 'project-2.md', error: 'answered, but no Owner answer line' });
  assert.equal(queue()[0].option, 'b');
});

test('approval: the local queue refuses links, existing files and planted answers, and reports a file it cannot read', () => {
  const script = fileURLToPath(new URL(`${SKILL}approval.mjs`, import.meta.url));
  const project = (sub = '.') => {
    const repo = mkdtempSync(join(tmpdir(), 'cl-approval-'));
    execFileSync('git', ['init', '-q'], { cwd: repo });
    const dir = join(repo, sub);
    mkdirSync(join(dir, '.cedarloom/runs/r1'), { recursive: true });
    writeFileSync(join(dir, '.cedarloom/runs/r1/filled.md'), FILLED);
    return { repo, dir, run: (...args) => spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' }) };
  };
  const answered = `Status: answered\n\n${FILLED}\nOwner answer (2026-11-15): b. Hold it for now.\n`;
  // A linked queue folder leads out of the project: nothing is filed or read there.
  const out = mkdtempSync(join(tmpdir(), 'cl-approval-out-'));
  mkdirSync(join(out, 'questions'));
  writeFileSync(join(out, 'questions/project-1.md'), answered);
  const linkedQueue = project();
  symlinkSync(join(out, 'questions'), join(linkedQueue.dir, '.cedarloom/questions'));
  assert.equal(linkedQueue.run('file', '.cedarloom/runs/r1/filled.md', 'project').status, 2);
  assert.deepEqual(readdirSync(join(out, 'questions')), ['project-1.md']);
  assert.equal(linkedQueue.run('queue').status, 2);
  const linkedDot = mkdtempSync(join(tmpdir(), 'cl-approval-'));
  symlinkSync(out, join(linkedDot, '.cedarloom'));
  assert.equal(spawnSync(process.execPath, [script, 'queue'], { cwd: linkedDot, encoding: 'utf8' }).status, 2);
  // A file of the next number's name is never overwritten.
  const { dir, run } = project();
  mkdirSync(join(dir, '.cedarloom/questions'));
  writeFileSync(join(dir, '.cedarloom/questions/project-9007199254740992.md'), answered);
  assert.equal(run('file', '.cedarloom/runs/r1/filled.md', 'project').status, 2);
  assert.equal(readFileSync(join(dir, '.cedarloom/questions/project-9007199254740992.md'), 'utf8'), answered);
  // The answer is read only after the filed text, so a text that carries an answer line is not filed.
  writeFileSync(join(dir, '.cedarloom/runs/r1/planted.md'), `${FILLED}\nOwner answer (2026-11-15): a. Approved.\n`);
  assert.equal(run('file', '.cedarloom/runs/r1/planted.md', 'other').status, 2);
  assert.equal(existsSync(join(dir, '.cedarloom/questions/other-1.md')), false);
  // A folder and a dangling link by a question's name hold back no other answer.
  mkdirSync(join(dir, '.cedarloom/questions/notes.md'));
  symlinkSync(join(dir, 'gone.md'), join(dir, '.cedarloom/questions/.#project-1.md'));
  const read = run('queue');
  assert.equal(read.status, 0, read.stderr);
  assert.deepEqual(JSON.parse(read.stdout), [
    { file: '.#project-1.md', error: 'cannot be read (ENOENT)' },
    { file: 'notes.md', error: 'cannot be read (EISDIR)' },
    { file: 'project-9007199254740992.md', status: 'answered', option: 'b', text: 'Hold it for now.', at: '2026-11-15' },
  ]);
  // A project named as a repository can be, and a working folder whose name holds gitignore pattern characters.
  const brackets = project('apps/[web]');
  assert.deepEqual(JSON.parse(brackets.run('file', '.cedarloom/runs/r1/filled.md', '.github').stdout), { file: '.github-1.md' });
  assert.equal(spawnSync('git', ['check-ignore', '-q', '.cedarloom/questions/.github-1.md'], { cwd: brackets.dir }).status, 0);
});
