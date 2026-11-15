// Usage: node hub-mentions.mjs <hub> <owner/repo> <number>. Before a merge in a public repository whose tracker is the hub: prints each part of the pull request (title, body, branch, a commit) that names the hub, its URLs included, and exits 1; exit 0 when none does, exit 2 when it cannot tell. It prints the parts, never the hub.
import { escaped, isMain, sh } from './policy.mjs';

// The parts of { title, body, headRefName, commits: [{ oid, messageHeadline, messageBody }] } that name the hub, in any case.
export function mentions(hub, pr) {
  const named = (text) => (text ?? '').toLowerCase().includes(hub.toLowerCase());
  return [
    ...(named(pr.title) ? ['title'] : []),
    ...(named(pr.body) ? ['body'] : []),
    ...(named(pr.headRefName) ? ['branch'] : []),
    ...pr.commits.filter((c) => named(`${c.messageHeadline}\n${c.messageBody}`)).map((c) => `commit ${c.oid.slice(0, 12)}`),
  ];
}

export const hubMentions = (hub, repo, number, run = sh) => mentions(hub, JSON.parse(run('.', 'gh', ['pr', 'view', number, '-R', repo, '--json', 'title,body,headRefName,commits'])));

if (isMain(import.meta.url)) {
  try {
    if (process.argv.length !== 5 || !/^\d+$/.test(process.argv[4])) throw new Error('usage: node hub-mentions.mjs <hub> <owner/repo> <number>');
    const found = hubMentions(...process.argv.slice(2));
    for (const part of found) console.log(escaped(`names the hub: ${part}`));
    process.exitCode = found.length ? 1 : 0;
  } catch (e) {
    console.error(escaped(e.message.split('\n')[0]));
    process.exitCode = 2;
  }
}
