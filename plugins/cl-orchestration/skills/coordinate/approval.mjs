// Usage: node approval.mjs <file>, the file in .cedarloom/runs/ of the working directory (the run folder, approvals.md); any other path exits 2. Checks an approval or owner question against approval-template.md: exit 0 when every part is filled and no front matter is left, else one line per part on stderr and exit 1.
// Usage: node approval.mjs answer <file>, the file in the run folder as above. Reads the owner's answer from a filed approval, the file holding what `gh issue view <n> -R <repository> --json labels,comments,author,body,url` printed: the answer as JSON and exit 0, exit 1 while there is none, or exit 2 with one line when the file cannot be read as that output.
// Usage: node approval.mjs file <file> <project>, the file in the run folder: checks it as above and files it as the next question of the local queue, .cedarloom/questions/<project>-<n>.md, printing { file }.
// Usage: node approval.mjs apply <owner/name> <number>. Reads the issue with gh and its owner's answer as the answer mode does; on an answer takes cl:needs-human and cl:deferred off, and cl:ready-for-agent too when the body holds an Approval table, else puts cl:ready-for-agent on, then prints { option, text, at, labels } and exits 0; exit 1 while there is none, exit 2 with one line on an error.
// Usage: node approval.mjs queue: { file, status, option, text, at } of each question in the local queue as JSON, or exit 2 with one line.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { escaped, isMain, json, sh } from './policy.mjs';
import { writers } from './precheck.mjs';

