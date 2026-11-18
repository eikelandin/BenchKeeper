// PreToolUse hook for Bash, Monitor and PowerShell: a session that does not run as the coordinator (CEDARLOOM_ROLE=coordinator),
// and every subagent, may not merge, release, push tags or to the default branch, change repository settings or security,
// use gh auth, write git config, use git stash or start a session in bare mode, which runs no hooks.
// It stops a session that forgets its role, not one that works around it (variables, aliases, scripts, another tool):
// the boundary is a gh token without those rights.
// For Write, Edit, MultiEdit and NotebookEdit too: an answer in the local question queue counts as the owner's, so every session, the
// coordinator's included, may only write there or reach it in a command (a word, a redirection or a cd, read from the session folder)
// after the user typed /cl-workflow:questions in that session; no session writes the window files that record that or starts a
// session with that command.
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { text } from 'node:stream/consumers';
import { openUntil, windowFile } from '../ask/window-file.mjs';
import { gitProgram } from '../git-program.mjs';

// The local question queue in any folder, as a folder and the folder inside it.
const QUEUE = ['.cedarloom', 'questions'];
const EDITS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
// The path fields of the edit tools: Write, Edit and MultiEdit carry file_path, NotebookEdit notebook_path.
const EDIT_PATHS = ['file_path', 'notebook_path'];
// A session started with /cl-workflow:questions as its prompt (claude -p expands it, https://code.claude.com/docs/en/headless) would
// hold the flag, and no hook input or variable Claude Code documents tells such a session from a typed one.
const QUESTIONS = /(^|[^\w-])\/(cl-workflow:)?questions(?![\w.-])/i;
// The program names that start such a session: claude, and claude-code as npx runs the package.
const LAUNCHERS = new Set(['claude', 'claude-code']);
// Folders the guard follows in one command: the session folder and one per cd.
const MAX_FOLDERS = 64;

const ROLE = 'CEDARLOOM_ROLE';

