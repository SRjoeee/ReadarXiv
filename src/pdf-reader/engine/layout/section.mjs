// An incremental-update section (ISO 32000-1 §7.5.6), written after a document's bytes: the objects, one cross-reference
// section of the document's own kind (a classic table, or a cross-reference stream, /W [1 4 2], uncompressed), its trailer
// with /Prev and the document's /Root, /Info and /ID, and `startxref`. Shared by the remover's add-on (layout/remove.mjs
// makeAddon: a part's tail) and our base as an update over arXiv's PDF (layout/delta.mjs deltaOf: the delta), so that both
// write the one form layout/tail.mjs tailLinks reads back. Imports nothing.

/** bytes of a string, one byte a character (latin-1) */
const enc = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b }
const concat = parts => { let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }

/** rows [number, generation, offset] sorted by number, as runs of consecutive numbers: [first, rows] */
function runsOf(rows) {
  const runs = []
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
export function appendSection({ end, objects, kind, prev, size, trailer, runs = true }) {
  if (!Number.isSafeInteger(end) || end < 0 || !Number.isSafeInteger(prev) || prev < 0 || !Number.isSafeInteger(size) || size < 1) throw new RangeError('end, prev, size: offsets and an object count')
  if (kind !== 'table' && kind !== 'stream') throw new RangeError(`kind: 'table' or 'stream' (${String(kind)})`)
  const chunks = [enc('\n')]
  let at = end + 1
  const offsets = []
  for (const [n, g, b] of objects) { offsets.push([n, g, at]); chunks.push(b); at += b.length }
  offsets.sort((a, b) => a[0] - b[0])
  const tr = [`/Root ${trailer.root}`, trailer.info ? `/Info ${trailer.info}` : '', trailer.id ? `/ID ${trailer.id}` : '', `/Prev ${prev}`].filter(Boolean).join(' ')
  const xrefAt = at
  let SIZE = size
  if (kind === 'table') {
    const groups = runs ? runsOf(offsets) : offsets.map(r => [r[0], [r]])
    const rows = groups.map(([first, rs]) => `${first} ${rs.length}\n${rs.map(([, g, o]) => `${String(o).padStart(10, '0')} ${String(g).padStart(5, '0')} n\r\n`).join('')}`).join('')
    chunks.push(enc(`xref\n${rows}trailer\n<< /Size ${SIZE} ${tr} >>\nstartxref\n${xrefAt}\n%%EOF\n`))
  } else {
    const xs = SIZE
    SIZE += 1
    const all = [...offsets, [xs, 0, xrefAt]]
    const groups = runs ? runsOf(all) : all.map(r => [r[0], [r]])
    const ordered = groups.flatMap(([, rs]) => rs)
    const data = new Uint8Array(ordered.length * 7)
    ordered.forEach(([, g, o], r) => { data[7 * r] = 1; data[7 * r + 1] = (o >>> 24) & 255; data[7 * r + 2] = (o >>> 16) & 255; data[7 * r + 3] = (o >>> 8) & 255; data[7 * r + 4] = o & 255; data[7 * r + 5] = (g >> 8) & 255; data[7 * r + 6] = g & 255 })
    chunks.push(enc(`${xs} 0 obj\n<< /Type /XRef /Size ${SIZE} /W [1 4 2] /Index [${groups.map(([first, rs]) => `${first} ${rs.length}`).join(' ')}] ${tr} /Length ${data.length} >>\nstream\n`), data, enc(`\nendstream\nendobj\nstartxref\n${xrefAt}\n%%EOF\n`))
  }
  return { bytes: concat(chunks), xref: xrefAt, size: SIZE }
}
