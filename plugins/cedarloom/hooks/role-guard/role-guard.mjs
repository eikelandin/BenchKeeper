// PreToolUse hook for Bash, Monitor and PowerShell: a session that does not run as the coordinator (CEDARLOOM_ROLE=coordinator),
// and every subagent, may not merge, release, push tags or to the default branch, change repository settings or security,
// use gh auth, write git config, use git stash or start a session in bare mode, which runs no hooks.
// It stops a session that forgets its role, not one that works around it (variables, aliases, scripts, another tool):
// the boundary is a gh token without those rights.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { text } from 'node:stream/consumers';

const ROLE = 'CEDARLOOM_ROLE';

// gh flags that take the next word as their value, wherever they stand (gh pr -R owner/repo merge).
const GH_VALUE_FLAGS = new Set(['-R', '--repo', '--hostname', '-b', '--body', '-F', '--body-file', '-f', '--field', '--raw-field', '-X', '--method', '-H', '--header', '-q', '--jq', '-t', '--template', '--input', '-p', '--preview', '--cache']);
// Per gh command, the verbs that only read: every other verb is denied.
const GH_READS = new Map([['auth', []], ['release', ['list', 'view', 'download', 'verify', 'verify-asset']], ['secret', ['list']], ['variable', ['list', 'get']]]);
// Per gh command, the verbs that are denied.
const GH_WRITES = new Map([['pr', ['merge']], ['repo', ['edit', 'rename', 'archive', 'unarchive', 'delete', 'deploy-key']], ['workflow', ['run', 'enable', 'disable']], ['config', ['set']], ['alias', ['set', 'import', 'delete']], ['ssh-key', ['add', 'delete']], ['gpg-key', ['add', 'delete']]]);
// The long flags of gh api that take a value; -i (--include) is its only short flag without one.
const API_VALUE_FLAGS = new Set(['cache', 'field', 'header', 'hostname', 'input', 'jq', 'method', 'preview', 'raw-field', 'template']);
// REST paths that merge, release, dispatch a workflow, write refs or change settings and security, when called with a method other than GET.
const API_PATHS = /(^|\/)(repos\/[^/]+\/[^/?]+\/?($|\?)|orgs\/|user(\/|$))|\/(pulls\/[^/]+\/merge|merges|releases|dispatches|git\/(refs|tags)|branches\/[^/]+\/protection|rulesets|hooks|collaborators|invitations|keys|actions\/(permissions|secrets|variables)|environments|pages|dependabot|codespaces|code-scanning|secret-scanning|security-advisories|vulnerability-alerts|automated-security-fixes|private-vulnerability-reporting|transfer|topics)\b/;
const MUTATIONS = /\b(mergePullRequest|mergeBranch|enablePullRequestAutoMerge|enqueuePullRequest|(create|update|delete)(BranchProtectionRule|RepositoryRuleset|Refs?)|updateRepository\w*|(un)?archiveRepository|dismissRepositoryVulnerabilityAlert)\b/;
const GIT_VALUE_OPTS = new Set(['-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix']);
const CONFIG_READ = /^(--get(-all|-regexp|-urlmatch|-color|colorbool)?|-l|--list|get|list)$/;
const CONFIG_WRITE = /^(--(unset|unset-all|add|replace-all|rename-section|remove-section|edit)|-e|set|unset|rename-section|remove-section|edit)$/;
// git takes any unique prefix of a long option (gitcli, "Abbreviating long options"), so a prefix of these is denied too.
const PUSH_OPTIONS = [['tags', 'a tag push'], ['follow-tags', 'a tag push'], ['mirror', 'a mirror push'], ['all', 'a push of every branch'], ['branches', 'a push of every branch']];
// A release tag name such as v1.2.0, app-v6.27.0 or setup-v6.27; branch names with a folder (dependabot/npm/x-1.2.3) are not read as tags.
const VERSION = /(^|[-_@])v?\d+(\.\d+)+/;
const DEFAULT_BRANCHES = ['main', 'master'];

