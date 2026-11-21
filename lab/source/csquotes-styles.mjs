// lab/source/csquotes-styles.mjs: the source reader's table of csquotes' English style, held to csquotes' own file in a TeX
// tree. packages/engine/src/source/latex-front.ts mirrors csquotes.def (design 3c's second kind of list: it names the file it
// copies, and a check reads that file in the tree a paper is compiled on): CSQUOTES_ENGLISH, each variant's marks, outer then
// inner, as \DeclareQuoteStyle[<variant>]{english} declares them (its four brace groups, LaTeX's text commands read through
// tuenc.def's \DeclareUnicodeSymbol); CSQUOTES_NAMES, every name csquotes.def gives a variant of that style
// (\DeclareQuoteAlias[<variant>]{english}{<name>}, and \DeclareQuoteAlias{<alias>}{<name>} of one of those) but `default` and its
// style paths (`latin/britishquotes`), no language's names, and no other; CSQUOTES_DEFAULT, the variant `default` names.
// Anything else fails, named.
// The two files are copied out of each pinned compile image (lab/pdf/compile-images.json) by the release check's
// `csquotes-styles` gate (lab/release-check/gates.mjs):
//   docker run --rm --network none -v <dir>:/out <image> sh -c 'cp "$(kpsewhich csquotes.def)" "$(kpsewhich tuenc.def)" /out/'
//   node --import tsx lab/source/csquotes-styles.mjs <dir>…   exit 0: every directory's files hold the table; 1: a difference,
//   each printed; 2: usage
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** a text command's character as tuenc.def declares it (\DeclareUnicodeSymbol{\name}{"XXXX}), by its name with its backslash */
export function symbolsOf(tuenc) {
  const out = new Map()
  for (const m of tuenc.matchAll(/\\DeclareUnicodeSymbol\s*\{(\\[A-Za-z]+)\}\s*\{"([0-9A-Fa-f]{4,6})\}/g))
    out.set(m[1], String.fromCodePoint(Number.parseInt(m[2], 16)))
  return out
}

/** csquotes.def's English style: each variant's four marks as written (`styles`), and every name of a variant (`names`, with
 *  `default` among them), the aliases of an alias followed */
export function englishOf(def) {
  const text = def.replace(/%[^\n]*/g, '')
  const styles = new Map()
  for (const m of text.matchAll(/\\DeclareQuoteStyle\s*\[([^\]]*)\]\s*\{english\}((?:\s*(?:\{[^{}]*\}|\[[^\]]*\]))*)/g))
    styles.set(m[1].trim(), [...m[2].matchAll(/\{([^{}]*)\}/g)].map((g) => g[1].trim()))
  const names = new Map()
  for (const m of text.matchAll(/\\DeclareQuoteAlias\s*\[([^\]]*)\]\s*\{english\}\s*\{([^{}]*)\}/g)) names.set(m[2].trim(), m[1].trim())
  const aliases = [...text.matchAll(/\\DeclareQuoteAlias\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2].trim()])
  for (let grew = true; grew; ) {
    grew = false
    for (const [alias, name] of aliases)
      if (names.has(alias) && !names.has(name)) {
        names.set(name, names.get(alias))
        grew = true
      }
  }
  return { styles, names }
}

/** what differs between the table (`english` by variant, `names` by name, `fallback` the default's variant) and csquotes'
 *  files (`def`, csquotes.def's text; `tuenc`, tuenc.def's): one sentence each, none where they agree */
export function differencesOf({ def, tuenc }, { english, names, fallback }) {
  const out = []
  const sym = symbolsOf(tuenc)
  const csq = englishOf(def)
  if (!csq.styles.size) out.push('csquotes.def: no \\DeclareQuoteStyle[…]{english}')
  for (const [variant, marks] of Object.entries(english)) {
    const groups = csq.styles.get(variant)
    if (!groups) {
      out.push(`${variant}: the table holds it, csquotes.def declares no such variant of english`)
      continue
    }
    const chars = groups.slice(0, 4).map((g) => sym.get(g) ?? `?${g}`)
    const want = [marks[0][0], marks[0][1], marks[1][0], marks[1][1]]
    if (groups.length < 4 || chars.join('') !== want.join('')) out.push(`${variant}: the table's marks ${want.join(' ')}, csquotes.def's ${groups.slice(0, 4).join(' ')} (${chars.join(' ')})`)
  }
  for (const variant of csq.styles.keys()) if (!Object.hasOwn(english, variant)) out.push(`${variant}: csquotes.def declares this variant of english, the table does not hold it`)
  for (const [name, variant] of Object.entries(names)) {
    if (name === 'default') out.push('default: no language\'s name, the table holds it')
    else if (!csq.names.has(name)) out.push(`${name}: the table holds it, csquotes.def gives it no variant of english`)
    else if (csq.names.get(name) !== variant) out.push(`${name}: the table's ${variant}, csquotes.def's ${csq.names.get(name)}`)
  }
  // (but `default` and csquotes' style paths, `<style>/<variant>` (latin/britishquotes): no language's name)
  for (const [name, variant] of csq.names)
    if (name !== 'default' && !name.includes('/') && !Object.hasOwn(names, name)) out.push(`${name}: csquotes.def gives it ${variant}, the table does not hold it`)
  if (csq.names.get('default') !== fallback) out.push(`default: the table's ${fallback}, csquotes.def's ${csq.names.get('default') ?? 'none'}`)
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dirs = process.argv.slice(2)
  if (!dirs.length) {
    console.error('usage: node --import tsx lab/source/csquotes-styles.mjs <dir of csquotes.def and tuenc.def>…')
    process.exit(2)
  }
  const { CSQUOTES_DEFAULT, CSQUOTES_ENGLISH, CSQUOTES_NAMES } = await import(new URL('../../packages/engine/src/source/latex-front.ts', import.meta.url).href)
  let bad = 0
  for (const dir of dirs) {
    const found = differencesOf(
      { def: readFileSync(join(dir, 'csquotes.def'), 'utf8'), tuenc: readFileSync(join(dir, 'tuenc.def'), 'utf8') },
      { english: CSQUOTES_ENGLISH, names: CSQUOTES_NAMES, fallback: CSQUOTES_DEFAULT },
    )
    bad += found.length
    console.log(`${dir}: ${found.length ? `${found.length} differ` : `csquotes' English style and its ${Object.keys(CSQUOTES_NAMES).length} names are csquotes.def's`}`)
    for (const f of found) console.log(`  ${f}`)
  }
  process.exit(bad ? 1 : 0)
}
