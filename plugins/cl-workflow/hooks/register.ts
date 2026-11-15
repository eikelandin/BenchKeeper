// The plugin's one hooks module: Claude Code loads a single module per plugin.
import type { Register } from 'claude-code'

import { register as tier } from './tier/register'

export const register: Register = (on, options) => {
  tier(on, options)
}
