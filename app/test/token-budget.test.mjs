import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { addProtected, anchorsOf, check, deadRefs, globRegex, loadConfig, locate, measure, planCuts, run, suggest, tokensOf } from '../../plugins/cedarloom/skills/debloat/token-budget.mjs';

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'token-budget-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const AGENTS = ['# Project', '', '## History', 'This file was rewritten in spring.', 'It used to be longer.', '', '## Code', '- Never push with `--no-verify`:', '  the hooks guard the release.', '- Read [the guide](docs/guide.md#setup).', ''].join('\n');

test('a glob matches whole paths, ** across folders', () => {
  assert.ok(globRegex('**/AGENTS.md').test('AGENTS.md'));
  assert.ok(globRegex('**/AGENTS.md').test('packages/ui/AGENTS.md'));
  assert.ok(globRegex('docs/**/*.md').test('docs/a/b.md'));
  assert.ok(!globRegex('docs/*.md').test('docs/a/b.md'));
  assert.ok(!globRegex('README.md').test('web/README.md'));
});

test('tokens are bytes divided by four, rounded up', () => {
  assert.equal(tokensOf('abcde'), 2);
  assert.equal(tokensOf('ä'), 1);
});

test('measure counts the files in scope only', () => {
  const root = repo({ 'AGENTS.md': AGENTS, 'docs/guide.md': '# Guide\n\n## Setup\nRun it.\n', 'src/main.js': 'x\n', 'CHANGELOG.md': 'log\n' });
  const m = measure(root, loadConfig(root));
  assert.deepEqual(Object.keys(m.files), ['AGENTS.md', 'docs/guide.md']);
  assert.equal(m.files['AGENTS.md'].lines, 10);
});

test('suggest finds a wrapped prohibition and a named section', () => {
  assert.deepEqual(suggest(AGENTS.split('\n')).map((r) => [r.start, r.end]), [[8, 9]]);
  const section = suggest(['# T', '## Safety', 'Wear glasses.', '', '## Other', 'text']);
  assert.deepEqual([section[0].start, section[0].end], [2, 3]);
});

test('a protected span is found again after its lines are rewrapped, and missed once a word is gone', () => {
  const span = 'Never push with `--no-verify`: the hooks guard the release.';
  assert.deepEqual(locate(['intro', '- Never push with', '  `--no-verify`: the hooks', 'guard the release.'], `- ${span}`), { start: 2, end: 4 });
  assert.equal(locate(['- Never push: the hooks guard the release.'], span), null);
});

test('a cut that removes protected text is refused and writes nothing', () => {
  const root = repo({ 'AGENTS.md': AGENTS });
  addProtected(root, loadConfig(root), ['AGENTS.md:8-9']);
  const plan = join(root, 'plan.json');
  writeFileSync(plan, JSON.stringify({ cuts: [{ file: 'AGENTS.md', start: 9, end: 9, reason: 'restates the hook', sha256: measure(root, loadConfig(root)).files['AGENTS.md'].sha256 }] }));
  const lines = [];
  assert.equal(run(['cut', '--root', root, '--plan', plan, '--apply'], (l) => lines.push(l)), 1);
  assert.match(lines.join('\n'), /refused, a cut removes protected text/);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), AGENTS);
});

test('a cut by line range deletes exactly those lines, only with --apply', () => {
  const root = repo({ 'AGENTS.md': AGENTS });
  addProtected(root, loadConfig(root), ['AGENTS.md:8-9']);
  const plan = join(root, 'plan.json');
  writeFileSync(plan, JSON.stringify({ cuts: [{ file: 'AGENTS.md', start: 3, end: 6, reason: 'history', sha256: measure(root, loadConfig(root)).files['AGENTS.md'].sha256 }] }));
  assert.equal(run(['cut', '--root', root, '--plan', plan], () => {}), 0);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), AGENTS);
  assert.equal(run(['cut', '--root', root, '--plan', plan, '--apply'], () => {}), 0);
  const kept = AGENTS.split('\n');
  kept.splice(2, 4);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), kept.join('\n'));
});

test('a plan is refused when the file changed, a range overlaps or a reason is missing', () => {
  const root = repo({ 'AGENTS.md': AGENTS });
  const p = planCuts(root, loadConfig(root), { cuts: [{ file: 'AGENTS.md', start: 3, end: 5, reason: 'history', sha256: 'stale' }, { file: 'AGENTS.md', start: 5, end: 6, sha256: 'stale' }] });
  assert.equal(p.errors.filter((e) => /changed since|overlaps|no reason/.test(e)).length, 4);
});

