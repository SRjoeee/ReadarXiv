// What a paper's macros are, asked of TeX. The compile plan's first pass (the unmarked source) reads, at the document's
// start (LaTeX's `begindocument/end` hook, after every package's \AtBeginDocument code), an ask file this module writes:
// for every control sequence the source uses, TeX writes its \meaning — and LaTeX's internals of it, where it has them —
// to `<job>.axtdefs`, one record a line. The reader of the source then knows each command's parameters, its delimiters,
// whether it is \long or \protected, its body, a conditional's value at the document's start and an xparse command's
// argument specification as TeX holds them, instead of reading the paper's definitions with regexes.
//
// The file (`readarxiv-definitions 1`), one record a line, a name never holding a blank:
//   H readarxiv-definitions 1                 the header
//   M <name> <meaning>                        \meaning\<name>, or `undefined`
//   O <name> <meaning>                        LaTeX's internal of a command with an optional argument (\newcommand\x[n][d]{…}
//                                             makes \x \@protected@testopt\x\\x{d}; this is \\x's), where defined
//   R <name> <meaning>                        a robust command's internal (\DeclareRobustCommand\x: `\x␣`), where defined
//   S <name> <spec>                           an xparse (ltcmd) command's argument specification
//   C <name> <meaning>                        its code (`\<name>␣code`), one parameter an argument
//   END <count>                               the number of M records: a file without it was cut short
import { Catcodes, isCs, Lexer, type LexRules, type Token, texText } from './tokens.ts'

export const DEFINITIONS_FORMAT = 'readarxiv-definitions 1'

/** a command as TeX holds it */
export type Meaning =
  | { k: 'undefined' }
  /** a macro: its prefixes, its parameter text (`#1#2`, or with delimiters `#1.#2\end`), its body */
  | { k: 'macro'; long: boolean; protected: boolean; outer: boolean; params: string; body: string }
  /** anything else: a primitive (`\relax`, `\iftrue`), a register (`\count123`), a character (`\char"41`, `the letter A`) */
  | { k: 'other'; text: string }

export interface Definition {
  meaning: Meaning
  /** LaTeX's optional-argument internal (`\\x`) */
  opt?: Meaning
  /** the robust internal (`\x␣`) */
  robust?: Meaning
  /** ltcmd's argument specification */
  spec?: string
  /** an ltcmd command's code (`\x␣code`), its parameters one a specified argument */
  code?: Meaning
}

export interface Definitions {
  /** every name asked, by name (no backslash) */
  names: ReadonlyMap<string, Definition>
  /** whether the file was read to its END record */
  complete: boolean
}

export const NO_DEFINITIONS: Definitions = { names: new Map(), complete: false }

/** TeX writes a macro's prefixes one after another, a blank after the last: `\\protected\\long macro:` */
const PREFIX = /^(?:\\(?:long|protected|outer))+ /
/** a \meaning as TeX writes it */
export function meaningOf(text: string): Meaning {
  if (text === 'undefined') return { k: 'undefined' }
  const pre = PREFIX.exec(text)
  const rest = pre ? text.slice(pre[0].length) : text
  if (rest.startsWith('macro:')) {
    const arrow = rest.indexOf('->')
    if (arrow >= 0) {
      const prefixes = pre ? pre[0] : ''
      return {
        k: 'macro',
        long: prefixes.includes('\\long'),
        protected: prefixes.includes('\\protected'),
        outer: prefixes.includes('\\outer'),
        params: rest.slice(6, arrow),
        body: rest.slice(arrow + 2),
      }
    }
  }
  return { k: 'other', text }
}

/** the file TeX wrote, read */
export function readDefinitions(text: string): Definitions {
  const names = new Map<string, Definition>()
  let complete = false
  let header = false
  let count = 0
  for (const line of texText(text).split('\n')) {
    if (!line) continue
    if (line.startsWith('H ')) {
      header = line.slice(2) === DEFINITIONS_FORMAT
      continue
    }
    if (!header) continue
    if (line.startsWith('END ')) {
      complete = Number(line.slice(4)) === count
      continue
    }
    const kind = line[0]
    const sp = line.indexOf(' ', 2)
    const name = sp < 0 ? line.slice(2) : line.slice(2, sp)
    const value = sp < 0 ? '' : line.slice(sp + 1)
    if (kind === 'M') {
      count++
      names.set(name, { meaning: meaningOf(value) })
      continue
    }
    const d = names.get(name)
    if (!d) continue
    if (kind === 'O') d.opt = meaningOf(value)
    else if (kind === 'R') d.robust = meaningOf(value)
    else if (kind === 'S') d.spec = value
    else if (kind === 'C') d.code = meaningOf(value)
  }
  return { names, complete }
}

