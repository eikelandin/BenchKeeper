import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The account was renamed and its old name is free to claim: a marketplace source, link or site built from it would reach whoever claims it.
const OLD = /eschuderer/i;
const self = '.github/scripts/account-name.test.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));

test('no tracked file names the renamed GitHub account', () => {
  const files = execFileSync('/usr/bin/git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter((f) => f && f !== self);
  assert.deepEqual(files.filter((f) => OLD.test(f) || OLD.test(readFileSync(join(root, f), 'latin1'))), []);
});
