// kpathsea's search paths within the TeX Live tree, as BusyTeX's kpathsea computes them from texmf.cnf (TeX Live 2026's,
// which BusyTeX ships unchanged): for a program and a file format, the ordered path elements under texmf-dist, so that
// the index can choose among files of one name as TeX Live does (texk/kpathsea: tex-file.c init_path, cnf.c, expand.c,
// pathsearch.c). Only the elements in $TEXMF's distribution tree count: the others (the project's directory, the
// home, the local and variable trees) are not on the page's tree. Node only; build.mjs runs it.
export { inElement } from '../poc-site/tex-tree.mjs'

/** each format's path variables, in kpathsea's order of preference (tex-file.c, *_ENVS and INIT_FORMAT) */
export const FORMAT_VARS = {
  0: ['GFFONTS', 'GLYPHFONTS', 'TEXFONTS'], 1: ['PKFONTS', 'TEXPKS', 'GLYPHFONTS', 'TEXFONTS'], 2: ['GLYPHFONTS', 'TEXFONTS'],
  3: ['TFMFONTS', 'TEXFONTS'], 4: ['AFMFONTS', 'TEXFONTS'], 5: ['MFBASES', 'TEXMFINI'], 6: ['BIBINPUTS', 'TEXBIB'],
  7: ['BSTINPUTS'], 8: ['TEXMFCNF'], 9: ['TEXMFDBS'], 10: ['TEXFORMATS', 'TEXMFINI'], 11: ['TEXFONTMAPS', 'TEXFONTS'],
  12: ['MPMEMS', 'TEXMFINI'], 13: ['MFINPUTS'], 14: ['MFPOOL', 'TEXMFINI'], 15: ['MFTINPUTS'], 16: ['MPINPUTS'],
  17: ['MPPOOL', 'TEXMFINI'], 18: ['MPSUPPORT'], 19: ['OCPINPUTS'], 20: ['OFMFONTS', 'TEXFONTS'], 21: ['OPLFONTS', 'TEXFONTS'],
  22: ['OTPINPUTS'], 23: ['OVFFONTS', 'TEXFONTS'], 24: ['OVPFONTS', 'TEXFONTS'], 25: ['TEXPICTS', 'TEXINPUTS'],
  26: ['TEXINPUTS'], 27: ['TEXDOCS'], 28: ['TEXPOOL', 'TEXMFINI'], 29: ['TEXSOURCES'], 30: ['TEXPSHEADERS', 'PSHEADERS'],
  31: ['TRFONTS'], 32: ['T1FONTS', 'T1INPUTS', 'TEXFONTS', 'TEXPSHEADERS', 'PSHEADERS'], 33: ['VFFONTS', 'TEXFONTS'],
  34: ['TEXCONFIG'], 35: ['TEXINDEXSTYLE', 'INDEXSTYLE'], 36: ['TTFONTS', 'TEXFONTS'], 37: ['T42FONTS', 'TEXFONTS'],
  38: ['WEB2C'], 41: ['MISCFONTS', 'TEXFONTS'], 42: ['WEBINPUTS'], 43: ['CWEBINPUTS'], 44: ['ENCFONTS', 'TEXFONTS'],
  45: ['CMAPFONTS', 'TEXFONTS'], 46: ['SFDFONTS', 'TEXFONTS'], 47: ['OPENTYPEFONTS', 'TEXFONTS'], 48: ['PDFTEXCONFIG'],
  49: ['LIGFONTS', 'TEXFONTS'], 50: ['TEXMFSCRIPTS'], 51: ['LUAINPUTS'], 52: ['FONTFEATURES'], 53: ['FONTCIDMAPS'],
  54: ['MLBIBINPUTS', 'BIBINPUTS', 'TEXBIB'], 55: ['MLBSTINPUTS', 'BSTINPUTS'], 56: ['CLUAINPUTS'], 57: ['RISINPUTS'],
  58: ['BLTXMLINPUTS'],
}
/** formats whose variable is the program's own (tex-file.c: program_text, program_binary): <PROGNAME>INPUTS, else
 *  `$TEXMF/<progname>//` */
const PROGRAM_FORMATS = new Set([39, 40])

/**
 * The programs BusyTeX runs, by the name the pipeline gives them, with the kpathsea program name and engine they
 * set: xdvipdfmx says it is dvipdfmx (dvipdfmx.c: "we pretend to be dvipdfmx for kpse purposes")
 */
export const PROGRAMS = {
  pdflatex: { progname: 'pdflatex', engine: 'pdftex' },
  xelatex: { progname: 'xelatex', engine: 'xetex' },
  luahblatex: { progname: 'luahblatex', engine: 'luahbtex' },
  lualatex: { progname: 'lualatex', engine: 'luatex' },
  bibtex8: { progname: 'bibtex8', engine: '' },
  makeindex: { progname: 'makeindex', engine: '' },
  xdvipdfmx: { progname: 'dvipdfmx', engine: '' },
}

/** texmf.cnf → Map name → [{ program: string | null, value }], in the file's order (kpathsea takes the first) */
export function parseCnf(text) {
  const vars = new Map()
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    while (/\\\s*$/.test(line) && i + 1 < lines.length) line = line.replace(/\\\s*$/, '') + lines[++i]
    line = line.replace(/^\s+/, '')
    if (!line || line.startsWith('%') || line.startsWith('#')) continue
    const m = /^([A-Za-z0-9_-]+)(?:\.([A-Za-z0-9_-]+))?\s*=\s*(.*?)\s*$/.exec(line)
    if (!m) continue
    const value = m[3].replace(/\s+%.*$/, '')
    if (!vars.has(m[1])) vars.set(m[1], [])
    vars.get(m[1]).push({ program: m[2] ?? null, value })
  }
  return vars
}