// gh flags that take the next word as their value, wherever they stand (gh pr -R owner/repo merge).
const GH_VALUE_FLAGS = new Set(['-R', '--repo', '--hostname', '-b', '--body', '-F', '--body-file', '-f', '--field', '--raw-field', '-X', '--method', '-H', '--header', '-q', '--jq', '-t', '--template', '--input', '-p', '--preview', '--cache']);
// Per gh command, the verbs that only read: every other verb is denied.
const GH_READS = new Map([['auth', []], ['release', ['list', 'view', 'download', 'verify', 'verify-asset']], ['secret', ['list']], ['variable', ['list', 'get']]]);
// Per gh command, the verbs that are denied.
const GH_WRITES = new Map([['pr', ['merge']], ['repo', ['edit', 'rename', 'archive', 'unarchive', 'delete', 'deploy-key', 'sync']], ['workflow', ['run', 'enable', 'disable']], ['config', ['set']], ['alias', ['set', 'import', 'delete']], ['ssh-key', ['add', 'delete']], ['gpg-key', ['add', 'delete']]]);
// The long flags of gh api that take a value; -i (--include) is its only short flag without one.
const API_VALUE_FLAGS = new Set(['cache', 'field', 'header', 'hostname', 'input', 'jq', 'method', 'preview', 'raw-field', 'template']);
// REST paths that merge, commit files, release, dispatch a workflow, write refs or change settings and security, when called with a method other than GET.
const API_PATHS = /(^|\/)(repos\/[^/]+\/[^/?]+\/?($|\?)|repos\/[^/]+\/[^/?]+\/(contents|merge-upstream)\b|orgs\/|user(\/|$))|\/(pulls\/[^/]+\/merge|merges|releases|dispatches|git\/(refs|tags)|branches\/[^/]+\/protection|rulesets|hooks|collaborators|invitations|keys|actions\/(permissions|secrets|variables)|environments|pages|dependabot|codespaces|code-scanning|secret-scanning|security-advisories|vulnerability-alerts|automated-security-fixes|private-vulnerability-reporting|transfer|topics)\b/;
const MUTATIONS = /\b(mergePullRequest|mergeBranch|enablePullRequestAutoMerge|enqueuePullRequest|createCommitOnBranch|(create|update|delete)(BranchProtectionRule|RepositoryRuleset|Refs?)|updateRepository\w*|(un)?archiveRepository|dismissRepositoryVulnerabilityAlert)\b/;
const GIT_VALUE_OPTS = new Set(['-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix']);
const CONFIG_READ = /^(--get(-all|-regexp|-urlmatch|-color|colorbool)?|-l|--list|get|list)$/;
const CONFIG_WRITE = /^(--(unset|unset-all|add|replace-all|rename-section|remove-section|edit)|-e|set|unset|rename-section|remove-section|edit)$/;
// git takes any unique prefix of a long option (gitcli, "Abbreviating long options"), so a prefix of these is denied too.
const PUSH_OPTIONS = [['tags', 'a tag push'], ['follow-tags', 'a tag push'], ['mirror', 'a mirror push'], ['all', 'a push of every branch'], ['branches', 'a push of every branch']];
// A release tag name such as v1.2.0, cedarloom-v0.1.0 or cedarloom-repo-v0.1.0; branch names with a folder (dependabot/npm/x-1.2.3) are not read as tags.
const VERSION = /(^|[-_@])v?\d+(\.\d+)+/;
// Bare mode runs no hooks (https://code.claude.com/docs/en/headless#start-faster-with-bare-mode).
const BARE = '--bare';
const DEFAULT_BRANCHES = ['main', 'master'];
// Commands that change the folder the following commands run in, in bash and PowerShell.
const CHANGE_DIR = new Set(['cd', 'pushd', 'popd', 'chdir', 'set-location', 'sl', 'push-location', 'pop-location']);
const UNREAD_BRANCH = 'a push without a branch name from a folder the guard cannot read (name it: git push <remote> <branch>)';
const GIT_DIR_PUSH = 'a push from the repository GIT_DIR or --git-dir names, which the guard does not read (push from its folder: git -C <dir> push <remote> <branch>)';
const UNREAD_DEFAULT = 'a push to a remote whose default branch the guard cannot read (push to a remote by name whose refs/remotes/<remote>/HEAD is set: git remote set-head <remote> --auto)';

// Inside double quotes bash drops a backslash only before these (https://www.gnu.org/software/bash/manual/html_node/Double-Quotes.html).
const BASH_QUOTED_ESCAPES = '$`"\\';