/** a name the ask file can carry in a brace group as it stands: letters, `@` and `*` (an environment's star), and a
 *  file's name in LaTeX's record of a package loaded (`ver@backref.sty`) */
const ASKABLE = /^[A-Za-z@*][A-Za-z0-9@*.-]*$/

/**
 * The ask file: TeX that writes `<job>.axtdefs` when it is read at `begindocument/end`. Every name once; names that cannot
 * stand in a group as they are (a control symbol, an expl3 name) are not asked. Read with `@` a letter; changes nothing
 * TeX sets: one write stream, its records, a group around its own definitions
 */
export function askFile(names: Iterable<string>): string {
  const list = [...new Set(names)].filter((n) => ASKABLE.test(n)).sort()
  return [
    '% readarxiv: the definitions the source reader asks of TeX (packages/engine/src/source/definitions.ts)',
    '\\makeatletter',
    '\\begingroup',
    '\\newlinechar=-1\\relax',
    '\\immediate\\openout15=\\jobname.axtdefs\\relax',
    `\\immediate\\write15{H ${DEFINITIONS_FORMAT}}%`,
    '\\count@=0\\relax',
    // (an ltcmd command's meaning begins `->\\__cmd_start`; asking another for its specification is an error)
    '\\edef\\axt@cmd{\\detokenize{->\\__cmd_start}}%',
    '\\def\\axt@ask#1{%',
    '  \\advance\\count@ 1\\relax',
    '  \\ifcsname #1\\endcsname',
    '    \\immediate\\write15{M #1 \\expandafter\\meaning\\csname #1\\endcsname}%',
    '    \\ifcsname\\expandafter\\string\\csname #1\\endcsname\\endcsname',
    '      \\immediate\\write15{O #1 \\expandafter\\meaning\\csname\\expandafter\\string\\csname #1\\endcsname\\endcsname}%',
    '    \\fi',
    '    \\ifcsname #1\\space\\endcsname',
    '      \\immediate\\write15{R #1 \\expandafter\\meaning\\csname #1\\space\\endcsname}%',
    '    \\fi',
    '    \\edef\\axt@m{\\expandafter\\meaning\\csname #1\\endcsname}%',
    '    \\edef\\axt@t{\\noexpand\\in@{\\axt@cmd}{\\axt@m}}\\axt@t',
    '    \\ifin@\\ifdefined\\GetDocumentCommandArgSpec',
    '      \\expandafter\\GetDocumentCommandArgSpec\\csname #1\\endcsname',
    '      \\immediate\\write15{S #1 \\detokenize\\expandafter{\\ArgumentSpecification}}%',
    '      \\immediate\\write15{C #1 \\expandafter\\meaning\\csname #1 code\\endcsname}%',
    '    \\fi\\fi',
    '  \\else',
    '    \\immediate\\write15{M #1 undefined}%',
    '  \\fi}%',
    ...list.map((n) => `\\axt@ask{${n}}%`),
    '\\immediate\\write15{END \\the\\count@}%',
    '\\immediate\\closeout15\\relax',
    '\\endgroup',
    '\\makeatother',
    '',
  ].join('\n')
}

/** the main file's name as TeX's \jobname has it */
export const jobName = (main: string): string => (main.split('/').pop() as string).replace(/\.[^.]+$/, '')

/** the source tree a paper is read from: its files by path, and its main file */
export interface Tree {
  main: string
  files: ReadonlyMap<string, Uint8Array>
}

const UTF8 = new TextDecoder('utf-8', { fatal: true })
const CP1252 = new TextDecoder('windows-1252')
/** a file's text as the reader reads it, lines ended at LF: UTF-8, or, a file that is not, the encoding the paper declares
 *  to inputenc (`cp1252`, `ansinew`), else Latin-1 (each byte its code point) */
export function fileText(bytes: Uint8Array, fallback: 'latin1' | 'cp1252' = 'latin1'): string {
  try {
    return texText(UTF8.decode(bytes))
  } catch {
    if (fallback === 'cp1252') return texText(CP1252.decode(bytes))
    let s = ''
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192))
    return texText(s)
  }
}

