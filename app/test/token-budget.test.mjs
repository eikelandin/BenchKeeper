import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
  writeFileSync(plan, JSON.stringify({ cuts: [{ file: 'AGENTS.md', start: 9, end: 9, reason: 'restates the hook' }] }));
  const lines = [];
  assert.equal(run(['cut', '--root', root, '--plan', plan, '--apply'], (l) => lines.push(l)), 1);
  assert.match(lines.join('\n'), /refused, a cut removes protected text/);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), AGENTS);
});

test('a cut by line range deletes exactly those lines, only with --apply', () => {
  const root = repo({ 'AGENTS.md': AGENTS });
  addProtected(root, loadConfig(root), ['AGENTS.md:8-9']);
  const plan = join(root, 'plan.json');
  writeFileSync(plan, JSON.stringify({ cuts: [{ file: 'AGENTS.md', start: 3, end: 6, reason: 'history' }] }));
  assert.equal(run(['cut', '--root', root, '--plan', plan], () => {}), 0);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), AGENTS);
  assert.equal(run(['cut', '--root', root, '--plan', plan, '--apply'], () => {}), 0);
  const kept = AGENTS.split('\n');
  kept.splice(2, 4);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), kept.join('\n'));
});

test('a plan is refused when the file changed, a range overlaps or a reason is missing', () => {
  const root = repo({ 'AGENTS.md': AGENTS });
  const p = planCuts(root, loadConfig(root), { cuts: [{ file: 'AGENTS.md', start: 3, end: 5, reason: 'history', sha256: 'stale' }, { file: 'AGENTS.md', start: 5, end: 6 }] });
  assert.equal(p.errors.filter((e) => /changed since|overlaps|no reason/.test(e)).length, 3);
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