// The commands of a shell text, each a list of words with quotes and escapes resolved, as the shell splits them: a line
// continuation joins its lines, a quoted word stays whole, and the targets of redirections are kept apart from the words. The text
// of a quoted word is read again as commands, so `bash -c "gh pr merge 1"` shows its gh; text that only names such a command is denied as well.
// A command from quoted text, parentheses, backticks, a pipeline or a background job is marked nested: a folder change there
// may not reach the commands after it.
// PowerShell escapes and continues lines with the backtick and keeps the backslash as a plain character
// (https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_special_characters).
function commands(source, powershell, nested = false) {
  /** @type {{ words: string[], targets: string[], nested: boolean }[]} */
  const out = [];
  const escape = powershell ? '`' : '\\';
  const s = source.replace(powershell ? /`\r?\n/g : /\\\r?\n/g, '');
  let words = [], targets = [], word = '', started = false, quoted = false, quote = null, redirect = false, depth = 0, backticks = false;
  const endWord = () => {
    if (started) {
      if (redirect) {
        redirect = false;
        targets.push(word);
      } else words.push(word);
      if (quoted && /[\s;&|()`<>]/.test(word)) out.push(...commands(word, powershell, true));
    }
    word = '';
    started = quoted = false;
  };
  const endCommand = (subshell = false) => {
    endWord();
    if (words.length || targets.length) out.push({ words, targets, nested: nested || subshell || depth > 0 || backticks });
    words = [];
    targets = [];
    redirect = false;
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === escape && quote === '"' && i + 1 < s.length && (powershell || BASH_QUOTED_ESCAPES.includes(s[i + 1]))) word += s[++i];
      else word += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      started = quoted = true;
    } else if (c === escape) {
      word += s[++i] ?? '';
      started = quoted = true;
    } else if (c === '<' || c === '>' || (c === '&' && s[i + 1] === '>')) {
      // A file descriptor number in front (2>&1) and the target after are no words of the command.
      if (!quoted && /^\d+$/.test(word)) started = false;
      endWord();
      while (/[<>&|]/.test(s[i + 1] ?? '')) i++;
      redirect = true;
    } else if (c === '\n' || ';&|()'.includes(c) || (c === '`' && !powershell)) {
      // A command before a single | or & runs in a subshell: a pipeline part or a background job.
      endCommand('|&'.includes(c) && s[i + 1] !== c);
      if (c === '(') depth++;
      else if (c === ')' && depth) depth--;
      else if (c === '`') backticks = !backticks;
    }
    // The braces of a PowerShell script block stand next to its first and last word: {gh pr merge 1}.
    else if (/\s/.test(c) || (powershell && '{}'.includes(c))) endWord();
    else {
      word += c;
      started = true;
    }
  }
  endCommand();
  return out;
}

const program = (word) => word.split(/[/\\]/).pop().toLowerCase().replace(/\.exe$/, '');
// A launcher also goes by its package with a version (npx @anthropic-ai/claude-code@latest) and, on Windows, by its script file (claude.cmd).
const launcher = (word) => program(word).replace(/@[^@]*$/, '').replace(/\.(cmd|ps1|bat)$/, '');

const GIT = gitProgram();
// Without git every query fails: no tag, no branch and no remote's default branch is known, so every push is denied.
const gitIn = (dir, args) => (GIT ? spawnSync(GIT, ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }) : { status: 1 });
const hasRef = (dir, ref) => gitIn(dir, ['show-ref', '--verify', '--quiet', ref]).status === 0;
const gitLine = (dir, args) => {
  const r = gitIn(dir, args);
  return r.status === 0 ? r.stdout.trim() : '';
};
// The branch part of origin/main.
const branchOf = (remoteRef) => remoteRef.slice(remoteRef.indexOf('/') + 1);

// A refspec side names a tag: refs/tags/, a tag of the repository, or a version name that is no local branch.
const isTag = (dir, name) =>
  name.startsWith('refs/tags/') ||
  (!!name && !name.startsWith('refs/') && name !== 'HEAD' && name !== '@' &&
    (hasRef(dir, `refs/tags/${name}`) || (!name.includes('/') && VERSION.test(name) && !hasRef(dir, `refs/heads/${name}`))));

// The existing folder a cd, a Set-Location or `git -C` names. A variable, a missing folder, `cd -`, a bare cd, a second
// target and a tilde (the home folder, or in quotes a folder of that name) stay unresolved.
function folder(dir, args) {
  const targets = args.filter((w) => !w.startsWith('-'));
  if (targets.length !== 1 || targets[0].startsWith('~')) return null;
  const to = resolve(dir, targets[0]);
  return statSync(to, { throwIfNoEntry: false })?.isDirectory() ? to : null;
}

