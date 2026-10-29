// lab/pdf/spikes/tex-names-make.mjs
// The names TeX's own packages give a theorem's head and a generated reference in each target the readers offer, read from
// TeX Live's files and written to src/pdf-reader/engine/rules/tex-names.json (rules/tex-names.mjs reads it; PDF-READER §19.11).
// Nothing is written by hand: every name is a package's.
//   - a theorem-like head's name (\newtheorem's printed "Theorem", "Definition", …): the translator package's theorem
//     dictionaries (beamer's; ctex's ChineseUTF8 for zh), `\providetranslation{<English>}{<target>}`;
//   - a reference's name and its conjunctions (cleveref's \cref/\Cref, hyperref's \autoref): cleveref's language definitions
//     (\cref@addlanguagedefs{<language>}: \Crefname and \crefname by counter type, singular and plural, and the conjunctions),
//     paired with its english ones by counter type, number and conditional branch; hyperref's \HyLang@<language>
//     (\<type>autorefname), paired with \HyLang@english by macro; ctex's own zh names (ctex-name-utf8.cfg) by type;
//   - each English form's counter type (cleveref's english and hyperref's english), which a reader whose target has neither
//     reads babel's names by (the layout rules' labels: a float's, an appendix's), rules/tex-names.mjs.
// TeX's text is decoded by LaTeX's own tables (t1enc.dfu's and t2aenc.dfu's \DeclareUnicodeCharacter, read backwards: `\"U`
// Ü, `\cyri` и); a value holding anything else is left out, never guessed.
//
// The files are copied out of the compile image (the one layout/marks.mjs's compiles run in) once:
//   docker run --rm --network none -v <dir>:/out texlive/texlive:TL2025-historic@sha256:7056390eac37715fd3e01875037ceb4016cb17d44c611f7bbbfa7a012007979f \
//     sh -c 'cp $(kpsewhich cleveref.sty) $(kpsewhich hyperref.sty) $(kpsewhich t1enc.dfu) $(kpsewhich t2aenc.dfu) \
//       $(kpsewhich ctex-name-utf8.cfg) $(kpsewhich translator-theorem-dictionary-German.dict) \
//       $(kpsewhich translator-theorem-dictionary-French.dict) $(kpsewhich translator-theorem-dictionary-Spanish.dict) \
//       $(kpsewhich translator-theorem-dictionary-Russian.dict) $(kpsewhich translator-theorem-dictionary-Portuguese.dict) \
//       $(kpsewhich translator-theorem-dictionary-ChineseUTF8.dict) /out/; \
//       for l in Italian Dutch Polish Turkish Czech Swedish Bulgarian; do cp $(kpsewhich translator-theorem-dictionary-$l.dict) /out/; done'
//   node lab/pdf/spikes/tex-names-make.mjs <dir> [--check]
// --check compares with the file in the tree and exits 1 where they differ.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const IMAGE = 'texlive/texlive:TL2025-historic@sha256:7056390eac37715fd3e01875037ceb4016cb17d44c611f7bbbfa7a012007979f'
/** the table's licence, as docs/THIRD_PARTY.md registers it: LPPL 1.3c data throughout, each source taken under it */
const LICENCE = 'LPPL 1.3c: translator-theorem-dictionary-{German,French,Spanish,Russian,Portuguese,Italian,Dutch,Polish,Turkish,Czech,Swedish,Bulgarian}.dict (the translator package, taken under LPPL 1.3c); translator-theorem-dictionary-ChineseUTF8.dict and ctex-name-utf8.cfg (ctex, LPPL 1.3c); cleveref.sty (LPPL 1.2 or later, taken under LPPL 1.3c); hyperref.sty (LPPL 1.3 or later, taken under LPPL 1.3c); t1enc.dfu and t2aenc.dfu (LaTeX, LPPL 1.3c)'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/pdf-reader/engine/rules/tex-names.json')
const dir = process.argv[2]
if (!dir) { console.error('usage: tex-names-make.mjs <dir of TeX Live files> [--check]'); process.exit(2) }
const files = new Map()
const read = name => { const b = readFileSync(join(dir, name)); files.set(name, createHash('sha256').update(b).digest('hex')); return b.toString('utf8') }

