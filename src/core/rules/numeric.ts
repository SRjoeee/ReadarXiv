// The numeric cell (DESIGN §5.3): a text that is a number, a symbol, N/A or blank, copied as it is and never translated. A
// module of its own, importing nothing, so that the PDF reader's engine reads it as its own (scripts/check-boundary.mjs
// ENGINE_ALLOW: a bitmap figure's line that is a number is no label, core/image/boxes.ts) and the HTML page's rules re-export it
// (rules/latexml.ts)

/** a digit required (so that a word starting with E, like ERROR, is not taken for an exponent); symbol-only cells; N/A; blank */
const NUMERIC_CELL = /^(?=.*\d)[\s\d.,+\-±×^%()/*eE−–—:;~<>=≤≥∼]+(\s*[a-zA-Zμ°%]{1,4})?$/
const SYMBOL_CELL = /^[✓✗✔✘–—−\-·×*]+$/
const NA_CELL = /^N\/A$/

/** The input should be visibleText's result (formulas excluded); a match is copied as it is, not translated */
export function isNumericCell(text: string): boolean {
  // (white space runs to one space, the ends trimmed: core/text.ts squash's)
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  return t === '' || NUMERIC_CELL.test(t) || SYMBOL_CELL.test(t) || NA_CELL.test(t)
}
