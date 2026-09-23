// The PDF reader's cached copy of a compiled translation: the rules that touch no storage (experiments/pdf-bilingual/
// REPORT.md, eighteenth addendum) — when a copy is current, and which of two copies is kept. Pure, so that the store
// and the reader share them.

/** What became of a unit in the runs that made the copy */
export type UnitState = 'whole' | 'partial' | 'none' | 'lost' | 'kept'

/** `by` when a unit's pieces came from more than one identity: never current */
export const MIXED = 'mixed'

export interface CachedUnit {
  /** para, caption, heading, … (latex-front's kinds) */
  kind: string
  /** the source as plain text, which the left side is anchored by */
  src: string
  /** SHA-256 of the unit's source pieces, which a seed is matched by */
  hash: string
  /** the translation as plain text, which the right side is anchored by; absent with no translation */
  tr?: string
  /** the translated pieces as they were typeset: the base of a translation made again */
  pieces?: unknown[]
  /** the identity the translation shown was made under, or MIXED */
  by?: string
  /** the identity the unit was last tried under */
  tried?: string
  state: UnitState
}

/** A figure's text translated, keyed by the wire format and the wire text it was sent in */
export interface FigureEntry {
  format: string
  wire: string
  text: string
  by: string
}

export interface PdfRecordBody {
  /** SHA-256 hex of arXiv's whole PDF */
  digest: string
  /** the target language, BCP 47 */
  lang: string
  /** the arXiv id as asked, for listing */
  paper: string
  /** the service's name, for the status line */
  engine: string
  /** the wire format of the run that made it: the figures' texts are looked up in it while no engine answers */
  format: string
  pipeline: string
  context: { paperTitle?: string; abstract?: string }
  units: CachedUnit[]
  /** the left side's mark words: the entries of the Map marksOfPdf gives */
  marks: [string, unknown][]
  figures: FigureEntry[]
}

export interface PdfRecord extends PdfRecordBody {
  /** the compiled translation, decrypted */
  pdf: Uint8Array<ArrayBuffer>
  createdAt: number
  openedAt: number
}

/** What a copy is judged against: the identity that would answer now, and the reader's PIPELINE_VERSION */
export interface Now {
  identity: string
  pipeline: string
}

/** A unit to translate is current when its translation was made, or it was settled, under the identity that would answer now */
export function unitIsCurrent(u: CachedUnit, identity: string): boolean {
  if (u.state === 'whole') return u.by === identity
  if (u.state === 'partial' || u.state === 'none') return u.tried === identity
  return false
}

/** A copy is current with the current pipeline and every unit to translate current; the kept names are none to translate */
export function isCurrent(record: PdfRecordBody, now: Now): boolean {
  return record.pipeline === now.pipeline && record.units.every(u => u.state === 'kept' || unitIsCurrent(u, now.identity))
}

/** What a copy is worth, in the order copies are compared: pipeline, units current, whole, partial, lost (fewer), marks */
function worth(record: PdfRecordBody, now: Now): number[] {
  const units = record.units.filter(u => u.state !== 'kept')
  const count = (f: (u: CachedUnit) => boolean) => units.filter(f).length
  return [
    record.pipeline === now.pipeline ? 1 : 0,
    count(u => unitIsCurrent(u, now.identity)),
    count(u => u.state === 'whole'),
    count(u => u.state === 'partial'),
    -count(u => u.state === 'lost'),
    record.marks.length > 0 ? 1 : 0,
  ]
}

/** Whether `candidate` may replace `stored`: at least as good, `worth` compared in order; a tie goes to the newer, the candidate */
export function atLeastAsGood(candidate: PdfRecordBody, stored: PdfRecordBody, now: Now): boolean {
  const a = worth(candidate, now)
  const b = worth(stored, now)
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! > b[i]!
  return true
}
