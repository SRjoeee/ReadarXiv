// lab/typeset/face-files.mjs: the typesetter's HOLDS and SMCP (packages/typeset/src/data/faces.ts) held to the face files'
// own OpenType tables. They mirror the files (design 3c's second kind of list: the list names the definition it copies, and a
// check reads that definition): a face holds an alphabet where its file's best Unicode cmap maps every letter of it, the
// letters as the check's reference states them (lab/typeset/face-files.json `letters`), HOLDS listing every such alphabet in
// the reference's order and no other; a face is in SMCP where its file's GSUB has the `smcp` feature, and no other face is.
// The files are read by lab/typeset/face-tables.py (fontTools) into a tables file this judges; a file not of its binding
// SHA-256 (the reference's `sha256`), a file missing, a face of the catalogue the reference names no file for, or one the
// reference names that the catalogue lacks, fails too. The release check's `face-files` gate (lab/release-check/gates.mjs):
//   python3 lab/typeset/face-tables.py <fonts dir> <tables.json>
//   node --import tsx lab/typeset/face-files.mjs <tables.json> [--reference=<face-files.json>]   exit 0: the lists are the
//   files'; 1: a difference, each printed; 2: usage
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** the check's reference beside this file: each face's file, each alphabet's letters, each file's binding SHA-256 */
export const REFERENCE = new URL('./face-files.json', import.meta.url)

/** the alphabets a face's tables hold, in the reference's order: those its file leaves no letter of unmapped */
export const heldOf = (tables, alphabets) => Object.keys(alphabets).filter((a) => !tables.unmapped?.[a])

/** what differs between the package's lists (`faces` the catalogue's ids, `holds`, `smcp`) and the files' tables (`tables`,
 *  face-tables.py's `faces`) under the reference (`reference`, face-files.json): one sentence each, none where they agree */
export function differencesOf(tables, reference, { faces, holds, smcp }) {
  const files = reference.files.faces,
    alphabets = reference.letters.alphabets,
    digests = reference.sha256.faces
  const out = []
  for (const face of faces) if (!Object.hasOwn(files, face)) out.push(`${face}: a face of the catalogue, no file in the reference`)
  for (const face of Object.keys(files)) if (!faces.includes(face)) out.push(`${face}: a file in the reference, no face of the catalogue`)
  const smcpOf = new Set(smcp)
  for (const face of faces) {
    if (!Object.hasOwn(files, face)) continue
    const t = tables[face]
    if (!t || t.missing) {
      out.push(`${face}: ${files[face]} not in the fonts folder`)
      continue
    }
    if (t.sha256 !== digests[face]) out.push(`${face}: ${files[face]} sha256 ${t.sha256}, not the binding ${digests[face]}`)
    const claimed = holds[face] ?? []
    const held = heldOf(t, alphabets)
    for (const a of claimed) {
      if (!Object.hasOwn(alphabets, a)) out.push(`${face}: HOLDS claims ${a}, an alphabet the reference has no letters of`)
      else if (!held.includes(a)) out.push(`${face}: HOLDS claims ${a}, its file's cmap does not map ${t.unmapped[a]}`)
    }
    for (const a of held) if (!claimed.includes(a)) out.push(`${face}: its file's cmap maps every letter of ${a}, HOLDS leaves it out`)
    if (claimed.length === held.length && claimed.some((a, i) => held[i] !== a))
      out.push(`${face}: HOLDS lists its alphabets in another order than the reference's (${held.join(' ')})`)
    if (smcpOf.has(face) && !t.smcp) out.push(`${face}: SMCP claims it, its file's GSUB has no smcp feature`)
    if (!smcpOf.has(face) && t.smcp) out.push(`${face}: its file's GSUB has the smcp feature, SMCP leaves it out`)
  }
  for (const face of smcp) if (!faces.includes(face)) out.push(`${face}: SMCP names it, no face of the catalogue`)
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  const file = args.find((a) => !a.startsWith('--'))
  const ref = args.find((a) => a.startsWith('--reference='))?.slice('--reference='.length) ?? REFERENCE
  if (!file) {
    console.error('usage: node --import tsx lab/typeset/face-files.mjs <tables.json> [--reference=<face-files.json>]')
    process.exit(2)
  }
  const tables = JSON.parse(readFileSync(file, 'utf8'))
  const reference = JSON.parse(readFileSync(ref, 'utf8'))
  const { FACES, HOLDS, SMCP } = await import(new URL('../../packages/typeset/src/data/faces.ts', import.meta.url).href)
  const faces = Object.keys(FACES)
  const found = differencesOf(tables.faces, reference, { faces, holds: HOLDS, smcp: SMCP })
  if (found.length) {
    console.log(`face-files: ${found.length} differ (the files of ${tables.fonts})`)
    for (const f of found) console.log(`  ${f}`)
    process.exit(1)
  }
  console.log(
    `face-files: the ${faces.length} faces' HOLDS and the ${SMCP.length} of SMCP are their files' tables (${tables.fonts}, every file's SHA-256 the binding one)`,
  )
}
