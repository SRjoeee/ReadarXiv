// lab/typeset/parity/frozen.mjs: today's side of the parity check frozen (amendment 8.3 of the refactor's design: before the
// cut-over deletes today's engine, today's outputs are written once and the display gate reads them in place of drawing today's
// side). render.mjs `--freeze-today=<dir>` draws today's side as always and writes into <dir> what it drew and read of each pair;
// `--today-frozen=<dir>` reads it from there and opens no page of today's engine. The folder:
//   shots/<sha256>.png               every shot of today's context, by the SHA-256 of its bytes (stored once, whichever pair,
//                                    page or toggles drew it): arXiv's page (A), today's pane whole (T), its translated text
//                                    alone (Tt), its drawing without its text (Tc), as the browser's screenshot gave them
//   <toggles>/<pair>.json            the pair's record (`defaults` or `on`, the toggles both readers were drawn under): what today's
//                                    page said on opening, each page's readings and shots, its sentence boxes, its page errors,
//                                    the inputs it was drawn from and how it was drawn
// The readings are kept as the browser handed them to render.mjs, NaN, the infinities, -0 and undefined included
// (lab/frozen-json.mjs encode): a reading a JSON round trip would change (NaN read back null) is no longer the reading the
// measures were taken on.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decode, encode } from '../../frozen-json.mjs'

export { decode, encode }
export const FROZEN_FORMAT = 'readarxiv-today-frozen 1'

const sha256 = (b) => createHash('sha256').update(b).digest('hex')
const shotFile = (dir, digest) => join(dir, 'shots', `${digest}.png`)
/** a pair's record's file under the toggles it was drawn under */
export const recordFile = (dir, toggles, pair) => join(dir, toggles, `${pair}.json`)

/** a file written whole or not at all (a run stopped while writing leaves no half file a later run would read) */
function writeWhole(file, bytes) {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, bytes)
  renameSync(tmp, file)
}

/** a shot (base64 PNG, as render.mjs holds it) stored by its digest, once: its digest */
export function putShot(dir, b64) {
  const bytes = Buffer.from(b64, 'base64')
  const digest = sha256(bytes)
  const f = shotFile(dir, digest)
  if (!existsSync(f)) {
    mkdirSync(join(dir, 'shots'), { recursive: true })
    writeWhole(f, bytes)
  }
  return digest
}

/** a stored shot as render.mjs hands shots on (base64 PNG); throws where it is missing or its bytes are not its digest's */
export function getShot(dir, digest) {
  const f = shotFile(dir, digest)
  if (!existsSync(f)) throw new Error(`today's frozen shot ${digest} is missing (${f})`)
  const bytes = readFileSync(f)
  if (sha256(bytes) !== digest) throw new Error(`today's frozen shot ${digest} does not hold its digest's bytes (${f})`)
  return bytes.toString('base64')
}

/** a pair's record, or null where none is frozen */
export function readRecord(dir, toggles, pair) {
  const f = recordFile(dir, toggles, pair)
  if (!existsSync(f)) return null
  const r = JSON.parse(readFileSync(f, 'utf8'))
  if (r.format !== FROZEN_FORMAT) throw new Error(`${f}: format ${r.format}, this reader reads ${FROZEN_FORMAT}`)
  return { ...r, opened: decode(r.opened), pages: r.pages.map(decode) }
}

/** a pair's record written once (`record`: its readings as the browser gave them; encoded here) */
export function writeRecord(dir, toggles, pair, record) {
  const f = recordFile(dir, toggles, pair)
  if (existsSync(f)) throw new Error(`today's side of ${pair} is frozen already (${f}): a frozen side is written once`)
  mkdirSync(join(dir, toggles), { recursive: true })
  writeWhole(f, `${JSON.stringify({ format: FROZEN_FORMAT, ...record, opened: encode(record.opened), pages: record.pages.map(encode) })}\n`)
}

/** the identity of what today's side of a pair is drawn from: the description today's page opens (the release's catalog refs,
 *  the target, the toggles' classes), the SHA-256 of the door rows it takes and of arXiv's PDF */
export function inputsOf(desc, rowsBytes, pdfBytes) {
  return { desc, rows: sha256(rowsBytes), pdf: sha256(pdfBytes) }
}

/** why a record cannot stand for today's side of this run's pair, or null: other toggles, or other inputs than the run's */
export function staleOf(record, toggles, inputs) {
  if (record.toggles !== toggles) return `today's side was frozen under the toggles ${record.toggles}, the drawing is asked ${toggles}`
  const was = record.inputs
  if (JSON.stringify(was.desc) !== JSON.stringify(inputs.desc)) return "today's side was frozen over another release bundle or target than this run's (the sweep cache's catalog)"
  if (was.rows !== inputs.rows) return `today's side was frozen over other door rows (${was.rows.slice(0, 12)}, this run's ${inputs.rows.slice(0, 12)})`
  if (was.pdf !== inputs.pdf) return `today's side was frozen over another arXiv PDF (${was.pdf.slice(0, 12)}, this run's ${inputs.pdf.slice(0, 12)})`
  return null
}

/** a page's frozen side, or the page's error where the record holds none of it (a page the freezing run was not asked) */
export function pageOf(record, n) {
  return record.pages.find((p) => p.page === n) ?? { page: n, error: `today's side is not frozen for page ${n}` }
}
