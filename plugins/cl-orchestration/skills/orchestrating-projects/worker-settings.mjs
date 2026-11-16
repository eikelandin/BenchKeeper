// Usage: node worker-settings.mjs <worktree path> <settings file> <domain>... Writes an automatic worker's settings file: automatic-settings.json with //W/ as the worktree, //G/ as its folder under the shared .git and the domains (the policy's sandbox.allowedDomains) as the network allow list. Any other input prints the error, exits 1 and writes nothing.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { errorLine, escaped, isMain, validate } from './policy.mjs';

// A character the permission rule syntax reads as a pattern or a bracket would widen or break every rule with the path in it.
const PLAIN = /^\/[^*?[\]{}()\\\p{Cc}\p{Cf}\p{Zl}\p{Zp}]*[^/*?[\]{}()\\\p{Cc}\p{Cf}\p{Zl}\p{Zp}]$/u;

// A linked worktree's .git is a file that names its folder under the shared .git: absolute, or relative to the worktree with worktree.useRelativePaths.
export function gitFolder(worktree, read = (path) => readFileSync(path, 'utf8')) {
  const named = /^gitdir: (.+)\n?$/.exec(read(`${worktree}/.git`))?.[1];
  const folder = named && resolve(worktree, named);
  if (!folder || basename(dirname(folder)) !== 'worktrees') throw new Error(`${escaped(worktree)}/.git names no folder under a shared .git's worktrees: not a linked worktree`);
  return folder;
}

// In a --settings file a rule path that starts with / counts from the file's folder, so an absolute path takes a second /.
export function workerSettings(template, worktree, folder, domains) {
  for (const path of [worktree, folder]) if (!PLAIN.test(path)) throw new Error(`${escaped(path)} is not an absolute path without a pattern character, a bracket or a trailing /`);
  const errors = validate({ mode: 'automatic', sandbox: { allowedDomains: domains } });
  if (errors.length) throw new Error(errors.map(errorLine).join('\n'));
  const fill = (rule) => rule.replace('(//W/', `(/${worktree}/`).replace('(//G/', `(/${folder}/`);
  const { permissions, sandbox } = template;
  return {
    ...template,
    permissions: { ...permissions, allow: permissions.allow.map(fill), deny: permissions.deny.map(fill) },
    sandbox: { ...sandbox, network: { ...sandbox.network, allowedDomains: domains } },
  };
}

if (isMain(import.meta.url)) {
  try {
    const [worktree, file, ...domains] = process.argv.slice(2);
    if (!file) throw new Error('usage: node worker-settings.mjs <worktree path> <settings file> <domain>...');
    // The worker writes its worktree: a settings file there would be the worker's to change.
    const inside = relative(worktree, resolve(file));
    if (!inside.startsWith('..') && !isAbsolute(inside)) throw new Error('the settings file must lie outside the worktree');
    const template = JSON.parse(readFileSync(new URL('./automatic-settings.json', import.meta.url), 'utf8'));
    const settings = workerSettings(template, worktree, gitFolder(worktree), domains);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
