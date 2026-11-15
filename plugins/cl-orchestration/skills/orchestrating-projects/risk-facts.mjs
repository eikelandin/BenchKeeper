// Usage: node risk-facts.mjs <repository path> <base> <head>. Prints the facts a change's risk class is judged from (the workflow skill's risk.md) as JSON, exit 0; exit 2 with one line on stderr gives none.
// { lines, files, risky, floor, dependencies, migrations, untested }: the changed lines and files of <base>...<head>; the files under the policy's riskyPaths and the lowest class they allow (medium, or null); dependency manifests and lock files; files in a migrations folder; changed code files with no test file of the same name anywhere at <head>.
// The policy is the reader's (origin's default branch). The merge gate does not take this output: merge-checks.mjs applies the riskyPaths floor itself.
import { risky } from './merge-checks.mjs';
import { errorLine, escaped, isMain, json, read, sh } from './policy.mjs';

const DEPENDENCIES = /^(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements[\w.-]*\.txt|pyproject\.toml|poetry\.lock|uv\.lock|pipfile(?:\.lock)?|cargo\.(?:toml|lock)|go\.(?:mod|sum)|gemfile(?:\.lock)?|composer\.(?:json|lock)|pom\.xml|build\.gradle(?:\.kts)?|.+\.csproj|packages\.lock\.json|directory\.packages\.props|package\.(?:swift|resolved)|mix\.(?:exs|lock)|pubspec\.(?:yaml|lock))$/;
const MIGRATIONS = ['migrations', 'migration', 'migrate'];
const CODE = /\.(?:c|cc|cjs|cpp|cs|cts|cxx|go|h|hpp|java|js|jsx|kt|kts|mjs|mts|php|py|rb|rs|scala|sh|swift|ts|tsx)$/;
// The name a test file covers: test_x.py, x_test.go, x.test.mjs, x.spec.ts, XTest.java.
const TEST = /^(?:test_(?<a>.+)|(?<b>.+?)(?:[._-](?:test|spec)|Tests?))\.[^.]+$/;
const base = (path) => path.slice(path.lastIndexOf('/') + 1);
const covers = (path) => { const m = TEST.exec(base(path)); return m ? (m.groups.a ?? m.groups.b).toLowerCase() : null; };

// changes: [{ path, lines }] of the diff; tracked: every path at the head.
export function facts(policy, changes, tracked) {
  const files = changes.map((c) => c.path);
  const tests = new Set(tracked.map(covers).filter(Boolean)), present = new Set(tracked);
  const riskyFiles = risky(policy, files);
  return {
    lines: changes.reduce((sum, c) => sum + c.lines, 0),
    files: files.length,
    risky: riskyFiles,
    floor: riskyFiles.length ? 'medium' : null,
    dependencies: files.filter((f) => DEPENDENCIES.test(base(f).toLowerCase())),
    migrations: files.filter((f) => f.toLowerCase().split('/').slice(0, -1).some((segment) => MIGRATIONS.includes(segment))),
    untested: files.filter((f) => present.has(f) && CODE.test(f.toLowerCase()) && !covers(f) && !tests.has(base(f).replace(/\.[^.]+$/, '').toLowerCase())),
  };
}

// No - at the start: git would read the revision as an option.
const REVISION = /^(?!-)[\w./^~-]+$/;

function run(dir, from, to) {
  if (![from, to].every((r) => REVISION.test(r))) throw new Error('base and head must be revisions of letters, digits and . _ / ^ ~ -, with no - at the start');
  const { policy, errors } = read(dir);
  if (!policy) throw new Error(errors.map(errorLine).join('; '));
  const git = (...args) => sh(dir, 'git', args);
  // -z: every path as it is; a binary file counts as a file with no lines.
  const changes = git('-c', 'core.quotePath=false', 'diff', '--numstat', '--no-renames', '-z', `${from}...${to}`, '--').split('\0').filter(Boolean).map((record) => {
    const [, added, deleted, path] = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(record);
    return { path, lines: (Number(added) || 0) + (Number(deleted) || 0) };
  });
  return facts(policy, changes, git('ls-tree', '-r', '--name-only', '-z', to).split('\0').filter(Boolean));
}

if (isMain(import.meta.url)) {
  try {
    if (process.argv.length !== 5) throw new Error('usage: node risk-facts.mjs <repository path> <base> <head>');
    console.log(json(run(...process.argv.slice(2))));
  } catch (e) {
    console.error(escaped(e.message.split('\n')[0]));
    process.exitCode = 2;
  }
}
