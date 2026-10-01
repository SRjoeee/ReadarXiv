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
  /** the displays the unit sets before its first words, or after its last — outside its marks, which the reader's
   *  anchors take them from beyond — as their letters (latex-front's displayOutside); absent in a copy made before they
   *  did, anchored as then */
  lead?: string
  trail?: string
  /** the displays between its words, as their letters: the reader's anchors fill a page break inside the unit with them */
  inner?: string
  /**
   * where each of its sentences after the first begins, as its engine cut them (Microsoft's sentence lengths): offsets of
   * its first word in `src` and in `tr`, one pair per sentence; absent where the engine reported none, or in a copy made
   * before they were kept — the unit is lit whole then (the reader's highlight, sentence level)
   */
  sentences?: { src: number[]; tr: number[] }
}

/**
 * A figure's boxes translated: keyed by the boxes' source texts, so that whatever engine or wire format made it, the next
 * one finds it — an entry keyed by the wire it was sent in was lost when a new service changed the format (measured on
 * 2608.18090); `texts` one per box, null where one did not come back
 */
export interface FigureEntry {
  key: string
  texts: (string | null)[]
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
  /** the wire format of the run that made it */
  format: string
  /** the reader's translation pipeline (live.mjs PIPELINE_VERSION): what its units are and what was sent for them */
  pipeline: string
  /** the reader's typesetting (live.mjs TYPESETTING_VERSION): how its PDF was set from the translation; absent in a copy
   *  made before the two were apart (2026-10-02), which is set again */
  typesetting?: string
  context: { paperTitle?: string; abstract?: string }
  units: CachedUnit[]
  /** the left side's mark words: the entries of the Map marksOfPdf gives */
  marks: [string, unknown][]
  /**
   * the right side's marks as its PDF names them (the entries of pdfMarks' Map): read from the PDF they took 1.2 s of a
   * copy's 1.3 s on 2608.02163, measured; empty when not known, and read from the PDF then
   */
  rightMarks: [string, unknown][]
  figures: FigureEntry[]
}

export interface PdfRecord extends PdfRecordBody {
  /** the compiled translation, decrypted */
  pdf: Uint8Array<ArrayBuffer>
  createdAt: number
  openedAt: number
}

/** What a copy is judged against: the identity that would answer now, and the reader's PIPELINE_VERSION and
 *  TYPESETTING_VERSION */
export interface Now {
  identity: string
  pipeline: string
  typesetting?: string
  /** the TeX page's versions, where a mark is judged */
  page?: string
}

/** A unit to translate is current when its translation was made, or it was settled, under the identity that would answer now */
export function unitIsCurrent(u: CachedUnit, identity: string): boolean {
  if (u.state === 'whole') return u.by === identity
  if (u.state === 'partial' || u.state === 'none') return u.tried === identity
  return false
}

/** A copy is current with the current pipeline and typesetting and every unit to translate current; the kept names are
 *  none to translate. A copy of another typesetting alone is set again from its translation, which asks the service
 *  nothing (pdf-reader/engine/cache.mjs reusable) */
export function isCurrent(record: PdfRecordBody, now: Now): boolean {
  return record.pipeline === now.pipeline && record.typesetting === now.typesetting && record.units.every(u => u.state === 'kept' || unitIsCurrent(u, now.identity))
}

/**
 * A paper none of the ways of typesetting could set, on this machine: the pipeline that tried, and the identity (as `Now`
 * holds it) whose translation none of them could set. A mark written before the identity was kept (2026-09-30) has none
 */
export interface UntypesetMark {
  pipeline: string
  identity?: string
  /** the typesetting that could not set it; absent in a mark made before the two versions were apart */
  typesetting?: string
  /** the TeX page's versions it was compiled under (its own, its engine's, its tree's, its index's; '1' for a page of
   *  protocol 1): a page fixed since may set it */
  page?: string
}

/**
 * Whether a mark still answers for a visit, which then says again that the paper cannot be typeset without asking the
 * service or the TeX page (the maintainer, 2026-09-26): only under the same pipeline and the same identity — the same
 * service asked again for the same translation, judged as a copy is (`isCurrent`). The failure is the translated text's,
 * which another service, model or prompt may not repeat; a mark with no identity is tried again (Codex on #306). The
 * reader leaves a mark only for one identity's whole translation (pdf-reader/engine/cache.mjs allTranslatedBy)
 */
export function stillUntypeset(mark: UntypesetMark | undefined, now: Now): boolean {
  return mark !== undefined && mark.pipeline === now.pipeline && mark.typesetting === now.typesetting && mark.page === now.page && mark.identity !== undefined && mark.identity === now.identity
}

/** What a copy is worth, in the order copies are compared: pipeline, typesetting, units current, whole, partial, lost
 *  (fewer), marks */
function worth(record: PdfRecordBody, now: Now): number[] {
  const units = record.units.filter(u => u.state !== 'kept')
  const count = (f: (u: CachedUnit) => boolean) => units.filter(f).length
  return [
    record.pipeline === now.pipeline ? 1 : 0,
    record.typesetting === now.typesetting ? 1 : 0,
    count(u => unitIsCurrent(u, now.identity)),
    count(u => u.state === 'whole'),
    count(u => u.state === 'partial'),
    -count(u => u.state === 'lost'),
    record.marks.length > 0 ? 1 : 0,
  ]
}

/**
 * Figures' entries merged by key: the incoming ones replace the entries of the same boxes, and the others are kept — a
 * tab writing what it saw erased what another tab had saved (final review)
 */
export function mergeFigures(stored: FigureEntry[], incoming: FigureEntry[]): FigureEntry[] {
  const out = new Map(stored.map(f => [f.key, f]))
  for (const f of incoming) out.set(f.key, f)
  return [...out.values()]
}

/** Whether `candidate` may replace `stored`: at least as good, `worth` compared in order; a tie goes to the newer, the candidate */
export function atLeastAsGood(candidate: PdfRecordBody, stored: PdfRecordBody, now: Now): boolean {
  const a = worth(candidate, now)
  const b = worth(stored, now)
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! > b[i]!
  return true
}
