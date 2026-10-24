// The content classes (docs/route/orphan-text.md): every text glyph of our final pass belongs to exactly one, and each class
// has one translation path and one reader toggle. One table, read by the maker child's ledger (layout/ledger.mjs), by the
// sweep and by the readers' settings: a class is translated once on the server, into the shared cache, and a toggle only shows
// or hides what was made, with no prepare and no translation again. The toggles are the owner's (2026-10-25): what is always
// translated, five items a reader turns on or off, and what is never translated. A unit's class is a pure function of its kind
// (UNIT_CLASS), which the bundle's units carry, so the server and every reader tell it alike.
// An original module (no port statement). Imports nothing.

/** the reader's toggles, in the order the settings list them: `always` and `never` are no toggle */
export const TOGGLES = Object.freeze(['always', 'heads', 'tables', 'figures', 'references', 'names', 'never'])

/**
 * Each class: `toggle` (TOGGLES); `state`, what exists today — `built` (translated and drawn), `planned` (accounted for by the
 * ledger, no path yet), `never` (kept as the original's ink by design); `glyphs`, whether the ledger can give a glyph this
 * class (OCR reads an image, which holds no glyph); `truth`, what its text and its place are read from. In the ledger's code
 * order (CLASS_IDS): a code is an index here, kept in a Uint8Array a page
 */
export const CLASSES = Object.freeze({
  body: Object.freeze({ toggle: 'always', state: 'built', glyphs: true, truth: "the source's units (prose, headings, captions, footnotes, abstract, title), placed by TeX's marks" }),
  generated: Object.freeze({ toggle: 'always', state: 'built', glyphs: true, truth: "babel's names (\\refname, \\contentsname…), marked where TeX sets them" }),
  contents: Object.freeze({ toggle: 'always', state: 'planned', glyphs: true, truth: "the contents and the lists of figures and tables, between a list's name and the next unit; their rows the headings' and captions'" }),
  notes: Object.freeze({ toggle: 'always', state: 'planned', glyphs: true, truth: "text below the column bodies no unit owns: a note with no unit, a margin's" }),
  orphan: Object.freeze({ toggle: 'always', state: 'planned', glyphs: true, truth: 'text no unit owns and no other class explains: a front-end defect, or text TeX generates (a theorem head)' }),
  heads: Object.freeze({ toggle: 'heads', state: 'planned', glyphs: true, truth: 'the output routine\'s head, shipped before the page\'s first mark, and its foot, after the last' }),
  tables: Object.freeze({ toggle: 'tables', state: 'built', glyphs: true, truth: "the source's table cells (units of kind cell)" }),
  figures: Object.freeze({ toggle: 'figures', state: 'planned', glyphs: true, truth: "glyphs our compile sets in a figure: an included PDF's (a form XObject), a float's own that no unit owns, a TikZ text's unit" }),
  ocr: Object.freeze({ toggle: 'figures', state: 'planned', glyphs: false, truth: "a bitmap figure's text, read and placed by OCR (PP-OCR, as the extension's: DESIGN §15.3); the owner's OK of 2026-10-25" }),
  references: Object.freeze({ toggle: 'references', state: 'planned', glyphs: true, truth: "the bibliography, between its name and the next unit; its entries' fields from the .bbl's \\bibitem" }),
  index: Object.freeze({ toggle: 'references', state: 'planned', glyphs: true, truth: 'an index or a glossary, between its name and the next unit (proposed: back matter, with the references)' }),
  names: Object.freeze({ toggle: 'names', state: 'built', glyphs: true, truth: "the author block's units (names and places), translated where the target's script writes names its own (translate/kept.mjs)" }),
  math: Object.freeze({ toggle: 'never', state: 'never', glyphs: true, truth: 'a math font\'s glyphs, a formula\'s line no unit owns' }),
  code: Object.freeze({ toggle: 'never', state: 'never', glyphs: true, truth: "a typewriter font's lines no unit owns: code, a log, a URL" }),
  symbols: Object.freeze({ toggle: 'never', state: 'never', glyphs: true, truth: 'a line with no letter: numbers, a folio, a symbol' }),
})
/** the classes by their code (a code is an index here) */
export const CLASS_IDS = Object.freeze(Object.keys(CLASSES))
/** a class's code */
export const CLASS_CODE = Object.freeze(Object.fromEntries(CLASS_IDS.map((id, i) => [id, i])))

/** a unit's class by its kind (latex-front.mjs's kinds); a kind not here is `body` */
export const UNIT_CLASS = Object.freeze({ para: 'body', heading: 'body', abstract: 'body', caption: 'body', footnote: 'body', cell: 'tables', author: 'names', figure: 'figures' })
/** a unit's class: of the front end's unit ({ kind }), of the bundle's ([kind, flags, …]) or of a kind; null for none */
export function unitClass(u) {
  const kind = typeof u === 'string' ? u : Array.isArray(u) ? u[0] : u?.kind
  if (typeof kind !== 'string') return null
  return Object.hasOwn(UNIT_CLASS, kind) ? UNIT_CLASS[kind] : 'body'
}

/** whether a class is shown translated under a reader's settings (`on`: the toggles turned on; `always` is, `never` is not) */
export const shownTranslated = (cls, on) => {
  const t = CLASSES[cls]?.toggle
  return t === 'always' || (t !== undefined && t !== 'never' && !!on?.has?.(t))
}
