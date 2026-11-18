// Optional status band (userConfig tierBand, off by default): a row with the project, its branch and Ponytail's level (only
// when Ponytail is installed: a recommended add-on, installed separately), and a row with the last test run and the last lint
// or type check, ASK while /cl-workflow:ask or /cl-workflow:questions allows terminal questions.
// It reads the working folder, the git branch, one flag file of Ponytail and the commands and edits of the main loop; it
// writes no file and makes no network request.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Check, Where } from '../../types'
import { askUntil, lasting } from '../ask/window.mjs'

const where = atom({ plugin: 'cl-workflow', key: 'where' } as const, null)
const tests = atom({ plugin: 'cl-workflow', key: 'tests' } as const, null)
const lint = atom({ plugin: 'cl-workflow', key: 'lint' } as const, null)
// A command list as found anywhere in a command, and as the start of one part of a chain, also after a runner (npx vitest).
const commands = (list: string) => ({
  any: new RegExp(`(?:^|[\\s;&|('"])${list}(?=$|[\\s;&|):'"])`),
  start: new RegExp(`^(?:\\w+=\\S+\\s+)*(?:(?:npx|pnpm(?: exec)?|yarn|bunx|uv run|python3? -m)\\s+)?${list}(?=$|\\s)`),
})
const TEST = commands('(?:(?:npm|pnpm|yarn|bun) (?:run )?test(?::\\S+)?|node --test|playwright test|pytest|go test|cargo test|vitest|jest)')
const LINT = commands('(?:eslint|npm run lint|tsc|ruff|mypy|pyright|go vet|cargo clippy|biome)')
const EDITS = ['Edit', 'Write', 'NotebookEdit'] as const
// The window /cl-workflow:ask or /cl-workflow:questions opened, as the plugin's hook (ask/ask.mjs) keeps it per process: a module variable outlives /clear too.
let asking: number | null = null

// The commands of a chain joined by && only, else none: with ||, ;, | or & the exit code can come from another command, and a
// quoted name (echo "npm test") runs no test.
const chain = (command: string) => (/[;|&\n`]|\$\(/.test(command.replaceAll('&&', ' ')) ? [] : command.split('&&').map((part) => part.trim()))
// Without its redirections (> log, 2>&1, &> log), which leave the exit code alone. The lookbehinds start a match only at the
// first space or digit of a run, so a long run without a redirection is read once (linear time).
export const plain = (command: string) => command.replace(/(?<!\s)\s*(?:&|(?<!\d)\d+)?>>?\s*(?:&\d+|[^\s;&|'"]+)/g, '')
// The script of one sh -c '<script>', alone or after a container exec (devcontainer exec ... sh -lc 'cd web && npm test'),
// else the command: in echo sh -c 'npm test' the shell is an argument.
function script(command: string) {
  const c = plain(command)
  return plain(c.match(/^(?:\w+=\S+\s+)*(?:(?:devcontainer|docker|podman)(?: compose)? exec\s(?:[^;&|`'"(]*\s)?)?(?:\/(?:usr\/)?bin\/)?(?:ba)?sh -[a-z]*c (['"])([^'"]*)\1$/)?.[2] ?? c)
}

// The result of a check run, as the board reads a test run: a failed exit code fails, any other result passes. A compound
// command, a failed chain or a background run has no result of its own (null). undefined leaves the last result.
function outcome(check: typeof TEST, command: string, ran: { isError?: boolean; text?: string; backgroundTaskId?: unknown }) {
  if (!check.any.test(plain(command))) return undefined
  const parts = chain(script(command))
  // A chain passes when every part passed. It fails for the check only when the check is the whole command: in cd x && npm test
  // or false && npm test the failure may be another part's, and in npm test && false the test passed.
  if (!parts.some((part) => check.start.test(part)) || ran.backgroundTaskId) return null
  if (!ran.isError) return 'pass'
  if (parts.length > 1) return null
  return /Exit code [1-9]/.test(ran.text ?? '') ? 'fail' : undefined
}

const state = (check: Check | null) => (!check ? 'not run' : check.edits ? `stale (${check.edits} edit${check.edits > 1 ? 's' : ''} since)` : check.result === 'pass' ? 'passed' : 'failed')