// known: dir is the folder git runs in. Otherwise dir is one of the folders it may run in, and only a named branch is read.
function push(args, dir, known) {
  const positionals = [];
  let repo;
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (w === '--') {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (w.startsWith('--')) {
      const name = w.slice(2).split('=')[0];
      const denied = name && PUSH_OPTIONS.find(([option]) => option.startsWith(name));
      if (denied) return denied[1];
      // --repo, or its prefix --rep, names the remote of a push without positionals.
      if (name === 'rep' || name === 'repo') repo = w.includes('=') ? w.slice(w.indexOf('=') + 1) : args[i + 1];
      if (!w.includes('=') && ['--push-option', '--receive-pack', '--exec', '--repo', '--rep'].includes(w)) i++;
    } else if (w.startsWith('-') && w.length > 1) {
      if (w.endsWith('o')) i++;
    } else positionals.push(w);
  }
  // Without a refspec, git pushes the current branch to its push target.
  const pushTarget = positionals.length > 1 ? '' : gitLine(dir, ['rev-parse', '--abbrev-ref', '@{push}']);
  // A push that names no remote goes where git sends it: the branch's pushRemote, remote.pushDefault, the branch's remote,
  // the sole remote, else origin.
  const pushRemote = () => {
    const branch = gitLine(dir, ['symbolic-ref', '--short', 'HEAD']);
    const config = (key) => gitLine(dir, ['config', '--get', key]);
    const sole = () => {
      const names = gitLine(dir, ['remote']).split('\n');
      return names.length === 1 && names[0] ? names[0] : 'origin';
    };
    return (branch && config(`branch.${branch}.pushRemote`)) || config('remote.pushDefault') || (branch && config(`branch.${branch}.remote`)) || sole();
  };
  const [remote = repo ?? pushRemote(), ...specs] = positionals;
  if (specs.includes('tag')) return 'a tag push';
  const remoteHead = /^[\w.-]+$/.test(remote) ? gitLine(dir, ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`]) : '';
  const defaults = new Set([...DEFAULT_BRANCHES, remoteHead && branchOf(remoteHead)].filter(Boolean));
  const targets = specs.length ? [] : ['HEAD', branchOf(pushTarget)];
  for (const spec of specs) {
    // git resolves tags/x and heads/x as refs/tags/x and refs/heads/x.
    const [src, dst = src] = spec.replace(/^\+/, '').split(':').map((side) => side.replace(/^(tags|heads)\//, 'refs/$1/'));
    if (isTag(dir, src) || isTag(dir, dst)) return 'a tag push';
    targets.push(dst === '@' ? 'HEAD' : dst.replace(/^refs\/heads\//, ''));
  }
  // A push of the current branch passes only where the guard can read which branch that is.
  if (targets.includes('HEAD')) {
    const current = known ? gitLine(dir, ['symbolic-ref', '--short', 'HEAD']) : '';
    if (!current) return UNREAD_BRANCH;
    targets.push(current);
  }
  // A URL, a path or a remote never fetched names no default branch; the same command may create the repository it pushes from.
  if (!remoteHead) return UNREAD_DEFAULT;
  const target = targets.find((branch) => defaults.has(branch));
  return target ? `a push to the default branch ${target}` : null;
}

// gitDir: the command text sets GIT_DIR.
function git(args, cwd, known, gitDir) {
  let i = 0;
  let dir = cwd;
  for (; i < args.length && args[i].startsWith('-'); i++) {
    if (/^(-c|--config-env)/.test(args[i])) return 'git -c';
    if (args[i] === '-C') {
      const to = folder(dir, [args[i + 1] ?? '']);
      if (to) dir = to;
      else known = false;
    }
    if (/^--git-dir(=|$)/.test(args[i])) gitDir = true;
    if (GIT_VALUE_OPTS.has(args[i])) i++;
  }
  const [sub, ...rest] = args.slice(i);
  if (sub === 'stash') return 'git stash';
  // git then pushes from the repository GIT_DIR or --git-dir names, whose branches and remotes the guard does not read.
  if (sub === 'push' && gitDir) return GIT_DIR_PUSH;
  // Only the explicit read forms pass: `git config <key>` alone reads too, but `--get` says so.
  if (sub === 'config' && !(rest.some((w) => CONFIG_READ.test(w)) && !rest.some((w) => CONFIG_WRITE.test(w)))) return 'git config';
  return sub === 'push' ? push(rest, dir, known) : null;
}

// gh api's flags as gh reads them: grouped short flags (-iX PUT), values joined (-XPUT, --method=PUT) or in the next word.
function apiCall(args) {
  /** @type {{ method: string | null, fields: string[], input: boolean, positionals: string[] }} */
  const call = { method: null, fields: [], input: false, positionals: [] };
  const take = (flag, value = '') => {
    if (flag === 'X' || flag === 'method') call.method = value.toUpperCase();
    if (['f', 'F', 'field', 'raw-field'].includes(flag)) call.fields.push(value);
    if (flag === 'input') call.input = true;
  };
  for (let j = 0; j < args.length; j++) {
    const w = args[j];
    if (w === '--') {
      call.positionals.push(...args.slice(j + 1));
      break;
    } else if (w.startsWith('--')) {
      const eq = w.indexOf('=');
      const name = eq < 0 ? w.slice(2) : w.slice(2, eq);
      if (API_VALUE_FLAGS.has(name)) take(name, eq < 0 ? args[++j] : w.slice(eq + 1));
    } else if (w.startsWith('-') && w.length > 1) {
      const k = [...w.slice(1)].findIndex((ch) => ch !== 'i') + 1;
      if (k > 0) take(w[k], w.slice(k + 1).replace(/^=/, '') || args[++j]);
    } else call.positionals.push(w);
  }
  return call;
}

// A path with each percent escape decoded, as the server may read it.
const decoded = (path) => path.replace(/%[\da-f]{2}/gi, (escape) => String.fromCharCode(parseInt(escape.slice(1), 16)));

// source: the command text and its words with quotes resolved, where a mutation split by quotes is whole.
function api(args, source) {
  const call = apiCall(args);
  // A REST call to /graphql or its full URL reaches the same endpoint, its fields sent as the JSON body. The request line
  // carries no fragment (#x), and a host may read the path in any case and with trailing slashes.
  if (/(^|\/)graphql\/*$/i.test(decoded(call.positionals[0] ?? '').split(/[?#]/)[0] ?? '')) {
    // A query read from a file stays unseen, so it is denied.
    if (call.input || call.fields.some((v) => /^query=@/.test(v ?? ''))) return 'a gh api graphql query from a file';
    if (MUTATIONS.test(source)) return 'a gh api graphql mutation';
  }
  // A REST path can end in graphql as well (a repository, branch or user of that name).
  const writes = call.method ? call.method !== 'GET' : call.fields.length > 0 || call.input;
  const path = writes && call.positionals.find((p) => API_PATHS.test(p) || API_PATHS.test(decoded(p)));
  return path ? `gh api ${path}` : null;
}

function gh(args, source) {
  const words = [];
  for (let j = 0; j < args.length; j++) {
    if (GH_VALUE_FLAGS.has(args[j])) j++;
    else if (!args[j].startsWith('-')) words.push([args[j], j]);
  }
  const [[sub, at] = [], [verb] = []] = words;
  if (GH_READS.has(sub) && !GH_READS.get(sub).includes(verb)) return `gh ${sub} ${verb ?? ''}`.trim();
  if (GH_WRITES.get(sub)?.includes(verb)) return `gh ${sub} ${verb}`;
  return sub === 'api' ? api(args.slice(at + 1), source) : null;
}

function reason({ tool_name: tool, tool_input: toolInput }, cwd) {
  const cmd = toolInput?.command;
  // A Monitor call on a WebSocket runs no command.
  if (tool === 'Monitor' && cmd === undefined && toolInput?.ws) return null;
  if (typeof cmd !== 'string') return 'a command the guard cannot read';
  // A guarded session must not start another one as the coordinator; Windows reads the name in any case.
  if (cmd.replace(/["'\\`]/g, '').toUpperCase().includes(ROLE)) return `a command that names ${ROLE}`;
  const powershell = tool === 'PowerShell';
  const changesDir = (w) => CHANGE_DIR.has(powershell ? w.toLowerCase() : w);
  // The folder git runs in is known in the session's folder and after a cd to an existing folder that the command starts with.
  // Any other folder change (later, conditional, nested, undone, unresolved, or in a comment or a here-document) may or may
  // not hold where git runs: from then on git is read in every folder seen, and a push has to name its branch.
  let dir = cwd, known = true, first = changesDir(/\S*/.exec(cmd.trimStart())[0]);
  const seen = [cwd];
  const parsed = commands(cmd, powershell);
  const source = [cmd, ...parsed.flatMap((c) => c.words)].join('\n');
  // Before the command, through env or export in bash, or $env:GIT_DIR in PowerShell.
  const gitDir = /\bGIT_DIR\s*=/i.test(cmd);
  for (const { words, nested } of parsed) {
    if (!words.length) continue;
    const at = words.findIndex(changesDir);
    if (at >= 0) {
      // popd and Pop-Location name no folder.
      const to = /^pop/i.test(words[at]) ? null : folder(dir, words.slice(at + 1));
      if (!to || nested || !first) known = false;
      if (to) {
        dir = to;
        seen.push(to);
      }
    }
    if (!nested) first = false;
    for (let j = 0; j < words.length; j++) {
      const name = program(words[j]);
      const rest = words.slice(j + 1);
      const why =
        name === 'git' ? (known ? [dir] : seen).reduce((found, d) => found ?? git(rest, d, known, gitDir), null)
        : name === 'gh' ? gh(rest, source)
        : name === 'claude' && rest.includes(BARE) ? 'a launch in bare mode, which runs no hooks'
        : null;
      if (why) return why;
    }
  }
  return null;
}