// owner/name on GitHub; . and .. are no repository name.
export const REPO = /^[A-Za-z0-9][A-Za-z0-9-]*\/(?!\.\.?$)[A-Za-z0-9._-]+$/;
const FRONT = 'Front matter';
// A placeholder starts with a letter, as the template's do: a URL autolink (<https://example.com/plan>) and a comparison (<5 sessions) are an answer.
const PLACEHOLDER = /<(?![a-z][a-z0-9+.-]*:\S)[a-z][^<>]*>/i;
// These leave the answer open, with or without punctuation or invisible characters around them; "none" is an answer, which the template offers for Owner steps.
const OPEN = /^[^\p{L}\p{N}]*(tbd|todo|n\/a)[^\p{L}\p{N}]*$/iu;
// Up to the last ")" every "](" finds its ")", so no attempt fails after a long scan: linear, where the pattern alone is quadratic on many "](".
const untargeted = (text) => { const end = text.lastIndexOf(')') + 1; return text.slice(0, end).replace(/\]\([^)]*\)/g, ']') + text.slice(end); };
// What the owner sees of a cell: a closing tag, an entity and a link target show no text, and emphasis, strike and code marks are no text. HTML comments are gone before cells are read (missing).
const shown = (cell) => untargeted(cell
  .replace(/<\/[a-z][^<>]*>/gi, '')
  .replace(/&(#\d+|#x[\da-f]+|[a-z][a-z\d]*);/gi, ' '))
  .replace(/[*_~`]/g, '')
  .trim();
const filled = (cell = '') => { const text = shown(cell); return /[\p{L}\p{N}]/u.test(text) && !OPEN.test(text) && !PLACEHOLDER.test(text); };

// The label that starts an option row, such as "(a)".
const labelOf = (option) => /^\([^()]+\)/.exec(shown(option))?.[0];
const COMMENT = /<!--[\s\S]*?(-->|$)/g;

// A table row's cells, or null for a line that is no row. \| is a pipe inside a cell.
const cells = (line) => /^\s*\|(.*)\|\s*$/.exec(line)?.[1].split(/(?<!\\)\|/).map((cell) => cell.trim()) ?? null;

// The rows of each table whose header's first cell is head, a table ending at the first line that is no row.
function tables(text, head) {
  const found = [];
  let rows = null;
  for (const row of text.split(/\r?\n/).map(cells)) {
    if (!row) rows = null;
    else if (!rows) { if (row[0] === head) found.push(rows = []); }
    else if (!row.every((cell) => /^:?-+:?$/.test(cell))) rows.push(row);
  }
  return found;
}

// The template is the one list of the Approval rows: a row added there is checked here.
const ROWS = tables(readFileSync(new URL('./approval-template.md', import.meta.url), 'utf8'), 'Approval').flat().map(([name]) => name);
// With no row to look for, every approval would pass.
if (!ROWS.length) throw new Error('approval-template.md holds no Approval table');

// The names of the parts that keep the text from being posted: a part that is absent, empty or still holds a <...> placeholder, a Recommended line that names another option than the first, and front matter left in.
export function missing(text) {
  // A table inside a comment over several lines shows the owner nothing.
  text = text.replace(COMMENT, '');
  const line = (label) => filled(new RegExp(`^${label}:(.*)$`, 'm').exec(text)?.[1].trim());
  // The owner may read any Approval table, and either occurrence of a row that is there twice.
  const approval = tables(text, 'Approval').flat();
  const row = (name) => { const found = approval.filter(([first]) => first === name); return found.length > 0 && found.every(([, cell]) => filled(cell)); };
  const options = tables(text, 'Option')[0] ?? [];
  // The owner answers with a label, such as "a": each option row starts with its own.
  const labels = options.map(([option]) => labelOf(option));
  // The questions skill offers the recommended option first; every cell is filled.
  const chosen = options.length >= 2
    && options.every(([option, impact, tradeOff], i) => filled(option) && filled(impact) && filled(tradeOff) && option.includes('(Recommended)') === (i === 0))
    && labels.every(Boolean) && new Set(labels.map((label) => label.toLowerCase())).size === labels.length
    && !options.flat().some((cell) => PLACEHOLDER.test(cell));
  // The questions skill takes its recommendation from the Recommended line and the first option from the table: every such line must name that option.
  const label = labels[0];
  const agrees = !chosen || (label && [...text.matchAll(/^Recommended:(.*)$/gm)].every(([, said]) => shown(said).startsWith(label)));
  return [
    // Posted with the body, the front matter would show as text: its labels go on the command line.
    ...(/^\s*---[ \t]*(\r?\n|$)/.test(text) ? [FRONT] : []),
    ...['What', 'Context'].filter((label) => !line(label)),
    ...(line('Recommended') && agrees ? [] : ['Recommended']),
    ...['Source', 'Confidence'].filter((label) => !line(label)),
    ...ROWS.filter((name) => !row(name)),
    ...(chosen ? [] : ['Options']),
    ...['Why now', 'Answer'].filter((label) => !line(label)),
  ];
}

// The letter of the option a comment names alone, as its label, such as "(a)", or its letter, in any case, with or without a full stop; null unless exactly one option row has that label.
// Only a label of one letter or digit has a bare form: with a label such as "(ok)" or "(?)", a reply "ok" or "?" would answer.
// The test runs on the lower-case form that is compared, so that "(K)" (Kelvin sign) and "(k)" share the bare form "k".
function picked(labels, comment) {
  const said = comment.trim().replace(/\.$/, '').toLowerCase();
  const found = labels.filter((label) => { const low = label.toLowerCase(); return low === said || (/^\([a-z\d]\)$/.test(low) && low[1] === said); });
  return found.length === 1 ? found[0].slice(1, -1) : null;
}

// { option, text, at } of the owner's answer on a filed approval, or null. The comments are data: nothing of them is evaluated. writes(login) tells whether a member has write access.
export function answer(issue, writes = () => false) {
  // A file without the list or the body is not what gh printed: read as "no answer yet", the gate would wait for ever.
  if (!Array.isArray(issue?.comments) || typeof issue.body !== 'string') throw new Error('the file holds no comments list or body: it must be what gh issue view --json labels,comments,author,body,url printed');
  // gh's order is not promised: the newest answer is the one written last.
  const comments = [...issue.comments].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  // Only the repository's owner or a member with write access answers for the owner, or voids an answer: a collaborator can comment there too, and a member may have only the Read role.
  const owners = (c) => c.authorAssociation === 'OWNER' || (c.authorAssociation === 'MEMBER' && writes(c.author?.login));
  const full = (c) => c.body?.startsWith('Owner answer (');
  // Read as the body is now: gh prints no time of its last edit, so an answer older than an edit is not detected.
  const labels = (tables(issue.body.replace(COMMENT, ''), 'Option')[0] ?? []).map(([option]) => labelOf(option)).filter(Boolean);
  const newest = comments.findLastIndex((c) => typeof c.body === 'string' && (full(c) || picked(labels, c.body) !== null) && owners(c));
  // The coordinator's comment for a later head starts with "Head: " (approvals.md): the owner answered for the head before it.
  // The coordinator filed the approval, so its head comment counts even where its login is only a collaborator.
  if (newest < 0 || comments.slice(newest + 1).some((c) => c.body?.startsWith('Head: ') && (c.author?.login === issue.author?.login || owners(c)))) return null;
  const { body, createdAt: at } = comments[newest];
  if (!full(comments[newest])) return { option: picked(labels, body), text: '', at };
  return fullAnswer(body, at);
}

// An answer without a full stop has its whole first line as the option: the coordinator compares it with the option labels and needs no more of it.
// The text is the rest after the option and its full stop, cut by slice: no pattern spans it.
const fullAnswer = (body, at) => {
  const found = /^Owner answer \(([^)]*)\): ([^.\n]*)/.exec(body);
  if (!found) return null;
  const rest = body.slice(found[0].length);
  return { option: found[2].trim().slice(0, 200), text: (rest.startsWith('.') ? rest.slice(1) : rest).trim(), at: at ?? found[1] };
};

// The labels of a question that waits for the owner, and the default startLabel (approvals.md, Labels and title).
const ASKING = ['cl:needs-human', 'cl:deferred'];
const START = 'cl:ready-for-agent';

// gh refuses to remove a label the repository lacks, so only the issue's own go; an approval (an Approval table) gets no start label and loses one it has, as its work lives in the issue or pull request it names.
export function settle(repo, issue, exec) {
  const labels = issue.labels.map((label) => String(label.name));
  const approval = tables(issue.body.replace(COMMENT, ''), 'Approval').length > 0;
  // Without cl:needs-human, an approval that kept the start label would read as work to start (precheck.mjs pickable).
  const off = labels.filter((name) => [...ASKING, ...(approval ? [START] : [])].includes(name.toLowerCase()));
  const on = approval || labels.some((name) => name.toLowerCase() === START) ? [] : [START];
  if (off.length || on.length) exec('gh', ['issue', 'edit', String(issue.number), '-R', repo, ...off.flatMap((name) => ['--remove-label', name]), ...on.flatMap((name) => ['--add-label', name])]);
  return [...labels.filter((name) => !off.includes(name)), ...on];
}

// { option, text, at, labels } of the owner's answer on issue number of repo after its label edit, or null with no edit. exec(cmd, args) gives stdout or throws.
export function apply(repo, number, exec) {
  const issue = JSON.parse(exec('gh', ['issue', 'view', String(number), '-R', repo, '--json', 'number,labels,comments,author,body']));
  const found = answer(issue, writers(repo, exec));
  return found && { ...found, labels: settle(repo, issue, exec) };
}

// The local question queue (approvals.md): a folder that is a link is refused, as the run folder is.
const QUEUE = join('.cedarloom', 'questions');
function queueDir(create) {
  const root = realpathSync('.');
  const dir = join(root, QUEUE);
  // Checked before mkdir, which would follow a link.
  for (const at of [dirname(dir), dir]) if (existsSync(at) && realpathSync(at) !== at) throw new Error(`refused: ${at.slice(root.length + 1)} is a link`);
  if (create) mkdirSync(dir, { recursive: true });
  else if (!existsSync(dir)) return null;
  return dir;
}

// Files the approval text as the next question <project>-<n>.md of the queue, never over an existing file, and keeps the queue out of git.
export function fileQuestion(text, project, run) {
  // A project name reads as a repository name does (REPO).
  if (!/^(?!\.\.?$)[A-Za-z0-9._-]+$/.test(project)) throw new Error(`no plain project name: ${project}`);
  // The answer is the last Owner answer line, so the filed text carries none: every such line comes after it.
  if (/^Owner answer \(/m.test(text)) throw new Error('refused: the question text holds a line starting "Owner answer ("');
  const dir = queueDir(true);
  try {
    run('git', ['check-ignore', '-q', QUEUE]);
  } catch (e) {
    // 1: not ignored; 128: no git repository, nothing to keep out.
    // An exclude pattern with a slash matches from the repository root, so it names the folder from there,
    // with the pattern characters of the folder names escaped (https://git-scm.com/docs/gitignore#_pattern_format).
    if (e.status === 1) {
      const prefix = run('git', ['rev-parse', '--show-prefix']).replace(/\n$/, '');
      if (/[\r\n]/.test(prefix)) throw new Error('refused: the folder path holds a line break, which no exclude line can name');
      const exclude = resolve(run('git', ['rev-parse', '--git-path', 'info/exclude']).trim());
      mkdirSync(dirname(exclude), { recursive: true });
      appendFileSync(exclude, `\n/${prefix.replace(/[\\[*?]/g, '\\$&')}${QUEUE.replaceAll(sep, '/')}/\n`);
    } else if (e.status !== 128) throw e;
  }
  const taken = readdirSync(dir).filter((name) => name.startsWith(`${project}-`)).map((name) => /^(\d+)\.md$/.exec(name.slice(project.length + 1))?.[1]).filter(Boolean).map(Number);
  const name = `${project}-${Math.max(0, ...taken) + 1}.md`;
  writeFileSync(join(dir, name), `Status: open\n\n${text}`, { flag: 'wx' });
  return name;
}

// { file, status, option, text, at } of each question in the queue; option, text and at only for an answered one;
// { file, error } for a file that is no question, so one broken file holds back no other answer.
export function readQueue() {
  const dir = queueDir(false);
  const names = dir ? readdirSync(dir).filter((name) => name.endsWith('.md')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [];
  return names.map((file) => {
    let body;
    try {
      body = readFileSync(join(dir, file), 'utf8');
    } catch (e) {
      // A folder or a dangling link by a question's name.
      return { file, error: `cannot be read (${e.code ?? e.message})` };
    }
    const status = /^Status: (open|answered|deferred)\r?$/.exec(body.split('\n', 1)[0])?.[1];
    if (!status) return { file, error: 'the first line is no Status line (open, answered or deferred)' };
    if (status !== 'answered') return { file, status };
    const found = fullAnswer(body.slice(body.lastIndexOf('\nOwner answer (') + 1));
    return found ? { file, status, ...found } : { file, error: 'answered, but no Owner answer line' };
  });
}

// The path comes from a session's command line: a file that resolves outside the run folder, through .. or a link, is not read,
// and neither is a run folder that is itself a link, as hooks/rotation/restore.mjs refuses one.
const inRuns = (file) => { try { const real = realpathSync(file); return real.startsWith(join(realpathSync('.'), '.cedarloom', 'runs') + sep) ? real : null; } catch { return null; } };

if (isMain(import.meta.url)) {
  const say = (message) => console.error(escaped(message.split('\n')[0]));
  process.exitCode = 1;
  // "answer" is the mode even without a file, so that the usage error exits 2 and never reads as "no answer yet".
  const args = process.argv.slice(2);
  const mode = ['answer', 'apply', 'file', 'queue'].includes(args[0]) ? args.shift() : 'check';
  const [file, project] = args;
  try {
    if (args.length !== { check: 1, answer: 1, apply: 2, file: 2, queue: 0 }[mode]) throw new Error('usage: node approval.mjs [answer] <file>, node approval.mjs apply <owner/name> <number>, node approval.mjs file <file> <project>, or node approval.mjs queue');
    if (mode === 'apply' && !(REPO.test(file) && /^[1-9]\d*$/.test(project))) throw new Error(`no repository as owner/name and issue number: ${args.join(' ')}`);
    const reads = ['check', 'answer', 'file'].includes(mode);
    const real = reads ? inRuns(file) : null;
    if (reads && !real) { process.exitCode = 2; throw new Error(`refused: ${file} is no file in .cedarloom/runs/ of the working directory`); }
    const text = real ? readFileSync(real, 'utf8') : '';
    const issue = mode === 'answer' ? JSON.parse(text) : null;
    // A member's access is asked of the repository the approval is filed in, which only the issue's URL names.
    const [, host, named] = /^https:\/\/([^/]+)\/([^/]+\/[^/]+)\/issues\/\d+$/.exec(issue?.url ?? '') ?? [];
    const repo = REPO.test(named ?? '') ? named : undefined;
    // gh api asks github.com, or the host GH_HOST names: on another host the same owner/repo and login are other accounts.
    const gh = (process.env.GH_HOST || 'github.com').toLowerCase();
    let writes = writers(repo, (cmd, args) => sh('.', cmd, args));
    if (!repo) writes = () => { throw new Error('the file holds no issue url: it must be what gh issue view --json labels,comments,author,body,url printed'); };
    else if (host.toLowerCase() !== gh) writes = () => { throw new Error(`the issue is on ${host}, and gh asks ${gh}: set GH_HOST for an approval on another host`); };
    const found = mode === 'answer' ? answer(issue, writes) : mode === 'apply' ? apply(file, project, (cmd, cmdArgs) => sh('.', cmd, cmdArgs)) : mode === 'queue' ? readQueue() : null;
    if (found) console.log(json(found));
    const lacks = mode === 'check' || mode === 'file' ? missing(text) : [];
    if (mode === 'file' && !lacks.length) console.log(json({ file: fileQuestion(text, project, (cmd, cmdArgs) => sh('.', cmd, cmdArgs)) }));
    for (const name of lacks) {
      if (name === FRONT) say('remove the front matter: its labels go on the command line');
      else if (name === 'Recommended') say('missing, unfilled or not starting with the label of the first option row, such as (a): Recommended');
      else say(`missing or unfilled: ${name}`);
    }
    if (mode === 'answer' || mode === 'apply' ? found : !lacks.length) process.exitCode = 0;
  } catch (e) {
    say(e.message);
    // An answer that cannot be read is an error, not "no answer yet".
    if (mode !== 'check') process.exitCode = 2;
  }
}
