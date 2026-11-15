// Usage: node thread.mjs <project path> <issue number> <file>. Writes the issue's trusted thread to <file>: its title, body and the comments whose author precheck.mjs trusts, oldest first, then the count of the comments left out, never their text.
// The coordinator pastes this file into the spec and the reviewer's brief: workers and reviewers never read an issue's comments themselves.
import { writeFileSync } from 'node:fs';
import { errorLine, escaped, isMain, read, sh } from './policy.mjs';
import { originRepo, trusts, writers } from './precheck.mjs';

// Each body line quoted and without control or format characters, so no text, even quoted from someone else, reads as a block of the spec it is pasted into.
const quoted = (text) => (text ?? '').split(/\r?\n/).map((line) => `> ${escaped(line)}`).join('\n');
const entry = (item) => `## ${item.user.login}, ${item.created_at}, ${item.html_url}\n\n${quoted(item.body)}\n`;

// The thread's text. run(dir, cmd, args) gives stdout or throws; a failed lookup throws, so nothing is written on a guess.
export function thread(dir, number, run = sh, env = process.env) {
  if (!/^[1-9]\d*$/.test(number)) throw new Error('the issue number is not a positive integer');
  const { policy, errors } = read(dir, run);
  if (!policy) throw new Error(errors.map(errorLine).join('; '));
  const tracker = policy.issues.repository ?? originRepo(dir, run, env);
  const trusted = trusts(policy, writers(tracker, (cmd, args) => run(dir, cmd, args)));
  const issue = JSON.parse(run(dir, 'gh', ['api', `repos/${tracker}/issues/${number}`]));
  // The title and body are the issue author's: an untrusted author leaves nothing to start from.
  if (issue.pull_request) throw new Error(`${tracker}#${number} is a pull request`);
  if (!trusted(issue)) throw new Error(`${tracker}#${number} is not by a trusted author`);
  const comments = JSON.parse(run(dir, 'gh', ['api', '--paginate', '--slurp', `repos/${tracker}/issues/${number}/comments?per_page=100`])).flat();
  const kept = comments.filter(trusted);
  return [`# ${tracker}#${number}: ${escaped(issue.title)}\n`, entry(issue), ...kept.map(entry), `Untrusted comments left out: ${comments.length - kept.length}.\n`].join('\n');
}

if (isMain(import.meta.url)) {
  const [dir, number, file] = process.argv.slice(2);
  if (!file) {
    console.error('usage: node thread.mjs <project path> <issue number> <file>');
    process.exit(2);
  }
  try {
    writeFileSync(file, thread(dir, number));
  } catch (e) {
    console.error(escaped(e.message.split('\n')[0]));
    process.exit(1);
  }
}
