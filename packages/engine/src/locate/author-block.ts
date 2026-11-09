// The author block under the title: the one stretch of a paper the names toggle governs, whole, and nothing else (the owner's
// ruling of 2026-11-09: the toggle governs the whole block under the title and affects nothing else, docs/PDF-READER.md
// §19.13). Read off TeX's stream on arXiv's page
// (A's glyphs in their content stream's order, which is the order TeX shipped them in), by the source units that own its
// glyphs: after the title, the block opens at its first name or place (a unit of the author block, or a line no unit is whose
// letters are an author's names: the ink units' rule 8) and runs through the names, the places and what TeX sets between and
// after them until it sets something of another kind — a unit (the abstract, its babel name, a date, a keyword list, the body),
// less that unit's run-in label (the glyphs before it on its first line, as own.mjs MR 5 reads a label: JCAP's "Abstract."); and
// where a graphic no unit owns (an image, a rule, a form's or a picture's text) stands between the block's last name or place
// and that unit, the block ends at the graphic (egpubl's teaser and its caption under the names, elsarticle's \hrule over its
// abstract's heading), one followed by more of the block being the block's (an icon before a link of its places); and where TeX
// begins a front matter environment no author's (the abstract, the keywords: the marked compile's `fm<n>` point), the block
// ends there, a heading its class sets from a literal of its own, no babel name, on a line of its own before the element's
// text being the element's (spconf's "ABSTRACT", jmlr's "Abstract"). A subtitle before the names is the title's. Where the title is drawn inside a picture (a framed title box: 2604.14228v3's tcolorbox, the title, the names, the
// abstract and the correspondence line inside one pgf picture), the block is the rest of that picture: its frame is the block's
// end TeX states; the abstract inside it keeps its own kind as any unit does, and so does every unit's run-in label (alta's
// "Abstract." and "Keywords:").
// Every class of the 88 corpus papers sets its author block there, whatever macro it uses: LaTeX's \maketitle and its kin
// (\@author in a tabular, IEEEtran's blocks, amsart's \andify, REVTeX's lists, llncs's institutes), acmart's \@mkauthors and a
// paper's own override of it (2610.22065v1's literal lines), a class's own lists (2604.14228v3's \addtolist). What a class prints
// from the same data elsewhere — acmart's reference format, a running head, amsart's addresses at the paper's end, an e-mail
// footnote — is not under the title, and is the text it is.
// Its ink (`has`): the glyphs no unit owns in it, outside a figure's (a form XObject's, another picture's), which locate's ink
// units take as the block's names; its stretch (`within`): every glyph there, by which a unit of the author block is told set in
// the block or elsewhere. An original module (no port statement).

/** an A page as the block reads it */
export interface BlockPage {
  /** its glyph count */
  n: number
  /** the source unit a glyph is (its index among the instrument's units), -1 none */
  owner: (j: number) => number
  /** the picture a glyph is drawn in (pageInk's `pid`, the innermost pgf picture open there), none outside any */
  pid: (j: number) => number | undefined
  /** whether a glyph is shown inside a form XObject (an included figure) */
  form: (j: number) => boolean
  /** whether glyph j stands on glyph k's baseline (own.mjs MR 5's test for a label: within half the larger size across it) */
  onLine: (j: number, k: number) => boolean
  /** whether a graphic no unit owns (an image, a path: a rule) stands in the stream right before a glyph */
  graphicBefore?: (j: number) => boolean
  /** whether a glyph no unit owns is of an ink unit of the names (the ink units' rule 8: its letters an author unit's words) */
  named?: (j: number) => boolean
  /** where TeX begins a front matter environment no author's (the marked compile's `fm<n>` points: the abstract, the keywords),
   *  each the glyph its point stands before */
  ends?: readonly number[]
}
/** a source unit as the block reads it */
export interface BlockUnit {
  kind: string
  title?: true
  front?: true
}
export interface AuthorBlock {
  /** its page (0-based) */
  page: number
  /** whether a glyph of that page is the block's ink: no unit's, no figure's */
  has: (j: number) => boolean
  /** whether a glyph of that page stands in the block's stretch, owned or not */
  within: (j: number) => boolean
}

