// lab/typeset/rules-data.mjs [--check]: writes packages/typeset/src/data/rules/, the rule set rulesFor reads, from today's own
// set (engine 065c1d973, read-only: rules/layout-rules.json, schema 10): one file a language (its own fields over its
// script's: its labels, its patterns, any field it sets), one of the scripts' fields and the hyphenation minimums, and an index.
// Not edited by hand; the set's own editor is today's (rules/layout.mjs writeRules). CJK characters (labels, the no-start
// and no-end marks) are written as \u escapes (the English gate counts CJK lines in code). Run from the worktree's root:
// node lab/typeset/rules-data.mjs; with --check it writes nothing and exits 1 where a file differs from what today's set gives.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TODAY = process.env.AXT_TODAY ?? '/Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/refactor-read'
const SET = JSON.parse(readFileSync(`${TODAY}/src/pdf-reader/engine/rules/layout-rules.json`, 'utf8'))
const check = process.argv.includes('--check')
const ROOT = join(import.meta.dirname, '../..')
const DIR = join(ROOT, 'packages/typeset/src/data/rules')

/** a value as TypeScript source, every character outside ASCII as an escape */
const lit = v => JSON.stringify(v, null, 2).replace(/[\u0080-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
const fileOf = tag => `${tag.toLowerCase()}.ts`
const varOf = tag => tag.replace(/-/g, '_').toUpperCase()
const files = new Map()
const head = what => `// ${what}.
// Today's rules/layout-rules.json (schema ${SET.schema}, version ${SET.version}, engine 065c1d973), written by lab/typeset/rules-data.mjs; not
// edited by hand.
`
files.set('scripts.ts', `${head("The rule set's scripts: each script's fields, which a language's own fields replace, and the hyphenation minimums")}
import type { LanguageRules, ScriptRules } from './types.ts'

export const VERSION = ${SET.version}

/** each script's fields: what a target written in it reads where its language sets nothing of its own */
export const SCRIPTS: Readonly<Record<string, ScriptRules>> = ${lit(SET.scripts)}

/** babel's hyphenation minimums: the shortest word cut, and each language's letters kept before and after a cut */
export const HYPHENATION: LanguageRules['hyphenation'] = ${lit(SET.hyphenation)}
`)
const langs = Object.keys(SET.languages).sort()
for (const tag of langs)
  files.set(fileOf(tag), `${head(`The rule set's ${tag}: its own fields over its script's`)}
import type { LanguageRules } from './types.ts'

export const ${varOf(tag)}: LanguageRules = ${lit(SET.languages[tag])}
`)
files.set('index.ts', `${head('The rule set: its languages by tag')}
${langs.map(t => `import { ${varOf(t)} } from './${fileOf(t)}'`).join('\n')}
import type { LanguageRules } from './types.ts'

export { HYPHENATION, SCRIPTS, VERSION } from './scripts.ts'
export type { LanguageRules, ScriptRules } from './types.ts'

/** each language's own fields, by its tag */
export const LANGUAGES: Readonly<Record<string, LanguageRules>> = {
${langs.map(t => `  ${JSON.stringify(t)}: ${varOf(t)},`).join('\n')}
}
`)
mkdirSync(DIR, { recursive: true })
let differ = 0
for (const [name, raw] of files) {
  const out = join(DIR, name)
  // (in the repository's own format: Biome's formatter holds packages/)
  const text = execFileSync(join(ROOT, 'node_modules/.bin/biome'), ['format', `--stdin-file-path=${out}`], { input: raw, cwd: ROOT, encoding: 'utf8' })
  if (check) {
    let cur = null
    try { cur = readFileSync(out, 'utf8') } catch {}
    if (cur !== text) { differ++; console.log(`rules-data: ${name} differs from today's set`) }
  } else writeFileSync(out, text)
}
console.log(`rules-data: ${langs.length} languages, ${Object.keys(SET.scripts).length} scripts: ${DIR}`)
if (check) process.exit(differ ? 1 : 0)