const escapeRegExp = (text) => text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
// In command text a name ends at a character that cannot continue it: a space, a quote, ;, | or the end.
const names = (text, [parent, child]) => new RegExp(`${escapeRegExp(parent)}[\\\\/]+${escapeRegExp(child)}(?![\\w.-])`, 'i').test(text);
const ANY = 0;
const ONE = 1;
// A path segment as the shell may expand it: * stands for any characters (a leading dot included), ? and [...] for any one;
// matched in linear steps, as a regular expression of many * backtracks for long.
const matches = (segment, name) => {
  const tokens = segment.toLowerCase().split(/(\[[^\]]*\]|\*+|\?)/).flatMap((part, i) => (i % 2 ? [part[0] === '*' ? ANY : ONE] : [...part]));
  const chars = [...name.toLowerCase()];
  let t = 0, c = 0, star = -1, mark = 0;
  while (c < chars.length) {
    if (tokens[t] === ANY) { star = t++; mark = c; }
    else if (t < tokens.length && (tokens[t] === ONE || tokens[t] === chars[c])) { t++; c++; }
    else if (star >= 0) { t = star + 1; c = ++mark; }
    else return false;
  }
  while (tokens[t] === ANY) t++;
  return t === tokens.length;
};
const wild = (segment) => /[*?[]/.test(segment);
// A resolved path is the folder or inside it, in any case, since macOS and Windows read paths so. Two wildcard segments in a
// row (*/*) count as no match: ordinary commands use them, and by default bash and zsh expand * to no dot folder.
const inside = (path, [parent, child]) => {
  const parts = path.split(/[\\/]+/);
  return parts.some((part, i) => i + 1 < parts.length && !(wild(part) && wild(parts[i + 1])) && matches(part, parent) && matches(parts[i + 1], child));
};

// Every path a command may reach: the session folder, the folder each cd, pushd or Set-Location names (its first word that is
// no option, read from the folder the cd before it reached), and each word and redirection target read from each of those
// folders; null past MAX_FOLDERS.
function reached(parsed, cwd) {
  const seen = [resolve(cwd)];
  const paths = [];
  const local = (word) => word.replace(/\\/g, '/');
  for (const { words, targets } of parsed) {
    for (const word of [...words, ...targets]) for (const dir of seen) paths.push(resolve(dir, local(word)));
    const at = words.findIndex((word) => CHANGE_DIR.has(word.toLowerCase()));
    const to = at >= 0 && words.slice(at + 1).find((w) => !w.startsWith('-'));
    if (to) seen.push(resolve(seen.at(-1), local(to)));
    if (seen.length > MAX_FOLDERS) return null;
  }
  return [...seen, ...paths];
}

// The coordinator files a question through approval.mjs, which writes a new file; changing one, its answer included, is the owner's.
function queue({ tool_name: tool, tool_input: toolInput, agent_id: agent }, cwd) {
  // Only the ask hook writes the window files: a session that wrote one could open the window for itself.
  const data = process.env.CLAUDE_PLUGIN_DATA;
  const window = data ? [basename(resolve(data)), 'ask'] : null;
  let texts = [];
  let paths;
  if (EDITS.has(tool)) {
    const fields = EDIT_PATHS.filter((key) => toolInput?.[key] !== undefined).map((key) => toolInput[key]);
    if (!fields.length || fields.some((path) => typeof path !== 'string')) return 'an edit the guard cannot read';
    paths = [resolve(cwd), ...fields.map((path) => resolve(cwd, path))];
  } else {
    const cmd = toolInput?.command;
    if (typeof cmd !== 'string') return null;
    const parsed = commands(cmd, tool === 'PowerShell');
    texts = [cmd, ...parsed.flatMap(({ words, targets }) => [...words, ...targets])];
    paths = reached(parsed, cwd);
    if (!paths) return `a command with more than ${MAX_FOLDERS} folders to follow, which may name the local question queue (.cedarloom/questions/),`;
    if (QUESTIONS.test(texts.join('\n')) && parsed.some(({ words }) => words.some((word) => LAUNCHERS.has(launcher(word))))) {
      return 'a session started with /cl-workflow:questions, which could write into the local question queue (.cedarloom/questions/),';
    }
  }
  const hits = (folder) => texts.some((text) => names(text, folder)) || paths.some((path) => inside(path, folder));
  if (window && hits(window)) return 'a write into the question window files of /cl-workflow:ask, or a command that names them,';
  // The window is the Claude Code process's: a subagent of the session that answers writes nothing there.
  if (!agent && openUntil(windowFile(), Date.now(), true) !== null) return null;
  return hits(QUEUE) ? 'a write into the local question queue (.cedarloom/questions/), or a command that names it,' : null;
}

// Exit 2 refuses the call; onFailure "block" also refuses it when the hook cannot start.
const refuse = (what) => {
  process.stderr.write(`CedarLoom role guard: ${what}, so the call is refused.\n`);
  process.exitCode = 2;
};
const input = await text(process.stdin).then(JSON.parse).catch(() => null);
if (input === null || typeof input !== 'object' || Array.isArray(input)) refuse('the hook input is no JSON object');
else {
  let line = null;
  try {
    const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
    const owners = queue(input, cwd);
    // A subagent inherits the coordinator's environment, so only the coordinator's main session passes.
    const why = owners || EDITS.has(input.tool_name) || (process.env[ROLE] === 'coordinator' && !input.agent_id) ? null : reason(input, cwd);
    if (owners) line = `CedarLoom role guard: ${owners} is the owner's step: only a session where the user typed /cl-workflow:questions writes answers there. File a question with approval.mjs file and read answers with approval.mjs queue. Text that only mentions the folder goes in a file (-F, --body-file).`;
    else if (why) line = `CedarLoom role guard: ${why} is the coordinator's step, and this session does not run as the coordinator (${ROLE}=coordinator in the main session, set by the user who starts it). Leave the step to the coordinator and name it in your report. Text that only mentions such a command goes in a file (-F, --body-file).`;
  } catch (error) {
    refuse(`the guard failed (${error})`);
  }
  if (line) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: line } }));
}
