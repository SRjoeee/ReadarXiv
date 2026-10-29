// src/pdf-reader/engine/rules/tex-names.mjs
// The names TeX's packages give a theorem-like head and a generated reference in a target (PDF-READER §19.11), read from
// tex-names.json, which lab/pdf/spikes/tex-names-make.mjs writes from TeX Live's own files: translator's theorem dictionaries
// (ctex's for Chinese), cleveref's and hyperref's language definitions, ctex's names. No name is written here: a word no
// package gives in the target is the paper's own name unit's translation (`names`: source/paper-names.mjs, PDF-READER §19.14),
// sent to the translator once like any unit, else the original's.
//
// Pure: no DOM, no clock. An original module (no port statement).
import NAMES from './tex-names.json' with { type: 'json' }

/** the commands whose text TeX's cross-referencing packages generate, a counter type's name before the number: cleveref's
 *  \cref and \Cref and their range, page and name forms, hyperref's \autoref. The layer renames their text (layer2.mjs
 *  GENERATED_REF), and a paper that calls any of them sends the names no package gives some target (source/paper-names.mjs) */
export const GENERATED_COMMANDS = Object.freeze(['cref', 'Cref', 'crefrange', 'Crefrange', 'cpageref', 'Cpageref', 'cpagerefrange', 'Cpagerefrange', 'namecref', 'nameCref', 'lcnamecref', 'namecrefs', 'nameCrefs', 'lcnamecrefs', 'labelcref', 'labelcpageref', 'autoref', 'Autoref'])
/** the targets whose names do not inflect (no plural, no case): an English plural or lower-case form reads as its type's one
 *  name there */
const UNINFLECTED = new Set(['zh', 'zh-TW', 'ja', 'ko'])
/** the babel names (the layout rules' labels, by key) a counter type reads in a target that neither cleveref nor ctex
 *  names: a float's, an appendix's */
const BABEL_TYPES = new Set(['figure', 'table', 'appendix'])
/** a number a reference or a head prints: TeX's arabic, an appendix's or a supplement's letter before it, its parts after
 *  stops or dashes, a letter after it, a roman numeral in either case (a front matter's page), a letter alone (an appendix), any of these in brackets (an equation) */
const NUMBER = /^[([]?(?:(?:[A-Z]{0,2}\d+|[A-Z](?=[.\-–]\d))(?:[.\-–]\d+|[.\-–][A-Za-z](?![A-Za-z]))*[a-z]?|[IVXLCDM]{1,7}|[ivxlcdm]{1,7}|[A-Z])[)\]]?$/
/** the conjunctions cleveref's English prints, the longest first (", and " before " and ") */
const CONJUNCTIONS = [...NAMES.conjunctions].sort((a, b) => b.length - a.length)
/** each counter type's English name, \Crefname's singular (cleveref's english): a form's one name in a target that does not
 *  inflect, whose name units hold that word */
const SINGULAR = NAMES.singular
/** the words no package names in some target the readers offer (cleveref's types' singulars, and the conjunctions' words): a paper
 *  that generates references sends them to the translator once, as name units of their own (source/paper-names.mjs) */
export const NAME_GAPS = Object.freeze([...NAMES.gaps])
export const CONJUNCTION_GAPS = Object.freeze([...new Set(NAMES.conjunctionGaps.map(c => conjunctionWord(c)))])
/** a conjunction's word, its spaces and punctuation aside (", and " "and") */
function conjunctionWord(c) { return c.replace(/[\s,]+/g, ' ').trim() }
/** a name unit's translation as the paper's names hold it (`names`, English → the target's), trimmed; null for none */
const ownName = (names, english) => { const w = names?.get?.(english); return typeof w === 'string' && w.trim() ? w.trim() : null }
/** a babel name as a reference's word: its letter-spacing between CJK characters dropped (zh-Hant's appendix name, its two characters a space apart, a heading's) */
const unspaced = s => s.replace(/(?<=[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}])/gu, '')

/** a theorem-like head's name (\newtheorem's printed name, "Definition") in the target: translator's dictionary's, else the
 *  paper's own name unit's translation (`names`), or null */
export function headName(english, to, names = null) {
  const t = NAMES.targets[to]
  return (t && Object.hasOwn(t.heads, english) && t.heads[english]) || (t ? ownName(names, english) : null)
}

/**
 * A generated reference's name (cleveref's or \autoref's English, "Theorem", "Sections", "Eq.") in the target, or null. A
 * theorem-like name is its head's (headName: a reference reads as the head it names); else cleveref's or hyperref's in the
 * target, ctex's for Chinese; else babel's name of its counter type (`labels`, the layout rules' labels: a float's, an
 * appendix's), for every form in a target whose names do not inflect and for the type's singular alone in one that does
 * (Polish's "Rysunek" for "Figure", where neither cleveref nor hyperref has Polish: babel's name is the singular's
 * nominative, a plural or a case none of its); else the paper's own name unit's translation (`names`: the form itself, a
 * name the paper defines, or, in a target whose names do not inflect, its type's singular, cleveref's English)
 */
