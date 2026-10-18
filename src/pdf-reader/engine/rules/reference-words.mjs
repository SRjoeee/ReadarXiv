// src/pdf-reader/engine/rules/reference-words.mjs
// The words a reference's name prints before its number: cleveref's default names, hyperref's \autoref's, the theorem
// names papers give them, and their abbreviations, case folded. One table for every reader of a reference whose name the
// two PDFs set otherwise (our marked compile's "section B" for arXiv's "appendix B": 2609.26457, a cleveref that names the
// appendix otherwise): the layout maker's link-anchor locator (the word before a reference's link) and its tolerant
// carry of a unit's own mark (the one word of the unit's text that may differ, at a reference) read it, and no word
// outside it is ever taken for another. Imports nothing.

/** the reference words, case folded (an abbreviation's stop kept) */
export const REFERENCE_WORDS = Object.freeze(('section sections sec. secs. subsection subsections subsubsection paragraph chapter chapters ch. chap. part parts '
  + 'appendix appendices app. apps. appx. figure figures fig. figs. subfigure table tables tab. tabs. equation equations eq. eqs. eqn. eqns. '
  + 'theorem theorems thm. thms. lemma lemmas lem. corollary corollaries cor. proposition propositions prop. definition definitions def. defn. '
  + 'example examples ex. remark remarks rem. algorithm algorithms alg. algs. line lines listing listings item items footnote footnotes page pages '
  + 'claim claims conjecture conjectures assumption assumptions step steps').split(' '))

const WORDS = new Set(REFERENCE_WORDS)

/** whether a word is a reference word, its case folded */
export const isReferenceWord = w => typeof w === 'string' && WORDS.has(w.toLowerCase())