test('anchors follow the heading text; a repeated heading gets a number', () => {
  assert.deepEqual([...anchorsOf('# Set up `npm`\n## Notes\n## Notes\n```\n# not a heading\n```\n')], ['set-up-npm', 'notes', 'notes-1']);
});

test('dead references: a missing file, a missing anchor, an import and a backticked path', () => {
  const root = repo({
    'CLAUDE.md': '@AGENTS.md\n@docs/gone.md\n',
    'AGENTS.md': 'See [a](docs/guide.md#setup), [b](docs/guide.md#removed), [c](docs/none.md), [d](https://example.com/x).\nRun `docs/guide.md` and `docs/old.md`, not `origin/main`.\n```\n[e](in/a/fence.md)\n```\n',
    'docs/guide.md': '# Guide\n\n## Setup\n',
  });
  assert.deepEqual(deadRefs(root, loadConfig(root)).map((r) => `${r.file}:${r.line} ${r.kind} ${r.target}`), [
    'AGENTS.md:1 anchor docs/guide.md#removed',
    'AGENTS.md:1 link docs/none.md',
    'AGENTS.md:2 path docs/old.md',
    'CLAUDE.md:2 import @docs/gone.md',
  ]);
});

test('check reports the change against the baseline and fails on a lost span, a dead link or a budget', () => {
  const root = repo({ 'AGENTS.md': AGENTS, 'docs/guide.md': '# Guide\n\n## Setup\n' });
  addProtected(root, loadConfig(root), ['AGENTS.md:8-9']);
  assert.equal(run(['baseline', '--root', root, '--write'], () => {}), 0);
  assert.equal(check(root, loadConfig(root)).ok, true);
  writeFileSync(join(root, 'AGENTS.md'), '# Project\n\n- Read [the guide](docs/guide.md#set-up).\n');
  const c = check(root, loadConfig(root));
  assert.equal(c.ok, false);
  // 193 bytes before and 53 after, counted by hand.
  assert.match(c.text, /\| AGENTS\.md \| 49 \| 14 \| -35 \|/);
  assert.equal(c.failures.length, 2);
  assert.equal(check(root, loadConfig(root), undefined, true).ok, true);
  writeFileSync(join(root, '.github/token-budget.json'), JSON.stringify({ budget: { total: 5 } }));
  assert.match(check(root, loadConfig(root)).failures.join('\n'), /above the budget 5/);
});

const skill = (name, description, extra = '') => `---\nname: ${name}\ndescription: "${description}"\n${extra}---\n\nBody text.\n`;

test('the listing counts descriptions of skills the model can start and of agents, not of user-invoked skills', () => {
  const root = repo({
    'plugins/p/skills/auto/SKILL.md': skill('auto', 'Picks a tier. Use before an edit.'),
    'plugins/p/skills/manual/SKILL.md': skill('manual', 'Cuts text.', 'disable-model-invocation: true\n'),
    'plugins/p/agents/look.md': skill('look', 'Looks things up.'),
    'docs/agents/notes.md': skill('notes', 'Not an agent.'),
  });
  const m = measure(root, loadConfig(root));
  // "auto: Picks a tier. Use before an edit." is 39 bytes, "look: Looks things up." 22 bytes.
  assert.deepEqual(Object.fromEntries(Object.entries(m.files).map(([p, f]) => [p, f.listed])), {
    'docs/agents/notes.md': 0,
    'plugins/p/agents/look.md': 6,
    'plugins/p/skills/auto/SKILL.md': 10,
    'plugins/p/skills/manual/SKILL.md': 0,
  });
  assert.equal(m.listed, 16);
});

test('suggest offers the description line of a listed skill, not of a user-invoked one', () => {
  const lines = skill('auto', 'Picks a tier. Use before an edit.').split('\n');
  assert.deepEqual(suggest(lines, 'plugins/p/skills/auto/SKILL.md'), [{ start: 3, end: 3, reason: 'routing description' }]);
  assert.deepEqual(suggest(skill('manual', 'Cuts text.', 'disable-model-invocation: true\n').split('\n'), 'plugins/p/skills/manual/SKILL.md'), []);
});

test('a cut into the front matter is refused', () => {
  const root = repo({ 'plugins/p/skills/auto/SKILL.md': skill('auto', 'Picks a tier. Use before an edit.') });
  const p = planCuts(root, loadConfig(root), { cuts: [{ file: 'plugins/p/skills/auto/SKILL.md', start: 3, end: 3, reason: 'long description' }] });
  assert.match(p.errors.join('\n'), /cuts into the front matter \(lines 1-4\)/);
});

