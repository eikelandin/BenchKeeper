// A plugin runs without the app: no file of a folder under plugins/ names the app, reaches outside that folder or keeps another plugin's matcher prefix.
// Usage: node .github/scripts/plugin-boundary.mjs [--base <ref>]   (exit 1 on a reference that is not in plugin-boundary-allow.json, an allow entry that no longer matches, or a list longer than at <ref>)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './main.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Rule name to the text it forbids. `app/dependabot` is GitHub's bot account, not a path; `Name.app/` is a macOS bundle.
export const REFERENCES = {
  'app-path': /(?<![\w.-])app\/(?!dependabot|renovate)[\w.*{-]|(?:--prefix(?:=|\s+)|\bcd\s+)app\b/,
  // Any @cedarloom package; the `cedarloom` command only in lower case, so prose that starts with the name passes.
  'app-package': [/\bbenchkeeper\b|@cedarloom\//i, /\b(?:npx|bunx|pnpm[ \t]+(?:dlx|exec))[ \t]+(?:-y[ \t]+)?cedarloom\b|(?:^|[`'"(]|\$[ \t])cedarloom[ \t]+[a-z]/m],
  'app-state': /cedarloom-app|CEDARLOOM_APP|\bminApp\b/i,
};

const CODE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
// Specifiers of import and export statements (at the start of a line or after `;`, so a string that says "from 'x'" is none), dynamic import and require.
const STATIC = /(?:^|;)[ \t]*(?:import|export)\b[^'";]*\bfrom[ \t]*(['"])([^'"\n]+)\1/gmd;
const DYNAMIC = /\b(?:import[ \t]*(?:\([ \t]*)?|require\([ \t]*)(['"])([^'"\n]+)\1/gd;
// Comments and strings, which hold text but no statement; a template literal counts as a string.
const LITERALS = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\[\s\S]|[^`\\])*`/g;
// What Claude Code supplies to a plugin's mods besides Node's built-ins.
const PROVIDED = /^(?:node:|claude-code(?:\/|$))/;
// A path that climbs from the file's folder, in any file: a plugin is installed as its folder alone.
const PARENT = /(?<![\w./-])(?:[\w.-]+\/)*\.\.\/[^\s'"`)\]]*/g;
const ABOVE_ROOT = /CLAUDE_PLUGIN_ROOT\}?\/\.\.(?![\w.])/;
// A hook file of the plugin, and the command prefix of a hook matcher such as `^name:(ask|questions)$`.
const HOOKS = /^plugins\/[^/]+\/hooks\/[^/]+\.json$/;
const PREFIX = /^\^([\w-]+):/;
const MANIFEST = '.claude-plugin/plugin.json';

const GENERATED = /(?:^|\/)CHANGELOG\.md$/;
const LIST = '.github/scripts/plugin-boundary-allow.json';

// JSON text as a value, null when it does not parse (the plugin validation reports that).
function parsed(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Matcher strings anywhere in a parsed hook file.
function matchers(value) {
  if (Array.isArray(value)) return value.flatMap(matchers);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) => (key === 'matcher' && typeof entry === 'string' ? [entry] : matchers(entry)));
}

// The text with comments and the inside of strings blanked to spaces and underscores of the same length, so a match position indexes the original.
function blanked(text) {
  return text.replace(LITERALS, (token) => (/^['"`]/.test(token) ? token[0] + token.slice(1, -1).replace(/[^\n]/g, '_') + token.at(-1) : token.replace(/[^\n]/g, ' ')));
}

// Rule names that match in `text` of the file `path` (relative to the repository root), `plugin` being the plugin's folder and `name` its manifest name.
export function offences(path, text, plugin, name) {
  const found = new Set(Object.keys(REFERENCES).filter((rule) => [REFERENCES[rule]].flat().some((pattern) => pattern.test(text))));
  const outside = (spec) => {
    const target = posix.join(posix.dirname(path), spec);
    return target !== plugin && !target.startsWith(`${plugin}/`);
  };
  if (ABOVE_ROOT.test(text) || [...text.matchAll(PARENT)].some(([spec]) => outside(spec))) found.add('import-outside');
  if (CODE.test(path)) {
    const code = blanked(text);
    for (const { indices } of [...code.matchAll(STATIC), ...code.matchAll(DYNAMIC)]) {
      const spec = text.slice(...indices[2]);
      if (spec.startsWith('.') ? outside(spec) : !PROVIDED.test(spec)) found.add('import-outside');
    }
  }
  // A matcher keeps firing only for the commands of its own plugin, whose name is the command prefix.
  if (name && HOOKS.test(path)) {
    const prefixes = matchers(parsed(text)).map((matcher) => PREFIX.exec(matcher)?.[1]);
    if (prefixes.some((prefix) => prefix !== undefined && prefix !== name)) found.add('matcher-prefix');
  }
  return [...found].sort((a, b) => a.localeCompare(b));
}

// Offending file to its rule names, over every tracked file of every folder under plugins/.
export function scan(cwd = root) {
  const files = execFileSync('/usr/bin/git', ['ls-files', '-z', '--', 'plugins'], { cwd, encoding: 'utf8' }).split('\0').filter(Boolean);
  const result = {};
  const names = {};
  for (const path of files) {
    if (GENERATED.test(path)) continue;
    const buffer = readFileSync(resolve(cwd, path));
    if (buffer.includes(0)) continue;
    const plugin = path.split('/').slice(0, 2).join('/');
    names[plugin] ??= existsSync(resolve(cwd, plugin, MANIFEST)) ? parsed(readFileSync(resolve(cwd, plugin, MANIFEST), 'utf8'))?.name : undefined;
    const found = offences(path, buffer.toString('utf8'), plugin, names[plugin]);
    if (found.length) result[path] = found;
  }
  return result;
}

// Lines that tell what to add to or take from the allow list.
export function differences(found, allowed) {
  const lines = [];
  for (const path of Object.keys({ ...found, ...allowed }).sort((a, b) => a.localeCompare(b))) {
    const now = found[path] ?? [];
    const listed = allowed[path] ?? [];
    for (const name of now) if (!listed.includes(name)) lines.push(`${path}: ${name} is a new reference to the app, a path outside the plugin or another plugin's matcher prefix`);
    for (const name of listed) if (!now.includes(name)) lines.push(`${path}: ${name} no longer matches: remove it from plugin-boundary-allow.json`);
  }
  return lines;
}

const pairs = (allowed) => Object.values(allowed).flat().length;

// A line when the allow list holds more (file, rule) pairs than the base's list; a count, so a renamed file moves its entries.
export function growth(allowed, base) {
  if (!base || pairs(allowed) <= pairs(base)) return [];
  return [`plugin-boundary-allow.json lists ${pairs(allowed)} pairs, more than the ${pairs(base)} of the base branch: remove the new reference instead of listing it`];
}

// The base's allow list, null when the base has none.
function baseList(ref) {
  execFileSync('/usr/bin/git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: root });
  try {
    return JSON.parse(execFileSync('/usr/bin/git', ['show', `${ref}:${LIST}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}

if (isMain(import.meta.url)) {
  const allowed = JSON.parse(readFileSync(resolve(root, LIST), 'utf8'));
  const at = process.argv.indexOf('--base');
  const lines = [...differences(scan(), allowed), ...(at === -1 ? [] : growth(allowed, baseList(process.argv[at + 1])))];
  for (const line of lines) console.error(line);
  process.exit(lines.length ? 1 : 0);
}
