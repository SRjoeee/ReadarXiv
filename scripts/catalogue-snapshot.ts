// Writes the string catalogue's snapshot: every pack flattened (packages/ui/tests/catalogue.ts says by which rule) into
// packages/ui/tests/fixtures/catalogue-<ref>.json, `pnpm tsx scripts/catalogue-snapshot.ts <ref>`. Made once, at the stage's
// base commit 3f4da971c, before the packs moved into packages/ui: packages/ui/tests/catalogue.test.ts holds the package's
// catalogue to it, so that every id of docs/UI.md resolves to the same words in every locale as before the move
import { writeFileSync } from 'node:fs'
import { flattenCatalogue } from '../packages/ui/tests/catalogue.ts'
import { LOCALES } from '../src/locales/index.ts'

const ref = process.argv[2]
if (!ref || !/^[0-9a-f]{7,40}$/.test(ref)) throw new Error('usage: pnpm tsx scripts/catalogue-snapshot.ts <the commit the packs are read at>')
const flat = flattenCatalogue(LOCALES)
const to = new URL(`../packages/ui/tests/fixtures/catalogue-${ref}.json`, import.meta.url)
writeFileSync(to, `${JSON.stringify(flat, null, 2)}\n`)
console.log(`wrote ${to.pathname}: ${Object.keys(flat).length} entries`)
