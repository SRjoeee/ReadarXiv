// src/pdf-reader/engine/layer-proto/hyph.mjs
// Ported from the private prototype (readarxiv-web, exp/instant-layer at 9e56fca,
// web/prototypes/instant-layer/hyph.js), 2026-10-06, as the instant layer's v0: hyphenation. Our own code, so no
// licence applies; the provenance is kept so that every number the prototype was approved on traces back to it.
// Unchanged in behaviour: the changes are the module paths, CJK characters written as \u escapes (the English gate),
// imports nothing uses left out, and what is named below. The prototype's own description follows.
//
// Hyphenation for the layer's alphabetic runs: Liang's patterns (TeX's own: Knuth's hyphen.tex for English, dehyphn.tex
// for German, served by serve.mjs from TinyTeX as /hyph/<lang>.json), and for Russian, which TinyTeX lacks, the
// rule-based syllable split of Khmelev (vowel/consonant classes), which is what light-weight Russian hyphenators use.
// Min lengths as TeX's babel sets them (English 2 and 3, German 2 and 2) are the layout rules' (rules/layout.mjs
// hyphenation), given with each call; Russian's rules hold their own.
//
// v0's changes: loadHyphenation takes its URL from its host, and the prototype host's reading of a TeX pattern file
// (serve.mjs hyphenation()) is here as patternsOfTex, so that any host serves the same patterns.

/** TeX's pattern files, by language, under texmf-dist: Knuth's hyphen.tex, and dehyphn.tex (German, new orthography) */
export const TEX_PATTERN_FILES = { en: 'tex/generic/hyphen/hyphen.tex', de: 'tex/generic/dehyph/dehyphn.tex' }

/**
 * A TeX pattern file as { patterns, exceptions } (serve.mjs's reading, unchanged): `latin1` is the file decoded as
 * Latin-1 (dehyphn.tex's umlauts are T1 bytes, its \u00DF at 0xFF). Comments go first (dehyphn.tex names \patterns{...}
 * in one before its own); a block runs to its matching brace; \n{\u2026"a\u2026} is an umlaut (T1), \3 is \u00DF, and the
 * \u00DF patterns repeated for OT1 as \c{\u2026} are left out
 */
export function patternsOfTex(latin1) {
  const raw = latin1.replace(/\u00FF/g, '\u00DF').split('\n').map(l => l.replace(/(^|[^\\])%.*$/, '$1')).join('\n')
  const block = name => {
    const at = raw.indexOf(`\\${name}{`)
    if (at < 0) return []
    let depth = 0, end = at + name.length + 1
    for (; end < raw.length; end++) {
      if (raw[end] === '{') depth++
      else if (raw[end] === '}' && --depth === 0) break
    }
    const text = raw.slice(at + name.length + 2, end).replace(/\\c\{[^}]*\}/g, ' ').replace(/\\n\{([^}]*)\}/g, '$1').replace(/\\3/g, '\u00DF').replace(/"a/g, '\u00E4').replace(/"o/g, '\u00F6').replace(/"u/g, '\u00FC')
    return text.split(/\s+/).filter(t => t && !t.startsWith('\\'))
  }
  return { patterns: block('patterns'), exceptions: block('hyphenation') }
}

const tries = new Map()

/** the patterns of a language, fetched once (from `url`, patternsOfTex's JSON); null where there are none */
export function loadHyphenation(lang, url = `/hyph/${lang}.json`) {
  if (lang === 'ru') return Promise.resolve(true)
  if (!tries.has(lang)) {
    tries.set(lang, fetch(url).then(r => (r.ok ? r.json() : null)).then(j => {
      if (!j) return null
      const pats = new Map()
      for (const p of j.patterns) {
        const letters = p.replace(/\d/g, '')
        const points = []
        let k = 0
        for (const ch of p) {
          if (/\d/.test(ch)) points[k] = Number(ch)
          else k++
        }
        const arr = Array.from({ length: letters.length + 1 }, (_, i) => points[i] ?? 0)
        pats.set(letters, arr)
      }
      const exceptions = new Map(j.exceptions.map(e => [e.replace(/-/g, ''), e]))
      return { pats, exceptions, maxLen: Math.max(...[...pats.keys()].map(k => k.length)) }
    }).catch(() => null))
  }
  return tries.get(lang)
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
  out = lang === 'ru' ? russian(word) : liang(word, data, mins)
  cache.set(key, out)
  return out
}

function liang(word, data, { left: lmin, right: rmin }) {
  if (!data) return []
  const w = word.toLowerCase()
  if (w.length < lmin + rmin) return []
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