/** the kinds of the author block's units (latex-front.mjs AUTHOR_KINDS: its names and its places) */
const AUTHOR_KINDS = new Set(['author', 'affiliation'])

/** the author block under the title, or null where no title is located on A */
export function authorBlockOf(pages: readonly BlockPage[], units: readonly BlockUnit[]): AuthorBlock | null {
  const isTitle = (u: number) => u >= 0 && !!units[u]?.title
  const page = pages.findIndex((pg) => {
    for (let j = 0; j < pg.n; j++) if (isTitle(pg.owner(j))) return true
    return false
  })
  if (page < 0) return null
  const pg = pages[page]!
  const titled: number[] = []
  for (let j = 0; j < pg.n; j++) if (isTitle(pg.owner(j))) titled.push(j)
  const last = titled.at(-1)!
  const unowned = (j: number) => pg.owner(j) < 0
  const other = (u: number) => u >= 0 && !isTitle(u) && !AUTHOR_KINDS.has(units[u]?.kind ?? '')
  /** the first glyph of the run-in label a unit's first glyph j has: the glyphs no unit owns right before it on its line, back
   *  to `floor` */
  const runIn = (j: number, floor: number) => {
    let k = j
    while (k - 1 > floor && unowned(k - 1) && pg.onLine(k - 1, j)) k--
    return k
  }
  // (a title drawn in a picture: the rest of that picture, a figure's picture or form inside it and a unit's run-in label aside)
  const frame = pg.pid(last)
  if (frame !== undefined && titled.every((j) => pg.pid(j) === frame)) {
    const within = (j: number) => j > last && j < pg.n && pg.pid(j) === frame
    const labelled = new Set<number>()
    for (let j = last + 1; j < pg.n; j++)
      if (within(j) && other(pg.owner(j)) && pg.owner(j - 1) !== pg.owner(j))
        for (let k = runIn(j, last); k < j; k++) labelled.add(k)
    return { page, within, has: (j) => within(j) && unowned(j) && !pg.form(j) && !labelled.has(j) }
  }
  // (else TeX's stream from the block's first name, through the block's units, to a unit of another kind, or to a graphic no
  // unit owns that no more of the block follows)
  let first = -1
  let keep = last
  let graphic = -1
  // (the first front matter environment TeX begins after the title: one before it, a title block's kept abstract, ends nothing)
  let cut = pg.n
  for (const e of pg.ends ?? []) if (e > last && e < cut) cut = e
  const stop = cut
  for (let j = last + 1; j < stop; j++) {
    const u = pg.owner(j)
    // (a graphic no unit owns: before the glyph, or the glyph a form or a picture shows)
    if (graphic < 0 && first >= 0 && (pg.graphicBefore?.(j) || (u < 0 && (pg.form(j) || pg.pid(j) !== undefined))))
      graphic = j
    if (u < 0) {
      if (pg.named?.(j) && !pg.form(j) && pg.pid(j) === undefined) {
        if (first < 0) first = j
        keep = j
        graphic = -1
      }
      continue
    }
    if (!units[u]) continue
    if (!other(u)) {
      if (first < 0 && !isTitle(u)) first = j
      keep = j
      graphic = -1
      continue
    }
    // (a subtitle, a heading of the front matter right after the title, before any name)
    if (first < 0 && units[u]!.kind === 'heading' && units[u]!.front) {
      keep = j
      continue
    }
    cut = graphic >= 0 ? graphic : runIn(j, keep)
    graphic = -1
    break
  }
  // (a graphic no more of the block followed, up to the page's end or the environment's point)
  if (graphic >= 0) cut = graphic
  const within = (j: number) => first >= 0 && j >= first && j < cut
  return { page, within, has: (j) => within(j) && unowned(j) && !pg.form(j) && pg.pid(j) === undefined }
}
