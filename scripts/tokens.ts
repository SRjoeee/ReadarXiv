// Writes src/styles/tokens.css from src/shared/tokens.ts: `pnpm tokens`. tests/shared/tokens.test.ts fails while the
// committed sheet and the source differ
import { writeFileSync } from 'node:fs'
import { tokenSheet } from '../src/shared/tokens'

writeFileSync(new URL('../src/styles/tokens.css', import.meta.url), tokenSheet('page'))
