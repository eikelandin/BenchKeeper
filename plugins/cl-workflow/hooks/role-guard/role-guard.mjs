// PreToolUse hook for Bash, Monitor and PowerShell: a session that does not run as the coordinator (CEDARLOOM_ROLE=coordinator),
// and every subagent, may not merge, release, push tags or to the default branch, change repository settings or security,
// use gh auth, write git config, use git stash or start a session in bare mode, which runs no hooks.
// It stops a session that forgets its role, not one that works around it (variables, aliases, scripts, another tool):
// the boundary is a gh token without those rights.
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { text } from 'node:stream/consumers';
import { gitProgram } from '../git-program.mjs';

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
// A release tag name such as v1.2.0, app-v6.27.0 or setup-v6.27; branch names with a folder (dependabot/npm/x-1.2.3) are not read as tags.
const VERSION = /(^|[-_@])v?\d+(\.\d+)+/;
// Bare mode runs no hooks (https://code.claude.com/docs/en/headless#start-faster-with-bare-mode).
const BARE = '--bare';
const DEFAULT_BRANCHES = ['main', 'master'];
// Commands that change the folder the following commands run in, in bash and PowerShell.
const CHANGE_DIR = new Set(['cd', 'pushd', 'popd', 'chdir', 'set-location', 'sl', 'push-location', 'pop-location']);
const UNREAD_BRANCH = 'a push without a branch name from a folder the guard cannot read (name it: git push <remote> <branch>)';
const GIT_DIR_PUSH = 'a push from the repository GIT_DIR or --git-dir names, which the guard does not read (push from its folder: git -C <dir> push <remote> <branch>)';
const UNREAD_DEFAULT = 'a push to a remote whose default branch the guard cannot read (push to a remote by name whose refs/remotes/<remote>/HEAD is set: git remote set-head <remote> --auto)';
// The characters the guard reads and the commands it checks at most: quoted text nested so deep that its readings multiply
// past them is refused instead of read.
const budget = { read: 1 << 26, checked: 100_000 };
const spend = (kind, amount) => {
  if ((budget[kind] -= amount) < 0) throw new Error('quoted text nested deeper than the guard reads');
};

