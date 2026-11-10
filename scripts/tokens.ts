// Writes packages/ui/src/tokens.css from packages/ui/src/tokens.ts: `pnpm tokens`. packages/ui/tests/tokens.test.ts fails
// while the committed sheet and the source differ
import { writeFileSync } from 'node:fs'
import { tokenSheet } from '../packages/ui/src/tokens.ts'

writeFileSync(new URL('../packages/ui/src/tokens.css', import.meta.url), tokenSheet('page'))
