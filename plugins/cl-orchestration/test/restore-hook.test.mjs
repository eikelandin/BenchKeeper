import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../hooks/rotation/restore.mjs', import.meta.url));
const OWNED = '# Handoff\nSession: s-a\n\n## Next\nwatch #12\n';
const RUNS = join('.cedarloom', 'runs');

// A folder holding the coordinator's handoff file, untracked in a git work tree unless `git` is false.
const folder = ({ text = OWNED, git = true } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'restore-'));
  if (git) execFileSync('git', ['init', '-q', root]);
  mkdirSync(join(root, RUNS), { recursive: true });
  writeFileSync(join(root, RUNS, 'handoff.md'), text);
  return root;
};
// What the hook prints for a SessionStart after a compaction in that folder: the way Codex runs it, or with a project folder
// the way Claude Code runs it.
const restore = (root, { session = 's-a', project = '', input = JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact', session_id: session, cwd: root }) } = {}) => {
  const r = spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: project } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout === '' ? '' : JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
};

test('restore hook: hands back the file its session owns, cut to stay below 10,000 characters', () => {
  assert.match(restore(folder()), /\n# Handoff\nSession: s-a\n\n## Next\nwatch #12\n$/);
  assert.ok(restore(folder({ text: OWNED + 'x'.repeat(20_000) })).length < 10_000);
});

test('restore hook: in Claude Code, reads the project folder, not the folder a shell cd moved to', () => {
  const root = folder();
  mkdirSync(join(root, 'clone'));
  assert.match(restore(join(root, 'clone'), { project: root }), /\n# Handoff\nSession: s-a\n\n## Next\nwatch #12\n$/);
});

test('restore hook: the drift counts from the edited stamp of the status line, with paths from the repository root', () => {
  // A commit of 2010 with a backdated one of 1999 on top, and a file changed now, in the repository root; the session's
  // folder is sub/, and its handoff file, written now, carries the coordinator's own last write as 2000.
  const root = folder();
  const commit = (subject, date) => {
    writeFileSync(join(root, 'README.md'), subject);
    execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t.test', '-c', 'commit.gpgsign=false', 'commit', '-q', '-am', subject], { env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  };
  writeFileSync(join(root, 'README.md'), 'a');
  execFileSync('git', ['-C', root, 'add', 'README.md']);
  commit('first', '2010-01-01T00:00:00Z');
  commit('backdated', '1999-01-01T00:00:00Z');
  writeFileSync(join(root, 'README.md'), 'b');
  mkdirSync(join(root, 'sub', RUNS), { recursive: true });
  writeFileSync(join(root, 'sub', RUNS, 'handoff.md'), `${OWNED}\n<!-- cedarloom:status -->\n2026-01-01T00:00:00.000Z compacting; context: 1 tokens; last clear: none; edited: 2000-01-01T00:00:00.000Z; text: bbba8bb0\n<!-- /cedarloom:status -->\n`);
  const restored = restore(join(root, 'sub'));
  assert.match(restored, /\n## Drift since this file was written \(2000-01-01T00:00:00\.000Z, /);
  // git 2.39 prints %cI in UTC as +00:00, newer as Z.
  assert.match(restored, /\nCommits:\n[0-9a-f]+ 2010-01-01T00:00:00(Z|\+00:00) first\n/);
  assert.match(restored, /\n- `README\.md`\n/);
});

test('restore hook: prints nothing for another session, a linked file or folder, a tracked file, a folder outside git, or bad input', () => {
  assert.equal(restore(folder(), { session: 's-b' }), '');
  const unnamed = folder();
  assert.equal(restore(unnamed, { input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact', cwd: unnamed }) }), '');
  const linked = folder();
  renameSync(join(linked, RUNS, 'handoff.md'), join(linked, 'notes.md'));
  symlinkSync(join(linked, 'notes.md'), join(linked, RUNS, 'handoff.md'));
  assert.equal(restore(linked), '');
  const behind = folder();
  renameSync(join(behind, RUNS), join(behind, 'elsewhere'));
  symlinkSync(join(behind, 'elsewhere'), join(behind, RUNS));
  assert.equal(restore(behind), '');
  const tracked = folder();
  execFileSync('git', ['-C', tracked, 'add', '-f', join(RUNS, 'handoff.md')]);
  assert.equal(restore(tracked), '');
  assert.equal(restore(folder({ git: false })), '');
  assert.equal(restore(folder(), { input: 'not json' }), '');
});