// Project folder, git branch and Ponytail's level (the flag file its own hooks write; absent when it is not installed).
// Read after each answer, never while drawing.
async function refresh($: EngineInterface) {
  const cwd = await $.session.cwd()
  const git = await $.process.run(['git', 'branch', '--show-current'], { cwd }).catch(() => undefined)
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`
  const level = (await $.fs.read(`${dir}/.ponytail-active`).catch(() => '')).trim()
  const branch = git?.exitCode === 0 ? git.stdout.trim() : ''
  await update($, where, () => ({ project: cwd.split(/[\\/]/).filter(Boolean).pop() || cwd, branch: branch || null, ponytail: /^[a-z-]{1,12}$/.test(level) ? level : null }))
}

const HELP = 'CedarLoom band. Top row: project, branch, Ponytail level (only when Ponytail is installed: a recommended add-on, installed separately). Second row: last test run and lint or type check, stale after an edit. ASK until a time or for this session: terminal questions are allowed until then (/cl-workflow:ask, /cl-workflow:questions). The band writes no file and makes no network request. Turn off: set the status band option to false in the plugin options.'

export const register: Register = (on, options) => {
  // Off: no hook at all, so tool calls and prompts pass the band by. Changing the option reloads the module.
  if (options.tierBand !== true) return

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (!e.agentId) await refresh($).catch(() => undefined)
    return result
  })

  // The last test run and lint or type check of the main loop. Never denies.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (!e.agentId && ran.deny === undefined) {
      const testRun = outcome(TEST, e.command, ran)
      const lintRun = outcome(LINT, e.command, ran)
      if (testRun !== undefined) await update($, tests, () => (testRun && { result: testRun, edits: 0 }))
      if (lintRun !== undefined) await update($, lint, () => (lintRun && { result: lintRun, edits: 0 }))
    }
    return ran
  }).catch(($, e, next) => next(e))

  // An edit of the main loop makes the results before it stale; a denied or failed edit changed nothing.
  on('tool.call', { tool: EDITS }, async ($, e, next) => {
    const ran = await next(e)
    if (!e.agentId && ran.deny === undefined && !ran.isError) {
      const stale = (c: Check | null) => (c ? { ...c, edits: c.edits + 1 } : null)
      await update($, tests, stale)
      await update($, lint, stale)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    await refresh($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  // /clear, /resume and /branch reset the band's atoms and do not fire session.start again.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    // A resumed conversation starts with questions off, as the hook drops the window then.
    if (e.source === 'resume') asking = null
    await refresh($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    if (e.command?.name === 'cl-workflow:ask') {
      const end = askUntil(e.command.args, await $.clock.now())
      if (end !== undefined) asking = end
    }
    if (e.command?.name === 'cl-workflow:questions') asking = Infinity
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    // Other mods share this slot: theirs draw below. next(e) rejects only when nothing answers beneath (a test).
    const below = await next(e).catch(() => undefined)
    const at = await read($, where)
    const testRun = await read($, tests)
    const lintRun = await read($, lint)
    const now = asking === null ? null : await $.clock.now()
    const ask = asking !== null && now !== null && asking > now ? `ASK ${lasting(asking, now)}` : null
    const { Box, Text, Button } = $.ui.resolve(e)
    const info = [
      at?.project ? `${at.project}${at.branch ? ` (${at.branch})` : ''}` : null,
      at?.ponytail ? `Ponytail: ${at.ponytail}` : null,
    ].filter(Boolean).join('  ')
    const mine = (
      <Box flexDirection="column" width={e.props.bodyColumns}>
      {info ? <Text dimColor>{info}</Text> : null}
      <Box flexDirection="row" alignItems="center" gap={2} width={e.props.bodyColumns}>
        <Text>tests: {state(testRun)}  lint/types: {state(lintRun)}</Text>
        {ask ? <Text>{ask}</Text> : null}
        <Box flexGrow={1} />
        <Button key="help" plain label="?" onPress={() => $.ui.toast(HELP)} />
      </Box>
      </Box>
    )
    return below ? <Box flexDirection="column">{mine}{below}</Box> : mine
  })
}
