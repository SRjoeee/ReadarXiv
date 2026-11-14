// The names babel gives a document's generated headings (its [captions]: \abstractname, \refname, …), by key: what the
// layout marks wrap (marks.mjs NAMES_TEX), the layout file locates (file.mjs `names`) and the layout rules name in each
// target's words (rules/layout-rules.json `labels`). One list, read by the server's modules and the readers': imports
// nothing.

/** the keys, babel's own (its ini files' [captions]). `chapter` and `part` are not among them: their CJK names are
 *  templates around the number TeX sets after the name */
export const NAME_KEYS = Object.freeze(['abstract', 'ref', 'bib', 'contents', 'listfigure', 'listtable', 'appendix', 'index', 'proof', 'preface', 'glossary', 'figure', 'table'])
/** each name's English value, babel's en [captions] (the layout rules' pinned locale files): what a style that writes a
 *  name literally writes (marks.mjs literalNames), and a head the layer never draws as a theorem's (layer2.mjs
 *  headLabelInTarget: a babel name is the names' own, nameInTarget) */
export const NAME_ENGLISH = Object.freeze({ abstract: 'Abstract', ref: 'References', bib: 'Bibliography', contents: 'Contents', listfigure: 'List of Figures', listtable: 'List of Tables', appendix: 'Appendix', index: 'Index', proof: 'Proof', preface: 'Preface', glossary: 'Glossary', figure: 'Figure', table: 'Table' })

/** a counter's form, of its characters (NFKC, lower case, no white space): a letter, a number of up to four digits or a roman
 *  numeral, maybe a letter before a number ("A1"), its parts after stops or dashes ("C.1", "A-A"), a stop or a colon after it */
const COUNTER_FORM = /^(?:[a-z](?=\d))?(?:\d{1,4}|[a-z]|[ivxlcdm]{1,6})(?:[.\-–](?:\d{1,4}|[a-z]))*[.:]?$/u
/** how far after a name its counter may begin, of the name's size: TeX's \nobreakspace is a third of an em, a \quad one */
const COUNTER_GAP = 1.1
/** a word's space, of the glyphs' size: two glyphs further apart are two words (a fifth of an em, as layer2.mjs spacedText reads) */
const WORD_SPACE = 0.2
/**
 * The counter TeX set after a babel name on its line where it leads no unit (the class's own heading or contents line,
 * `\appendixname\nobreakspace\thesection`: IEEEtran's "APPENDIX A" over its title, its contents list's "Appendix A: …"): of
 * `next`, the glyphs that stand after the name on its line in reading order ({ u, x0, x1, size }), the first that begins
 * within COUNTER_GAP of `size` after the name's end `x1`, and those after it that follow within a word's space, read as a
 * counter's form and then a word's space or the line's end. The same rule for the wrap, which gives those glyphs the name's
 * group (own.mjs), and the maker, which gives them its row (make.mjs): the layer then sets the counter after the name's
 * word, where it was left at its own place, a gap the width of the original's word less the target's after the word.
 * Returns how many of `next` the counter is: 0 for none
 */
export function counterAfter(x1, size, next) {
  if (!next.length || !(size > 0) || next[0].x0 < x1 - 0.1 || next[0].x0 - x1 > COUNTER_GAP * size) return 0
  let k = 1
  while (k < next.length && next[k].x0 - next[k - 1].x1 < WORD_SPACE * Math.max(next[k].size ?? size, next[k - 1].size ?? size)) k++
  const text = next.slice(0, k).map(g => g.u ?? '').join('').normalize('NFKC').toLowerCase().replace(/\s/gu, '')
  return text && COUNTER_FORM.test(text) ? k : 0
}
/**
 * The number TeX set right before a babel name at its line's start, where a class numbers a heading it sets itself (ICASSP's
 * spconf.sty: thebibliography's \section{References}, its \@svsec "9." and \hskip 0.6em before the word; LaTeX's own
 * \@seccntformat, the number and a \quad): of `before`, the glyphs that stand before the name on its line in reading order
 * ({ u, x0, x1, size }), all of them, one word (each within a word's space of the next), its last ending within COUNTER_GAP of
 * `size` before the name's start `x0`, a counter's form with a digit in it (a section's number as LaTeX prints it: "9", "9.",
 * "2.3", "A.1"; a letter or a roman numeral alone is no number here). The rule counterAfter's mirror, and narrower: nothing
 * else on the line before it. The wrap gives those glyphs the name's label group (own.mjs MR 6c), so that the line is laid
 * whole: the name's word after its number, centred as TeX centred the two. Returns how many of `before` the number is: 0 for
 * none
 */
export function counterBefore(x0, size, before) {
  const n = before.length
  if (!n || !(size > 0)) return 0
  const last = before[n - 1]
  if (last.x1 > x0 + 0.1 || x0 - last.x1 > COUNTER_GAP * size) return 0
  for (let k = n - 1; k > 0; k--) if (before[k].x0 - before[k - 1].x1 >= WORD_SPACE * Math.max(before[k].size ?? size, before[k - 1].size ?? size)) return 0
  const text = before.map(g => g.u ?? '').join('').normalize('NFKC').toLowerCase().replace(/\s/gu, '')
  return text && /\d/u.test(text) && COUNTER_FORM.test(text) ? n : 0
}
