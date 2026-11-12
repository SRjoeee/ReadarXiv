// `pnpm digests`: every behaviour digest of the repository recomputed (packages/translate/tests/digests.ts: the acceptance
// rule's, each adapter's, the chain's) and compared with the literal its source holds; `pnpm digests --write` writes each one
// that moved into its source. A digest that moves is the announcement that rows are asked again: every chain's identity
// (identityOf) reads them, so its diff is what a lane states. Exits 1 where a literal differs and --write is not given.
import { readFileSync, writeFileSync } from 'node:fs'
import { DIGESTS } from '../packages/translate/tests/digests.ts'

const write = process.argv.includes('--write')
const root = new URL('../packages/translate/', import.meta.url)
let moved = 0
for (const d of DIGESTS) {
  const file = new URL(d.file, root)
  const source = readFileSync(file, 'utf8')
  const literal = new RegExp(`(export const ${d.name} = ')([0-9a-f]{64})(')`)
  const held = literal.exec(source)?.[2]
  if (!held) throw new Error(`packages/translate/${d.file} holds no literal ${d.name}`)
  const now = await d.compute()
  if (now === held) {
    console.log(`same   ${d.name} ${now}`)
    continue
  }
  moved++
  console.log(`MOVED  ${d.name} ${held} -> ${now} (packages/translate/${d.file})`)
  if (write) writeFileSync(file, source.replace(literal, `$1${now}$3`))
}
if (!moved) console.log('digests: every literal is its table\'s')
else if (write) console.log(`digests: ${moved} written; every chain's identity moves with them, and its rows are asked again`)
else {
  console.log(`digests: ${moved} moved; \`pnpm digests --write\` writes them`)
  process.exitCode = 1
}