// Inside double quotes bash drops a backslash only before these (https://www.gnu.org/software/bash/manual/html_node/Double-Quotes.html).
const BASH_QUOTED_ESCAPES = '$`"\\';
// Bash's ANSI-C quoting $'...' (https://www.gnu.org/software/bash/manual/html_node/ANSI_002dC-Quoting.html).
const ANSI_C = /\$'((?:[^'\\]|\\[\s\S])*)'?/y;
// bash 5.2 reads \c\\ as one escape.
const ANSI_C_ESCAPE = /\\(?:([abeEfnrtv\\'"?])|([0-7]{1,3})|x\{([\da-fA-F]*)\}?|x([\da-fA-F]{1,2})|u([\da-fA-F]{1,4})|U([\da-fA-F]{1,8})|c(\\\\|[\s\S]))/gu;
// zsh's $'...': an unknown escape and \c drop the backslash, \x, \u and \U without digits are NUL, there is no \x{...},
// and \x reads the two characters after it as a number, so it skips blanks and takes a sign. \C, \C-, \M and \M- make
// a control or meta character of the next character or escape other than \u and \U, and of nothing at the end of the text.
const ZSH_ANSI_C_ESCAPE = /\\(?:([CM])-?|([abeEfnrtv\\'"?])|([0-7]{1,3})|x([\s\S]{0,2})|u([\da-fA-F]{0,4})|U([\da-fA-F]{0,8})|([\s\S]))|([\s\S])/gu;
const ZSH_HEX = /^[ \t]*([-+]?)([\da-fA-F]*)/;
const ANSI_C_CHARS = { a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
// U+FFFD stands for text that is no ASCII: a \U value above U+10FFFF, which bash 5.2 and zsh write as bytes of no character.
const NOT_ASCII = String.fromCharCode(0xfffd);
// The shells write an octal or hex escape and a zsh control or meta character as bytes. A byte from 0x80 stays a lone
// surrogate (U+DC80 to U+DCFF) until its word ends, where each run of them is read as UTF-8, as the file system and the
// programs read it: \303\251 is é.
const byte = (code) => String.fromCharCode(code < 0x80 ? code : 0xdc00 + code);
const isByte = (code) => code >= 0xdc80 && code <= 0xdcff;
const UTF8 = new TextDecoder('utf-8', { ignoreBOM: true });
const utf8 = (word) => word.replace(/[\udc80-\udcff]+/gu, (run) => UTF8.decode(Uint8Array.from(run, (char) => char.charCodeAt(0) & 0xff)));
// bash 5.2 drops a \U value above 0x7FFFFFFF.
const codePoint = (code, zsh) => (code <= 0x10ffff ? String.fromCodePoint(code) : code > 0x7fffffff && !zsh ? '' : NOT_ASCII);
// The text of $'...' with its escapes decoded as zsh 5.9 reads them.
function zshAnsiC(body) {
  let out = '', control = false, meta = false;
  for (let m; (m = ZSH_ANSI_C_ESCAPE.exec(body)); ) {
    const [, prefix, char, octal, hex, u, U, unknown, plain] = m;
    if (prefix === 'C') control = true;
    else if (prefix) meta = true;
    // zsh writes a \u or \U character without applying a prefix, which then waits for the next one.
    else if (u !== undefined || U !== undefined) out += codePoint(parseInt(u || U || '0', 16), true);
    else {
      let text = char ? (ANSI_C_CHARS[char] ?? char) : octal ? byte(parseInt(octal, 8) & 0xff) : (unknown ?? plain);
      if (hex !== undefined) {
        const [read, sign, digits] = ZSH_HEX.exec(hex);
        ZSH_ANSI_C_ESCAPE.lastIndex = m.index + 2 + read.length;
        text = byte((sign === '-' ? -1 : 1) * parseInt(digits || '0', 16) & 0xff);
      }
      if (!control && !meta) out += text;
      else {
        // A prefix changes the first byte of the character: \C- clears two of its bits (\C-? is DEL), then \M- sets its high bit.
        const [first, ...rest] = isByte(text.charCodeAt(0)) ? [text.charCodeAt(0) & 0xff] : Buffer.from(text);
        out += [(control ? (first === 0x3f ? 0x7f : first & 0x9f) : first) | (meta ? 0x80 : 0), ...rest].map(byte).join('');
      }
      control = meta = false;
    }
  }
  return out;
}
// The text of $'...' with its escapes decoded as bash reads them, or as zsh does: bash keeps the backslash of an unknown escape,
// and both keep the low byte of an octal or (bash) \x{...} value.
const ansiC = (body, zsh) =>
  zsh
    ? zshAnsiC(body)
    : body.replace(ANSI_C_ESCAPE, (_, char, octal, braced, hex, u, U, control) => {
        if (char) return ANSI_C_CHARS[char] ?? char;
        if (octal) return byte(parseInt(octal, 8) & 0xff);
        if (braced !== undefined) return byte(parseInt(braced.slice(-2) || '0', 16));
        if (control) {
          // \c keeps five bits of the first byte of the character (\c? is DEL).
          const [first, ...rest] = Buffer.from(control === '\\\\' ? '\\' : control);
          return [control === '?' ? 0x7f : first & 0x1f, ...rest].map(byte).join('');
        }
        return hex ? byte(parseInt(hex, 16)) : codePoint(parseInt(u ?? U, 16), false);
      });

// The commands of a shell text, each a list of words with quotes and escapes resolved, as the shell splits them: a line
// continuation joins its lines, a quoted word stays whole, and redirections are dropped. The text of a quoted word is read again
// as commands, so `bash -c "gh pr merge 1"` shows its gh; text that only names such a command is denied as well.
// A command from quoted text, parentheses, backticks, a pipeline or a background job is marked nested: a folder change there
// may not reach the commands after it.
// PowerShell escapes and continues lines with the backtick and keeps the backslash as a plain character
// (https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_special_characters).
// reading: 'bash' or 'zsh' reads $'...', $"..." and $$ as that shell does (zsh keeps the $ of $"..."), 'plain' reads $ as
// a plain character, as a shell without these quotes does.
// Text read again stands in the list as { text, readings }: another shell may run it (zsh passes it to bash -c), so it is
// read as each shell does, whatever shell reads the text around it.
function commands(source, powershell, nested, reading) {
  /** @type {({ words: string[], nested: boolean } | { text: string, readings: object[][] })[]} */
  const out = [];
  spend('read', source.length);
  const zsh = reading === 'zsh';
  const dollar = !powershell && reading !== 'plain';
  const escape = powershell ? '`' : '\\';
  const s = source.replace(powershell ? /`\r?\n/g : /\\\r?\n/g, '');
  let words = [], word = '', started = false, quoted = false, quote = null, redirect = false, depth = 0, backticks = false;
  const again = (text) => {
    if (!AGAIN.has(text)) AGAIN.set(text, readings(text, powershell, true));
    out.push({ text, readings: AGAIN.get(text) });
  };
  const endWord = () => {
    if (started) {
      if (redirect) redirect = false;
      // A program gets a zsh word up to its first NUL.
      else words.push(utf8(zsh ? word.split('\0')[0] : word));
      if (quoted && /[\s;&|()`<>]/.test(word)) again(word);
    }
    word = '';
    started = quoted = false;
  };
  const endCommand = (subshell = false) => {
    endWord();
    if (words.length) out.push({ words, nested: nested || subshell || depth > 0 || backticks });
    words = [];
    redirect = false;
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === escape && quote === '"' && i + 1 < s.length && (powershell || BASH_QUOTED_ESCAPES.includes(s[i + 1]))) word += s[++i];
      else word += c;
    } else if (dollar && c === '$' && s[i + 1] === '$') {
      // $$ is the shell's process id, so a quote after it is a plain one.
      word += '$$';
      i++;
      started = true;
    } else if (dollar && c === '$' && s[i + 1] === "'") {
      ANSI_C.lastIndex = i;
      const [whole, body] = ANSI_C.exec(s);
      const decoded = ansiC(body, zsh);
      const [text, ...rest] = decoded.split('\0');
      word += zsh ? decoded : text;
      // In a comment or here-document $' is no quote, so the text as written is read as well; bash drops the text after a NUL,
      // zsh keeps it.
      if (/[\s;&|()`<>]/.test(body)) again(body);
      if (rest.length) again(rest.join('\n'));
      i += whole.length - 1;
      started = quoted = true;
    } else if (dollar && !zsh && c === '$' && s[i + 1] === '"') {
      // Bash reads the locale string $"..." as "..." in the C locale.
      quote = '"';
      i++;
      started = quoted = true;
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

// The readings of each text read again, so that a text is read once however many readings hold it.
const AGAIN = new Map();
// The command lists a text gives as bash, as zsh and with $ as a plain character, each distinct list once: the hook cannot
// tell which shell runs the text. Only the bash reading of the command itself has commands that are not nested.
function readings(source, powershell, nested) {
  const lists = new Map();
  for (const [extra, reading] of (powershell ? ['plain'] : ['bash', 'zsh', 'plain']).entries()) {
    const list = commands(source, powershell, nested || extra > 0, reading);
    const key = JSON.stringify(list.map((item) => item.words ?? item.text));
    if (!lists.has(key)) lists.set(key, list);
  }
  return [...lists.values()];
}

const program = (word) => word.split(/[/\\]/).pop().toLowerCase().replace(/\.exe$/, '');

const GIT = gitProgram();
// Without git every query fails: no tag, no branch and no remote's default branch is known, so every push is denied.
// The readings of a command ask the same questions, so each is asked once.
const answers = new Map();
const gitIn = (dir, args) => {
  const key = JSON.stringify([dir, args]);
  if (!answers.has(key)) answers.set(key, GIT ? spawnSync(GIT, ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }) : { status: 1 });
  return answers.get(key);
};
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
    // : and +: push the branches both sides have, a * pattern every branch it matches.
    if ((!src && !dst) || `${src}${dst}`.includes('*')) return 'a push of every branch that : or a * pattern matches';
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
  const powershell = tool === 'PowerShell';
  // A lone surrogate reaches the shell as U+FFFD; in the guard it stands for a byte of an escape.
  const lists = readings(cmd.replace(/[\ud800-\udfff]/gu, NOT_ASCII), powershell, false);
  const words = [lists, ...AGAIN.values()].flat(2).flatMap((item) => item.words ?? []);
  const source = [cmd, ...words].join('\n');
  // A guarded session must not start another one as the coordinator; Windows reads the name in any case.
  if (source.replace(/["'\\`]/g, '').toUpperCase().includes(ROLE)) return `a command that names ${ROLE}`;
  const changesDir = (w) => CHANGE_DIR.has(powershell ? w.toLowerCase() : w);
  const leadingCd = changesDir(/\S*/.exec(cmd.trimStart())[0]);
  // Before the command, through env or export in bash, or $env:GIT_DIR in PowerShell.
  const gitDir = /\bGIT_DIR\s*=/i.test(source);
  // Each reading is checked on its own from the session's folder: a folder one reading moves to is no folder of another.
  for (const list of lists) {
    // The folder git runs in is known in the session's folder and after a cd to an existing folder that the command starts with.
    // Any other folder change (later, conditional, nested, undone, unresolved, or in a comment or a here-document) may or may
    // not hold where git runs: from then on git is read in every folder seen, and a push has to name its branch.
    // dirs: the folders a cd starts from, one while the folder is known.
    const state = { dirs: [cwd], known: true, first: leadingCd, seen: new Set([cwd]) };
    const why = denied(list, state, { changesDir, gitDir, source });
    if (why) return why;
  }
  return null;
}

// The first step of a command list that is denied, or null.
function denied(list, state, command) {
  for (const { words, nested, readings: again } of list) {
    spend('checked', 1);
    if (again) {
      // Each reading of the text starts in the folders the text is read in, and the commands after it start where any
      // of the readings ends.
      const from = state.dirs;
      const ends = new Set();
      for (const reading of again) {
        state.dirs = from;
        const why = denied(reading, state, command);
        if (why) return why;
        for (const dir of state.dirs) ends.add(dir);
      }
      state.dirs = [...ends];
      continue;
    }
    const at = words.findIndex(command.changesDir);
    if (at >= 0) {
      // popd and Pop-Location name no folder.
      const to = /^pop/i.test(words[at]) ? [null] : state.dirs.map((dir) => folder(dir, words.slice(at + 1)));
      if (to.includes(null) || nested || !state.first) state.known = false;
      state.dirs = [...new Set(state.dirs.map((dir, k) => to[k] ?? dir))];
      for (const dir of to) if (dir) state.seen.add(dir);
    }
    if (!nested) state.first = false;
    for (let j = 0; j < words.length; j++) {
      const name = program(words[j]);
      const rest = words.slice(j + 1);
      const why =
        name === 'git' ? [...(state.known ? state.dirs : state.seen)].reduce((found, d) => found ?? git(rest, d, state.known, command.gitDir), null)
        : name === 'gh' ? gh(rest, command.source)
        : name === 'claude' && rest.includes(BARE) ? 'a launch in bare mode, which runs no hooks'
        : null;
      if (why) return why;
    }
  }
  return null;
}

// Exit 2 refuses the call on every Claude Code version; onFailure "block" needs 2.1.295 or later.
const refuse = (what) => {
  process.stderr.write(`CedarLoom role guard: ${what}, so the call is refused.\n`);
  process.exitCode = 2;
};
const input = await text(process.stdin).then(JSON.parse).catch(() => null);
if (input === null || typeof input !== 'object' || Array.isArray(input)) refuse('the hook input is no JSON object');
// A subagent inherits the coordinator's environment, so only the coordinator's main session passes.
else if (process.env[ROLE] !== 'coordinator' || input.agent_id) {
  let why = null;
  try {
    why = reason(input, typeof input.cwd === 'string' ? input.cwd : process.cwd());
  } catch (error) {
    refuse(`the guard failed (${error})`);
  }
  if (why) {
    const line = `CedarLoom role guard: ${why} is the coordinator's step, and this session does not run as the coordinator (${ROLE}=coordinator in the main session, set by the user who starts it). Leave the step to the coordinator and name it in your report. Text that only mentions such a command goes in a file (-F, --body-file).`;
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: line } }));
  }
}