/** a variable's value for a program: NAME.progname first, then NAME (cnf.c), the first definition of each */
function cnfValue(vars, name, progname) {
  const defs = vars.get(name)
  if (!defs) return null
  return (defs.find(d => d.program === progname) ?? defs.find(d => d.program === null))?.value ?? null
}

const ROOT = '\u0001'
const NONE = '\u0002'
/** the variables that name the distribution tree, and those that name places not on the page's tree */
const TREE_VARS = new Set(['TEXMF', 'TEXMFDIST', 'TEXMFMAIN'])
const OTHER_VARS = /^(TEXMFDOTDIR|TEXMFHOME|TEXMFVAR|TEXMFCONFIG|TEXMFLOCAL|TEXMFSYSVAR|TEXMFSYSCONFIG|TEXMFAUXTREES|TEXMFROOT|VARTEXFONTS|OSFONTDIR|SELFAUTO\w*|HOME)$/

/** `$VAR` and `${VAR}` expanded, recursively; $TEXMF stands for the tree's root (expand.c) */
function expandVars(vars, value, progname, engine, depth = 0) {
  if (depth > 20) return value
  return value.replace(/\$(?:\{([A-Za-z0-9_]+)\}|([A-Za-z0-9_]+))/g, (_, a, b) => {
    const name = a ?? b
    if (TREE_VARS.has(name)) return ROOT
    if (name === 'progname') return progname
    if (name === 'engine') return engine
    if (OTHER_VARS.test(name)) return NONE
    const v = cnfValue(vars, name, progname)
    return v == null ? '' : expandVars(vars, v, progname, engine, depth + 1)
  })
}

/** one path element's brace expansion: `a{b,c{d,}}e` → [abe, acde, ace] (expand.c brace_expand) */
export function braces(s) {
  const open = s.indexOf('{')
  if (open < 0) return [s]
  let depth = 0, close = -1
  const commas = []
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}' && --depth === 0) { close = i; break }
    else if (s[i] === ',' && depth === 1) commas.push(i)
  }
  if (close < 0) return [s]
  const head = s.slice(0, open), tail = s.slice(close + 1)
  const parts = []
  let from = open + 1
  for (const c of [...commas, close]) { parts.push(s.slice(from, c)); from = c + 1 }
  return parts.flatMap(p => braces(head + p + tail))
}

/** a path string split at its separators (';' or ':') outside braces */
function elements(path) {
  const out = []
  let depth = 0, from = 0
  for (let i = 0; i < path.length; i++) {
    if (path[i] === '{') depth++
    else if (path[i] === '}') depth--
    else if ((path[i] === ';' || path[i] === ':') && depth === 0) { out.push(path.slice(from, i)); from = i + 1 }
  }
  out.push(path.slice(from))
  return out
}

/**
 * The ordered path elements under texmf-dist for `format` as `program` (one of PROGRAMS, or another name) searches it:
 * patterns relative to the tree, a trailing `//` for "and every directory below" (kpathsea's `//`)
 */
export function searchPath(vars, format, program) {
  const { progname, engine } = PROGRAMS[program] ?? { progname: program, engine: '' }
  let raw = null
  const names = PROGRAM_FORMATS.has(format) ? [`${progname.toUpperCase()}INPUTS`] : (FORMAT_VARS[format] ?? [])
  for (const name of names) {
    raw = cnfValue(vars, name, progname)
    if (raw != null) break
  }
  if (raw == null && PROGRAM_FORMATS.has(format)) raw = `.;$TEXMF/${progname}//`
  if (raw == null) return []
  const out = []
  for (const element of elements(expandVars(vars, raw, progname, engine))) {
    for (let e of braces(element.trim())) {
      if (e.startsWith('!!')) e = e.slice(2)
      if (e.includes(NONE) || !e.startsWith(ROOT)) continue
      const rel = e.slice(ROOT.length).replace(/^\/+/, '').replace(/\/{3,}/g, '//')
      if (!out.includes(rel)) out.push(rel)
    }
  }
  return out
}

/** the order of directories in ls-R (mktexlsr: `ls -R`, the C locale): a directory before its subdirectories, siblings
 *  sorted bytewise — kpathsea's database lists a name's directories in this order */
export function lsrCompare(a, b) {
  if (a === b) return 0
  const x = a ? a.split('/') : [], y = b ? b.split('/') : []
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
  return x.length - y.length
}

/**
 * Every format's search path for every program of PROGRAMS → { format: { '*': elements, program: elements } }: '*' is
 * a program BusyTeX does not run (named busytex), and a program is listed only where its elements differ from '*'
 */
export function searchPaths(vars) {
  const out = {}
  for (const format of [...Object.keys(FORMAT_VARS).map(Number), ...PROGRAM_FORMATS].sort((a, b) => a - b)) {
    const any = searchPath(vars, format, 'busytex')
    const byProgram = { '*': any }
    for (const program of Object.keys(PROGRAMS)) {
      const own = searchPath(vars, format, program)
      if (JSON.stringify(own) !== JSON.stringify(any)) byProgram[program] = own
    }
    if (any.length || Object.keys(byProgram).length > 1) out[format] = byProgram
  }
  return out
}
