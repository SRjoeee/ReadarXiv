// src/pdf-reader/engine/layer-proto/hyph.mjs
// Ported from the private prototype (readarxiv-web, exp/instant-layer at 9e56fca,
// web/prototypes/instant-layer/hyph.js), 2026-10-06, as the instant layer's v0: hyphenation. Our own code, so no
// licence applies; the provenance is kept so that every number the prototype was approved on traces back to it.
// Unchanged in behaviour: the changes are the module paths, CJK characters written as \u escapes (the English gate),
// imports nothing uses left out, and what is named below. The prototype's own description follows.
//
// Hyphenation for the layer's alphabetic runs: Liang's patterns (TeX's own: Knuth's hyphen.tex for English, dehyphn.tex
// for German, hyph-utf8's for French, Spanish, Portuguese, Italian, Dutch, Polish, Turkish, Indonesian (Malay's too, as
// babel's malay.ldf takes them), Czech, Swedish, Ukrainian and Bulgarian, served by the host from TeX Live as
// /hyph/<lang>.json), and for Russian the rule-based syllable split of Khmelev (vowel/consonant classes), which is what
// light-weight Russian hyphenators use. Min lengths as TeX's babel sets them (English 2 and 3, German 2 and 2, French 2 and
// 3, Spanish 2 and 2, Portuguese 2 and 3: the .ldf files' \providehyphenmins; the rest as TeX reports them under babel,
// tests/fixtures/hyph/README.md) are the layout rules' (rules/layout.mjs hyphenation), given with each call; Russian's
// rules hold their own.
//
// v0's changes: loadHyphenation takes its URL from its host, and the prototype host's reading of a TeX pattern file
// (serve.mjs hyphenation()) is here as patternsOfTex, so that any host serves the same patterns.

/** hyph-utf8's languages the engine hyphenates with: French, Spanish and Portuguese (#121-4: those three were hyphenated with
 *  English's patterns), and the languages of the owner's ruling of 2026-10-29 */
const HYPH_UTF8 = ['fr', 'es', 'pt', 'it', 'nl', 'pl', 'tr', 'id', 'cs', 'sv', 'uk', 'bg']
/** TeX's pattern files, by language, under texmf-dist: Knuth's hyphen.tex, dehyphn.tex (German, new orthography), and
 *  hyph-utf8's */
export const TEX_PATTERN_FILES = Object.freeze({
  en: 'tex/generic/hyphen/hyphen.tex', de: 'tex/generic/dehyph/dehyphn.tex',
  ...Object.fromEntries(HYPH_UTF8.map(l => [l, `tex/generic/hyph-utf8/patterns/tex/hyph-${l}.tex`])),
})
/** how each pattern file is decoded: Latin-1 for TeX's 8-bit files (dehyphn.tex's umlauts are T1 bytes), UTF-8 for hyph-utf8's */
export const TEX_PATTERN_ENCODINGS = Object.freeze({ en: 'latin1', de: 'latin1', ...Object.fromEntries(HYPH_UTF8.map(l => [l, 'utf8'])) })

/**
 * A TeX pattern file as { patterns, exceptions } (serve.mjs's reading): `text` is the file decoded as its `encoding`
 * (TEX_PATTERN_ENCODINGS). Comments go first (dehyphn.tex names \patterns{...} in one before its own); a block runs to its
 * matching brace. A Latin-1 file is TeX's 8-bit form: \n{\u2026"a\u2026} is an umlaut (T1), \3 and 0xFF are \u00DF, and the
 * \u00DF patterns repeated for OT1 as \c{\u2026} are left out; a UTF-8 file (hyph-utf8's) holds its letters as they are, a
 * \u00FF one of them (French's)
 */
export function patternsOfTex(text, encoding = 'latin1') {
  const t1 = encoding === 'latin1'
  const raw = (t1 ? text.replace(/\u00FF/g, '\u00DF') : text).split('\n').map(l => l.replace(/(^|[^\\])%.*$/, '$1')).join('\n')
  const block = name => {
    const at = raw.indexOf(`\\${name}{`)
    if (at < 0) return []
    let depth = 0, end = at + name.length + 1
    for (; end < raw.length; end++) {
      if (raw[end] === '{') depth++
      else if (raw[end] === '}' && --depth === 0) break
    }
    const body = raw.slice(at + name.length + 2, end)
    const read = t1 ? body.replace(/\\c\{[^}]*\}/g, ' ').replace(/\\n\{([^}]*)\}/g, '$1').replace(/\\3/g, '\u00DF').replace(/"a/g, '\u00E4').replace(/"o/g, '\u00F6').replace(/"u/g, '\u00FC') : body
    return read.split(/\s+/).filter(t => t && !t.startsWith('\\'))
  }
  return { patterns: block('patterns'), exceptions: block('hyphenation') }
}

