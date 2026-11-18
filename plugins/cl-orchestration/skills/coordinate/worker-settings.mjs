// Usage: node worker-settings.mjs <worktree path> <project path> <settings file> <domain>..., the paths absolute. Writes an automatic worker's settings file: automatic-settings.json with //W/ as the worktree, //C/ as the real path of <project path>/.git, each worktrees/* rule also once per folder under the shared .git's worktrees, and the domains (the policy's sandbox.allowedDomains) as the network allow list, plus the rules of worker-rules.json that the template's deny list does not already match, an Edit rule as ask. With --supervised <worktree path> <project path> instead, it writes only the rules of worker-rules.json and disableBypassPermissionsMode set to disable as <worktree path>/.claude/settings.local.json of a linked worktree of that project, never over a file with other content, and lists that path in the shared .git's info/exclude. With --check first, it writes nothing and exits 0 only when the file's text is exactly what it would write now (and, supervised, the exclude line is there). Any other input prints the error, exits 1 and writes nothing.
import { appendFileSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { errorLine, escaped, isMain, validate } from './policy.mjs';

// A character the permission rule syntax reads as a pattern or a bracket would widen or break every rule with the path in it.
const PLAIN = /^\/[^*?[\]{}()\\\p{Cc}\p{Cf}\p{Zl}\p{Zp}]*[^/*?[\]{}()\\\p{Cc}\p{Cf}\p{Zl}\p{Zp}]$/u;

const within = (folder, path) => {
  const inside = relative(folder, path);
  return inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
};

const realPath = (path) => {
  try {
    return realpathSync.native(path);
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return undefined;
    throw e;
  }
};

// A linked worktree's .git is a file that names its folder under the shared .git's worktrees: absolute, or relative to the worktree with worktree.useRelativePaths.
export function gitCommonDir(worktree, project, read = (path) => readFileSync(path, 'utf8')) {
  const named = /^gitdir: (.+)\n?$/.exec(read(`${worktree}/.git`))?.[1];
  // Git opens the named path as written, so the kernel follows each link before it applies a `..`.
  const folder = named && realPath(isAbsolute(named) ? named : `${worktree}/${named}`);
  // The sandbox matches an existing rule path by its real path and keeps the spelling of one that does not exist, such as commondir.
  const commonDir = realPath(resolve(project, '.git'));
  // The worker can rewrite its .git file: by file identity, so no other spelling of a folder (letter case, /System/Volumes/Data, a link) and no folder outside the project's worktrees folder counts as the project's.
  let anchor;
  try {
    anchor = commonDir && lstatSync(`${commonDir}/worktrees`, { throwIfNoEntry: false });
  } catch (e) {
    // The project path's .git is a file: it is a linked worktree itself.
    if (e.code !== 'ENOTDIR') throw e;
  }
  const parent = folder && statSync(dirname(folder));
  if (!anchor?.isDirectory() || !parent || parent.dev !== anchor.dev || parent.ino !== anchor.ino || !statSync(folder).isDirectory()) {
    throw new Error(`${escaped(worktree)}/.git names no folder under ${escaped(resolve(project, '.git'))}/worktrees: not a linked worktree of that project`);
  }
  return commonDir;
}

// O_NOFOLLOW refuses a symbolic link only; a hard link shares the file with a name elsewhere.
function refuseHardLink(fd, file) {
  if (fstatSync(fd).nlink > 1) throw new Error(`${escaped(file)} has another name (a hard link): not written or read`);
}

// A link or another kind of file would let the text read differ from the file Claude Code loads; O_NONBLOCK, so a FIFO does not hang the open.
function readRegular(file) {
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (e) {
    if (e.code === 'ENOENT') return undefined;
    if (e.code === 'ELOOP') throw new Error(`${escaped(file)} is a link: not written or read`);
    throw e;
  }
  try {
    if (!fstatSync(fd).isFile()) throw new Error(`${escaped(file)} is not a regular file: not written or read`);
    refuseHardLink(fd, file);
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}

// A Bash deny rule `Bash(<prefix> *)` matches every command that a rule starting with `Bash(<prefix> ` matches.
const covers = (deny, rule) => deny.includes(rule) || deny.some((d) => d.startsWith('Bash(') && d.endsWith(' *)') && rule.startsWith(d.slice(0, -2)));

const EXCLUDED = '/.claude/settings.local.json';
const listed = (text) => text.split('\n').includes(EXCLUDED);
const excluded = (exclude) => {
  const text = readRegular(exclude);
  return text !== undefined && listed(text);
};

// A rule under any other key, or not a string, would reach neither settings file without an error.
function denyRules(rules) {
  const keys = Object.keys(rules);
  if (keys.length !== 1 || keys[0] !== 'deny' || !Array.isArray(rules.deny) || !rules.deny.every((rule) => typeof rule === 'string')) {
    throw new Error('worker-rules.json must hold one key, deny, with a list of rule strings');
  }
  return rules.deny;
}

// In .claude/settings.local.json a rule path that starts with / counts from the session's starting folder, the worktree, so the file names no host path.
// The key keeps bypass out of the Shift+Tab cycle and out of a resume in a settings file's mode, which the launch's --permission-mode does not reach.
export function supervisedSettings(rules) {
  const local = (rule) => rule.replace('(//W/', '(/');
  return { permissions: { deny: denyRules(rules).map(local), disableBypassPermissionsMode: 'disable' } };
}

// In a --settings file a rule path that starts with / counts from the file's folder, so an absolute path takes a second /.
export function workerSettings(template, rules, worktree, commonDir, worktreeFolders, domains) {
  for (const path of [worktree, commonDir, ...worktreeFolders.map((name) => `${commonDir}/worktrees/${name}`)]) if (!PLAIN.test(path)) throw new Error(`${escaped(path)} is not an absolute path without a pattern character, a bracket or a trailing /`);
  const errors = validate({ mode: 'automatic', sandbox: { allowedDomains: domains } });
  if (errors.length) throw new Error(errors.map(errorLine).join('\n'));
  // A function as the replacement, so a $ in a path stays as written.
  const fill = (rule) => rule.replace('(//W/', () => `(/${worktree}/`).replace('(//C/', () => `(/${commonDir}/`);
  // A sandbox filesystem path takes the absolute path as it is.
  const fillPath = (path) => path.replace(/^\/\/W\//, () => `${worktree}/`);
  // The sandbox keeps a folder from being renamed, and so swapped for a copy, only where a rule names its path, and on Linux it skips a pattern rule for writes.
  const perFolder = (rule) => (rule.includes('(//C/worktrees/*/') ? [rule, ...worktreeFolders.map((name) => rule.replace('/worktrees/*/', () => `/worktrees/${name}/`))] : [rule]);
  const { permissions, sandbox } = template;
  const added = denyRules(rules).filter((rule) => !covers(permissions.deny, rule));
  // The sandbox closes an Edit deny's paths to Bash too, git's own writes to .git and a checkout's files included; as ask, dontAsk refuses the file tools alone.
  const fileRule = (rule) => rule.startsWith('Edit(');
  const deny = [...permissions.deny, ...added.filter((rule) => !fileRule(rule))];
  const ask = added.filter(fileRule);
  return {
    ...template,
    permissions: { ...permissions, allow: permissions.allow.map(fill), deny: deny.flatMap(perFolder).map(fill), ask: ask.map(fill) },
    sandbox: { ...sandbox, network: { ...sandbox.network, allowedDomains: domains }, filesystem: { ...sandbox.filesystem, denyWrite: sandbox.filesystem.denyWrite.map(fillPath) } },
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
    let exclude;
    if (supervised) {
      const [worktree, project, ...rest] = args;
      if (!project || rest.length) throw new Error('usage: node worker-settings.mjs [--check] --supervised <worktree path> <project path>');
      for (const path of [worktree, project]) if (!isAbsolute(path)) throw new Error(`${escaped(path)} is not an absolute path`);
      // A main checkout or a mistyped path would pass --check while the worker starts without its rules; git reads the shared .git's exclude for every worktree.
      exclude = `${gitCommonDir(worktree, project)}/info/exclude`;
      file = `${worktree}/.claude/settings.local.json`;
      settings = supervisedSettings(rules);
    } else {
      const [worktree, project, settingsFile, ...domains] = args;
      file = settingsFile;
      if (!file) throw new Error('usage: node worker-settings.mjs [--check] <worktree path> <project path> <settings file> <domain>...');
      // The launch's --settings resolves a relative path in the worker's terminal folder, the worktree, not here.
      if (!isAbsolute(file)) throw new Error(`${escaped(file)} is not an absolute path`);
      // The worker writes its worktree: a settings file there would be the worker's to change.
      if (within(worktree, file)) throw new Error('the settings file must lie outside the worktree');
      if (!isAbsolute(project)) throw new Error(`${escaped(project)} is not an absolute path`);
      const commonDir = gitCommonDir(worktree, project);
      settings = workerSettings(read('automatic-settings.json'), rules, worktree, commonDir, readdirSync(`${commonDir}/worktrees`).sort(), domains);
    }
    const text = `${JSON.stringify(settings, null, 2)}\n`;
    // A repository can commit .claude as a link, which would put the file outside the worktree.
    if (supervised && lstatSync(dirname(file), { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`${escaped(dirname(file))} is a link: not written or read`);
    if (check) {
      // Claude Code loads an empty file as no settings and starts without the sandbox, and another parser may read a duplicate key otherwise than JSON.parse, so the file's text must be the one this script writes.
      if (readRegular(file) !== text) throw new Error(`${escaped(file)} is not the settings file this script writes for those arguments`);
      if (supervised && !excluded(exclude)) throw new Error(`${escaped(exclude)} does not list ${EXCLUDED}: git add would stage the rule file`);
    } else if (supervised) {
      const current = readRegular(file);
      // A file the repository tracks or a person wrote stays theirs.
      if (current !== undefined && current !== text) throw new Error(`${escaped(file)} exists with other content: not overwritten`);
      // Only info, never the shared .git itself: a stale .git pointer fails with ENOENT before anything is written.
      try {
        mkdirSync(dirname(exclude));
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
      }
      // The coordinator appends outside the worker's bounds, so never through a link to a file elsewhere.
      if (lstatSync(dirname(exclude)).isSymbolicLink()) throw new Error(`${escaped(dirname(exclude))} is a link: not written`);
      // One descriptor, so the text read is the file appended to, opened before the rule file is written, so an exclude that cannot take the line leaves no rule file.
      const fd = openSync(exclude, constants.O_RDWR | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW);
      try {
        refuseHardLink(fd, exclude);
        if (current === undefined) {
          mkdirSync(dirname(file), { recursive: true });
          // wx: no write through a dangling link in the worktree.
          writeFileSync(file, text, { flag: 'wx' });
        }
        const before = readFileSync(fd, 'utf8');
        if (!listed(before)) appendFileSync(fd, `${before && !before.endsWith('\n') ? '\n' : ''}${EXCLUDED}\n`);
      } finally {
        closeSync(fd);
      }
    } else {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
