// TeX's hyphenation patterns as a host serves them: the pattern file of each language under TeX Live's texmf-dist, how each
// is decoded, and the reading of one into { patterns, exceptions } (patternsOfTex), the JSON a reader's hyphenation is made
// from (the typesetter's breaker/hyph.ts hyphenationOf). The website builds the patterns it serves with these
// (/hyph/<lang>.json).

/** hyph-utf8's languages the engine hyphenates with: French, Spanish and Portuguese (their own patterns, TeX's, not
 *  English's patterns), and the further languages PDF-READER §11.10 lists */
const HYPH_UTF8: readonly Exclude<PatternLanguage, 'en' | 'de'>[] = [
  'fr',
  'es',
  'pt',
  'it',
  'nl',
  'pl',
  'tr',
  'id',
  'cs',
  'sv',
  'uk',
  'bg',
]
/** the languages of TeX's pattern files the layer hyphenates with */
export type PatternLanguage =
  | 'en'
  | 'de'
  | 'fr'
  | 'es'
  | 'pt'
  | 'it'
  | 'nl'
  | 'pl'
  | 'tr'
  | 'id'
  | 'cs'
  | 'sv'
  | 'uk'
  | 'bg'
/** TeX's pattern files, by language, under texmf-dist: Knuth's hyphen.tex, dehyphn.tex (German, new orthography), and
 *  hyph-utf8's */
export const TEX_PATTERN_FILES = Object.freeze({
  en: 'tex/generic/hyphen/hyphen.tex',
  de: 'tex/generic/dehyph/dehyphn.tex',
  ...Object.fromEntries(HYPH_UTF8.map((l) => [l, `tex/generic/hyph-utf8/patterns/tex/hyph-${l}.tex`])),
}) as Readonly<Record<PatternLanguage, string>>
/** how each pattern file is decoded: Latin-1 for TeX's 8-bit files (dehyphn.tex's umlauts are T1 bytes), UTF-8 for hyph-utf8's */
export const TEX_PATTERN_ENCODINGS = Object.freeze({
  en: 'latin1',
  de: 'latin1',
  ...Object.fromEntries(HYPH_UTF8.map((l) => [l, 'utf8'])),
}) as Readonly<Record<PatternLanguage, 'latin1' | 'utf8'>>

/**
 * A TeX pattern file as { patterns, exceptions }: `text` is the file decoded as its `encoding`
 * (TEX_PATTERN_ENCODINGS). Comments go first (dehyphn.tex names \patterns{...} in one before its own); a block runs to its
 * matching brace. A Latin-1 file is TeX's 8-bit form: \n{…"a…} is an umlaut (T1), \3 and 0xFF are ß, and the
 * ß patterns repeated for OT1 as \c{…} are left out; a UTF-8 file (hyph-utf8's) holds its letters as they are, a
 * ÿ one of them (French's)
 */
export function patternsOfTex(
  text: string,
  encoding: 'latin1' | 'utf8' = 'latin1',
): { patterns: string[]; exceptions: string[] } {
  const t1 = encoding === 'latin1'
  const raw = (t1 ? text.replace(/ÿ/g, 'ß') : text)
    .split('\n')
    .map((l) => l.replace(/(^|[^\\])%.*$/, '$1'))
    .join('\n')
  const block = (name: string): string[] => {
    const at = raw.indexOf(`\\${name}{`)
    if (at < 0) return []
    let depth = 0,
      end = at + name.length + 1
    for (; end < raw.length; end++) {
      if (raw[end] === '{') depth++
      else if (raw[end] === '}' && --depth === 0) break
    }
    const body = raw.slice(at + name.length + 2, end)
    const read = t1
      ? body
          .replace(/\\c\{[^}]*\}/g, ' ')
          .replace(/\\n\{([^}]*)\}/g, '$1')
          .replace(/\\3/g, 'ß')
          .replace(/"a/g, 'ä')
          .replace(/"o/g, 'ö')
          .replace(/"u/g, 'ü')
      : body
    return read.split(/\s+/).filter((t) => t && !t.startsWith('\\'))
  }
  return { patterns: block('patterns'), exceptions: block('hyphenation') }
}
