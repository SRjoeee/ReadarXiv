// U.rename: the names TeX's cross-referencing packages generate in a reference (cleveref's \cref, hyperref's \autoref:
// "Theorem A.17") and a citation's note ("[Ascolani et al., 2026, Lemma 1]") put in the target's names, each replacement
// [start, end, word] over the text the page shows; its numbers and punctuation kept; a reference no package names whole in
// the target left as the page shows it. The rule returns the replacements by element, and the composition sets them.
//
// Its inputs, and where each comes from:
// - `elements`: the unit's resolutions in the row's order (U.elements' answer): each one drawn as its page's text
//   (`orig-text`) with its source and text
// - `names`: the packages' names (data/rules/refs.ts and heads.ts, written from TeX Live's files: translator's,
//   cleveref's, hyperref's, ctex's; a data file of Rules, LPPL), prepared for the target by `refNamesOf`
// - `labels`: babel's names in the target (Rules.words); `own`: the paper's own name units' translations (other rows,
//   `ownNamesOf`)

import type { OutPiece, Row } from '@readarxiv/format'

/** the reference names' data (data/rules/refs.ts, the engine's source/tex-names.json) as the rule reads it: each form's
 *  counter type, cleveref's English conjunctions and singulars, and per target the heads' (translator's), the references'
 *  (cleveref's, hyperref's) and the conjunctions' words */
export type TexNamesData = {
  types: Readonly<Record<string, string>>
  conjunctions: readonly string[]
  singular: Readonly<Record<string, string>>
  targets: Readonly<
    Record<
      string,
      {
        heads: Readonly<Record<string, string>>
        refs: Readonly<Record<string, string>>
        conj: Readonly<Record<string, string>>
      }
    >
  >
}
/** the packages' names prepared for one target: its words (null where the file names nothing in it), the forms' types and
 *  singulars, the conjunctions the longest first, and every word a name may be, the longest first */
export type RefNames = {
  to: string
  target: TexNamesData['targets'][string] | null
  types: TexNamesData['types']
  singular: TexNamesData['singular']
  conjunctions: readonly string[]
  words: readonly string[]
}
/** a replacement: [start, end, word] over the text the page shows */
export type Rename = [start: number, end: number, word: string]
/** a resolution as the rule reads it */
type Renamable = { mode: string; sup?: boolean; src?: string; text?: string }

/** the commands whose text TeX's cross-referencing packages generate, a counter type's name before the number: cleveref.sty's
 *  \cref and \Cref with their range, page and name forms, hyperref.sty's \autoref and \Autoref (TeX Live 2025). The engine's
 *  packages/engine/src/source/tex-names.ts GENERATED_COMMANDS, which its source reader reads, held equal to it by
 *  tests/typeset/tex-names.test.ts */