/** each target: its cleveref language, hyperref's, translator's theorem dictionary (none where the package has none) */
const TARGETS = {
  zh: { translator: 'ChineseUTF8', ctex: true },
  'zh-TW': {},
  ja: {},
  ko: {},
  de: { cleveref: 'ngerman', hyperref: 'german', translator: 'German' },
  fr: { cleveref: 'french', hyperref: 'french', translator: 'French' },
  es: { cleveref: 'spanish', hyperref: 'spanish', translator: 'Spanish' },
  ru: { cleveref: 'russian', hyperref: 'russian', translator: 'Russian' },
  pt: { cleveref: 'brazilian', hyperref: 'portuges', translator: 'Portuguese' },
  // (the languages of the owner's ruling of 2026-10-29: each package's where it has the language; Indonesian and Malay none)
  it: { cleveref: 'italian', hyperref: 'italian', translator: 'Italian' },
  nl: { cleveref: 'dutch', hyperref: 'dutch', translator: 'Dutch' },
  pl: { translator: 'Polish' },
  tr: { translator: 'Turkish' },
  id: {},
  ms: {},
  cs: { translator: 'Czech' },
  sv: { cleveref: 'swedish', hyperref: 'swedish', translator: 'Swedish' },
  uk: { cleveref: 'ukrainian' },
  bg: { translator: 'Bulgarian' },
}

// ---- LaTeX's text, decoded by its own tables
const LICR = new Map()
for (const f of ['t1enc.dfu', 't2aenc.dfu']) for (const m of read(f).matchAll(/\\DeclareUnicodeCharacter\{([0-9A-F]{4,5})\}\{(.*)\}\s*$/gm)) {
  const key = licrKey(m[2].trim())
  if (key && !LICR.has(key)) LICR.set(key, String.fromCodePoint(Number.parseInt(m[1], 16)))
}
/** a LICR form's key: its command and, for an accent, its one-letter argument (`\"U` and `\"{U}` alike; `\c c`) */
function licrKey(s0) {
  // (`\@tabacckludge'e` is LaTeX's own spelling of `\'e`, whose accent \tabbing makes active: latex.ltx)
  const s = s0.replace(/^\\@tabacckludge(.)/, '\\$1')
  const m = /^\\([A-Za-z]+|[^A-Za-z])\s*(?:\{([A-Za-z]?)\}|([A-Za-z]))?$/.exec(s)
  if (!m) return null
  return `${m[1]}|${m[2] ?? m[3] ?? ''}`
}
/** a TeX value as text: LICR decoded, \nobreakspace and ~ a space, \- and \@ nothing, braces dropped; null where anything
 *  else stands in it */
function decode(s) {
  let out = '', i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '{' || c === '}') { i++; continue }
    if (c === '~') { out += ' '; i++; continue }
    if (c !== '\\') { out += c; i++; continue }
    const m = /^\\([A-Za-z]+|[^A-Za-z])/.exec(s.slice(i))
    const cmd = m[1]
    i += m[0].length
    if (cmd === 'nobreakspace' || cmd === ' ') { out += ' '; continue }
    if (cmd === '-' || cmd === '@' || cmd === '/') continue
    // an accent's argument: a letter, braced or not (after a control word, its spaces first)
    const rest = s.slice(i)
    const a = /^[A-Za-z]$/.test(cmd) || /^[A-Za-z]+$/.test(cmd) ? /^\s*(?:\{([A-Za-z])\}|([A-Za-z]))/.exec(rest) : /^(?:\{([A-Za-z])\}|([A-Za-z]))/.exec(rest)
    const arg = a ? (a[1] ?? a[2]) : ''
    if (arg && LICR.has(`${cmd}|${arg}`)) { out += LICR.get(`${cmd}|${arg}`); i += a[0].length; continue }
    if (LICR.has(`${cmd}|`)) { out += LICR.get(`${cmd}|`); if (/^[A-Za-z]+$/.test(cmd) && s[i] === ' ') i++; continue }
    return null
  }
  return out.normalize('NFC')
}

