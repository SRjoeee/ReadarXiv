// An incremental-update section (ISO 32000-1 §7.5.6), written after a document's bytes: the objects, one cross-reference
// section of the document's own kind (a classic table, or a cross-reference stream, /W [1 4 2], uncompressed), its trailer
// with /Prev and the document's /Root, /Info and /ID, and `startxref`. Shared by the wrap (layout/wrap.mjs: our final pass's
// pages wrapped by optional content) and our base as an update over arXiv's PDF (layout/delta.mjs deltaOf: the delta), so that
// both write the one form. Imports nothing.

/** an object written whole, `n g obj … endobj`: its number, generation and bytes */
export type SectionObject = [number: number, generation: number, bytes: Uint8Array]
/** an object's row in the cross-reference section: its number, generation and offset in the document */
export type SectionRow = [number: number, generation: number, offset: number]
/** what appendSection writes: the objects, one cross-reference section of `kind` with /Prev `prev`, the trailer's /Root, /Info
 *  and /ID; `size` the next free number (a stream section's object takes it); `runs` false writes one subsection a number */
export interface SectionInput {
  end: number
  objects: SectionObject[]
  kind: 'table' | 'stream'
  prev: number
  size: number
  trailer: { root: unknown; info?: unknown; id?: unknown }
  runs?: boolean
}

/** bytes of a string, one byte a character (latin-1) */
const enc = (s: string): Uint8Array => {
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255
  return b
}
const concat = (parts: Uint8Array[]): Uint8Array => {
  let n = 0
  for (const p of parts) n += p.length
  const out = new Uint8Array(n)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** rows [number, generation, offset] sorted by number, as runs of consecutive numbers: [first, rows] */
function runsOf(rows: SectionRow[]): [first: number, rows: SectionRow[]][] {
  const runs: [first: number, rows: SectionRow[]][] = []
  for (const r of rows) {
    const last = runs[runs.length - 1]
    if (last && last[0] + last[1].length === r[0]) last[1].push(r)
    else runs.push([r[0], [r]])
  }
  return runs
}

/**
 * The section appended at `end` (the document's length so far: its offsets run from there). `objects` [[number, generation,
 * bytes], …], each `n g obj … endobj` written whole (a number at most once); `kind` 'table' or 'stream' (the document's own);
 * `prev` the startxref of the section it follows; `size` the next free object number (a stream section's own object takes it,
 * the /Size then one more); `trailer` { root, info?, id? } as their PDF text (the document's /Root, /Info, /ID). `runs`: the
 * subsections (the stream's /Index pairs) one a run of consecutive numbers; false, one a number (the remover's tails, as they
 * were written). Returns { bytes, xref: the section's offset in the document, size: the /Size written }. The bytes begin with a
 * line feed (the document's last line may lack one) and end in `%%EOF\n`
 */
export function appendSection({ end, objects, kind, prev, size, trailer, runs = true }: SectionInput): {
  bytes: Uint8Array
  xref: number
  size: number
} {
  if (
    !Number.isSafeInteger(end) ||
    end < 0 ||
    !Number.isSafeInteger(prev) ||
    prev < 0 ||
    !Number.isSafeInteger(size) ||
    size < 1
  )
    throw new RangeError('end, prev, size: offsets and an object count')
  if (kind !== 'table' && kind !== 'stream') throw new RangeError(`kind: 'table' or 'stream' (${String(kind)})`)
  const chunks = [enc('\n')]
  let at = end + 1
  const offsets: SectionRow[] = []
  for (const [n, g, b] of objects) {
    offsets.push([n, g, at])
    chunks.push(b)
    at += b.length
  }
  // (a stream section's offsets are 4 bytes wide: past them it would wrap)
  if (kind === 'stream' && at >= 2 ** 32)
    throw new RangeError("an offset past 4 GiB: a stream section's offsets are 4 bytes")
  offsets.sort((a, b) => a[0] - b[0])
  const tr = [
    `/Root ${trailer.root}`,
    trailer.info ? `/Info ${trailer.info}` : '',
    trailer.id ? `/ID ${trailer.id}` : '',
    `/Prev ${prev}`,
  ]
    .filter(Boolean)
    .join(' ')
  const xrefAt = at
  let SIZE = size
  if (kind === 'table') {
    const groups = runs ? runsOf(offsets) : offsets.map((r): [number, SectionRow[]] => [r[0], [r]])
    const rows = groups
      .map(
        ([first, rs]) =>
          `${first} ${rs.length}\n${rs.map(([, g, o]) => `${String(o).padStart(10, '0')} ${String(g).padStart(5, '0')} n\r\n`).join('')}`,
      )
      .join('')
    chunks.push(enc(`xref\n${rows}trailer\n<< /Size ${SIZE} ${tr} >>\nstartxref\n${xrefAt}\n%%EOF\n`))
  } else {
    const xs = SIZE
    SIZE += 1
    const all: SectionRow[] = [...offsets, [xs, 0, xrefAt]]
    const groups = runs ? runsOf(all) : all.map((r): [number, SectionRow[]] => [r[0], [r]])
    const ordered = groups.flatMap(([, rs]) => rs)
    const data = new Uint8Array(ordered.length * 7)
    ordered.forEach(([, g, o], r) => {
      data[7 * r] = 1
      data[7 * r + 1] = (o >>> 24) & 255
      data[7 * r + 2] = (o >>> 16) & 255
      data[7 * r + 3] = (o >>> 8) & 255
      data[7 * r + 4] = o & 255
      data[7 * r + 5] = (g >> 8) & 255
      data[7 * r + 6] = g & 255
    })
    chunks.push(
      enc(
        `${xs} 0 obj\n<< /Type /XRef /Size ${SIZE} /W [1 4 2] /Index [${groups.map(([first, rs]) => `${first} ${rs.length}`).join(' ')}] ${tr} /Length ${data.length} >>\nstream\n`,
      ),
      data,
      enc(`\nendstream\nendobj\nstartxref\n${xrefAt}\n%%EOF\n`),
    )
  }
  return { bytes: concat(chunks), xref: xrefAt, size: SIZE }
}
