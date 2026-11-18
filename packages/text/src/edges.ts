// A token's edges: the sentence punctuation that stands at the edge of a run of characters with no white space and is none
// of it. One definition, read by two rules: the source reader's identifier (packages/engine latex-front.ts identifiersIn,
// docs/PDF-READER.md §18.25: a token holding an identifier's mark is kept whole, its edges' punctuation aside) and the
// chain's flush number (packages/translate words.ts, §18.47: a number set flush against an inline formula is held off the
// wire with it, the punctuation at its far edge aside). Its syntax alone: Unicode's general categories and the ASCII marks,
// no list of words.

/** an opening and a closing bracket of a pair a token may hold (`host_label(result)`, `[sentence_1]`, `{root_question}`) */
const PAIRS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' }

/** whether the bracket at `at` of `t` has its pair inside `t`, walking `step` from it: depth by its own pair alone */
function answered(t: string, at: number, step: number): boolean {
  const c = t[at]
  const open = step > 0 ? c : Object.keys(PAIRS).find((k) => PAIRS[k] === c)
  const close = open === undefined ? undefined : PAIRS[open]
  if (!close) return false
  let depth = 0
  for (let i = at; i >= 0 && i < t.length; i += step) {
    if (t[i] === (step > 0 ? open : close)) depth++
    else if (t[i] === (step > 0 ? close : open) && --depth === 0) return true
  }
  return false
}

/**
 * Whether the code unit at an edge of `t` is sentence punctuation that is none of the token. At its end: a stop, a comma, a
 * semicolon, a colon, an exclamation or a question mark, and a quote (`'` `"` `` ` `` and every closing one, Pf); or a
 * closing bracket (Pe) that no opening bracket of its pair inside `t` answers (`(see conv5_x)` loses the `)`,
 * `host_label(result)` keeps its own). At its start: a quote (`'` `"` `` ` `` and every opening one, Pi); or an opening
 * bracket (Ps) that no closing bracket of its pair inside `t` answers. A caller takes it off and asks again, one code unit at
 * a time
 */
export function edgeMark(t: string, side: 'start' | 'end'): boolean {
  if (side === 'end') {
    const last = t.at(-1) ?? ''
    return /[.,;:!?'"`\p{Pf}]/u.test(last) || (/\p{Pe}/u.test(last) && !answered(t, t.length - 1, -1))
  }
  const first = t[0] ?? ''
  return /['"`\p{Pi}]/u.test(first) || (/\p{Ps}/u.test(first) && !answered(t, 0, 1))
}
