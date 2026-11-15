import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// git from a system folder, so the PATH search does not decide which program runs.
const GIT = ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git'].find((p) => existsSync(p));

// Makes dir a git repository on main with one commit (README.md) and returns a git runner in it.
export function initRepo(dir) {
  if (!GIT) throw new Error('git is not in /usr/bin, /usr/local/bin or /opt/homebrew/bin');
  const git = (...a) => execFileSync(GIT, ['-C', dir, ...a], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  writeFileSync(join(dir, 'README.md'), '# P\n');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return git;
}
