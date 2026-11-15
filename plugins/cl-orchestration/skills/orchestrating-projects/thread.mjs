// Usage: node thread.mjs <project path> <issue number> <file>. Writes the issue's trusted thread to <file>: its title, body and the comments whose author precheck.mjs trusts, oldest first, then the count of the comments left out, never their text.
// node thread.mjs <project path> --pull <pull request number> <file> writes the pull request's unresolved review threads the same way: a thread only when its first comment's author is trusted, in it only trusted comments, then the counts left out.
// The coordinator pastes these files into the spec, the reviewer's brief and the follow-up: workers and reviewers never read comments themselves.
import { writeFileSync } from 'node:fs';
import { errorLine, escaped, isMain, read, sh } from './policy.mjs';
import { originRepo, trusts, writers } from './precheck.mjs';

// Each body line quoted and without control or format characters, so no text, even quoted from someone else, reads as a block of the spec it is pasted into. A tab becomes spaces, so indented code keeps its indent.
const quoted = (text) => (text ?? '').split(/\r?\n/).map((line) => `> ${escaped(line.replaceAll('\t', '    '))}`).join('\n');
const entry = (item, level = '##') => `${level} ${item.user.login}, ${item.created_at}, ${item.html_url}\n\n${quoted(item.body)}\n`;

// { repo, tracker, trusted }. run(dir, cmd, args) gives stdout or throws; a failed lookup throws, so nothing is written on a guess.
function setup(dir, number, run, env, tracked) {
  if (!/^[1-9]\d*$/.test(number)) throw new Error('the number is not a positive integer');
  const { policy, errors } = read(dir, run);
  if (!policy) throw new Error(errors.map(errorLine).join('; '));
  const repo = originRepo(dir, run, env);
  // Issue text counts by access to the tracker, pull request and review text by access to the project's repository.
  const tracker = tracked ? policy.issues.repository ?? repo : repo;
  return { repo, tracker, trusted: trusts(policy, writers(tracker, (cmd, args) => run(dir, cmd, args))) };
}

export function thread(dir, number, run = sh, env = process.env) {
  const { tracker, trusted } = setup(dir, number, run, env, true);
  const issue = JSON.parse(run(dir, 'gh', ['api', `repos/${tracker}/issues/${number}`]));
  // The title and body are the issue author's: an untrusted author leaves nothing to start from.
  if (issue.pull_request) throw new Error(`${tracker}#${number} is a pull request`);
  if (!trusted(issue)) throw new Error(`${tracker}#${number} is not by a trusted author`);
  const comments = JSON.parse(run(dir, 'gh', ['api', '--paginate', '--slurp', `repos/${tracker}/issues/${number}/comments?per_page=100`])).flat();
  const kept = comments.filter(trusted);
  return [`# ${tracker}#${number}: ${escaped(issue.title)}\n`, entry(issue), ...kept.map((c) => entry(c)), `Untrusted comments left out: ${comments.length - kept.length}.\n`].join('\n');
}

const QUERY = 'query($owner: String!, $name: String!, $n: Int!, $endCursor: String) { repository(owner: $owner, name: $name) { pullRequest(number: $n) { reviewThreads(first: 100, after: $endCursor) { pageInfo { hasNextPage endCursor } nodes { id isResolved path line comments(first: 100) { totalCount nodes { author { __typename login } authorAssociation body createdAt url } } } } } } }';

// A GraphQL comment in the REST shape trusts() reads: GraphQL gives a bot's login without the [bot] suffix that REST and trustedAuthors carry.
const rest = (c) => ({ user: { login: c.author && (c.author.__typename === 'Bot' ? `${c.author.login}[bot]` : c.author.login) }, author_association: c.authorAssociation, body: c.body, created_at: c.createdAt, html_url: c.url });

export function reviewThreads(dir, number, run = sh, env = process.env) {
  const { repo, trusted } = setup(dir, number, run, env, false);
  const [owner, name] = repo.split('/');
  const pages = JSON.parse(run(dir, 'gh', ['api', 'graphql', '--paginate', '--slurp', '-f', `query=${QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `n=${number}`]));
  const open = pages.flatMap((page) => page.data.repository.pullRequest.reviewThreads.nodes).filter((t) => !t.isResolved);
  // A comment past the first 100 of a thread is never read: such a thread gives no file rather than one that looks whole.
  const long = open.find((t) => t.comments.totalCount > t.comments.nodes.length);
  if (long) throw new Error(`review thread ${long.id} has more comments than one page holds`);
  let threadsOut = 0, commentsOut = 0;
  const kept = [];
  for (const t of open) {
    const comments = t.comments.nodes.map(rest);
    if (!comments.length || !trusted(comments[0])) { threadsOut++; continue; }
    const mine = comments.filter(trusted);
    commentsOut += comments.length - mine.length;
    kept.push(`## Thread ${t.id}, ${escaped(t.path)}, line ${t.line ?? 'none'}\n\n${mine.map((c) => entry(c, '###')).join('\n')}`);
  }
  return [`# ${repo}#${number}: unresolved review threads\n`, ...kept, `Untrusted threads left out: ${threadsOut}. Untrusted comments left out: ${commentsOut}.\n`].join('\n');
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const pull = args[1] === '--pull';
  if (pull) args.splice(1, 1);
  const [dir, number, file] = args;
  if (!file) {
    console.error('usage: node thread.mjs <project path> [--pull] <number> <file>');
    process.exit(2);
  }
  try {
    writeFileSync(file, (pull ? reviewThreads : thread)(dir, number));
  } catch (e) {
    console.error(escaped(e.message.split('\n')[0]));
    process.exit(1);
  }
}
