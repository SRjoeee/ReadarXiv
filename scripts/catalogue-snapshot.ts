// Writes the string catalogue's snapshot: every pack flattened (packages/ui/tests/catalogue.ts says by which rule) into
// packages/ui/tests/fixtures/catalogue-<ref>.json, `pnpm tsx scripts/catalogue-snapshot.ts <ref>`, <ref> the commit the
// tree is at. The snapshot of 3f4da971c (the stage's base) was made there, the packs still in src/locales, before they
// moved into packages/ui: packages/ui/tests/catalogue.test.ts holds the package's catalogue to it, so that every id of
// docs/UI.md resolves to the same words in every locale as before the move. A snapshot is never written over
import { existsSync, writeFileSync } from 'node:fs'
import { LOCALES } from '../packages/ui/src/locales/index.ts'
import { flattenCatalogue } from '../packages/ui/tests/catalogue.ts'

const ref = process.argv[2]
if (!ref || !/^[0-9a-f]{7,40}$/.test(ref)) throw new Error('usage: pnpm tsx scripts/catalogue-snapshot.ts <the commit the packs are read at>')
const to = new URL(`../packages/ui/tests/fixtures/catalogue-${ref}.json`, import.meta.url)
if (existsSync(to)) throw new Error(`${to.pathname} exists: a snapshot is the words at its commit, never made again`)
const flat = flattenCatalogue(LOCALES)
writeFileSync(to, `${JSON.stringify(flat, null, 2)}\n`)
console.log(`wrote ${to.pathname}: ${Object.keys(flat).length} entries`)