// The commands of a shell text, each a list of words with quotes and backslashes resolved, as the shell splits them: a line
// continuation joins its lines, a quoted word stays whole, and redirections are dropped. The text of a quoted word is read again
// as commands, so `bash -c "gh pr merge 1"` shows its gh; text that only names such a command is denied as well.
function commands(source) {
  const out = [];
  const s = source.replace(/\\\r?\n/g, '');
  let words = [], word = '', started = false, quoted = false, quote = null, redirect = false;
  const endWord = () => {
    if (started) {
      if (redirect) redirect = false;
      else words.push(word);
      if (quoted && /[\s;&|()`<>]/.test(word)) out.push(...commands(word));
    }
    word = '';
    started = quoted = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length) out.push(words);
    words = [];
    redirect = false;
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      else word += c === '\\' && quote === '"' && i + 1 < s.length ? s[++i] : c;
    } else if (c === '"' || c === "'") {
      quote = c;
      started = quoted = true;
    } else if (c === '\\') {
      word += s[++i] ?? '';
      started = quoted = true;
    } else if (c === '<' || c === '>' || (c === '&' && s[i + 1] === '>')) {
      // A file descriptor number in front (2>&1) and the target after are no words of the command.
      if (!quoted && /^\d+$/.test(word)) started = false;
      endWord();
      while (/[<>&|]/.test(s[i + 1] ?? '')) i++;
      redirect = true;
    } else if (c === '\n' || ';&|()`'.includes(c)) endCommand();
    else if (/\s/.test(c)) endWord();
    else {
      word += c;
      started = true;
    }
  }
  endCommand();
  return out;
}

const program = (word) => word.split(/[/\\]/).pop().toLowerCase().replace(/\.exe$/, '');

const gitIn = (dir, args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 });
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

function push(args, dir) {
  const positionals = [];
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
      if (!w.includes('=') && ['--push-option', '--receive-pack', '--exec', '--repo'].includes(w)) i++;
    } else if (w.startsWith('-') && w.length > 1) {
      if (w.endsWith('o')) i++;
    } else positionals.push(w);
  }
  const [remote = 'origin', ...specs] = positionals;
  if (specs.includes('tag')) return 'a tag push';
  const remoteHead = /^[\w.-]+$/.test(remote) ? gitLine(dir, ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`]) : '';
  const defaults = new Set([...DEFAULT_BRANCHES, remoteHead && branchOf(remoteHead)].filter(Boolean));
  const current = () => gitLine(dir, ['symbolic-ref', '--short', 'HEAD']);
  // Without a refspec, git pushes the current branch to its push target.
  const targets = specs.length ? [] : [current(), branchOf(gitLine(dir, ['rev-parse', '--abbrev-ref', '@{push}']))];
  for (const spec of specs) {
    const [src, dst = src] = spec.replace(/^\+/, '').split(':');
    if (isTag(dir, src) || isTag(dir, dst)) return 'a tag push';
    targets.push(dst === 'HEAD' || dst === '@' ? current() : dst.replace(/^refs\/heads\//, ''));
  }
  const target = targets.find((branch) => defaults.has(branch));
  return target ? `a push to the default branch ${target}` : null;
}

function git(args, cwd) {
  let i = 0;
  let dir = cwd;
  for (; i < args.length && args[i].startsWith('-'); i++) {
    if (/^(-c|--config-env)/.test(args[i])) return 'git -c';
    if (args[i] === '-C') dir = resolve(dir, args[i + 1] ?? '');
    if (GIT_VALUE_OPTS.has(args[i])) i++;
  }
  const [sub, ...rest] = args.slice(i);
  if (sub === 'stash') return 'git stash';
  // Only the explicit read forms pass: `git config <key>` alone reads too, but `--get` says so.
  if (sub === 'config' && !(rest.some((w) => CONFIG_READ.test(w)) && !rest.some((w) => CONFIG_WRITE.test(w)))) return 'git config';
  return sub === 'push' ? push(rest, dir) : null;
}

// gh api's flags as gh reads them: grouped short flags (-iX PUT), values joined (-XPUT, --method=PUT) or in the next word.
function apiCall(args) {
  const call = { method: null, fields: [], input: false, positionals: [] };
  const take = (flag, value = '') => {
    if (flag === 'X' || flag === 'method') call.method = value.toUpperCase();
    if (['f', 'F', 'field', 'raw-field'].includes(flag)) call.fields.push(value);
    if (flag === 'input') call.input = true;
  };
  for (let j = 0; j < args.length; j++) {
    const w = args[j];
    const long = /^--([^=]+)(=?)(.*)$/.exec(w);
    if (w === '--') {
      call.positionals.push(...args.slice(j + 1));
      break;
    } else if (long) {
      if (API_VALUE_FLAGS.has(long[1])) take(long[1], long[2] ? long[3] : args[++j]);
    } else if (w.startsWith('-') && w.length > 1) {
      const k = [...w.slice(1)].findIndex((ch) => ch !== 'i') + 1;
      if (k > 0) take(w[k], w.slice(k + 1).replace(/^=/, '') || args[++j]);
    } else call.positionals.push(w);
  }
  return call;
}

function api(args, cmd) {
  const call = apiCall(args);
  if (call.positionals[0] === 'graphql') {
    // A query read from a file stays unseen, so it is denied.
    if (call.input || call.fields.some((v) => /^query=@/.test(v ?? ''))) return 'a gh api graphql query from a file';
    return MUTATIONS.test(cmd) ? 'a gh api graphql mutation' : null;
  }
  const writes = call.method ? call.method !== 'GET' : call.fields.length > 0 || call.input;
  const path = writes && call.positionals.find((p) => API_PATHS.test(p));
  return path ? `gh api ${path}` : null;
}

function gh(args, cmd) {
  const words = [];
  for (let j = 0; j < args.length; j++) {
    if (GH_VALUE_FLAGS.has(args[j])) j++;
    else if (!args[j].startsWith('-')) words.push([args[j], j]);
  }
  const [[sub, at] = [], [verb] = []] = words;
  if (GH_READS.has(sub) && !GH_READS.get(sub).includes(verb)) return `gh ${sub} ${verb ?? ''}`.trim();
  if (GH_WRITES.get(sub)?.includes(verb)) return `gh ${sub} ${verb}`;
  return sub === 'api' ? api(args.slice(at + 1), cmd) : null;
}

function reason(cmd, cwd) {
  if (typeof cmd !== 'string') return 'a command the guard cannot read';
  // A guarded session must not start another one as the coordinator.
  if (cmd.replace(/["'\\]/g, '').includes(ROLE)) return `a command that names ${ROLE}`;
  for (const words of commands(cmd)) {
    for (let j = 0; j < words.length; j++) {
      const name = program(words[j]);
      const rest = words.slice(j + 1);
      const why = name === 'git' ? git(rest, cwd) : name === 'gh' ? gh(rest, cmd) : name === 'claude' && rest.includes('--bare') ? 'a claude --bare launch (bare mode runs no hooks)' : null;
      if (why) return why;
    }
  }
  return null;
}

const input = JSON.parse(await text(process.stdin));
// A subagent inherits the coordinator's environment, so only the coordinator's main session passes.
if (process.env[ROLE] !== 'coordinator' || input.agent_id) {
  const why = reason(input.tool_input?.command, typeof input.cwd === 'string' ? input.cwd : process.cwd());
  if (why) {
    const line = `CedarLoom role guard: ${why} is the coordinator's step, and this session does not run as the coordinator (${ROLE}=coordinator in the main session, set by the user who starts it). Leave the step to the coordinator and name it in your report. Text that only mentions such a command goes in a file (-F, --body-file).`;
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: line } }));
  }
}