// ---- translator's theorem dictionaries
const dictOf = lang => {
  const out = {}
  for (const m of read(`translator-theorem-dictionary-${lang}.dict`).matchAll(/\\providetranslation\{([^{}]*)\}\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
    const v = decode(m[2])
    if (v) out[m[1]] = v
  }
  return out
}

// ---- cleveref's language definitions: by counter type, number (0 singular, 1 plural), capital (\Crefname) or not, and the
// conditional branch it is in (\if@cref@capitalise, \if@cref@abbrev: each \if's branch by its name and side)
const CLEVEREF = read('cleveref.sty')
function cleverefOf(lang) {
  const at = CLEVEREF.indexOf(`\\cref@addlanguagedefs{${lang}}{`)
  if (at < 0) throw new Error(`cleveref: no ${lang}`)
  // its body: to the brace that closes the definitions' group
  let depth = 0, end = at + `\\cref@addlanguagedefs{${lang}}`.length
  for (let j = end; j < CLEVEREF.length; j++) {
    const ch = CLEVEREF[j]
    if (ch === '\\') { j++; continue }
    if (ch === '%') { while (j < CLEVEREF.length && CLEVEREF[j] !== '\n') j++; continue }
    if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) { end = j; break }
  }
  const body = CLEVEREF.slice(at, end).replace(/%[^\n]*/g, '')
  const names = new Map(), conj = {}
  const path = []
  const tok = /\\(if@cref@[a-z]+|else|fi)(?![A-Za-z@])|\\([cC])refname\s*\{([A-Za-z]+)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}|\\renewcommand\s*\{?\\(cref[a-z]*conjunction)\}?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g
  for (const m of body.matchAll(tok)) {
    if (m[1]?.startsWith('if')) { path.push(`${m[1].slice(8)}+`); continue }
    if (m[1] === 'else') { const t = path.pop(); path.push(`${t.slice(0, -1)}-`); continue }
    if (m[1] === 'fi') { path.pop(); continue }
    if (m[6]) { const v = decode(m[7]); if (v !== null) conj[m[6]] = v; continue }
    const capital = m[2] === 'C', type = m[3]
    ;[m[4], m[5]].forEach((raw, n) => {
      const v = decode(raw)
      if (v) names.set(`${type}|${n}|${capital ? 'C' : 'c'}|${path.join('.')}`, v)
    })
  }
  return { names, conj }
}

// ---- hyperref's \autoref names
const HYPERREF = read('hyperref.sty')
function hyperrefOf(lang) {
  const m = new RegExp(`\\\\def\\\\HyLang@${lang}\\{([\\s\\S]*?)\\n\\}`).exec(HYPERREF)
  if (!m) throw new Error(`hyperref: no ${lang}`)
  const out = {}
  for (const d of m[1].matchAll(/\\def\\([A-Za-z]+)autorefname\{((?:[^{}]|\{[^{}]*\})*)\}/g)) { const v = decode(d[2]); if (v) out[d[1]] = v }
  return out
}

// ---- ctex's zh names (ctex-name-utf8.cfg: `figurename = <name> ,`), by the counter type they name
const CTEX_TYPES = { figurename: 'figure', tablename: 'table', appendixname: 'appendix', algorithmname: 'algorithm' }
const ctex = {}
for (const m of read('ctex-name-utf8.cfg').matchAll(/^\s*([a-z]+name)\s*=\s*([^,\n]+?)\s*,?\s*$/gm)) if (CTEX_TYPES[m[1]]) ctex[CTEX_TYPES[m[1]]] = m[2].trim()

// ---- the English side: each form cleveref's and hyperref's english print, its counter type, number and branch
const en = cleverefOf('english'), enAuto = hyperrefOf('english')
/** the English forms, form → [type, number, capital, path] (the first branch that prints it) */
const forms = new Map()
for (const [key, v] of en.names) if (!forms.has(v)) forms.set(v, key.split('|'))
const types = {}
for (const [v, [type]] of forms) types[v] = type
for (const [type, v] of Object.entries(enAuto)) types[v] ??= type
/** the English conjunctions as a reference prints them (cleveref's, \nobreakspace a space), each the macro that prints it */
const conjOf = {}
for (const [macro, v] of Object.entries(en.conj)) if (v.trim()) (conjOf[v] ??= []).push(macro)

