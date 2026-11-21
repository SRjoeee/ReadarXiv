// `pnpm digests`: every behaviour digest of the repository recomputed and compared with the literal its source holds — the
// translate package's (packages/translate/tests/digests.ts: the acceptance rule's, each adapter's, the chain's) and the LLM
// prompt's rules' (tests/providers/prompt-cases.ts: buildPrompts'); `pnpm digests --write` writes each one that moved into
// its source. A digest that moves is the announcement that rows are asked again: every chain's identity (identityOf) reads
// the package's, every LLM translator's identity the prompt's. Exits 1 where a literal differs and --write is not given.
import { readFileSync, writeFileSync } from 'node:fs'
import { DIGESTS } from '../packages/translate/tests/digests.ts'
import { PROMPT_DIGESTS } from '../tests/providers/prompt-cases.ts'

const write = process.argv.includes('--write')
const root = new URL('../', import.meta.url)
const all = [...DIGESTS.map(d => ({ ...d, file: `packages/translate/${d.file}` })), ...PROMPT_DIGESTS]
let moved = 0
for (const d of all) {
  const file = new URL(d.file, root)
  const source = readFileSync(file, 'utf8')
  const literal = new RegExp(`(export const ${d.name} = ')([0-9a-f]{64})(')`)
  const held = literal.exec(source)?.[2]
  if (!held) throw new Error(`${d.file} holds no literal ${d.name}`)
  const now = await d.compute()
  if (now === held) {
    console.log(`same   ${d.name} ${now}`)
    continue
  }
  moved++
  console.log(`MOVED  ${d.name} ${held} -> ${now} (${d.file})`)
  if (write) writeFileSync(file, source.replace(literal, `$1${now}$3`))
}
if (!moved) console.log('digests: every literal is its table\'s')
else if (write) console.log(`digests: ${moved} written; the identities that read them move, and their rows are asked again`)
else {
  console.log(`digests: ${moved} moved; \`pnpm digests --write\` writes them`)
  process.exitCode = 1
}
