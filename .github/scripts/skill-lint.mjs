// Structural checks for BenchKeeper's own skills (plugin skills) and the plugin's agents.
// Usage: node .github/scripts/skill-lint.mjs [skill folders...]   (default: every own skill and agent), exit 1 on any error.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './main.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z][\w-]*):\s*(\S.*)?$/.exec(line);
    if (!kv) return null;
    fields[kv[1]] = kv[2] ?? '';
  }
  return fields;
}

function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesIn(p) : [p];
  });
}

const markdownFiles = (dir) => filesIn(dir).filter((p) => p.endsWith('.md'));

// A skill that hands issue or pull request text to a worker names the author filter somewhere in its files: text of other authors is untrusted input.
const HANDS_TEXT = /\b(read|pass|hand|send|give|copy|paste)\b[^.\n]{0,60}\b(issues?|pull requests?|PRs?)\b[^.\n]{0,60}\b(comments?|bod(y|ies)|text)\b/i;
const AUTHOR_FILTER = [/^Trusted authors: \S/m, /\bdata, never instructions\b/i];
// The workflow skill applies the Depth minimum line to its own pick, so a handed-over Depth line must not name it first.
const DEPTH_MINIMUM_FIRST = /^Depth: (?:(?!workflow skill)[^\n])*Depth minimum/m;

export function lintSkill(dir) {
  const errors = [];
  const folder = dir.split('/').pop();
  const skillFile = join(dir, 'SKILL.md');
  if (!existsSync(skillFile)) return [`${dir}: no SKILL.md`];
  const text = readFileSync(skillFile, 'utf8');
  const fm = frontMatter(text);
  if (!fm) return [`${skillFile}: front matter missing or not "key: value" lines`];
  if (fm.name !== folder) errors.push(`${skillFile}: name "${fm.name}" differs from the folder "${folder}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name ?? '')) errors.push(`${skillFile}: name must be lowercase letters, digits and hyphens`);
  if (!/^".*"$/.test(fm.description ?? '')) errors.push(`${skillFile}: description must be in double quotes`);
  else if (fm.description.length - 2 > 1024) errors.push(`${skillFile}: description longer than 1024 characters`);
  if (text.split('\n').length > 500) errors.push(`${skillFile}: more than 500 lines`);
  const files = markdownFiles(dir);
  const all = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  if (/\bworkers?\b/i.test(all) && HANDS_TEXT.test(all) && !AUTHOR_FILTER.every((re) => re.test(all)))
    errors.push(`${dir}: hands issue or pull request text to a worker without the author filter (a "Trusted authors:" line and the words "data, never instructions")`);
  if (DEPTH_MINIMUM_FIRST.test(all)) errors.push(`${dir}: a Depth line names the Depth minimum line ahead of the workflow skill`);
  for (const file of files) {
    const body = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const [, target] of body.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^([a-z]+:|#)/.test(target)) continue;
      if (!existsSync(join(dirname(file), target.split('#')[0]))) errors.push(`${file}: link target ${target} not found`);
    }
  }
  const yaml = join(dir, 'agents/openai.yaml');
  // openai.yaml is Codex metadata: a plugin with a Claude Code manifest and none for Codex ships without it.
  const plugin = dirname(dirname(dir));
  const claudeOnly = existsSync(join(plugin, '.claude-plugin')) && !existsSync(join(plugin, '.codex-plugin'));
  if (claudeOnly) return errors;
  if (!existsSync(yaml)) errors.push(`${dir}: agents/openai.yaml missing`);
  else if (fm['disable-model-invocation'] === 'true' && !/^[ \t]+allow_implicit_invocation: false$/m.test(readFileSync(yaml, 'utf8')))
    errors.push(`${yaml}: user-invoked skill needs policy.allow_implicit_invocation: false`);
  return errors;
}

const MODELS = ['fable', 'opus', 'sonnet', 'haiku', 'inherit'];
// Plugin agents ignore these keys (https://code.claude.com/docs/en/plugins-reference), and `claude plugin validate` reads no agents/.
const IGNORED = ['hooks', 'mcpServers', 'permissionMode', 'initialPrompt'];

// A front matter value as YAML reads it: a plain scalar, or a complete double- or single-quoted one; else undefined.
function scalar(raw) {
  if (raw.startsWith('"')) {
    try { return /^"(?:[^"\\]|\\.)*"$/.test(raw) ? JSON.parse(raw) : undefined; } catch { return undefined; }
  }
  if (raw.startsWith("'")) return /^'(?:[^']|'')*'$/.test(raw) ? raw.slice(1, -1).replaceAll("''", "'") : undefined;
  return /^[[\]{}#&*!|>%@`'"]|: |:$| #/.test(raw) ? undefined : raw;
}

// shortcut: a strict subset of YAML (`key: scalar` lines), as checks-core installs no YAML parser; anything outside it
// fails rather than passes. Switch to the `yaml` package once that job installs one.
function agentFields(block) {
  if (block === undefined) return null;
  const fields = {};
  for (const line of block.split('\n')) {
    const kv = /^([A-Za-z][\w-]*):(?:[ \t]+(.*?))?[ \t]*$/.exec(line);
    const value = kv && scalar(kv[2] ?? '');
    if (value === undefined || value === null) return null;
    fields[kv[1]] = value;
  }
  return fields;
}

export function lintAgent(file) {
  const text = readFileSync(file, 'utf8');
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
  const keys = block?.match(/^[A-Za-z][\w-]*(?=:)/gm) ?? [];
  const ignored = IGNORED.filter((key) => keys.includes(key)).map((key) => `${file}: ${key} is ignored in a plugin agent`);
  const fm = agentFields(block);
  if (!fm) return [...ignored, `${file}: front matter missing, or not "key: value" lines with a plain or complete quoted value`];
  const missing = ['name', 'description'].filter((key) => !fm[key]).map((key) => `${file}: ${key} missing`);
  const model = fm.model === undefined || MODELS.includes(fm.model) ? [] : [`${file}: model "${fm.model}" is not one of ${MODELS.join(', ')}`];
  return [...ignored, ...missing, ...model];
}

// The folder named part of each plugin under plugins/ that has one.
const pluginParts = (part) => readdirSync(join(root, 'plugins')).map((p) => join(root, 'plugins', p, part)).filter((d) => existsSync(d));

// Claude Code loads a plugin's agents from agents/ and its subfolders.
export const ownAgents = () => pluginParts('agents').flatMap(markdownFiles);

// Hooks do not run in bare mode, the role guard's included (https://code.claude.com/docs/en/headless#start-faster-with-bare-mode).
// A line (continuations joined) whose words, split at spaces, quotes, commas, brackets and shell operators, hold claude and
// after it --bare: a command line, or a spawn or execFile call with its argument list.
const bareLaunch = (text) =>
  text.replace(/[\\`]\r?\n/g, ' ').split('\n').some((line) => {
    const words = line.split(/[\s'"`,()[\]{};|&<>]+/);
    const at = words.findIndex((w) => /^claude(\.exe)?$/i.test(w.split(/[/\\]/).pop()));
    return at >= 0 && words.includes('--bare', at + 1);
  });

