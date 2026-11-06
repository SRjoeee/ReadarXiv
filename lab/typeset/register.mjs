// lab/typeset/register.mjs: `node --import ./lab/typeset/register.mjs <tool>` registers hook.mjs (today's private functions
// exported as the engine loads).
import { register } from 'node:module'

register('./hook.mjs', import.meta.url)
