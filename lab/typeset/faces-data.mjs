// lab/typeset/faces-data.mjs [--check] [<out>]: writes packages/typeset/src/data/faces.ts, the face catalogue B.faces reads, from
// today's own tables (engine 065c1d973, read-only: rules/font-roles.mjs FACES, rules/font-letters.mjs HOLDS and SMCP): each
// face's family, weight, style and size correction, the alphabets whose every letter it holds, the faces with small
// capitals of their own. Only what the typesetter reads: a face's file, source and licence stay the catalogue's (the
// server's font build). Run from the worktree's root: node lab/typeset/faces-data.mjs; with --check it writes nothing and
// exits 1 where the file differs from what today's tables give.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TODAY = process.env.AXT_TODAY ?? '/Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/refactor-read'
const R = `${TODAY}/src/pdf-reader/engine/rules/`
const { FACES } = await import(`${R}font-roles.mjs`)
const { HOLDS, SMCP } = await import(`${R}font-letters.mjs`)
const args = process.argv.slice(2), check = args.includes('--check')
const OUT = args.find(a => a !== '--check') ?? join(import.meta.dirname, '../../packages/typeset/src/data/faces.ts')

// (in the table's own order: a face is found by its family, weight and style, BY_STYLE)
const ids = Object.keys(FACES)
const row = id => {
  const f = FACES[id]
  return `  ${JSON.stringify(id)}: { family: ${JSON.stringify(f.family)}, weight: ${f.weight}, style: ${JSON.stringify(f.style)}, size: ${f.size} },`
}
const holds = Object.keys(HOLDS).sort().map(id => `  ${JSON.stringify(id)}: ${JSON.stringify(HOLDS[id])},`)
const raw = `// The face catalogue B.faces reads (rules/font-roles.mjs FACES, rules/font-letters.mjs HOLDS and SMCP at engine 065c1d973),
// written by lab/typeset/faces-data.mjs from today's own tables; not edited by hand. Each face's CSS family (ours, \`axt-\`),
// weight, style and size correction; the alphabets whose every letter it holds; the faces with small capitals of their own.

/** a face of the catalogue as the typesetter reads it */
export type CatalogueFace = { family: string; weight: number; style: 'normal' | 'italic'; size: number }

export const FACES: Readonly<Record<string, CatalogueFace>> = {
${ids.map(row).join('\n')}
}

/** each face's alphabets whose every letter it holds (a language's own, and a script's bare letters) */
export const HOLDS: Readonly<Record<string, readonly string[]>> = {
${holds.join('\n')}
}

/** the faces that draw small capitals by their smcp feature */
export const SMCP: readonly string[] = ${JSON.stringify([...SMCP])}
`
// (in the repository's own format: Biome's formatter holds packages/, and reads the text from its input)
const ROOT = join(import.meta.dirname, '../..')
const text = execFileSync(join(ROOT, 'node_modules/.bin/biome'), ['format', `--stdin-file-path=${OUT}`], { input: raw, cwd: ROOT, encoding: 'utf8' })
if (check) {
  const same = readFileSync(OUT, 'utf8') === text
  console.log(`faces-data: ${OUT} ${same ? 'equals' : 'differs from'} today's tables`)
  process.exit(same ? 0 : 1)
}
writeFileSync(OUT, text)
console.log(`faces-data: ${ids.length} faces, ${Object.keys(HOLDS).length} with letters, ${SMCP.length} with smcp: ${OUT}`)
