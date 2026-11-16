// Usage: node worker-settings.mjs <worktree path> <settings file> <domain>..., both paths absolute. Writes an automatic worker's settings file: automatic-settings.json with //W/ as the worktree, //C/ as the shared .git, each worktrees/* rule also once per folder under the shared .git's worktrees, and the domains (the policy's sandbox.allowedDomains) as the network allow list. With --check first, it writes nothing and exits 0 only when the file's text is exactly what it would write now. Any other input prints the error, exits 1 and writes nothing.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// In a --settings file a rule path that starts with / counts from the file's folder, so an absolute path takes a second /.
export function workerSettings(template, worktree, commonDir, worktreeFolders, domains) {
  for (const path of [worktree, commonDir, ...worktreeFolders.map((name) => `${commonDir}/worktrees/${name}`)]) if (!PLAIN.test(path)) throw new Error(`${escaped(path)} is not an absolute path without a pattern character, a bracket or a trailing /`);
  const errors = validate({ mode: 'automatic', sandbox: { allowedDomains: domains } });
  if (errors.length) throw new Error(errors.map(errorLine).join('\n'));
  // A function as the replacement, so a $ in a path stays as written.
  const fill = (rule) => rule.replace('(//W/', () => `(/${worktree}/`).replace('(//C/', () => `(/${commonDir}/`);
  // The sandbox keeps a folder from being renamed, and so swapped for a copy, only where a rule names its path, and on Linux it skips a pattern rule for writes.
  const perFolder = (rule) => (rule.includes('(//C/worktrees/*/') ? [rule, ...worktreeFolders.map((name) => rule.replace('/worktrees/*/', () => `/worktrees/${name}/`))] : [rule]);
  const { permissions, sandbox } = template;
  return {
    ...template,
    permissions: { ...permissions, allow: permissions.allow.map(fill), deny: permissions.deny.flatMap(perFolder).map(fill) },
    sandbox: { ...sandbox, network: { ...sandbox.network, allowedDomains: domains } },
  };
}

if (isMain(import.meta.url)) {
  try {
    const check = process.argv[2] === '--check';
    const [worktree, file, ...domains] = process.argv.slice(check ? 3 : 2);
    if (!file) throw new Error('usage: node worker-settings.mjs [--check] <worktree path> <settings file> <domain>...');
    // The launch's --settings resolves a relative path in the worker's terminal folder, the worktree, not here.
    if (!isAbsolute(file)) throw new Error(`${escaped(file)} is not an absolute path`);
    // The worker writes its worktree: a settings file there would be the worker's to change.
    const inside = relative(worktree, file);
    if (inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside)) throw new Error('the settings file must lie outside the worktree');
    const template = JSON.parse(readFileSync(new URL('./automatic-settings.json', import.meta.url), 'utf8'));
    const commonDir = gitCommonDir(worktree);
    const text = `${JSON.stringify(workerSettings(template, worktree, commonDir, readdirSync(`${commonDir}/worktrees`).sort(), domains), null, 2)}\n`;
    if (check) {
      // Claude Code loads an empty file as no settings and starts without the sandbox, and another parser may read a duplicate key otherwise than JSON.parse, so the file's text must be the one this script writes.
      if (readFileSync(file, 'utf8') !== text) throw new Error(`${escaped(file)} is not the settings file this script writes for that worktree and those domains`);
    } else {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
