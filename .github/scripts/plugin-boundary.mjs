// A plugin installs as its folder alone: no file of a folder under plugins/ reaches outside that folder or keeps another plugin's matcher prefix, and only the Orca-only cl-orchestration and the bundle that installs it name Orca.
// Usage: node .github/scripts/plugin-boundary.mjs   (exit 1 on any such file, listed with its rule names)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './main.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

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
// Orca's name as a word or inside an identifier (`orca`, `OrcaClient`, `ORCA_*`, `CEDARLOOM_ORCA_HANDLE`, `isOrcaWorker`, `in_orca`) but not inside a plain word (`Majorca`), and the plugin folders that may hold it: cl-workflow and cl-repo work without Orca.
const ORCA = /(?<![A-Za-z])orca|(?<![A-Z])Orca|(?<![A-Z])ORCA/;
const ORCA_PLUGINS = new Set(['plugins/cl-orchestration', 'plugins/cedarloom']);

const GENERATED = /(?:^|\/)CHANGELOG\.md$/;

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
  const found = new Set();
  if (!ORCA_PLUGINS.has(plugin) && ORCA.test(text)) found.add('orca-only-orchestration');
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

if (isMain(import.meta.url)) {
  const found = Object.entries(scan());
  for (const [path, rules] of found) console.error(`${path}: ${rules.join(', ')}`);
  process.exit(found.length ? 1 : 0);
}
