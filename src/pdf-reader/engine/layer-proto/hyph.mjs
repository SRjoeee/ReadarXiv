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

// (the TeX pattern files, their encodings and their reading, patternsOfTex, moved into the engine package,
// packages/engine/src/fonts/hyph.ts, which the website builds the patterns it serves with: re-exported here for what still
// imports them from this path; the cut-over deletes this module)
export { TEX_PATTERN_FILES, TEX_PATTERN_ENCODINGS, patternsOfTex } from '@readarxiv/engine/fonts'

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
