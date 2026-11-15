// The status band's session state: where the session runs and its last test run and lint or type check, each with the
// edits since.
export type Where = { project: string; branch: string | null; ponytail: string | null }
export type Check = { result: 'pass' | 'fail'; edits: number }

declare module 'claude-code' {
  interface PluginState {
    'cl-workflow': { where: Where | null; tests: Check | null; lint: Check | null }
  }
}
