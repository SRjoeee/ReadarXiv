// lab/rules/register.mjs: `node --import ./lab/rules/register.mjs [--import tsx] <script>`: the rule ledger's instrument
// in a Node process (design-reduction-2026-11-13.md §3c): the recorder installed (recorder.mjs; AXT_RULES_SITES the site
// map, AXT_RULES_OUT where the record goes, AXT_RULES_PAPER or the script's `--id=` the paper, AXT_RULES_INPUT the input,
// AXT_RULES_ROOT the tree the map is of where it is not this checkout), the load hook registered
// (hook.mjs: every module the site map names is loaded instrumented), the record written when the process exits. Import
// it before tsx, so that tsx compiles the instrumented text. Not shipped.
import { realpathSync } from 'node:fs'
import { register } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { install } from './recorder.mjs'

const rec = install()
// (the tree the site map is of: this checkout, or AXT_RULES_ROOT)
const root = realpathSync(process.env.AXT_RULES_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..'))
register('./hook.mjs', import.meta.url, { data: { sites: process.env.AXT_RULES_SITES, root } })
process.on('exit', () => rec.flush())
