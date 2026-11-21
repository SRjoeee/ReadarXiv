// lab/marks/babel-names.mjs: the babel names the layout marks wrap, held to babel's own files in a TeX tree. They mirror babel's
// definition (design 3c's second kind of list: the list names the file it copies, and a check reads that file in the tree a
// paper is compiled on): packages/engine/src/marks/names.ts NAME_KEYS, each a key of babel's English locale's [captions]
// (tex/generic/babel/locale/en/babel-en.ini), and NAME_ENGLISH, each key's value there; marks.ts NAME_MACROS, each key's macro as
// babel.sty's \bbl@ini@captions@aux defines it from the key (`\SetString\<\bbl@tempa name>`: the key, then `name`). A key the
// lists hold and babel's file lacks, a value or a macro that is not babel's, fails; a key of babel's the lists leave out
// (`chapter` and `part`, whose CJK names are templates around the number, names.ts) is no difference.
// The two files are copied out of each pinned compile image (lab/pdf/compile-images.json) by the release check's
// `babel-names` gate (lab/release-check/gates.mjs):
//   docker run --rm --network none -v <dir>:/out <image> sh -c 'cp "$(kpsewhich babel-en.ini)" "$(kpsewhich babel.sty)" /out/'
//   node --import tsx lab/marks/babel-names.mjs <dir>…   exit 0: every directory's files hold the lists; 1: a difference, each
//   printed; 2: usage
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** the line of babel.sty's \bbl@ini@captions@aux that names a [captions] key's macro: the key, then `name` */
export const MACRO_RULE = '\\SetString\\<\\bbl@tempa name>'

/** an ini file's [captions] section as key → value, its keys and values trimmed; a comment (`;`) or a blank line is none */
export function captionsOf(ini) {
  const out = new Map()
  let inside = false
  for (const raw of ini.split(/\r?\n/)) {
    const line = raw.trim()
    if (/^\[.*\]$/.test(line)) {
      inside = line === '[captions]'
      continue
    }
    if (!inside || !line || line.startsWith(';')) continue
    const eq = line.indexOf('=')
    if (eq > 0) out.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim())
  }
  return out
}

/** what differs between the lists (`keys`, `english` by key, `macros` by key) and babel's files (`ini`, babel-en.ini's text;
 *  `sty`, babel.sty's): one sentence each, none where they agree */
export function differencesOf({ ini, sty }, { keys, english, macros }) {
  const captions = captionsOf(ini)
  const out = []
  if (!captions.size) out.push("babel-en.ini: no [captions] section")
  const rule = sty.includes(MACRO_RULE)
  if (!rule) out.push(`babel.sty: no ${MACRO_RULE}, the line that names a key's macro`)
  for (const k of keys) {
    if (!captions.has(k)) {
      out.push(`${k}: NAME_KEYS holds it, babel-en.ini's [captions] does not`)
      continue
    }
    if (english[k] !== captions.get(k)) out.push(`${k}: NAME_ENGLISH ${JSON.stringify(english[k])}, babel-en.ini ${JSON.stringify(captions.get(k))}`)
    if (rule && macros[k] !== `${k}name`) out.push(`${k}: NAME_MACROS ${JSON.stringify(macros[k])}, babel.sty's \\${k}name`)
  }
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dirs = process.argv.slice(2)
  if (!dirs.length) {
    console.error('usage: node --import tsx lab/marks/babel-names.mjs <dir of babel-en.ini and babel.sty>…')
    process.exit(2)
  }
  const { NAME_ENGLISH, NAME_KEYS } = await import(new URL('../../packages/engine/src/marks/names.ts', import.meta.url).href)
  const { NAME_MACROS } = await import(new URL('../../packages/engine/src/marks/marks.ts', import.meta.url).href)
  let bad = 0
  for (const dir of dirs) {
    const found = differencesOf(
      { ini: readFileSync(join(dir, 'babel-en.ini'), 'utf8'), sty: readFileSync(join(dir, 'babel.sty'), 'utf8') },
      { keys: NAME_KEYS, english: NAME_ENGLISH, macros: NAME_MACROS },
    )
    bad += found.length
    console.log(`${dir}: ${found.length ? `${found.length} differ` : `the ${NAME_KEYS.length} names are babel's`}`)
    for (const f of found) console.log(`  ${f}`)
  }
  process.exit(bad ? 1 : 0)
}
