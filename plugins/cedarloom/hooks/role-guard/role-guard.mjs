// PreToolUse hook for Bash: a session that does not run as the coordinator (CEDARLOOM_ROLE=coordinator) may not merge, release,
// push tags, change repository settings or security, use gh auth, write git config or use git stash.
// It stops a session that forgets its role, not one that works around it (variables, aliases, scripts, another tool):
// the boundary is a gh token without those rights.
import { text } from 'node:stream/consumers';

const ROLE = 'CEDARLOOM_ROLE';

// gh flags that take the next word as their value, wherever they stand (gh pr -R owner/repo merge).
const GH_VALUE_FLAGS = new Set(['-R', '--repo', '--hostname', '-b', '--body', '-F', '--body-file', '-f', '--field', '--raw-field', '-X', '--method', '-H', '--header', '-q', '--jq', '-t', '--template', '--input', '-p', '--preview', '--cache']);
// Per gh command, the verbs that only read: every other verb is denied.
const GH_READS = new Map([['auth', []], ['release', ['list', 'view', 'download', 'verify', 'verify-asset']], ['secret', ['list']], ['variable', ['list', 'get']]]);
// Per gh command, the verbs that are denied.
const GH_WRITES = new Map([['pr', ['merge']], ['repo', ['edit', 'rename', 'archive', 'unarchive', 'delete', 'deploy-key']], ['workflow', ['enable', 'disable']], ['config', ['set']], ['alias', ['set', 'import', 'delete']], ['ssh-key', ['add', 'delete']], ['gpg-key', ['add', 'delete']]]);
// REST paths that merge, release, write refs or change settings and security, when called with a method other than GET.
const API_PATHS = /(^|\/)(repos\/[^/]+\/[^/?]+\/?($|\?)|orgs\/|user(\/|$))|\/(pulls\/[^/]+\/merge|merges|releases|git\/(refs|tags)|branches\/[^/]+\/protection|rulesets|hooks|collaborators|invitations|keys|actions\/(permissions|secrets|variables)|environments|pages|dependabot|codespaces|code-scanning|secret-scanning|security-advisories|vulnerability-alerts|automated-security-fixes|private-vulnerability-reporting|transfer|topics)\b/;
const MUTATIONS = /\b(mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest|(create|update|delete)(BranchProtectionRule|RepositoryRuleset|Refs?)|updateRepository\w*|(un)?archiveRepository|dismissRepositoryVulnerabilityAlert)\b/;
const GIT_VALUE_OPTS = new Set(['-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix']);
const CONFIG_READ = /^(--get(-all|-regexp|-urlmatch|-color|colorbool)?|-l|--list|get|list)$/;
const CONFIG_WRITE = /^(--(unset|unset-all|add|replace-all|rename-section|remove-section|edit)|-e|set|unset|rename-section|remove-section|edit)$/;

// The words of each command, roughly as the shell splits them. Quotes and backslashes go and quoted words stay separate,
// so `bash -c "gh pr merge 1"` shows its gh; every word is checked as a command, so text that names one is denied too.
const commands = (cmd) => cmd.split(/[;&|()`\n]/).map((part) => part.replace(/["'\\]/g, '').split(/\s+/).filter(Boolean));
const program = (word) => word.split('/').pop().toLowerCase().replace(/\.exe$/, '');

function git(args) {
  let i = 0;
  for (; i < args.length && args[i].startsWith('-'); i += GIT_VALUE_OPTS.has(args[i]) ? 2 : 1) {
    if (/^(-c|--config-env)/.test(args[i])) return 'git -c';
  }
  const [sub, ...rest] = args.slice(i);
  if (sub === 'stash') return 'git stash';
  // Only the explicit read forms pass: `git config <key>` alone reads too, but `--get` says so.
  if (sub === 'config' && !(rest.some((w) => CONFIG_READ.test(w)) && !rest.some((w) => CONFIG_WRITE.test(w)))) return 'git config';
  const tagRef = (w) => !w.startsWith('-') && w.split(':').some((side) => /^\+?(refs\/tags\/|v?\d+(\.\d+)+$)/.test(side));
  if (sub === 'push' && rest.some((w) => /^--(tags|follow-tags|mirror)$/.test(w) || w === 'tag' || tagRef(w))) return 'a tag push';
  return null;
}

function api(args, endpoint, cmd) {
  if (endpoint === 'graphql') {
    // A query read from a file stays unseen, so it is denied.
    if (args.some((w) => w.startsWith('--input') || /(^|=)query=@/.test(w))) return 'a gh api graphql query from a file';
    return MUTATIONS.test(cmd) ? 'a gh api graphql mutation' : null;
  }
  let method = null;
  args.forEach((w, j) => {
    const m = /^(?:-X|--method=?)(.*)$/.exec(w);
    if (m) method = (m[1] || args[j + 1] || '').toUpperCase();
  });
  const writes = method ? method !== 'GET' : args.some((w) => /^(-[fF]|--(raw-)?field|--input)/.test(w));
  return writes && API_PATHS.test(endpoint ?? '') ? `gh api ${endpoint}` : null;
}

function gh(args, cmd) {
  const words = [];
  for (let j = 0; j < args.length; j++) {
    if (GH_VALUE_FLAGS.has(args[j])) j++;
    else if (!args[j].startsWith('-')) words.push(args[j]);
  }
  const [sub, verb] = words;
  if (GH_READS.has(sub) && !GH_READS.get(sub).includes(verb)) return `gh ${sub} ${verb ?? ''}`.trim();
  if (GH_WRITES.get(sub)?.includes(verb)) return `gh ${sub} ${verb}`;
  return sub === 'api' ? api(args, words[1], cmd) : null;
}

function reason(cmd) {
  if (typeof cmd !== 'string') return null;
  // A guarded session must not start another one as the coordinator.
  if (cmd.includes(ROLE)) return `a command that names ${ROLE}`;
  for (const words of commands(cmd)) {
    for (let j = 0; j < words.length; j++) {
      const name = program(words[j]);
      const why = name === 'git' ? git(words.slice(j + 1)) : name === 'gh' ? gh(words.slice(j + 1), cmd) : null;
      if (why) return why;
    }
  }
  return null;
}

const input = JSON.parse(await text(process.stdin));
if (process.env[ROLE] !== 'coordinator' && input.tool_name === 'Bash') {
  const why = reason(input.tool_input?.command);
  if (why) {
    const line = `CedarLoom role guard: ${why} is the coordinator's step, and this session does not run as the coordinator (${ROLE}=coordinator, set by the user who starts it). Leave the step to the coordinator and name it in your report. Text that only mentions such a command goes in a file (-F, --body-file).`;
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: line } }));
  }
}
