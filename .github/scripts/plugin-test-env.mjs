import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Started from a git hook or `git rebase --exec`, these name the caller's repository: a test's `git -C <fixture>` would then init, configure and commit there.
for (const v of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE', 'GIT_PREFIX']) delete process.env[v];

// Tests leave their mkdtemp folders behind: each test process (and its children) gets its own temp folder, removed on exit.
const dir = mkdtempSync(join(tmpdir(), 'cl-plugin-test-'));
Object.assign(process.env, { TMPDIR: dir, TEMP: dir, TMP: dir });
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
