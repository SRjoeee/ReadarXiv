// src/pdf-reader/engine/source/paper-names.mjs
// The structural names a paper's TeX prints that no package names in every target (PDF-READER §19.14): each becomes a unit of
// its own (bundleUnitsOf, kind `name`), sent to the translator once with the paper's units and cached by its text as any unit,
// and the layer draws a theorem's head or a generated reference's name in that translation where no package gives the target
// a word (rules/tex-names.mjs, `names`). Read from the paper's own definitions, in the order its files write them:
//   - a theorem-like environment's printed name: \newtheorem{env}[…]{Name}[…] and its starred form, llncs's \spnewtheorem,
//     elsarticle's \newproof, mdframed's \newmdtheoremenv, thmtools' \declaretheorem (its `name=`, else the environment's name
//     with a capital, as thmtools prints it);
//   - a reference's names the paper gives: cleveref's \crefname and \Crefname (singular, plural), thmtools' `refname=` and
//     `Refname=`, hyperref's \<type>autorefname redefined;
//   - where the paper calls cleveref or \autoref: the counter types' English names and the conjunctions' words no package
//     names in some target (rules/tex-names.mjs NAME_GAPS, CONJUNCTION_GAPS: zh's "Section", every CJK target's "and").
// A name is plain text alone: letters, spaces, a hyphen, an apostrophe, a stop; one holding a command or a brace is the
// original's. At most NAMES_MAX a paper.
//
// Pure: no DOM, no clock. An original module (no port statement).
import { CONJUNCTION_GAPS, GENERATED_COMMANDS, NAME_GAPS } from '../rules/tex-names.mjs'

/** the names a paper's units may hold at most (a paper defines a few dozen at most; the gaps are 21) */
export const NAMES_MAX = 96
/** a name as a unit holds it: plain words, at most 40 characters */
const PLAIN = /^[\p{L}][\p{L}\p{M} .'’-]{0,39}$/u
/** a brace group's text at `at` (its opening brace), nested groups whole; null where it does not close */
function group(s, at) {
  if (s[at] !== '{') return null
  let depth = 0
  for (let j = at; j < s.length; j++) {
    const c = s[j]
    if (c === '\\') { j++; continue }
    if (c === '{') depth++
    else if (c === '}' && --depth === 0) return { text: s.slice(at + 1, j), end: j + 1 }
  }
  return null
}
/** the arguments after `at`: brace groups and optional [..] in order, white space between, up to `n` brace groups */
function argsAt(s, at, n) {
  const out = []
  let i = at
  while (out.filter(a => a.brace).length < n) {
    while (i < s.length && /\s/.test(s[i])) i++
    if (s[i] === '[') { const e = s.indexOf(']', i); if (e < 0) return out; out.push({ brace: false, text: s.slice(i + 1, e) }); i = e + 1; continue }
    const g = group(s, i)
    if (!g) return out
    out.push({ brace: true, text: g.text })
    i = g.end
  }
  return out
}
/** a TeX file's text with its comments gone (a `%` no backslash escapes, to the line's end) */
const uncommented = s => s.replace(/(?<!\\)%.*$/gm, '')
/** a key=value list's value of `key` (thmtools' options), its braces gone */
const optionOf = (opts, key) => {
  const m = new RegExp(`(?:^|,)\\s*${key}\\s*=\\s*(\\{[^{}]*\\}|[^,]*)`).exec(opts ?? '')
  return m ? m[1].replace(/^\{|\}$/g, '').trim() : null
}

/** a call of a command whose names a reader may draw (rules/tex-names.mjs GENERATED_COMMANDS: layer2.mjs GENERATED_REF's) */
const CALLS = new RegExp(`\\\\(?:${GENERATED_COMMANDS.join('|')})\\*?\\s*\\{`)

/**
 * The paper's structural names (`texts`, its files' TeX in the order they are read): each name once, in the order first
 * written, the gaps last. Language-independent: the same files give the same names
 */
export function paperNames(texts) {
  return namesOf(texts).all
}
/**
 * The printed names of the paper's theorem-like environments alone (`texts` as paperNames'): \newtheorem's and its kin's
 * `Name`, thmtools' `name=` or its environment's name with a capital — each once, in the order first written, the names
 * paperNames gives for them. A head TeX sets of one of them ("Recall 7 (", "Notation 9.") is a label's form, as "Theorem 7"
 * is (layout/own.mjs `names`: the wrap gives it its unit's label group, and the layer draws it in that name unit's word, the
 * same word on every head of the name)
 */
export function theoremNames(texts) {
  return namesOf(texts).theorems
}
function namesOf(texts) {
  const out = [], seen = new Set(), theorems = []
  const add = (s, theorem = false) => {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim()
    if (!t || !PLAIN.test(t)) return
    if (!seen.has(t) && out.length < NAMES_MAX) { seen.add(t); out.push(t) }
    if (theorem && seen.has(t) && !theorems.includes(t)) theorems.push(t)
  }
  let calls = false
  for (const raw of texts) {
    const s = uncommented(raw)
    if (CALLS.test(s)) calls = true
    for (const m of s.matchAll(/\\(newtheorem\*?|spnewtheorem\*?|newmdtheoremenv|newproof|declaretheorem|crefname|Crefname|renewcommand\*?\s*\{?\\[A-Za-z]+autorefname\}?|def\s*\\[A-Za-z]+autorefname)(?![A-Za-z@])/g)) {
      const cmd = m[1], at = m.index + m[0].length
      if (/autorefname/.test(cmd)) { const g = argsAt(s, at, 1)[0]; if (g?.brace) add(g.text); continue }
      if (cmd === 'crefname' || cmd === 'Crefname') { const a = argsAt(s, at, 3).filter(x => x.brace); if (a.length === 3) { add(a[1].text); add(a[2].text) } continue }
      if (cmd === 'declaretheorem') {
        const a = argsAt(s, at, 1), opts = a.filter(x => !x.brace).map(x => x.text).join(','), env = a.find(x => x.brace)?.text?.trim()
        const name = optionOf(opts, 'name') ?? (env && /^[A-Za-z]+$/.test(env) ? env[0].toUpperCase() + env.slice(1) : null)
        add(name, true)
        for (const key of ['refname', 'Refname']) { const v = optionOf(opts, key); if (v) for (const w of v.split(',')) add(w) }
        continue
      }
      // \newtheorem{env}[shared]{Name}[within], \spnewtheorem{env}[shared]{Name}{fonts}, \newproof{env}{Name}, \newmdtheoremenv{env}{Name}
      const a = argsAt(s, at, 2).filter(x => x.brace)
      if (a.length === 2) add(a[1].text, true)
    }
  }
  if (calls) for (const w of [...NAME_GAPS, ...CONJUNCTION_GAPS]) add(w)
  return { all: out, theorems }
}
