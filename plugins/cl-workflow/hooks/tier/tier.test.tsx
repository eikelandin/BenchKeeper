import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { plain } from './register'

const BAND = {
  plugin: 'cl-workflow',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const
const ON = { options: { tierBand: true } }

// The engine beneath: another mod's band and a step that answers.
function engine(on: On) {
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>other band</Text>
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
}
async function step($: Engine) {
  const s = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 })
  for await (const _ of s) { /* chunks */ }
  return s.result
}

test('drops redirections in linear time', () => {
  expect(plain('npm test > test.log 2>&1')).toBe('npm test')
  expect(plain('npm test>test.log && ls 12>>err')).toBe('npm test && ls')
  expect(plain('npm test &> test.log; x 1 2>&1')).toBe('npm test; x 1')
  // Long runs of spaces or digits without a redirection took seconds with a backtracking expression.
  const start = Date.now()
  for (const command of [`a${' '.repeat(50000)}b`, `${'1'.repeat(50000)}x`]) expect(plain(command)).toBe(command)
  expect(Date.now() - start).toBeLessThan(100)
})

test('off by default: no band', async ($, on) => {
  engine(on)
  await step($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^tests:/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /other band/ })).toBeDefined()
  await ui.unmount()
})

test('on: the band draws above the other mods, in the terminal and the desktop app', ON, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^tests: not run/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /other band/ })).toBeDefined()
  await ui.unmount()
  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ type: 'Text', text: /^tests: not run/ })).toBeDefined()
  await desktop.unmount()
})

test('on: the band names the project, branch, last test run and Ponytail level; no Ponytail file, no Ponytail text', ON, async ($, on) => {
  engine(on)
  let level = 'full\n'
  let outcome: { isError?: true; text: string } = { text: '12 passing' }
  on('session.cwd', () => ({ value: '/work/shop/' }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'feat/cart\n', stderr: '' } }) as never)
  on('fs.read', (_, e) => {
    if (e.path !== '/home/u/.claude/.ponytail-active' || level === '') throw new Error('no such file')
    return { value: level } as never
  })
  on('tool.call', () => ({ result: {}, ...outcome }) as never)
  const test = (command: string) => $.tool.call({ tool: 'Bash', command } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await step($)
  expect(await ui.find({ type: 'Text', text: /^shop \(feat\/cart\)  Ponytail: full$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^tests: not run  lint\/types: not run$/ })).toBeDefined()
  await test('cd web && npm test')
  expect(await ui.find({ type: 'Text', text: /tests: passed/ })).toBeDefined()
  // A command that is no test run, and a failed command that is not a test failure, leave the result.
  outcome = { isError: true, text: 'Exit code 1\nnot ok' }
  await test('ls')
  expect(await ui.find({ type: 'Text', text: /tests: passed/ })).toBeDefined()
  await test('node --test')
  expect(await ui.find({ type: 'Text', text: /tests: failed/ })).toBeDefined()
  outcome = { isError: true, text: 'interrupted' }
  await test('node --test')
  expect(await ui.find({ type: 'Text', text: /tests: failed/ })).toBeDefined()
  // A compound command, a quoted name and a background run do not report the test's own outcome.
  outcome = { text: '12 passing' }
  await test('node --test')
  expect(await ui.find({ type: 'Text', text: /tests: passed/ })).toBeDefined()
  for (const command of ['npm test || true', 'echo "npm test"', 'npm test | tee log', 'npm test; ls']) {
    await test('node --test')
    await test(command)
    expect(await ui.find({ type: 'Text', text: /tests: not run / })).toBeDefined()
  }
  // In a chain that failed, the failure may belong to another part: false && npm test ran no test, npm test && false passed it.
  for (const command of ['false && npm test', 'npm test && false', 'cd web && npm test']) {
    outcome = { text: '12 passing' }
    await test('node --test')
    outcome = { isError: true, text: 'Exit code 1' }
    await test(command)
    expect(await ui.find({ type: 'Text', text: /tests: not run / })).toBeDefined()
  }
  // Redirections, a runner before the command and one sh -c script are read as the command they run.
  for (const command of ['npm test > test.log 2>&1', 'npm test>test.log', 'npm test &> test.log', 'npx vitest run', 'pnpm test', 'yarn jest', 'bunx vitest',
    'npm run test:unit', 'python -m pytest', 'uv run pytest', "devcontainer exec --workspace-folder . sh -lc 'cd web && npm test'",
    'sh -c "npm test 2>&1 > log"']) {
    outcome = { isError: true, text: 'Exit code 1' }
    await test('node --test')
    outcome = { text: '12 passing' }
    await test(command)
    expect(await ui.find({ type: 'Text', text: /tests: passed/ })).toBeDefined()
  }
  for (const command of ["sh -lc 'npm test | tail'", "ls; sh -c 'npm test'", 'npm test 2>&1 | tail', "echo sh -c 'npm test'"]) {
    await test('node --test')
    await test(command)
    expect(await ui.find({ type: 'Text', text: /tests: not run / })).toBeDefined()
  }
  outcome = { text: '12 passing' }
  await test('node --test')
  outcome = { text: 'started', backgroundTaskId: 'b1' } as never
  await test('npm test')
  expect(await ui.find({ type: 'Text', text: /tests: not run / })).toBeDefined()
  level = ''
  await step($)
  expect(await ui.find({ type: 'Text', text: /Ponytail/ })).toBeUndefined()
  await ui.unmount()
})

