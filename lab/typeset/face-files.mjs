// lab/typeset/face-files.mjs: the typesetter's HOLDS and SMCP (packages/typeset/src/data/faces.ts) held to the face files'
// own OpenType tables. They mirror the files (design 3c's second kind of list: the list names the definition it copies, and a
// check reads that definition): a face holds an alphabet where its file's best Unicode cmap maps every letter of it, the
// letters as the check's reference states them (lab/typeset/face-files.json `letters`), HOLDS listing every such alphabet in
// the reference's order and no other; a face is in SMCP where its file's GSUB has the `smcp` feature, and no other face is;
// and @readarxiv/text's SMALL_CAPS (packages/text/src/font-caps.ts) holds, for each face of SMCP and no other, the code points
// its file's smcp substitutes (face-tables.py `smallCaps`), `--write=<file>` writing that module from the tables in place of
// judging (Biome formats it after).
// The files are read by lab/typeset/face-tables.py (fontTools) into a tables file this judges; a file not of its binding
// SHA-256 (the reference's `sha256`), a file missing, a face of the catalogue the reference names no file for, or one the
// reference names that the catalogue lacks, fails too. The release check's `face-files` gate (lab/release-check/gates.mjs):
//   python3 lab/typeset/face-tables.py <fonts dir> <tables.json>
//   node --import tsx lab/typeset/face-files.mjs <tables.json> [--reference=<face-files.json>]   exit 0: the lists are the
//   files'; 1: a difference, each printed; 2: usage
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** the check's reference beside this file: each face's file, each alphabet's letters, each file's binding SHA-256 */
export const REFERENCE = new URL('./face-files.json', import.meta.url)

/** the alphabets a face's tables hold, in the reference's order: those its file leaves no letter of unmapped */
export const heldOf = (tables, alphabets) => Object.keys(alphabets).filter((a) => !tables.unmapped?.[a])

/** ranges (start and end in turn) as their characters, for a sentence: "a-z ß à-ö", at most 200 characters */
const rangesText = (r) => {
  const out = []
  for (let i = 0; i + 1 < (r?.length ?? 0); i += 2)
    out.push(r[i] === r[i + 1] ? String.fromCodePoint(r[i]) : `${String.fromCodePoint(r[i])}-${String.fromCodePoint(r[i + 1])}`)
  const s = out.join(' ')
  return s.length > 200 ? `${s.slice(0, 200)}…` : s || 'none'
}
const sameRanges = (a, b) => (a?.length ?? 0) === (b?.length ?? 0) && (a ?? []).every((v, i) => v === b[i])

/** what differs between the package's lists (`faces` the catalogue's ids, `holds`, `smcp`, `smallCaps`) and the files' tables
 *  (`tables`, face-tables.py's `faces`) under the reference (`reference`, face-files.json): one sentence each, none where they
 *  agree. `smallCaps` (@readarxiv/text SMALL_CAPS) holds, for each face of SMCP and no other, the code points its file's smcp
 *  substitutes, as face-tables.py reads them */
export function differencesOf(tables, reference, { faces, holds, smcp, smallCaps = null }) {
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
    if (!smallCaps) continue
    const stated = Object.hasOwn(smallCaps, face) ? smallCaps[face] : null
    if (smcpOf.has(face) && !stated)
      out.push(`${face}: in SMCP, no SMALL_CAPS of it (its file's smcp substitutes ${rangesText(t.smallCaps)})`)
    else if (stated && !smcpOf.has(face)) out.push(`${face}: SMALL_CAPS states it, SMCP does not`)
    else if (stated && !sameRanges(stated, t.smallCaps))
      out.push(`${face}: SMALL_CAPS states ${rangesText(stated)}, its file's smcp substitutes ${rangesText(t.smallCaps)}`)
  }
  for (const face of smcp) if (!faces.includes(face)) out.push(`${face}: SMCP names it, no face of the catalogue`)
  for (const face of Object.keys(smallCaps ?? {}))
    if (!faces.includes(face)) out.push(`${face}: SMALL_CAPS names it, no face of the catalogue`)
  return out
}

/** packages/text/src/font-caps.ts as the files' tables make it: for each face of the catalogue whose file has smcp, in the
 *  catalogue's order, the code points the feature substitutes; faces of one set share one entry (S0, S1, … in the order first
 *  met). Formatted by Biome after it is written (packages/ are) */
export function smallCapsModule(tables, faces) {
  const sets = []
  const of = []
  for (const face of faces) {
    const t = tables[face]
    if (!t?.smcp) continue
    const key = JSON.stringify(t.smallCaps ?? [])
    let k = sets.indexOf(key)
    if (k < 0) k = sets.push(key) - 1
    of.push([face, k])
  }
  const head = `// packages/text/src/font-caps.ts
// Generated by lab/typeset/face-files.mjs --write from the face files (over lab/typeset/face-tables.py's reading of them) and
// held to them by the release check's \`face-files\` gate, as font-letters.ts HOLDS and SMCP are: do not edit by hand.
// SMALL_CAPS: for each face whose file's GSUB has OpenType's \`smcp\` feature (font-letters.ts SMCP), the code points whose glyph
// (its best Unicode cmap's) the feature substitutes, every lookup of every smcp feature record (the union over its scripts and
// language systems), as sorted inclusive ranges, start and end in turn; faces of one set share one entry. What a face draws in
// its own small capitals letter by letter (font-faces.ts ownSmallCapsOf): a served slice keeps the feature where it holds one
// of these letters, and a letter it does not substitute is drawn in lower case under \`font-variant-caps: small-caps\`.
// Read by font-faces.ts alone, never re-exported by the package's entry: there the website's server bundles, which bundle the
// entry, kept its tables (each an Object.freeze call) though nothing of the server reads them, and their keys moved.
`
  const body = sets.map((s, k) => `const S${k}: readonly number[] = Object.freeze(${s})`).join('\n')
  const map = of.map(([face, k]) => `  '${face}': S${k},`).join('\n')
  return `${head}\n${body}\n\n/** each face of SMCP: the code points its file's smcp substitutes (ranges) */\nexport const SMALL_CAPS: Readonly<Record<string, readonly number[]>> = Object.freeze({\n${map}\n})\n`
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
  // (--write=<file>: the package's SMALL_CAPS written from these tables, nothing judged; Biome formats it after)
  const write = args.find((a) => a.startsWith('--write='))?.slice('--write='.length)
  if (write) {
    writeFileSync(write, smallCapsModule(tables.faces, faces))
    console.log(`face-files: ${write} written from ${file}`)
    process.exit(0)
  }
  const { SMALL_CAPS } = await import(new URL('../../packages/text/src/font-caps.ts', import.meta.url).href)
  const found = differencesOf(tables.faces, reference, { faces, holds: HOLDS, smcp: SMCP, smallCaps: SMALL_CAPS })
  if (found.length) {
    console.log(`face-files: ${found.length} differ (the files of ${tables.fonts})`)
    for (const f of found) console.log(`  ${f}`)
    process.exit(1)
  }
  console.log(
    `face-files: the ${faces.length} faces' HOLDS, the ${SMCP.length} of SMCP and their SMALL_CAPS are their files' tables (${tables.fonts}, every file's SHA-256 the binding one)`,
  )
}