export function refName(english, to, labels = null, names = null) {
  const t = NAMES.targets[to]
  if (!t) return null
  const head = Object.hasOwn(t.heads, english) && t.heads[english]
  if (head) return head
  if (Object.hasOwn(t.refs, english) && t.refs[english]) return t.refs[english]
  const type = Object.hasOwn(NAMES.types, english) ? NAMES.types[english] : null
  if (type && BABEL_TYPES.has(type) && labels?.[type] && (UNINFLECTED.has(to) || SINGULAR[type] === english)) return unspaced(labels[type])
  return ownName(names, english) ?? (UNINFLECTED.has(to) && type && Object.hasOwn(SINGULAR, type) ? ownName(names, SINGULAR[type]) : null)
}
/** a conjunction in the target: cleveref's; else one of punctuation alone as it is; else its word the paper's name unit's
 *  translation, its spaces and punctuation the English's (" and " a space each side) */
function conjunctionOf(t, c, names) {
  if (Object.hasOwn(t.conj, c)) return t.conj[c]
  if (!/\p{L}/u.test(c)) return c
  const word = conjunctionWord(c), w = ownName(names, word)
  return w ? c.replace(word, w) : null
}

/** the words a name may be, the longest first, so that "Main Theorem" is read before "Theorem" */
const WORDS = [...new Set([...Object.keys(NAMES.types), ...Object.values(NAMES.targets).flatMap(t => [...Object.keys(t.heads), ...Object.keys(t.refs)])])].sort((a, b) => b.length - a.length)

/**
 * A generated reference's text as TeX set it (`text`: "Theorem A.17", "Sections 5.2.1, 5.2.3 and 5.2.4") in the target's
 * names: the replacements, [start, end, word] over `text` in order, each name and each conjunction the reference prints; its
 * numbers and its punctuation kept. Null where any part of it is no number, no name the target has a word for and no
 * conjunction it has one for: the reference is then the original's whole, never half in either language. An empty list
 * where it holds no name (\labelcref's numbers alone)
 */
export function refInTarget(text, to, labels = null, names = null) {
  if (typeof text !== 'string' || !text.trim() || !NAMES.targets[to]) return null
  const t = NAMES.targets[to]
  // (the paper's own names among the words, the longest first: "Main Assumption" before "Assumption")
  const words = names?.size ? [...new Set([...names.keys(), ...WORDS])].sort((a, b) => b.length - a.length) : WORDS
  const out = []
  let i = 0, rest = '', named = false
  const flush = () => { const s = rest.trim(); rest = ''; return !s || s.split(/\s+/).every(w => NUMBER.test(w.replace(/[,;]$/, ''))) }
  while (i < text.length) {
    const c = CONJUNCTIONS.find(x => text.startsWith(x, i))
    if (c && (named || rest.trim())) {
      if (!flush()) return null
      // (", " between two numbers is its own conjunction where the target's is the same)
      const w = conjunctionOf(t, c, names)
      if (w === null) return null
      if (w !== c) out.push([i, i + c.length, w])
      i += c.length
      continue
    }
    const atWord = i === 0 || /[\s(]/.test(text[i - 1])
    const name = atWord ? words.find(x => text.startsWith(x, i) && !/[\p{L}\p{N}]/u.test(text[i + x.length] ?? '')) : null
    if (name) {
      if (!flush()) return null
      const w = refName(name, to, labels, names)
      if (!w) return null
      named = true
      if (w !== name) out.push([i, i + name.length, w])
      i += name.length
      continue
    }
    rest += text[i]
    i++
  }
  if (!flush()) return null
  return out
}

/**
 * A theorem-like head as TeX set it (`text`, its label's characters: "Definition 5.1 (", "Theorem 2.", "Main Theorem.") in
 * the target: its name in translator's dictionary's word for it, its number and its punctuation as they are. Null where it
 * is no head of a name the target's dictionary holds, nor one the paper's name units translate (`names`)
 */
export function headInTarget(text, to, names = null) {
  // (its name of the characters a paper's own name may hold, source/paper-names.mjs PLAIN's: "Sub-Claim", "Thm.", the
  // shortest that leaves a number and punctuation after it, so that a package's names read as they did)
  const m = typeof text === 'string' && /^\s*(\p{L}[\p{L}\p{M} .'\u2019-]*?)\s*((?:[A-Z]{0,2}\d+|[A-Z](?=[.\-–]\d))(?:[.\-–]\d+)*[a-z]?|[IVXLCDM]{1,7}|[A-Z])?(\s*[.:]?\s*[([]?)\s*$/u.exec(text)
  if (!m) return null
  const english = m[1].replace(/\s+/g, ' ')
  let name = headName(english, to, names), tail = m[3]
  // (an unnumbered head of a name that ends in its own stop, a style that sets no punctuation after it: "Thm.", the stop the
  // name's where the name without it has no word)
  if (!name && !m[2] && /^\s*\./.test(tail)) {
    const dotted = headName(`${english}.`, to, names)
    if (dotted) { name = dotted; tail = tail.replace(/^\s*\./, '') }
  }
  if (!name) return null
  // (its punctuation as TeX set it, a space before an opening bracket kept: "Definition 5.1 (")
  return `${name}${m[2] ? ` ${m[2]}` : ''}${tail.replace(/\s+/g, ' ')}`
}
