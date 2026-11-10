// Hyphenation for the breaker (B.break): Liang's patterns (TeX's own, served as data: Rules.breaking.hyphenation) and, for
// Russian, Khmelev's syllable rules; the fewest letters before and after a break the layout rules' (babel's). Ported from
// engine 065c1d973 layer-proto/hyph.mjs: hyphenationOf :68-82, breakPoints :88-96, liang :98-126, russian :128-142. Module
// state removed on the way (no behaviour): today's breakPoints caches its answers by word; the port computes them each call.
// Fetching the patterns (loadHyphenation) is the host's.

/** a language's patterns as breakPoints reads them */
export type Patterns = { pats: Map<string, number[]>; exceptions: Map<string, string>; maxLen: number }
/** babel's fewest letters before and after a break */
export type Mins = { left: number; right: number }

/** patternsOfTex's { patterns, exceptions } as breakPoints reads them (hyph.mjs:68 hyphenationOf) */
export function hyphenationOf(j: { patterns: readonly string[]; exceptions: readonly string[] }): Patterns {
  const pats = new Map<string, number[]>()
  for (const p of j.patterns) {
    const letters = p.replace(/\d/g, '')
    const points: number[] = []
    let k = 0
    for (const ch of p) {
      if (/\d/.test(ch)) points[k] = Number(ch)
      else k++
    }
    pats.set(
      letters,
      Array.from({ length: letters.length + 1 }, (_, i) => points[i] ?? 0),
    )
  }
  const exceptions = new Map(j.exceptions.map((e) => [e.replace(/-/g, ''), e]))
  return { pats, exceptions, maxLen: Math.max(...[...pats.keys()].map((k) => k.length)) }
}

/** the offsets into `word` where it may break (hyph.mjs:88 breakPoints) */
export function breakPoints(
  word: string,
  lang: string,
  data: Patterns | null | undefined,
  mins: Mins | undefined,
): number[] {
  if (lang !== 'ru' && (typeof mins?.left !== 'number' || typeof mins.right !== 'number'))
    throw new TypeError(
      `breakPoints: mins ({ left, right }), the fewest letters before and after a break, for ${lang}'s patterns`,
    )
  return lang === 'ru' ? russian(word) : liang(word, data, mins!, lang)
}

function liang(word: string, data: Patterns | null | undefined, { left: lmin, right: rmin }: Mins, lang: string) {
  if (!data) return []
  const w = word.toLocaleLowerCase(lang)
  if (w.length !== word.length || w.length < lmin + rmin) return []
  const ex = data.exceptions.get(w)
  if (ex) {
    const out: number[] = []
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
      if (p) for (let k = 0; k < p.length; k++) if (p[k]! > points[i + k]!) points[i + k] = p[k]!
    }
  }
  const out: number[] = []
  for (let i = lmin; i <= w.length - rmin; i++) if (points[i + 1]! % 2 === 1) out.push(i)
  return out
}

const V = 'аеёиоуыэюя'
const C = 'бвгджзклмнпрстфхцчшщ'
const Z = 'йъь'
const cls = (ch: string) => (V.includes(ch) ? 'g' : C.includes(ch) ? 's' : Z.includes(ch) ? 'x' : 'o')
/** Khmelev's rules: x-ll, g-gl, gs-sg, sg-sg, gs-ssg, gss-ssg (l any letter), never leaving one letter (hyph.mjs:131) */
function russian(word: string): number[] {
  const w = word.toLowerCase()
  if (w.length < 4 || /[^а-яё]/.test(w)) return []
  const c = [...w].map(cls).join('')
  const out = new Set<number>()
  const rules: [RegExp, number][] = [
    [/x(?=..)/g, 1],
    [/g(?=g.)/g, 1],
    [/gs(?=sg)/g, 2],
    [/sg(?=sg)/g, 2],
    [/gs(?=ssg)/g, 2],
    [/gss(?=ssg)/g, 3],
  ]
  for (const [re, len] of rules) {
    re.lastIndex = 0
    for (const m of c.matchAll(re)) out.add(m.index! + len)
  }
  return [...out].filter((i) => i >= 2 && i <= w.length - 2).sort((a, b) => a - b)
}
