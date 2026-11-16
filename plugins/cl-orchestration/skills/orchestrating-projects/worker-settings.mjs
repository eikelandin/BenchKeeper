// Usage: node worker-settings.mjs <worktree path> <settings file> <domain>..., both paths absolute. Writes an automatic worker's settings file: automatic-settings.json with //W/ as the worktree, //C/ as the shared .git, each worktrees/* rule also once per folder under the shared .git's worktrees, and the domains (the policy's sandbox.allowedDomains) as the network allow list, plus the rules of worker-rules.json that the template's deny list does not already match. With --supervised <worktree path> instead, it writes only the rules of worker-rules.json as <worktree path>/.claude/settings.local.json, never over a file with other content. With --check first, it writes nothing and exits 0 only when the file's text is exactly what it would write now. Any other input prints the error, exits 1 and writes nothing.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { errorLine, escaped, isMain, validate } from './policy.mjs';

// A character the permission rule syntax reads as a pattern or a bracket would widen or break every rule with the path in it.
const PLAIN = /^\/[^*?[\]{}()\\\p{Cc}\p{Cf}\p{Zl}\p{Zp}]*[^/*?[\]{}()\\\p{Cc}\p{Cf}\p{Zl}\p{Zp}]$/u;

// A linked worktree's .git is a file that names its folder under the shared .git's worktrees: absolute, or relative to the worktree with worktree.useRelativePaths.
export function gitCommonDir(worktree, read = (path) => readFileSync(path, 'utf8')) {
  const named = /^gitdir: (.+)\n?$/.exec(read(`${worktree}/.git`))?.[1];
  const folder = named && resolve(worktree, named);
  if (!folder || basename(dirname(folder)) !== 'worktrees') throw new Error(`${escaped(worktree)}/.git names no folder under a shared .git's worktrees: not a linked worktree`);
  return dirname(dirname(folder));
}

// A Bash deny rule `Bash(<prefix> *)` matches every command that a rule starting with `Bash(<prefix> ` matches.
const covers = (deny, rule) => deny.includes(rule) || deny.some((d) => d.startsWith('Bash(') && d.endsWith(' *)') && rule.startsWith(d.slice(0, -2)));

// In .claude/settings.local.json a rule path that starts with / counts from the session's starting folder, the worktree, so the file names no host path.
export function supervisedSettings(rules) {
  const local = (rule) => rule.replace('(//W/', '(/');
  return { permissions: { deny: rules.deny.map(local), ask: rules.ask.map(local) } };
}

// In a --settings file a rule path that starts with / counts from the file's folder, so an absolute path takes a second /.
export function workerSettings(template, rules, worktree, commonDir, worktreeFolders, domains) {
  for (const path of [worktree, commonDir, ...worktreeFolders.map((name) => `${commonDir}/worktrees/${name}`)]) if (!PLAIN.test(path)) throw new Error(`${escaped(path)} is not an absolute path without a pattern character, a bracket or a trailing /`);
  const errors = validate({ mode: 'automatic', sandbox: { allowedDomains: domains } });
  if (errors.length) throw new Error(errors.map(errorLine).join('\n'));
  // A function as the replacement, so a $ in a path stays as written.
  const fill = (rule) => rule.replace('(//W/', () => `(/${worktree}/`).replace('(//C/', () => `(/${commonDir}/`);
  // The sandbox keeps a folder from being renamed, and so swapped for a copy, only where a rule names its path, and on Linux it skips a pattern rule for writes.
  const perFolder = (rule) => (rule.includes('(//C/worktrees/*/') ? [rule, ...worktreeFolders.map((name) => rule.replace('/worktrees/*/', () => `/worktrees/${name}/`))] : [rule]);
  const { permissions, sandbox } = template;
  const deny = [...permissions.deny, ...rules.deny.filter((rule) => !covers(permissions.deny, rule))];
  const ask = rules.ask.filter((rule) => !covers(deny, rule));
  return {
    ...template,
    permissions: { ...permissions, allow: permissions.allow.map(fill), deny: deny.flatMap(perFolder).map(fill), ask: ask.map(fill) },
    sandbox: { ...sandbox, network: { ...sandbox.network, allowedDomains: domains } },
  };
}

if (isMain(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const check = args[0] === '--check';
    if (check) args.shift();
    const supervised = args[0] === '--supervised';
    if (supervised) args.shift();
    const read = (name) => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'));
    const rules = read('worker-rules.json');
    let file;
    let settings;
    if (supervised) {
      const [worktree, ...rest] = args;
      if (!worktree || rest.length) throw new Error('usage: node worker-settings.mjs [--check] --supervised <worktree path>');
      if (!isAbsolute(worktree)) throw new Error(`${escaped(worktree)} is not an absolute path`);
      file = `${worktree}/.claude/settings.local.json`;
      settings = supervisedSettings(rules);
    } else {
      const [worktree, settingsFile, ...domains] = args;
      file = settingsFile;
      if (!file) throw new Error('usage: node worker-settings.mjs [--check] <worktree path> <settings file> <domain>...');
      // The launch's --settings resolves a relative path in the worker's terminal folder, the worktree, not here.
      if (!isAbsolute(file)) throw new Error(`${escaped(file)} is not an absolute path`);
      // The worker writes its worktree: a settings file there would be the worker's to change.
      const inside = relative(worktree, file);
      if (inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside)) throw new Error('the settings file must lie outside the worktree');
      const commonDir = gitCommonDir(worktree);
      settings = workerSettings(read('automatic-settings.json'), rules, worktree, commonDir, readdirSync(`${commonDir}/worktrees`).sort(), domains);
    }
    const text = `${JSON.stringify(settings, null, 2)}\n`;
    // A repository can commit .claude as a link, which would put the file outside the worktree.
    if (supervised && lstatSync(dirname(file), { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`${escaped(dirname(file))} is a link: not written or read`);
    if (check) {
      // Claude Code loads an empty file as no settings and starts without the sandbox, and another parser may read a duplicate key otherwise than JSON.parse, so the file's text must be the one this script writes.
      if (readFileSync(file, 'utf8') !== text) throw new Error(`${escaped(file)} is not the settings file this script writes for those arguments`);
    } else if (supervised && existsSync(file)) {
      // A file the repository tracks or a person wrote stays theirs.
      if (readFileSync(file, 'utf8') !== text) throw new Error(`${escaped(file)} exists with other content: not overwritten`);
    } else {
      mkdirSync(dirname(file), { recursive: true });
      // wx: no write through a dangling link in the worktree.
      writeFileSync(file, text, { flag: supervised ? 'wx' : 'w' });
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