test('on: the project row comes back after /clear, /resume and /branch', ON, async ($, on) => {
  engine(on)
  on('classic.SessionStart', () => ({}))
  on('session.cwd', () => ({ value: '/work/shop' }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'main\n', stderr: '' } }) as never)
  on('fs.read', () => { throw new Error('no such file') })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /shop/ })).toBeUndefined()
  await $.classic.SessionStart({ source: 'resume' })
  expect(await ui.find({ type: 'Text', text: /^shop \(main\)$/ })).toBeDefined()
  await ui.unmount()
})

// One stub answers every tool call: Bash with the outcome set, the edit tools with it too.
function tools($: Engine, on: On) {
  let outcome: { isError?: true; text: string } = { text: 'ok' }
  on('tool.call', () => ({ result: {}, ...outcome }) as never)
  return {
    set: (o: typeof outcome) => { outcome = o },
    bash: (command: string) => $.tool.call({ tool: 'Bash', command } as never),
    edit: (agentId?: string) => $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'a', new_string: 'b', ...(agentId ? { agentId } : {}) } as never),
  }
}

test('on: an edit of the main loop makes the last results stale; a failed or subagent edit does not', ON, async ($, on) => {
  engine(on)
  const t = tools($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await t.edit()
  expect(await ui.find({ type: 'Text', text: /^tests: not run  lint\/types: not run$/ })).toBeDefined()
  await t.bash('npm test')
  await t.edit()
  expect(await ui.find({ type: 'Text', text: /tests: stale \(1 edit since\)  lint\/types: not run/ })).toBeDefined()
  await t.edit('subagent-1')
  t.set({ isError: true, text: 'String not found' })
  await t.edit()
  t.set({ text: 'ok' })
  expect(await ui.find({ type: 'Text', text: /tests: stale \(1 edit since\)/ })).toBeDefined()
  await $.tool.call({ tool: 'Write', file_path: 'b.ts', content: '' } as never)
  expect(await ui.find({ type: 'Text', text: /tests: stale \(2 edits since\)/ })).toBeDefined()
  await t.bash('npm test')
  expect(await ui.find({ type: 'Text', text: /tests: passed/ })).toBeDefined()
  t.set({ isError: true, text: 'Exit code 1' })
  await t.bash('npm test')
  expect(await ui.find({ type: 'Text', text: /tests: failed/ })).toBeDefined()
  await ui.unmount()
})

test('on: a lint or type check is read with the chain rules of a test run; a quoted name is not one', ON, async ($, on) => {
  engine(on)
  const t = tools($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  for (const command of ['ruff check .', 'cd web && npm run lint', 'npx tsc --noEmit', 'CI=1 eslint .', 'go vet ./...', 'cargo clippy', 'npx eslint .', 'npx biome check']) {
    t.set({ isError: true, text: 'Exit code 1' })
    await t.bash('mypy')
    t.set({ text: 'ok' })
    await t.bash(command)
    expect(await ui.find({ type: 'Text', text: /lint\/types: passed/ })).toBeDefined()
  }
  // A quoted name, a name that is no part's start (npm run lint:fix) or a compound command has no result.
  for (const command of ['echo "eslint"', 'npm run lint:fix', 'tsc || true']) {
    await t.bash('tsc')
    await t.bash(command)
    expect(await ui.find({ type: 'Text', text: /lint\/types: not run/ })).toBeDefined()
  }
  t.set({ isError: true, text: 'Exit code 2' })
  await t.bash('pyright')
  expect(await ui.find({ type: 'Text', text: /lint\/types: failed/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /tests: not run/ })).toBeDefined()
  await ui.unmount()
})