/** a path written as the tree holds it: no `./`, no empty or `.` part, `..` taken back */
export function normalizePath(p: string): string {
  const out: string[] = []
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

/** the tree's file TeX finds for `name` from the directories `dirs` (import.sty's, the last imported first) and then the
 *  root, where TeX runs: kpathsea tries `name.tex` before `name` where the name does not end in `.tex` */
export function findFile(tree: Tree, name: string, dirs: readonly string[] = []): string | null {
  for (const dir of [...dirs, '']) {
    const base = normalizePath(`${dir}/${name}`)
    for (const cand of base.endsWith('.tex') ? [base] : [`${base}.tex`, base]) if (tree.files.has(cand)) return cand
  }
  return null
}

/** the commands that read a file at their place, and how many arguments name it (import.sty's a directory first) */
export const INPUTS: ReadonlyMap<string, 'file' | 'import' | 'subimport' | 'subfile'> = new Map([
  ['input', 'file'],
  ['include', 'file'],
  ['import', 'import'],
  ['subimport', 'subimport'],
  ['inputfrom', 'import'],
  ['subinputfrom', 'subimport'],
  ['includefrom', 'import'],
  ['subincludefrom', 'subimport'],
  ['subfile', 'subfile'],
])

/**
 * The control sequences the source uses, in every file TeX reads from the main one on (\input and its kin followed, each
 * file once) and in every TeX file the package ships, and the environments it begins: what the ask file asks. With each environment `env`, `endenv` too. The
 * tokens are read as the reader reads them (`rules`), so that \verb's text and an environment read by lines hold no names
 */
export function namesUsed(tree: Tree, rules: LexRules, always: Iterable<string> = []): Set<string> {
  const names = new Set<string>(always)
  const seen = new Set<string>()
  // (every TeX file the package ships too, and the job's .bbl: a command defined or used only in one of them is asked)
  const queue: { path: string; dirs: string[] }[] = [
    { path: tree.main, dirs: [] },
    ...[...tree.files.keys()].filter((p) => /\.(?:tex|sty|cls|bbl)$/i.test(p)).sort().map((path) => ({ path, dirs: [] })),
  ]
  const codes = new Catcodes()
  while (queue.length) {
    const { path, dirs } = queue.shift() as { path: string; dirs: string[] }
    if (seen.has(path)) continue
    seen.add(path)
    const bytes = tree.files.get(path)
    if (!bytes) continue
    const lx = new Lexer(fileText(bytes), codes, rules)
    let prev: Token | null = null
    for (let t = lx.next(); t; t = lx.next()) {
      if (t.k !== 'cs') {
        if (t.k !== 'space' && t.k !== 'comment') prev = t
        continue
      }
      names.add(t.name)
      if (t.name === 'begin' || t.name === 'end') {
        const m = /^\s*\{([^{}\\%]+)\}/.exec(lx.text.slice(t.e, t.e + 200))
        if (m) {
          const env = (m[1] as string).trim()
          names.add(env)
          names.add(`end${env}`)
        }
      }
      const form = INPUTS.get(t.name)
      // (an \input after \def or \let names no file TeX reads there)
      if (form && !(isCs(prev, 'def') || isCs(prev, 'let'))) {
        const a = fileArgs(lx, form)
        for (const f of a) {
          const found = findFile(tree, f.name, f.dirs.length ? f.dirs : dirs)
          if (found) queue.push({ path: found, dirs: f.dirs.length ? f.dirs : dirs })
        }
      }
      prev = t
    }
  }
  return names
}

/** the file names an input command's arguments give, with the directories import.sty puts first */
export function fileArgs(
  lx: Lexer,
  form: 'file' | 'import' | 'subimport' | 'subfile',
): { name: string; dirs: string[] }[] {
  const t = lx.text
  const braced = (): string | null => {
    const m = /^[ \t]*\n?[ \t]*\{([^{}]*)\}/.exec(t.slice(lx.pos, lx.pos + 512))
    if (!m) return null
    lx.pos += m[0].length
    return (m[1] as string).trim()
  }
  if (form === 'file') {
    const m = /^[ \t]*\n?[ \t]*\{([^{}]*)\}/.exec(t.slice(lx.pos, lx.pos + 512))
    if (m) {
      lx.pos += m[0].length
      return [{ name: (m[1] as string).trim(), dirs: [] }]
    }
    const u = /^[ \t]+([^\s{}\\%]+) ?/.exec(t.slice(lx.pos, lx.pos + 512))
    if (!u) return []
    lx.pos += u[0].length
    return [{ name: u[1] as string, dirs: [] }]
  }
  if (form === 'subfile') {
    const a = braced()
    if (!a) return []
    const slash = a.lastIndexOf('/')
    return [{ name: a.slice(slash + 1), dirs: [a.slice(0, slash + 1)] }]
  }
  const dir = braced()
  const file = dir === null ? null : braced()
  return file === null || dir === null ? [] : [{ name: file, dirs: [dir] }]
}
