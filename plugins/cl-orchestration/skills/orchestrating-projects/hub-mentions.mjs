// Usage: node hub-mentions.mjs <hub> <owner/repo> <number>. Before a merge in a public repository whose tracker is the hub: prints each part of the pull request (title, body, branch, a commit) that names the hub, and exits 1; exit 0 when none does, exit 2 when it cannot tell (a hub that is not a plain owner/name, a failed gh call, a commit not read: GitHub lists at most 250, a text encoded more than three times over). It matches `owner/name`, its URLs and `name#<number>` in any case, with the percent, entity and backslash forms decoded, never inside a longer name (`owner/name-cli`); the bare name in prose and a hub issue number alone are the reviewer's to find. It prints the parts, never the hub.
import { escaped, isMain, sh } from './policy.mjs';
import { HUB } from './precheck.mjs';

// The ASCII a URL or GitHub's Markdown renders from %2F, &#47;, &#x2F;, &sol; and \/, decoded layer by layer, so a double encoding is read too.
const ascii = (code, raw) => (code < 128 ? String.fromCharCode(code) : raw);
const layer = (text) => text.replace(/%([0-7][0-9a-f])/gi, (raw, hex) => ascii(parseInt(hex, 16), raw))
  .replace(/&#x0*([0-9a-f]{1,6});/gi, (raw, hex) => ascii(parseInt(hex, 16), raw))
  .replace(/&#0*([0-9]{1,7});/g, (raw, digits) => ascii(Number(digits), raw))
  .replace(/&sol;/gi, '/')
  .replace(/\\(?=[^\sA-Za-z0-9])/g, '');
// Each layer reads the whole text again, so the layers are capped: deeper nesting takes time in the size of the text squared.
const LAYERS = 3;
function decoded(text) {
  let now = text;
  for (let pass = 0; pass <= LAYERS; pass++) {
    const was = now;
    now = layer(was);
    if (now === was) return now;
  }
  throw new Error(`a text encoded more than ${LAYERS} times over: cannot tell`);
}

// The test for text that names the hub; a hub that is not plain throws, since an empty or unfilled one would match everything or nothing.
function namer(hub) {
  if (!HUB.test(hub)) throw new Error('the hub takes a plain owner/name');
  const [owner, name] = hub.split('/').map((part) => part.replaceAll('.', '\\.'));
  // No owner name goes on before it; after the name and an optional .wiki and .git, a ., _ or - is more name only when a letter or digit follows.
  const slug = `(?<![a-z0-9-])${owner}/${name}(?:\\.wiki)?(?:\\.git)?(?![._-]*[a-z0-9])`;
  const pattern = new RegExp(`${slug}|(?<![a-z0-9._/-])${name}#\\d`, 'i');
  return (text) => pattern.test(decoded(text ?? ''));
}

// pr: { title, body, headRefName, commits: [{ oid, message }] }.
const parts = (named, pr) => [
  ...(named(pr.title) ? ['title'] : []),
  ...(named(pr.body) ? ['body'] : []),
  ...(named(pr.headRefName) ? ['branch'] : []),
  ...pr.commits.filter((c) => named(c.message)).map((c) => `commit ${c.oid.slice(0, 12)}`),
];

export const mentions = (hub, pr) => parts(namer(hub), pr);

// gh pr view cuts a commit subject at 69 characters and lists 100 commits, so the full messages come from the REST list, checked against the pull request's own count and head.
export function hubMentions(hub, repo, number, run = sh) {
  const named = namer(hub);
  const gh = (args) => JSON.parse(run('.', 'gh', ['api', ...args]));
  const pr = gh([`repos/${repo}/pulls/${number}`]);
  const commits = gh(['--paginate', '--slurp', `repos/${repo}/pulls/${number}/commits?per_page=100`]).flat();
  const head = commits.some((c) => c.sha === pr.head.sha);
  if (commits.length !== pr.commits || !head) throw new Error(`read ${commits.length} of the pull request's ${pr.commits} commits, its head ${head ? 'among them' : 'not among them'}: not every commit was checked`);
  return parts(named, { title: pr.title, body: pr.body, headRefName: pr.head.ref, commits: commits.map((c) => ({ oid: c.sha, message: c.commit.message })) });
}

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
