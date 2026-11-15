// Writes the generated blocks of docs/stack.md from src/data/facts.json. `--check` fails when one is out of date.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const facts = JSON.parse(readFileSync(new URL('web/src/data/facts.json', root), 'utf8'));

// `|` would end a table cell, and a backslash in the text would escape the one added before it.
const cell = (s) => s.replace(/[\\|]/g, '\\$&');
const link = (name, url) => `[${cell(name)}](${url.replace(/\|/g, '%7C')})`;

const blocks = {
  tools: [
    '| Tool | Platforms | Gives you | Choose it when |',
    '|---|---|---|---|',
    ...facts.parallelTools.map((t) => `| ${link(t.name, t.url)} | ${cell(t.platforms)} | ${cell(t.points.join('; '))} | ${cell(t.when)} |`),
  ],
  reasons: facts.stack.reasons.map((r) => `- ${r.name}: ${r.text}`),
  openhands: [
    `**Unattended or isolated runs: [${facts.openhands.name}](${facts.openhands.url}).** ${facts.openhands.summary}`,
    '',
    ...facts.openhands.points.map((p) => `- ${p}`),
  ],
};

// The root README is written by hand (it describes the plugins); docs/stack.md holds the reference blocks.
const targets = [['docs/stack.md', blocks]];
let stale = false;
for (const [file, wanted] of targets) {
  const url = new URL(file, root);
  const readme = readFileSync(url, 'utf8');
  const nl = readme.includes('\r\n') ? '\r\n' : '\n';
  let out = readme;
  for (const [name, lines] of Object.entries(wanted)) {
    const re = new RegExp(`(<!-- generated:${name} -->\\r?\\n)[\\s\\S]*?(\\r?\\n<!-- /generated:${name} -->)`);
    if (!re.test(out)) throw new Error(`${file} marker missing: ${name}`);
    // A function replacement keeps `$` in facts literal.
    out = out.replace(re, (_, start, end) => `${start}${lines.join(nl)}${end}`);
  }
  if (out === readme) continue;
  if (process.argv.includes('--check')) {
    console.error(`${file} is out of date: run \`node web/scripts/readme.mjs\``);
    stale = true;
  } else writeFileSync(url, out);
}
if (stale) process.exit(1);
