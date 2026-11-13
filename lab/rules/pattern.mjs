// lab/rules/pattern.mjs: a pattern list's entries, read from the pattern's structure, and the shadow pattern the recorder
// reads which entry a match took through (design-reduction-2026-11-13.md §3c: a list is judged by its entries' hits). Pure.
// Not shipped.
//
// AN ENTRY of a pattern is an alternative of one of its alternations (a group's, or the whole pattern's, where it holds two
// alternatives or more) that is a word: the alternative's text, its anchors (`^`, `$`) and word boundaries (`\b`) at its ends
// set aside, is letters, `@`, `-` and escaped `*`, at most one escaped backslash first (`\\section` is the entry
// `\section`); the census's word rule (census-lib.mjs alternativesOf), read per alternation instead of cutting the pattern at
// every `|`: the census reads no first or last alternative of a group with more pattern beside it
// (`(?:WinAnsi|MacRoman|MacExpert|Standard)Encoding` holds four entries; the census counts three). One word in several
// alternatives is one entry.
//
// A HIT: a match whose path went through the entry's alternative. The shadow is the pattern with an empty capture `()` at the
// head of each entry's alternative (numbered back references moved to their groups' new numbers): run at the match's place on
// the same text it takes the same path, and an entry's capture is defined where its alternative was on that path. Removing
// every entry no match went through leaves every recorded match as it was (each took a path through none of them) and makes
// no text match that did not. Three kinds are read otherwise:
// - an entry in a negative lookaround is never on a match's path (it decides by failing): not judged;
// - an entry in a repeated group (`*`, `+`, `{n,}`, `{n,m}` past one) shows its capture for the last repetition alone: a hit
//   where the match's text holds its word (more hits, never fewer); in a positive lookaround as well, not judged;
// - a pattern whose shadow cannot keep its back references (a `\N` past its groups' count, read as an escape) has no shadow:
//   each entry a hit where the match's text holds its word.

const WORD = /^\\?[A-Za-z@][A-Za-z@*-]+$/

/** where a character class that opens at `i` ends (the index after its `]`); with the `v` flag a class nests */
function classEnd(p, i, nested) {
  let depth = 0
  for (let k = i; k < p.length; k++) {
    const c = p[k]
    if (c === '\\') k++
    else if (c === '[' && (k === i || nested)) depth++
    else if (c === ']') {
      depth--
      if (depth === 0) return k + 1
    }
  }
  return p.length
}

/** an alternative's text as a word, or null: its anchors and boundaries at its ends set aside, its escapes read */
export function wordOf(text) {
  // (its tokens: an escape pair, or one character)
  const tokens = []
  for (let k = 0; k < text.length; k++) tokens.push(text[k] === '\\' ? text.slice(k, ++k + 1) : text[k])
  while (tokens.length && (tokens[0] === '^' || tokens[0] === '\\b')) tokens.shift()
  while (tokens.length && (tokens.at(-1) === '$' || tokens.at(-1) === '\\b')) tokens.pop()
  let w = ''
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]
    if (t === '\\\\' && k === 0) w += '\\'
    else if (t === '\\*' || t === '\\-' || t === '\\@') w += t[1]
    else if (t.length === 1 && /[A-Za-z@-]/.test(t)) w += t
    else return null
  }
  return WORD.test(w) ? w : null
}

/**
 * A pattern's entries and its shadow: `{ words, shadow, marks, why }`. `words`: one per word alternative, in the pattern's
 * order, `{ word, at, look, repeated }` (`at` the alternative's offset; `look` 'pos' or 'neg' where it stands in a lookaround,
 * a negative one first; `repeated` where a group around it repeats); `shadow`: the shadow's source (null where it cannot be
 * made, `why` says why); `marks`: `[index into words, the shadow's group number]` for each alternative marked
 */
export function entriesOf(pattern, flags = '') {
  const nested = flags.includes('v')
  const top = { kind: 'top', parent: null, alts: [], altStart: 0, repeated: false }
  let g = top
  const groups = []
  const captures = []
  const backrefs = []
  let i = 0
  while (i < pattern.length) {
    const c = pattern[i]
    if (c === '\\') {
      const m = /^\\([1-9]\d*)/.exec(pattern.slice(i, i + 12))
      if (m) {
        backrefs.push({ at: i, end: i + m[0].length, n: Number(m[1]) })
        i += m[0].length
      } else i += 2
      continue
    }
    if (c === '[') {
      i = classEnd(pattern, i, nested)
      continue
    }
    if (c === '(') {
      let kind = 'cap'
      let head = 1
      if (pattern.startsWith('(?:', i)) [kind, head] = ['non', 3]
      else if (pattern.startsWith('(?=', i)) [kind, head] = ['pos', 3]
      else if (pattern.startsWith('(?!', i)) [kind, head] = ['neg', 3]
      else if (pattern.startsWith('(?<=', i)) [kind, head] = ['pos', 4]
      else if (pattern.startsWith('(?<!', i)) [kind, head] = ['neg', 4]
      else if (pattern.startsWith('(?<', i)) head = pattern.indexOf('>', i) + 1 - i
      else if (pattern.startsWith('(?', i)) [kind, head] = ['non', pattern.indexOf(':', i) + 1 - i]
      if (kind === 'cap') captures.push(i)
      g = { kind, parent: g, alts: [], altStart: i + head, repeated: false }
      i += head
      continue
    }
    if (c === '|') {
      g.alts.push([g.altStart, i])
      g.altStart = i + 1
      i++
      continue
    }
    if (c === ')' && g.parent) {
      g.alts.push([g.altStart, i])
      const q = /^(?:([*+])|\{(\d+)(,(\d*))?\})/.exec(pattern.slice(i + 1))
      g.repeated = Boolean(q && (q[1] || (q[3] ? q[4] === '' || Number(q[4]) > 1 : Number(q[2]) > 1)))
      groups.push(g)
      g = g.parent
      i++
      continue
    }
    i++
  }
  top.alts.push([top.altStart, pattern.length])
  groups.push(top)
  const words = []
  for (const grp of groups) {
    if (grp.alts.length < 2) continue
    let look = null
    let repeated = false
    for (let a = grp; a; a = a.parent) {
      if (a.kind === 'neg') look = 'neg'
      else if (a.kind === 'pos' && look !== 'neg') look = 'pos'
      if (a.repeated) repeated = true
    }
    for (const [s, e] of grp.alts) {
      const word = wordOf(pattern.slice(s, e))
      if (word) words.push({ word, at: s, look, repeated })
    }
  }
  words.sort((a, b) => a.at - b.at)
  // the shadow: a capture at each marked alternative's head; every group after it one number later
  const marked = words.map((w, k) => [k, w]).filter(([, w]) => w.look !== 'neg' && !w.repeated)
  if (backrefs.some(b => b.n > captures.length)) return { words, shadow: null, marks: [], why: 'a back reference past its groups, read as an escape' }
  const at = marked.map(([, w]) => w.at)
  const before = (xs, o) => xs.filter(x => x < o).length
  const renumber = n => n + before(at, captures[n - 1])
  let shadow = ''
  let from = 0
  const points = [...at.map(o => ({ o, text: '()' })), ...backrefs.map(b => ({ o: b.at, end: b.end, text: `\\${renumber(b.n)}` }))].sort((a, b) => a.o - b.o)
  for (const p of points) {
    shadow += pattern.slice(from, p.o) + p.text
    from = p.end ?? p.o
  }
  shadow += pattern.slice(from)
  const marks = marked.map(([k, w]) => [k, 1 + before(captures, w.at) + before(at, w.at)])
  return { words, shadow, marks, why: null }
}
