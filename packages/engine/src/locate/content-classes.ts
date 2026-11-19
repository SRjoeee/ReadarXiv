// The content classes (docs/route/orphan-text.md): every text glyph of our final pass belongs to exactly one, and each class
// has one translation path and one reader toggle. One table, read by locate (ledger.ts, ink-units.ts; the
// reader's toggles keep their own, packages/reader compose/classes.ts): a class is translated once on the server, into the
// shared cache, and a toggle only shows or hides what was made, with no prepare and no translation again (PDF-READER §19.13).
// The toggles: what is always translated, five items a reader turns on or off, and what is never translated. A unit's class
// is a pure function of its kind (UNIT_CLASS), which the bundle's units carry, so the server and every reader tell it alike.
// An original module (no port statement). Imports nothing.

/**
 * Each class: `toggle`, the reader's toggle that shows it (`always`, one of the five a reader turns on or off, or `never`; the
 * readers' own list of them is packages/format's); `state`, what is made — `built` (translated and drawn: the source's units, and the ink
 * units ink-units.ts and figure-text.ts make of the glyphs no source unit owns, stages 2, 3 and 5 of
 * docs/route/orphan-text.md), `planned` (accounted for by the ledger, no path yet), `never` (kept as the original's ink by
 * design), which the lab's ledger reads (lab/pdf/spikes/ledger.mjs builtShare: the letters of the built classes); `glyphs`, whether the ledger can give a glyph this
 * class (OCR reads an image, which holds no glyph); `truth`, what its text and its place are read from. In the ledger's code
 * order (CLASS_IDS): a code is an index here, kept in a Uint8Array a page
 */
const CLASSES = Object.freeze({
  body: Object.freeze({
    toggle: 'always',
    state: 'built',
    glyphs: true,
    truth: "the source's units (prose, headings, captions, footnotes, abstract, title), placed by TeX's marks",
  }),
  generated: Object.freeze({
    toggle: 'always',
    state: 'built',
    glyphs: true,
    truth:
      "babel's names (\\refname, \\contentsname…), marked where TeX sets them; a theorem head's and a generated reference's names, the target's packages' or the paper's own name units' (rules/tex-names.mjs, source/paper-names.mjs)",
  }),
  contents: Object.freeze({
    toggle: 'always',
    state: 'built',
    glyphs: true,
    truth:
      "the contents and the lists of figures and tables, between a list's name and the next unit; their rows the headings' and captions'",
  }),
  notes: Object.freeze({
    toggle: 'always',
    state: 'built',
    glyphs: true,
    truth: "text below the column bodies no unit owns: a note with no unit, a margin's",
  }),
  orphan: Object.freeze({
    toggle: 'always',
    state: 'built',
    glyphs: true,
    truth: 'text no unit owns and no other class explains: a front-end defect, or text TeX generates (a theorem head)',
  }),
  heads: Object.freeze({
    toggle: 'heads',
    state: 'built',
    glyphs: true,
    truth: "the output routine's head, shipped before the page's first mark, and its foot, after the last",
  }),
  tables: Object.freeze({
    toggle: 'tables',
    state: 'built',
    glyphs: true,
    truth: "the source's table cells (units of kind cell)",
  }),
  figures: Object.freeze({
    toggle: 'figures',
    state: 'built',
    glyphs: true,
    truth:
      "glyphs our compile sets in a vector figure, no unit's: an included PDF's (a form XObject) and a TikZ or pgfplots picture's (between its points), cut into ink units of kind `inkfigures` (layout/figure-text.mjs), each drawn in its run's box; a float's other text no unit owns, counted",
  }),
  ocr: Object.freeze({
    toggle: 'figures',
    state: 'planned',
    glyphs: false,
    truth:
      "a bitmap figure's text, read and placed by OCR (PP-OCR, as the extension's: DESIGN §15.3); the owner's OK of 2026-10-25",
  }),
  references: Object.freeze({
    toggle: 'references',
    state: 'built',
    glyphs: true,
    truth:
      "the bibliography's entries, each \\bibitem's text one unit, whole, its names its own (kind reference) as the compile reads it: the paper's thebibliography, the .bbl its package holds or the one BibTeX makes in the prepare's first pass, marked like the body; its label, numbers, web addresses and formulas the original's ink. A bibliography biblatex prints (biber's data, no text of the source): each entry one unit of kind inkreferences, whole, its names its own, cut where the compile's point (bi<n>, biblatex's per-entry hook) stands before it, its label the original's",
  }),
  index: Object.freeze({
    toggle: 'references',
    state: 'planned',
    glyphs: true,
    truth: 'an index or a glossary, between its name and the next unit (proposed: back matter, with the references)',
  }),
  names: Object.freeze({
    toggle: 'names',
    state: 'built',
    glyphs: true,
    truth:
      "the author block under the title, translated once whatever the target: its names (kind author) and its places, the affiliations, institutions, addresses and e-mail line (kind affiliation), one toggle (the owner's ruling of 2026-10-30); an entry's names are the references'",
  }),
  math: Object.freeze({
    toggle: 'never',
    state: 'never',
    glyphs: true,
    truth: "a math font's glyphs, a formula's line no unit owns",
  }),
  code: Object.freeze({
    toggle: 'never',
    state: 'never',
    glyphs: true,
    truth: "a typewriter font's lines no unit owns: code, a log, a URL",
  }),
  symbols: Object.freeze({
    toggle: 'never',
    state: 'never',
    glyphs: true,
    truth: 'a line with no letter: numbers, a folio, a symbol',
  }),
})
/** a content class's name (CLASSES' keys) */
export type ClassId = keyof typeof CLASSES
/** the classes by their code (a code is an index here) (Object.keys's string[]: CLASSES' own keys, the class names) */
export const CLASS_IDS = Object.freeze(Object.keys(CLASSES) as ClassId[])
/** a class's code (Object.fromEntries' string index: one entry a class name) */
export const CLASS_CODE = Object.freeze(
  Object.fromEntries(CLASS_IDS.map((id, i) => [id, i])) as Record<ClassId, number>,
)

