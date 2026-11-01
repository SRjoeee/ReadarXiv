// A label's form (the per-unit erasure's §1.3, docs/route/ocg-erasure.md): what a unit's label holds — a number or an item's
// mark, maybe a caption's, a section's or a theorem's name before it, in brackets or with a stop after it. own.mjs reads a label by
// it (MR 5); stream.mjs headInk tells by it the head \everypar sets on the first line of a paragraph a display begins.
// An original module (no port statement), moved out of own.mjs whole so that stream.mjs, which own.mjs imports, reads it too.

/** a label's form (§1.3): a number or an item's mark, maybe a caption's or a section's name before it, in brackets or with a
 *  stop after it — of its characters, NFKC, lower case, no white space */
export const LABEL_NAME = '(?:figure|fig\\.?|table|tab\\.?|algorithm|alg\\.?|listing|section|sec\\.?|chapter|appendix|part|step|case|example|definition|lemma|theorem|proposition|corollary|remark|claim|note|assumption|exercise|problem|equation|eq\\.?|proof|keywords?|index ?terms)'
const LABEL_NUMBER = '[([]?(?:\\d{1,4}|[a-z]|[ivxlcdm]{1,6})(?:[.\\-–](?:\\d{1,4}|[a-z]))*'
// (after a name, a number may take a letter before it: a supplement's or an appendix's, "Table S3:", "Figure A1", the letter
// before a digit alone, so that two letters are no number, "Figure AB"; alone, a letter and a number are a model's or a
// product's name, "A100", no label)
const formOf = name => new RegExp(`^(?:(?:${name}(?:(?:[a-z](?=\\d))?${LABEL_NUMBER})?|${LABEL_NUMBER})[)\\].:–—|]{0,2}|[•◦▪▫‣⁃∙·∗*–—\\-+○●■□►▸▹➢✓✔])$`, 'u')
export const LABEL_FORM = formOf(LABEL_NAME)
export const labelText = s => s.normalize('NFKC').toLowerCase().replace(/\s/gu, '')
/**
 * The label's form with the paper's own theorem names beside LABEL_NAME (`names`: source/paper-names.mjs theoremNames, the
 * printed names of the theorem-like environments its files define — thmtools' "Recall", "Notation", a \newtheorem's
 * "Conjecture"), each as a label holds it (NFKC, lower case, no white space); LABEL_FORM where it gives none. A head TeX sets of
 * such a name ("Recall 7 (") is then its unit's label, in its label group, which the layer draws in the paper's name unit's
 * word for it (rules/tex-names.mjs: one word a name, every head of it), where it was left the original's ink (`labelKept`)
 */
export function labelFormOf(names) {
  const own = [...new Set((names ?? []).map(n => labelText(String(n))).filter(n => /\p{L}/u.test(n)))].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return own.length ? formOf(`(?:${LABEL_NAME}|${own.join('|')})`) : LABEL_FORM
}
/** (`note`: the label of a theorem's note, a unit the front end read in a head's brackets (latex-front.mjs `bracketed`): the head
 *  macro sets the bracket that opens the note after its name and number, amsthm's "Definition 5.1 (", which is the head's own,
 *  and so the label's) */
export const isLabelForm = (s, note = false, form = LABEL_FORM) => { const t = labelText(s); const u = note ? t.replace(/[([]$/u, '') : t; return u === '' || form.test(u) }