export const GENERATED_COMMANDS: readonly string[] = Object.freeze([
  'cref',
  'Cref',
  'crefrange',
  'Crefrange',
  'cpageref',
  'Cpageref',
  'cpagerefrange',
  'Cpagerefrange',
  'namecref',
  'nameCref',
  'lcnamecref',
  'namecrefs',
  'nameCrefs',
  'lcnamecrefs',
  'labelcref',
  'labelcpageref',
  'autoref',
  'Autoref',
])
/** a placeholder whose text a package generates */
const GENERATED_REF = new RegExp(`^\\\\(?:${GENERATED_COMMANDS.join('|')})\\*?\\s*\\{`)
/** a citation's note, its last optional argument */
const CITE_NOTE = /^\\(?:cite[a-z]*|parencite|textcite|autocite)\*?((?:\s*\[[^\]]*\])+)\s*\{/
/** the targets whose names do not inflect */
const UNINFLECTED = new Set(['zh', 'zh-TW', 'ja', 'ko'])
/** the counter types babel names that neither cleveref nor ctex does: article.cls's \figurename,
 *  \tablename and \appendixname, as babel's captions */
const BABEL_TYPES = new Set(['figure', 'table', 'appendix'])
/** a number a reference prints */
const NUMBER =
  /^[([]?(?:(?:[A-Z]{0,2}\d+|[A-Z](?=[.\-–]\d))(?:[.\-–]\d+|[.\-–][A-Za-z](?![A-Za-z]))*[a-z]?|[IVXLCDM]{1,7}|[ivxlcdm]{1,7}|[A-Z])[)\]]?$/
const longestFirst = (a: string, b: string) => b.length - a.length

/** the packages' names for one target: the conjunctions and the words of every target (the types, the heads' and the
 *  references' names), each longest first, so that the name found at a place is the longest there */
export function refNamesOf(data: TexNamesData, to: string): RefNames {
  return {
    to,
    target: Object.hasOwn(data.targets, to) ? data.targets[to]! : null,
    types: data.types,
    singular: data.singular,
    conjunctions: [...data.conjunctions].sort(longestFirst),
    words: [
      ...new Set([
        ...Object.keys(data.types),
        ...Object.values(data.targets).flatMap((t) => [...Object.keys(t.heads), ...Object.keys(t.refs)]),
      ]),
    ].sort(longestFirst),
  }
}

const conjunctionWord = (c: string) => c.replace(/[\s,]+/g, ' ').trim()
/** the paper's own names as the rules read them: a name's word by its English, the Englishes (a reference's tokens), how many */
export type OwnNames = Pick<ReadonlyMap<string, string>, 'get' | 'keys' | 'size'>
/** whether a piece's source is one whose text a cross-referencing package generates, or a citation's note (GENERATED_REF,
 *  CITE_NOTE): the sources U.rename reads a name for, the paper's own among them */
export const renamedBy = (src: string): boolean => GENERATED_REF.test(src) || CITE_NOTE.test(src)
const ownName = (own: OwnNames | null, english: string) => {
  const w = own?.get?.(english)
  return typeof w === 'string' && w.trim() ? w.trim() : null
}
const unspaced = (s: string) =>
  s.replace(
    /(?<=[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}])/gu,
    '',
  )
const has = (table: Readonly<Record<string, string>>, w: string) => Object.hasOwn(table, w) && !!table[w]

/** a generated reference's name in the target, or null */
function refName(
  english: string,
  n: RefNames,
  labels: Readonly<Record<string, string>> | null,
  own: OwnNames | null,
): string | null {
  const t = n.target
  if (!t) return null
  if (has(t.heads, english)) return t.heads[english]!
  if (has(t.refs, english)) return t.refs[english]!
  const type = Object.hasOwn(n.types, english) ? n.types[english]! : null
  if (type && BABEL_TYPES.has(type) && labels?.[type] && (UNINFLECTED.has(n.to) || n.singular[type] === english))
    return unspaced(labels[type]!)
  return (
    ownName(own, english) ??
    (UNINFLECTED.has(n.to) && type && Object.hasOwn(n.singular, type) ? ownName(own, n.singular[type]!) : null)
  )
}

/** a conjunction in the target */
function conjunctionOf(t: NonNullable<RefNames['target']>, c: string, own: OwnNames | null) {
  if (Object.hasOwn(t.conj, c)) return t.conj[c]!
  if (!/\p{L}/u.test(c)) return c
  const word = conjunctionWord(c),
    w = ownName(own, word)
  return w ? c.replace(word, w) : null
}

/** a generated reference's text in the target's names: its replacements in order; null where a part of it is no number,
 *  name or conjunction the target has a word for; empty where it holds no name */