/** the kind of a figure's ink unit (figure-text.ts): its text our glyphs', its place its run's (the parts' figure rows) */
const FIGURE_KIND = 'inkfigures'
/** a unit's class by its kind (the front end's, source/latex-front.ts, and the ink units'); a kind not here is `body` */
const UNIT_CLASS: Readonly<Record<string, ClassId>> = Object.freeze({
  para: 'body',
  heading: 'body',
  abstract: 'body',
  caption: 'body',
  footnote: 'body',
  cell: 'tables',
  author: 'names',
  figure: 'figures',
  // (an author block's places, source/latex-front.ts frontBlock: the names' toggle with its names, `author`, the whole block one
  // toggle: PDF-READER §19.13)
  affiliation: 'names',
  // (the ink units', ink-units.ts INK_KIND: their kind names their class)
  inkheads: 'heads',
  inkcontents: 'contents',
  inknotes: 'notes',
  inkorphan: 'orphan',
  inknames: 'names',
  inkgenerated: 'generated',
  [FIGURE_KIND]: 'figures',
  // (a biblatex entry, the printed bibliography cut one entry a unit by the compile's points: the references', as a \bibitem's)
  inkreferences: 'references',
  // (a structural name's unit, bundleUnitsOf's: a theorem head's or a generated reference's word in the target, always
  // translated: PDF-READER §19.14)
  name: 'generated',
  // (a bibliography's entry, latex-front.ts bibliography: one unit, whole, the references'. `refnames`, an entry's names cut apart
  // by PIPELINE 29, is made no more; a bundle of 29 a reader still reads keeps both halves of an entry under the one toggle the
  // bibliography has, and "names" governs the author block alone, its places too: PDF-READER §19.13)
  reference: 'references',
  refnames: 'references',
})
/** a unit's class: of the front end's unit ({ kind }), of the bundle's ([kind, flags, …]) or of a kind; null for none */
export function unitClass(u: string | unknown[] | { readonly kind?: unknown } | null | undefined): ClassId | null {
  const kind = typeof u === 'string' ? u : Array.isArray(u) ? u[0] : u?.kind
  if (typeof kind !== 'string') return null
  // (`!`: an own entry, Object.hasOwn's)
  return Object.hasOwn(UNIT_CLASS, kind) ? UNIT_CLASS[kind]! : 'body'
}