test('a cut outside the instruction files and docs in scope is refused and writes nothing', () => {
  const root = repo({ 'AGENTS.md': AGENTS, 'src/app.js': 'a\nb\n' });
  addProtected(root, loadConfig(root), ['AGENTS.md:8-9']);
  const config = readFileSync(join(root, '.github/token-budget.json'), 'utf8');
  const outside = `${basename(root)}-outside.md`;
  writeFileSync(join(root, '..', outside), 'a\nb\n');
  const plan = join(root, 'plan.json');
  const hash = '0'.repeat(64);
  writeFileSync(plan, JSON.stringify({ cuts: [
    { file: `../${outside}`, start: 1, end: 1, reason: 'r', sha256: hash },
    { file: 'src/app.js', start: 1, end: 1, reason: 'r', sha256: hash },
    { file: '.github/token-budget.json', start: 2, end: 9, reason: 'r', sha256: hash },
  ] }));
  const out = [];
  assert.equal(run(['cut', '--root', root, '--plan', plan, '--apply'], (l) => out.push(l)), 1);
  assert.equal(out.filter((l) => /not an instruction file or doc in scope/.test(l)).length, 3);
  assert.equal(readFileSync(join(root, '..', outside), 'utf8'), 'a\nb\n');
  assert.equal(readFileSync(join(root, 'src/app.js'), 'utf8'), 'a\nb\n');
  assert.equal(readFileSync(join(root, '.github/token-budget.json'), 'utf8'), config);
});

test('a cut through a symlink in scope is refused and writes nothing', (t) => {
  const root = repo({ 'AGENTS.md': AGENTS });
  const outside = join(root, '..', `${basename(root)}-target.md`);
  writeFileSync(outside, 'a\nb\n');
  mkdirSync(join(root, 'docs'));
  try {
    symlinkSync(outside, join(root, 'docs/link.md'));
  } catch {
    t.skip('symlinks need a privilege here');
    return;
  }
  const hash = measure(root, loadConfig(root)).files['docs/link.md'].sha256;
  const plan = join(root, 'plan.json');
  writeFileSync(plan, JSON.stringify({ cuts: [{ file: 'docs/link.md', start: 2, end: 2, reason: 'r', sha256: hash }] }));
  const out = [];
  assert.equal(run(['cut', '--root', root, '--plan', plan, '--apply'], (l) => out.push(l)), 1);
  assert.ok(out.includes('error: docs/link.md: a symlink: cut the file it points to'));
  assert.equal(readFileSync(outside, 'utf8'), 'a\nb\n');
});

test('a cut without the sha256 of the file is refused', () => {
  const root = repo({ 'AGENTS.md': AGENTS });
  const p = planCuts(root, loadConfig(root), { cuts: [{ file: 'AGENTS.md', start: 3, end: 5, reason: 'history' }] });
  assert.deepEqual(p.errors, ['AGENTS.md:3-5: no sha256: take it from measure --json']);
});

test('front matter with CRLF line breaks: the description is listed, suggested and not cut; a cut keeps CRLF', () => {
  const path = 'plugins/p/skills/auto/SKILL.md';
  const text = `${skill('auto', 'Picks a tier. Use before an edit.').replace(/\n/g, '\r\n')}More.\r\n`;
  const root = repo({ [path]: text });
  assert.equal(measure(root, loadConfig(root)).files[path].listed, 10);
  const out = [];
  run(['protect', '--suggest', '--root', root, path], (l) => out.push(l));
  assert.deepEqual(JSON.parse(out.join('\n')).map((r) => [r.start, r.end, r.reason]), [[3, 3, 'routing description']]);
  const hash = measure(root, loadConfig(root)).files[path].sha256;
  assert.match(planCuts(root, loadConfig(root), { cuts: [{ file: path, start: 3, end: 3, reason: 'r', sha256: hash }] }).errors.join('\n'), /cuts into the front matter \(lines 1-4\)/);
  const p = planCuts(root, loadConfig(root), { cuts: [{ file: path, start: 7, end: 7, reason: 'r', sha256: hash }] });
  assert.deepEqual(p.errors, []);
  assert.equal(p.contents[path], '---\r\nname: auto\r\ndescription: "Picks a tier. Use before an edit."\r\n---\r\n\r\nBody text.\r\n');
});

test('a folded description counts every line and is suggested as a whole', () => {
  const path = 'plugins/p/skills/auto/SKILL.md';
  const text = '---\nname: auto\ndescription: >-\n  Picks a tier.\n  Use before an edit.\n---\n\nBody text.\n';
  const root = repo({ [path]: text });
  assert.equal(measure(root, loadConfig(root)).files[path].listed, 10);
  assert.deepEqual(suggest(text.split('\n'), path), [{ start: 3, end: 5, reason: 'routing description' }]);
});
