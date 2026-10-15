// A formula an author split across several inline formulas. `the three components $\{\Phi_0$, $\Phi_1$, $\Phi_2\}$` is
// one set written as three formulas, its brace opened in the first and closed in the last (2307.16209, line 711). Each
// formula a placeholder of its own, a translator may move one of them away from the others, and the set is drawn broken
// apart: Microsoft's Chinese set the first one before the words the other two follow, "{Φ0的一阶偏微分方程组，Φ1，Φ2}" (the
// thesis's page 31). Such a run — formulas whose delimiters are unbalanced each on its own and balanced across them,
// nothing but white space and punctuation between them — goes to the translator as one placeholder, and comes back as its
// parts and what stands between them, as the source has them.
//
// The rule reads TeX alone, so that any host that holds a formula's source can use it: the PDF reader's wire does (mt.mjs
// formulaRuns, over a unit's `$…$` and `\(…\)`; the unit keeps its parts); a LaTeXML page's formulas carry their source
// as `alttext`, and its own split runs are the same (four in the HTML fixtures), which its protector does not group yet.
// Imports nothing.

/** a delimiter's kind. `(` and `[` are one kind: a half-open interval, `[0, 1)`, is balanced */
export type Kind = 'paren' | 'brace' | 'angle' | 'vert' | 'Vert' | 'floor' | 'ceil' | 'group' | 'left'
const OPENS: Record<string, Kind> = {
  '(': 'paren', '[': 'paren', '\\lbrack': 'paren', '\\{': 'brace', '\\lbrace': 'brace', '\\langle': 'angle',
  '\\lvert': 'vert', '\\lVert': 'Vert', '\\lfloor': 'floor', '\\lceil': 'ceil', '\\lgroup': 'group',
}
const CLOSES: Record<string, Kind> = {
  ')': 'paren', ']': 'paren', '\\rbrack': 'paren', '\\}': 'brace', '\\rbrace': 'brace', '\\rangle': 'angle',
  '\\rvert': 'vert', '\\rVert': 'Vert', '\\rfloor': 'floor', '\\rceil': 'ceil', '\\rgroup': 'group',
}
/** a size given to the delimiter after it (\bigl(, \Bigr], \bigg\{): the delimiter is what counts */
const SIZE = /^\\(?:big|Big|bigg|Bigg)[lrm]?$/

/** a formula's TeX as its tokens: control words, control symbols and characters, white space and comments left out */
function tokensOf(tex: string): string[] {
  const out: string[] = []
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i]!
    if (c === '%') { while (i < tex.length && tex[i] !== '\n') i++; continue }
    if (c === '\\') {
      let j = i + 1
      if (/[A-Za-z@]/.test(tex[j] ?? '')) { while (/[A-Za-z@]/.test(tex[j] ?? '')) j++; out.push(tex.slice(i, j)); i = j - 1 }
      else { out.push(tex.slice(i, j + 1)); i = j }
      continue
    }
    if (!/\s/.test(c)) out.push(c)
  }
  return out
}

export interface Residue {
  /** the delimiters it closes and did not open, in order */
  readonly closes: readonly Kind[]
  /** those it opens and does not close, the innermost last */
  readonly opens: readonly Kind[]
}
/**
 * What a formula leaves of its delimiters once those it opens and closes are paired: the ones it closes of a formula
 * before it, and the ones it leaves open for one after it. \left and \right pair with each other, whatever delimiter
 * they take (\right., \middle|), as TeX pairs them within one formula. Null where the formula closes a delimiter by one
 * of another kind, or leaves a \left or a \right unpaired (TeX's error): no run takes it. An unescaped brace is a group,
 * no delimiter, and `|` and `\|` open and close alike, which tells nothing
 */
export function delimiterResidue(tex: string): Residue | null {
  const tokens = tokensOf(tex)
  const opens: Kind[] = []
  const closes: Kind[] = []
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]!
    if (t === '\\left') { opens.push('left'); k++; continue }
    if (t === '\\right') { if (opens.pop() !== 'left') return null; k++; continue }
    if (t === '\\middle') { k++; continue }
    if (SIZE.test(t)) continue
    const open = OPENS[t]
    if (open) { opens.push(open); continue }
    const close = CLOSES[t]
    if (!close) continue
    if (!opens.length) closes.push(close)
    else if (opens.at(-1) === close) opens.pop()
    else return null
  }
  return opens.includes('left') ? null : { closes, opens }
}

/** a formula (its TeX, without its math shifts), what may stand between two formulas of a run, or anything else */
export type RunItem = { readonly tex: string } | 'between' | null
/** the most formulas a run takes: a longer one is left as it is (the corpus's longest is four) */
export const MAX_RUN = 8
/** text that may stand between the formulas of a run: white space (a no-break space among it), commas, semicolons
 *  and ellipses. Not a word, which is the translator's; not a colon or a stop, which end a clause */
export const RUN_SEPARATOR = /^(?:[\s,;\u2026]|\.\.\.)*$/

/**
 * The runs among a sequence of items, each [first, last] by index, both formulas: a run begins at a formula that opens
 * delimiters and closes none, and takes the formulas after it, over separators, as long as each closes what is open in
 * kind (innermost first); it ends where nothing is open any more. A closer of another kind, one with nothing open, an
 * item that is neither formula nor separator, the end of the items, or more than `bound` formulas: no run there, and the
 * next formula is tried as a run's first
 */
export function balancedRuns(items: readonly RunItem[], bound: number = MAX_RUN): Array<[number, number]> {
  const runs: Array<[number, number]> = []
  for (let k = 0; k < items.length; k++) {
    const first = items[k]
    if (!first || first === 'between') continue
    const r = delimiterResidue(first.tex)
    if (!r || r.closes.length || !r.opens.length) continue
    const open = [...r.opens]
    let formulas = 1
    let last = -1
    for (let j = k + 1; j < items.length; j++) {
      const item = items[j]
      if (item === 'between') continue
      if (!item) break
      const q = delimiterResidue(item.tex)
      if (!q || ++formulas > bound || !q.closes.every(c => open.pop() === c)) break
      open.push(...q.opens)
      if (!open.length) { last = j; break }
    }
    if (last >= 0) { runs.push([k, last]); k = last }
  }
  return runs
}
