// SessionStart after a compaction (Claude Code and Codex) or a Codex clear: hands the coordinator's handoff file back with
// the git drift since the coordinator wrote it, when the file names the session of the hook input. A clear starts a new
// session id and this hook keeps no state between runs, so in practice it serves compaction; the Claude Code module
// restores after a clear.
import { execFileSync } from 'node:child_process';
import { constants, fstatSync, openSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import { gitProgram as git } from '../git-program.mjs';
import { FILE, RUNS, STATUS_ARGS, TOP_ARGS, changedPaths, commitArgs, drift, editedAt, mine, restored } from './handoff.mjs';

// Whether git tracks anything under the runs folder; no git or any git failure counts as tracked, as in the Claude Code module.
const tracked = (cwd) => {
  const program = git();
  if (!program) return true;
  try {
    return execFileSync(program, ['-c', 'core.fsmonitor=false', 'ls-files', '--', RUNS], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, killSignal: 'SIGKILL' }) !== '';
  } catch {
    return true;
  }
};

// The drift since the coordinator last wrote the file: the time the status line carries, else the file's mtime. Any
// failure means no drift, never a failed restore, as in the Claude Code module, whose engine bounds its git calls too: a
// call past 5 seconds or 4 MiB of output (a huge status) is one.
const drifted = (cwd, handle, handoff) => {
  const program = git();
  if (!program) return '';
  const run = (args) => execFileSync(program, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 4 << 20 });
  try {
    const since = editedAt(handoff) ?? fstatSync(handle).mtimeMs;
    const top = run(TOP_ARGS).trim();
    const paths = changedPaths(run(STATUS_ARGS)).filter((path) => (statSync(join(top, path), { throwIfNoEntry: false })?.mtimeMs ?? 0) > since);
    return drift(since, run(commitArgs(since)).split('\n').filter(Boolean), paths);
  } catch {
    return '';
  }
};

let handoff;
let drifting;
try {
  const { cwd, session_id: session } = JSON.parse(await text(process.stdin));
  // Claude Code's project folder, never a folder a shell cd moved to; Codex sets no such variable. The module's root follows
  // a /cd or worktree move; this variable may not.
  const root = process.env.CLAUDE_PROJECT_DIR || cwd;
  const path = join(root, FILE);
  // Opened without following a link or waiting on a FIFO where the platform can (Windows cannot), read through that handle,
  // and refused unless its real path is the one under the real project folder, so a committed file or a link is never read.
  const handle = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  if (!fstatSync(handle).isFile() || realpathSync(path) !== join(realpathSync(root), FILE)) process.exit(0);
  handoff = readFileSync(handle, 'utf8');
  // A claude -p run that resumed the coordinator's session passes too.
  if (!mine(handoff, session) || tracked(root)) process.exit(0);
  drifting = drifted(root, handle, handoff);
} catch {
  process.exit(0);
}
// As additionalContext, which codex.json lets through whole (additionalContextLimit 0) and Claude Code up to 10,000
// characters: restored() stays below that, while Codex would cut plain stdout past about 2,500 tokens to a preview.
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: restored(handoff, drifting) } }));
