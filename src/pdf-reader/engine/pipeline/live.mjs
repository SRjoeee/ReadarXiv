// The part of this module that stays in the old engine: what the moved front half never calls. The rest moved into the engine
// package (packages/engine/src/compile/live.mjs); this path imports it back and re-exports its names through its transition path. The cut-over
// deletes this file.
import { inAuthorBlock, lastTexLog } from '../source/latex-front.mjs'
import { authorsTranslated } from '../translate/kept.mjs'
import { nameCells } from '../translate/mt.mjs'
import { auxLines, closed, openPaper as openSource } from '@readarxiv/engine/today/compile/live.mjs'
export { stoppedShort, ranThrough, DRAFT_OPTION, NO_DRIVER_GROUP, listsMissing, notFound, bblProvides, probeFiles, markedPreamble, originalFiles } from '@readarxiv/engine/today/compile/live.mjs'

/** a paper as today's reader keeps it: the engine package's (compile/live.mjs openPaper), and `kept`, the units today's name rule
 *  keeps as the original (translate/mt.mjs nameCells: a table's cell or a figure text of names or markup tokens alone). The rebuilt
 *  engine keeps no unit by its words (the owner, 2026-11-13: a table's cell is text like any other; the translator decides a
 *  name); this path keeps its rule until the cut-over deletes it */
export const withNames = paper => ({ ...paper, kept: nameCells(paper.units) })
/** a paper's files (Map path → bytes) → today's paper (withNames over the package's openPaper) */
export const openPaper = files => withNames(openSource(files))

/** the lines of a compile's last TeX pass that the readings keep: each unit's lines and the document's end (typeset/tex.mjs
 *  readLines, completeLog), the letters it could not set */
const READ_LINE = /^(?:AXT-|Missing character: |! LaTeX Error: Unicode character )/
/**
 * The marked original's readings: those lines of its log, its marks with every page's columns (`marks`, typeset/places.mjs
 * marksOf's), its references — the aux's \bibcite and \newlabel lines — and the bibliography its BibTeX or biber made
 * (`bbl`, null where the paper ships its own or has none). What the layout marks gate compares, byte for byte, between the
 * marked original and the layout-marked one (lab/pdf/spikes/layout-marks-gate.mjs)
 */
export const readingsOf = (o, marks) => ({ log: lastTexLog(o.log).split('\n').filter(l => READ_LINE.test(l)).join('\n'), marks, ...referencesOf(o) })
/**
 * An aux's citation lines: every closed line whose first argument is a key the aux cites — a \citation's or a
 * \bibcite's (\nocite{*} cites keys no \citation names) —, in the aux's order, so that a later line overrides an earlier
 * one as in the paper's own passes; not \citation's own, which a draft writes, nor \newlabel's, which are the labels.
 * Not \bibcite's alone: apacite writes each entry twice, \bibcite then \APACbibcite, and with babel loaded after it
 * babel's \bibcite keeps the entry wrapped, which only the second line makes whole again — given the first alone, every
 * citation broke TeX (2610.02069: "Illegal parameter number in definition of \B@my@dummy"). harvard's \harvardcite,
 * backref's \backcite and any other package's line of the kind go with them; biblatex's name a refsection first, and
 * its drafts read the bibliography
 */
export const citationLines = aux => {
  const all = (aux ?? '').split('\n').filter(closed), keys = new Set()
  for (const l of all) { const m = /^\\(?:citation|bibcite)\{([^}]*)\}/.exec(l); if (m) for (const k of m[1].split(',')) keys.add(k.trim()) }
  return all.filter(l => { const m = /^\\([A-Za-z@]+)\{([^{}]*)\}/.exec(l); return !!m && m[1] !== 'citation' && m[1] !== 'newlabel' && keys.has(m[2].trim()) }).join('\n')
}
/** a compile's references as a draft is given them: its citation lines, its labels (\newlabel), its bibliography */
const referencesOf = o => ({ cites: citationLines(o.aux), labels: auxLines(o.aux, 'newlabel'), bbl: o.bbl ?? null })

/** the units a translation into `lang` leaves as they are: the names a table holds (nameCells), and the author block's
 *  names and places where the target writes them as the paper does (translate/kept.mjs authorsTranslated) */
export const keptFor = (paper, lang) => (authorsTranslated(lang) ? paper.kept : new Set([...paper.kept, ...paper.units.filter(inAuthorBlock)]))

/** PIPELINE_VERSION, what the units are (docs/PDF-READER.md §18): defined in versions.mjs, which the readers load without this
 *  module, and re-exported here for the server's callers */
export { PIPELINE_VERSION } from './versions.mjs'