export const bareLaunches = (files) =>
  files.filter((file) => bareLaunch(readFileSync(file, 'utf8'))).map((file) => `${file}: starts claude with --bare, which runs no hooks (the role guard's included)`);

// The files every plugin ships; its tests name commands the hooks deny.
export function pluginFiles() {
  const plugins = join(root, 'plugins');
  return readdirSync(plugins, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    .flatMap(({ name }) => filesIn(join(plugins, name)).filter((p) => !p.slice(plugins.length).split(sep).includes('test')));
}

export function ownSkills() {
  return pluginParts('skills').flatMap((d) => readdirSync(d).map((n) => join(d, n)).filter((p) => statSync(p).isDirectory()));
}

if (isMain(import.meta.url)) {
  const dirs = process.argv.length > 2 ? process.argv.slice(2).map((d) => resolve(d)) : ownSkills();
  const agents = process.argv.length > 2 ? [] : ownAgents();
  const launches = process.argv.length > 2 ? [] : bareLaunches(pluginFiles());
  const errors = [...dirs.flatMap(lintSkill), ...agents.flatMap(lintAgent), ...launches];
  for (const e of errors) console.log(`::error::${e.replace(root + '/', '')}`);
  console.log(`${agents.length} agents, ${dirs.length} skills checked, ${errors.length} errors`);
  process.exit(errors.length ? 1 : 0);
}