function refInTarget(
  text: string,
  n: RefNames,
  labels: Readonly<Record<string, string>> | null,
  own: OwnNames | null,
): Rename[] | null {
  if (typeof text !== 'string' || !text.trim() || !n.target) return null
  const t = n.target
  const words = own?.size ? [...new Set([...own.keys(), ...n.words])].sort(longestFirst) : n.words
  const out: Rename[] = []
  let i = 0,
    rest = '',
    named = false
  const flush = () => {
    const s = rest.trim()
    rest = ''
    return !s || s.split(/\s+/).every((w) => NUMBER.test(w.replace(/[,;]$/, '')))
  }
  while (i < text.length) {
    const c = n.conjunctions.find((x) => text.startsWith(x, i))
    if (c && (named || rest.trim())) {
      if (!flush()) return null
      const w = conjunctionOf(t, c, own)
      if (w === null) return null
      if (w !== c) out.push([i, i + c.length, w])
      i += c.length
      continue
    }
    const atWord = i === 0 || /[\s(]/.test(text[i - 1]!)
    const name = atWord
      ? words.find((x) => text.startsWith(x, i) && !/[\p{L}\p{N}]/u.test(text[i + x.length] ?? ''))
      : null
    if (name) {
      if (!flush()) return null
      const w = refName(name, n, labels, own)
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

/** U.rename: each resolution drawn as its page's text whose names a package generated, its replacements in the target's
 *  names, by element in the row's order; one with none is absent */
export function rename<K>(
  elements: Iterable<[K, Renamable | null | undefined]>,
  n: RefNames,
  labels: Readonly<Record<string, string>> | null,
  own: OwnNames | null,
): Map<K, Rename[]> {
  const out = new Map<K, Rename[]>()
  for (const [k, r] of elements) {
    if (r?.mode !== 'orig-text' || r.sup || typeof r.src !== 'string' || typeof r.text !== 'string') continue
    if (GENERATED_REF.test(r.src)) {
      const x = refInTarget(r.text, n, labels, own)
      if (x?.length) out.set(k, x)
      continue
    }
    const m = CITE_NOTE.exec(r.src)
    if (!m) continue
    const last = [...m[1]!.matchAll(/\[([^\]]*)\]/g)].at(-1)
    const note = last?.[1]
      ?.replace(/~|\\[ ,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!note || !/\p{L}/u.test(note)) continue
    const at = r.text.lastIndexOf(note)
    if (at < 0 || r.text.indexOf(note) !== at || /[\p{L}\p{N}]/u.test(r.text[at + note.length] ?? '')) continue
    const x = refInTarget(note, n, labels, own)
    if (x?.length)
      out.set(
        k,
        x.map(([a, b, w]) => [a + at, b + at, w]),
      )
  }
  return out
}

/** a name's translation as the target's word: its text pieces joined, white space one space, an ideographic full stop the
 *  translator ends a word with gone */
const wordOf = (texts: readonly string[]) =>
  texts
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\u3002\uff0e]$/u, '')
    .trim()

/** a row's text pieces in order, its groups' with them (a v0 row's text between a group's open and close is its own) */
function textsOf(content: readonly OutPiece[], out: string[] = []): string[] {
  for (const q of content)
    if (q.t === 'text') out.push(q.s)
    else if (q.t === 'span') textsOf(q.content, out)
  return out
}
/**
 * The paper's own names in the target, English → its word (each row's word as wordOf reads its text): the name
 * units the part states (Part.paper.names, [English, unit id]), each by its row where it is in and a translation; none where
 * it is not in, or no translation, and its heads and references keep the original's. Read when asked, each row once a call:
 * a name's row is read only by a member whose head or reference names it, and such a member's page waits for its paper's names
 * (lay/wait.ts drawsName, docs/PDF-READER.md §19.14). Its Englishes, which a reference's tokens read, need no row
 */
export function ownNamesOf(
  names: readonly (readonly [string, string])[] | undefined,
  rows: { get(id: string): Row | undefined },
): OwnNames {
  const ids = new Map<string, string>()
  for (const [en, id] of names ?? []) {
    const english = en.replace(/\s+/g, ' ').trim()
    if (english) ids.set(english, id)
  }
  const read = new Map<string, string | undefined>()
  return {
    get(english: string) {
      if (!read.has(english)) {
        const id = ids.get(english)
        const row = id === undefined ? undefined : rows.get(id)
        read.set(english, (row?.ok && wordOf(textsOf(row.content))) || undefined)
      }
      return read.get(english)
    },
    keys: () => ids.keys(),
    get size() {
      return ids.size
    },
  }
}
