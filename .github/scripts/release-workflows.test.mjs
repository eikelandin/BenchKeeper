import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const workflow = (name) => readFileSync(new URL(`../workflows/${name}`, import.meta.url), 'utf8');
const release = workflow('release.yml');

// The `run: |` block of the step with this name (`- name:`, or `name:` after `- if:`), without its indentation.
function runBlock(text, name) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim().replace(/^- /, '') === `name: ${name}`);
  assert.ok(start >= 0, `step ${name}`);
  const run = lines.findIndex((l, i) => i > start && /^ +run: \|$/.test(l));
  const indent = lines[run + 1].match(/^ */)[0].length;
  const body = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() && line.match(/^ */)[0].length < indent) break;
    body.push(line.slice(indent));
  }
  return body.join('\n');
}

// GitHub keeps one pending run per concurrency group and cancels the older one: a push after the release merge
// must not cancel the job `release` of the merge commit.
test('release.yml has no workflow-wide concurrency group; the job release has one per commit', () => {
  assert.doesNotMatch(release, /^concurrency:/m);
  const job = release.slice(release.indexOf('\n  release:\n'));
  assert.match(job, /^ {4}concurrency:\n {6}group: \$\{\{ github\.workflow \}\}-release-\$\{\{ github\.sha \}\}\n/m);
  const rp = release.slice(release.indexOf('\n  release-please:\n'), release.indexOf('\n  release:\n'));
  assert.match(rp, /^ {4}concurrency:\n {6}group: \$\{\{ github\.workflow \}\}-release-please\n/m);
});

// A push during the release runs release-please while the release pull request is still pending, which opens nothing.
test('release.yml starts release-please again after it marks the release pull request as tagged', () => {
  const tagged = release.indexOf('- if: ${{ steps.pr.outputs.number != \'\' }}\n        name: Mark the release pull request as tagged');
  const again = release.indexOf('name: Run release-please again');
  assert.ok(tagged > 0 && again > tagged);
  assert.match(release.slice(again), /run: gh workflow run release\.yml --repo "\$REPO" --ref main/);
});

// gh pr edit removes the pending label before it fails on a missing one; the job then finds no release pull request.
test('release.yml creates the tagged label before it marks the release pull request', () => {
  const block = runBlock(release, 'Mark the release pull request as tagged');
  assert.match(block, /^gh label create 'autorelease: tagged' .*--force\ngh pr edit /m);
});

// Stub: each gh call lands in calls/<n> as NUL-separated arguments; of the tags only setup's last one exists, no Release. The step reads the
// config with jq: the runners have it, elsewhere the test skips without it.
const noJq = spawnSync('jq', ['--version'], { stdio: 'ignore' }).status !== 0 && !process.env.CI;
test('release.yml tags every plugin component at the version of its plugin.json and creates one Release with the changelog section of each plugin', { skip: noJq }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-tags-'));
  try {
    const packages = { 'plugins/cedarloom': { component: 'cedarloom' }, 'plugins/cl-workflow': { component: 'cedarloom-workflow' }, 'plugins/cl-repo': { component: 'cedarloom-repo' }, 'plugins/cl-orchestration': { component: 'cedarloom-orchestration' } };
    writeFileSync(join(dir, 'release-please-config.json'), JSON.stringify({ packages }));
    // setup stays at its last release; orchestration has no changelog yet; workflow's first release has no compare link.
    const versions = { cedarloom: '0.2.0', 'cl-workflow': '0.2.0', 'cl-repo': '0.1.0', 'cl-orchestration': '0.2.0' };
    for (const [name, version] of Object.entries(versions)) {
      mkdirSync(join(dir, 'plugins', name, '.claude-plugin'), { recursive: true });
      writeFileSync(join(dir, 'plugins', name, '.claude-plugin', 'plugin.json'), JSON.stringify({ name, version }));
    }
    const changelogs = {
      cedarloom: '# Changelog\n\n## [0.2.0](x) (2026-11-20)\n\n### Features\n\n* rules\n\n## [0.1.0](x)\n\n* old\n',
      'cl-workflow': '# Changelog\n\n## 0.2.0 (2026-11-20)\n\n### Bug Fixes\n\n* review\n',
      'cl-repo': '# Changelog\n\n## [0.1.0](x)\n\n* older\n',
    };
    for (const [name, text] of Object.entries(changelogs)) {
      mkdirSync(join(dir, 'plugins', name), { recursive: true });
      writeFileSync(join(dir, 'plugins', name, 'CHANGELOG.md'), text);
    }
    mkdirSync(join(dir, 'calls'));
    const stubs = `n=0
gh() { n=$((n + 1)); printf '%s\\0' "$@" > "calls/$n"; case "$1 $2" in 'release view') return 1 ;; 'api repos/o/r/git/ref/tags/cedarloom-repo-v0.1.0') return 0 ;; 'api repos/o/r/git/ref/'*) return 1 ;; esac; }
`;
    const out = spawnSync('bash', ['-e', '-c', stubs + runBlock(release, 'Tag and create the GitHub Release')], { cwd: dir, env: { ...process.env, REPO: 'o/r', SHA: 'abc', VERSION: '0.2.0' }, encoding: 'utf8' });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    const calls = readdirSync(join(dir, 'calls')).sort((a, b) => a - b).map((f) => readFileSync(join(dir, 'calls', f), 'utf8').split('\0').slice(0, -1));
    const tag = (t) => [['api', `repos/o/r/git/ref/tags/${t}`], ['api', 'repos/o/r/git/refs', '-f', `ref=refs/tags/${t}`, '-f', 'sha=abc']];
    assert.deepEqual(calls, [
      ...tag('cedarloom-v0.2.0'),
      ...tag('cedarloom-workflow-v0.2.0'),
      ['api', 'repos/o/r/git/ref/tags/cedarloom-repo-v0.1.0'],
      ...tag('cedarloom-orchestration-v0.2.0'),
      ['release', 'view', 'cedarloom-v0.2.0', '--repo', 'o/r'],
      ['release', 'create', 'cedarloom-v0.2.0', '--repo', 'o/r', '--target', 'abc', '--title', 'cedarloom v0.2.0', '--notes',
        '## cedarloom\n\n### Features\n\n* rules\n\n## cl-workflow\n\n### Bug Fixes\n\n* review\n\n', '--latest'],
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The Release is on the bundle's tag, so it takes the bundle's version, not another plugin's.
test('release.yml releases the version of the bundle plugin.json', { skip: noJq }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-version-'));
  try {
    const packages = { 'plugins/cl-repo': { component: 'cedarloom-repo' }, 'plugins/cedarloom': { component: 'cedarloom' } };
    writeFileSync(join(dir, 'release-please-config.json'), JSON.stringify({ packages }));
    for (const [name, version] of Object.entries({ cedarloom: '0.2.0', 'cl-repo': '0.3.0' })) {
      mkdirSync(join(dir, 'plugins', name, '.claude-plugin'), { recursive: true });
      writeFileSync(join(dir, 'plugins', name, '.claude-plugin', 'plugin.json'), JSON.stringify({ name, version }));
    }
    const output = join(dir, 'output');
    const out = spawnSync('bash', ['-e', '-c', runBlock(release, 'Version to release')], { cwd: dir, env: { ...process.env, GITHUB_OUTPUT: output }, encoding: 'utf8' });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.equal(readFileSync(output, 'utf8'), 'version=0.2.0\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