const out = { note: 'generated by lab/pdf/spikes/tex-names-make.mjs from TeX Live files; do not edit by hand', licence: LICENCE, image: IMAGE, files: {}, types, conjunctions: Object.keys(conjOf).sort(), targets: {} }
for (const [to, t] of Object.entries(TARGETS)) {
  const heads = t.translator ? dictOf(t.translator) : {}
  const refs = {}, conj = {}
  if (t.cleveref) {
    const tg = cleverefOf(t.cleveref)
    for (const [form, [type, n, capital, path]] of forms) {
      // the target's form of the same command (\crefname, \Crefname) in the branches English's form is in that the target's
      // definitions test (german's has \if@cref@abbrev and no \if@cref@capitalise: English's lower-case "fig." of
      // capitalise-.abbrev+ is its "Abb." of abbrev+), the most of them first; else, for a capital form, its \Crefname
      const mine = new Set(path ? path.split('.') : [])
      const fits = [...tg.names.keys()].map(k => k.split('|')).filter(([t2, n2, c2, p2]) => t2 === type && n2 === n && c2 === capital && (p2 ? p2.split('.') : []).every(b => mine.has(b))).sort((a, b) => (b[3] ? b[3].split('.').length : 0) - (a[3] ? a[3].split('.').length : 0))
      const hit = fits.map(k => tg.names.get(k.join('|'))).find(Boolean) ?? (capital === 'C' || /^[A-Z]/.test(form) ? tg.names.get(`${type}|${n}|C|`) : undefined)
      if (hit) refs[form] = hit
    }
    for (const [v, macros] of Object.entries(conjOf)) { const tv = macros.map(m => tg.conj[m]).find(x => x?.trim()); if (tv) conj[v] = tv }
    // (hyperref names no Ukrainian: cleveref's alone)
    const auto = t.hyperref ? hyperrefOf(t.hyperref) : {}
    for (const [type, v] of Object.entries(enAuto)) if (auto[type] && refs[v] === undefined) refs[v] = auto[type]
  }
  if (t.ctex) for (const [form, [type]] of forms) if (ctex[type] && refs[form] === undefined) refs[form] = ctex[type]
  out.targets[to] = { heads, refs, conj }
}
// ---- what no package names in some target: each counter type's English \Crefname, singular (cleveref's english, outside its
// branches), and the conjunctions, where a target the readers offer has no word for it. A paper that generates references sends
// these to the translator once, as units of their own (source/paper-names.mjs; PDF-READER §19.14). Babel's names of a float and
// an appendix (the layout rules' labels, every target's) count as a target's words for those types' singulars (rules/tex-names.mjs
// refName: every form of them in a target whose names do not inflect, CJK's)
const UNINFLECTED = new Set(['zh', 'zh-TW', 'ja', 'ko']), BABEL_TYPES = new Set(['figure', 'table', 'appendix'])
const singular = {}
for (const [key, v] of en.names) { const [type, n, capital, path] = key.split('|'); if (n === '0' && capital === 'C' && path === '' && !(type in singular)) singular[type] = v }
const named = (to, word) => { const t = out.targets[to]; return !!(t.heads[word] || t.refs[word] || (BABEL_TYPES.has(types[word]) && (UNINFLECTED.has(to) || singular[types[word]] === word))) }
out.singular = singular
out.gaps = [...new Set(Object.values(singular))].filter(word => Object.keys(TARGETS).some(to => !named(to, word)))
// (a conjunction of punctuation alone, ", ", is the same in every target: no word to translate; a range's, \crefrange's " to ",
// is none either: a word alone that the translator reads with no numbers either side of it, "to", has no one sense to give)
out.conjunctionGaps = out.conjunctions.filter(c => /\p{L}/u.test(c) && !conjOf[c].every(m => /range/.test(m)) && Object.keys(TARGETS).some(to => !out.targets[to].conj[c]))
out.files = Object.fromEntries([...files].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
// (every character past ASCII written as its escape: the file holds no line of CJK, which the English gate would count)
const text = `${JSON.stringify(out, null, 1).replace(/[\u0080-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}\n`
if (process.argv.includes('--check')) {
  const was = readFileSync(OUT, 'utf8')
  if (was !== text) { console.error(`${OUT}: differs from what the files give`); process.exit(1) }
  console.log('same')
} else {
  writeFileSync(OUT, text)
  console.log(`${OUT}: ${Object.entries(out.targets).map(([k, v]) => `${k} ${Object.keys(v.heads).length}/${Object.keys(v.refs).length}/${Object.keys(v.conj).length}`).join(', ')}`)
}