const tries = new Map()

/** the patterns of a language, fetched once (from `url`, patternsOfTex's JSON); null where there are none */
export function loadHyphenation(lang, url = `/hyph/${lang}.json`) {
  if (lang === 'ru') return Promise.resolve(true)
  if (!tries.has(lang)) tries.set(lang, fetch(url).then(r => (r.ok ? r.json() : null)).then(j => (j ? hyphenationOf(j) : null)).catch(() => null))
  return tries.get(lang)
}

/** patternsOfTex's { patterns, exceptions } as breakPoints reads them: each pattern's letters with its points, each exception
 *  by its letters */
export function hyphenationOf(j) {
  const pats = new Map()
  for (const p of j.patterns) {
    const letters = p.replace(/\d/g, '')
    const points = []
    let k = 0
    for (const ch of p) {
      if (/\d/.test(ch)) points[k] = Number(ch)
      else k++
    }
    pats.set(letters, Array.from({ length: letters.length + 1 }, (_, i) => points[i] ?? 0))
  }
  const exceptions = new Map(j.exceptions.map(e => [e.replace(/-/g, ''), e]))
  return { pats, exceptions, maxLen: Math.max(...[...pats.keys()].map(k => k.length)) }
}

const cache = new Map()
/** the positions (character offsets into `word`) where `word` may break, for a language whose patterns are loaded.
 *  `mins`: the fewest letters left before and after a break ({ left, right }, the layout rules' for the language), required
 *  for a language of patterns (a TypeError without them); Russian's rules need none */
export function breakPoints(word, lang, data, mins) {
  if (lang !== 'ru' && (typeof mins?.left !== 'number' || typeof mins.right !== 'number')) throw new TypeError(`breakPoints: mins ({ left, right }), the fewest letters before and after a break, for ${lang}'s patterns`)
  const key = lang === 'ru' ? `ru|${word}` : `${lang}|${mins.left}|${mins.right}|${word}`
  let out = cache.get(key)
  if (out) return out
  out = lang === 'ru' ? russian(word) : liang(word, data, mins, lang)
  cache.set(key, out)
  return out
}

function liang(word, data, { left: lmin, right: rmin }, lang) {
  if (!data) return []
  // (lower case as the language has it, as its patterns are written: Turkish's I is ı and its İ is i, where the root's
  // İ is i and a combining dot, a letter more; a word whose lower case is longer or shorter has no offsets to give back)
  const w = word.toLocaleLowerCase(lang)
  if (w.length !== word.length || w.length < lmin + rmin) return []
  const ex = data.exceptions.get(w)
  if (ex) {
    const out = []
    let k = 0
    for (const ch of ex) {
      if (ch === '-') out.push(k)
      else k++
    }
    return out
  }
  const s = `.${w}.`
  const points = new Uint8Array(s.length + 1)
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j <= Math.min(s.length, i + data.maxLen); j++) {
      const p = data.pats.get(s.slice(i, j))
      if (p) for (let k = 0; k < p.length; k++) if (p[k] > points[i + k]) points[i + k] = p[k]
    }
  }
  const out = []
  // points[i + 1] is the value between s[i] and s[i + 1]: between word[i - 1] and word[i]
  for (let i = lmin; i <= w.length - rmin; i++) if (points[i + 1] % 2 === 1) out.push(i)
  return out
}

const V = 'аеёиоуыэюя', C = 'бвгджзклмнпрстфхцчшщ', Z = 'йъь'
const cls = ch => (V.includes(ch) ? 'g' : C.includes(ch) ? 's' : Z.includes(ch) ? 'x' : 'o')
/** Khmelev's rules: x-ℓℓ, g-gℓ, gs-sg, sg-sg, gs-ssg, gss-ssg (ℓ any letter), never leaving one letter */
function russian(word) {
  const w = word.toLowerCase()
  if (w.length < 4 || /[^а-яё]/.test(w)) return []
  const c = [...w].map(cls).join('')
  const out = new Set()
  const rules = [[/x(?=..)/g, 1], [/g(?=g.)/g, 1], [/gs(?=sg)/g, 2], [/sg(?=sg)/g, 2], [/gs(?=ssg)/g, 2], [/gss(?=ssg)/g, 3]]
  for (const [re, len] of rules) {
    re.lastIndex = 0
    for (const m of c.matchAll(re)) out.add(m.index + len)
  }
  return [...out].filter(i => i >= 2 && i <= w.length - 2).sort((a, b) => a - b)
}
