// Writes the skill table of docs/skills.md from the SKILL.md front matter of the plugins' skills.
// Usage: node .github/scripts/skills-doc.mjs [--check]   (--check: exit 1 when the page differs)
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './main.mjs';
import { frontMatter } from './skill-lint.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const START = '<!-- generated:skills -->';
const END = '<!-- /generated:skills -->';

const row = (cells) => `| ${cells.join(' | ')} |`;
const unquote = (v) => (v ?? '').replace(/^"(.*)"$/, '$1');

// One skill's row fields; the "when" comes from the field of that name, else from the description after its first sentence.
export function skillEntry(text, plugin) {
  const fm = frontMatter(text);
  const name = fm?.name;
  const writes = unquote(fm?.writes);
  if (!name || !fm.description || !writes) throw new Error(`${name ?? 'a skill'}: front matter needs name, description and writes`);
  // The first sentence ends at the first period followed by white space or the end.
  const description = unquote(fm.description), end = /\.(?:\s+|$)/.exec(description);
  if (!end) throw new Error(`${name}: the description needs a sentence that ends with a period`);
  const purpose = description.slice(0, end.index + 1), rest = description.slice(end.index + end[0].length);
  const when = unquote(fm.when) || rest;
  if (!when) throw new Error(`${name}: needs a when field or a second sentence in the description`);
  const user = fm['disable-model-invocation'] === 'true';
  // `codex: false` marks a skill that runs only in Claude Code.
  const codex = fm.codex === 'false' ? '' : ` (Codex \`$${plugin}:${name}\`)`;
  const start = user ? `you: \`/${plugin}:${name}\`${codex}` : `the agent, or you with \`/${plugin}:${name}\``;
  return { name, plugin, purpose, start, when, writes };
}

export function render(skills) {
  const out = [row(['Skill', 'What it is for', 'Started by', 'When it runs', 'What it writes']), row(['---', '---', '---', '---', '---'])];
  for (const s of skills) out.push(row([`[${s.name}](../plugins/${s.plugin}/skills/${s.name}/SKILL.md)`, s.purpose, s.start, s.when, s.writes]));
  return out.join('\n');
}

export function update(page, skills) {
  const a = page.indexOf(START);
  const b = page.indexOf(END);
  if (a < 0 || b < a) throw new Error(`docs/skills.md needs ${START} and ${END}`);
  return `${page.slice(0, a + START.length)}\n${render(skills)}\n${page.slice(b)}`;
}

// Every plugin's skills in one table, sorted by name.
export function sources() {
  const plugins = readdirSync(`${root}/plugins`).sort();
  return plugins.filter((p) => existsSync(`${root}/plugins/${p}/skills`))
    .flatMap((p) => readdirSync(`${root}/plugins/${p}/skills`).map((n) => skillEntry(readFileSync(`${root}/plugins/${p}/skills/${n}/SKILL.md`, 'utf8'), p)))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

if (isMain(import.meta.url)) {
  const file = `${root}/docs/skills.md`;
  const page = readFileSync(file, 'utf8');
  const next = update(page, sources());
  if (process.argv[2] === '--check') {
    if (next !== page) {
      console.log('::error::docs/skills.md differs from the skill front matter: run node .github/scripts/skills-doc.mjs');
      process.exit(1);
    }
  } else writeFileSync(file, next);
}
