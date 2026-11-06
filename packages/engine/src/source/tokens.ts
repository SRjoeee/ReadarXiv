// The one tokenizer of TeX source: TeX's eyes and mouth as far as a reader needs them (The TeXbook, ch. 7 and 8). Every
// reader of the source asks it what a comment, a group, a control sequence, a verbatim region or a line end is; none scans
// characters of its own. It reads one file's text (lines already ended at LF: `texText`) under a table of category codes
// that the text itself changes where TeX would (`\makeatletter`, `\catcode`, `\ExplSyntaxOn`, a group's end restoring what the
// group changed), and hands out tokens with their source offsets, so that a piece's source is always a slice of the file.
//
// Two readings are the reader's to ask for, because only it knows when TeX reads that way: a brace group read as an argument
// before anything inside it is read (`group`, the tokens as TeX holds them: a `%` inside is a comment), and a group read with
// `%` a character (`rawGroup`: \url's argument where TeX reads it from the file). Three readings are the tokenizer's own,
// because they are lexical wherever they stand in a paper that compiles: a \verb-like command's text up to its delimiter (or
// the line's end, or the file's), and an environment read by lines up to its `\end{name}`.

/** TeX's category codes (The TeXbook p. 37) */
export const CAT = {
  escape: 0,
  begin: 1,
  end: 2,
  math: 3,
  align: 4,
  eol: 5,
  param: 6,
  sup: 7,
  sub: 8,
  ignored: 9,
  space: 10,
  letter: 11,
  other: 12,
  active: 13,
  comment: 14,
  invalid: 15,
} as const

export type Token =
  /** a control word or a control symbol: `name` without its backslash (a control space's name is ' ') */
  | { k: 'cs'; s: number; e: number; name: string }
  /** a letter (category 11), or one character of another category that TeX passes on as a character token: one
   *  character each, as TeX's tokens are, so that an undelimited argument of one character (`\cmd x`) ends between two */
  | { k: 'letter'; s: number; e: number }
  | { k: 'char'; s: number; e: number; cat: number; ch: string }
  /** blanks with at most one line end between them; `skipped`: TeX makes no token of them (after a control word, at a
   *  line's start, after a space) */
  | { k: 'space'; s: number; e: number; skipped?: true }
  /** a line end and one empty line or more after it: TeX's \par */
  | { k: 'par'; s: number; e: number }
  /** `%` to its line's end, with the line end */
  | { k: 'comment'; s: number; e: number }
  /** a \verb-like command whole: its text from `body` to `bodyEnd`; `ended` how it ended (its delimiter, the line's end, as
   *  LaTeX ends it with an error, or the file's end) */
  | {
      k: 'verb'
      s: number
      e: number
      name: string
      body: number
      bodyEnd: number
      ended: 'delimiter' | 'line' | 'file'
    }
  /** an environment read by lines, from its `\begin{env}` to and with its `\end{env}` (or the file's end) */
  | { k: 'verbatim'; s: number; e: number; env: string; body: number; bodyEnd: number }
  /** a brace group read with every character a character but braces and a backslash pair (`rawGroup`) */
  | { k: 'raw'; s: number; e: number }

/** a category-code table; copied on write, so that a saved state is a reference */
class Codes {
  readonly ascii: Uint8Array
  readonly wide: ReadonlyMap<number, number>
  constructor(ascii: Uint8Array, wide: ReadonlyMap<number, number>) {
    this.ascii = ascii
    this.wide = wide
  }
  get(code: number): number {
    if (code < 128) return this.ascii[code] as number
    return this.wide.get(code) ?? CAT.letter
  }
  with(code: number, cat: number): Codes {
    if (code < 128) {
      const a = this.ascii.slice()
      a[code] = cat
      return new Codes(a, this.wide)
    }
    const w = new Map(this.wide)
    w.set(code, cat)
    return new Codes(this.ascii, w)
  }
}

/** LaTeX's codes in a document (latex.ltx): `\` 0, `{` 1, `}` 2, `$` 3, `&` 4, `#` 6, `^` 7, `_` 8, NUL 9, space and tab 10,
 *  letters 11, `~` 13, `%` 14, DEL 15, the rest 12. A character past ASCII is a letter: what it sets is a letter or a symbol
 *  of the text, never syntax (inputenc's active bytes set characters too) */
function latexCodes(): Codes {
  const a = new Uint8Array(128).fill(CAT.other)
  for (let c = 65; c <= 90; c++) a[c] = CAT.letter
  for (let c = 97; c <= 122; c++) a[c] = CAT.letter
  a[92] = CAT.escape
  a[123] = CAT.begin
  a[125] = CAT.end
  a[36] = CAT.math
  a[38] = CAT.align
  a[10] = CAT.eol
  a[35] = CAT.param
  a[94] = CAT.sup
  a[95] = CAT.sub
  a[0] = CAT.ignored
  a[32] = CAT.space
  a[9] = CAT.space
  a[126] = CAT.active
  a[37] = CAT.comment
  a[127] = CAT.invalid
  return new Codes(a, new Map())
}

/** The category codes in force, group by group: a group's changes end with it, as TeX's (\begingroup … \endgroup too) */
export class Catcodes {
  private stack: Codes[]
  private expl: Codes[] = []
  constructor(from?: Catcodes) {
    this.stack = from ? [...from.stack] : [latexCodes()]
  }
  /** the table now; a state to come back to */
  get now(): Codes {
    return this.stack[this.stack.length - 1] as Codes
  }
  cat(code: number): number {
    return this.now.get(code)
  }
  set(code: number, cat: number): void {
    this.stack[this.stack.length - 1] = this.now.with(code, cat)
  }
  push(): void {
    this.stack.push(this.now)
  }
  pop(): void {
    if (this.stack.length > 1) this.stack.pop()
  }
  /** expl3's syntax (expl3.dtx \ExplSyntaxOn): `_` and `:` letters, blanks ignored, `~` a space */
  explOn(): void {
    this.expl.push(this.now)
    let t = this.now
    for (const [c, k] of [
      [95, CAT.letter],
      [58, CAT.letter],
      [32, CAT.ignored],
      [9, CAT.ignored],
      [126, CAT.space],
    ] as const)
      t = t.with(c, k)
    this.stack[this.stack.length - 1] = t
  }
  explOff(): void {
    const t = this.expl.pop()
    if (t) this.stack[this.stack.length - 1] = t
  }
  /** a saved state, and the way back to it */
  save(): { stack: Codes[]; expl: Codes[] } {
    return { stack: [...this.stack], expl: [...this.expl] }
  }
  restore(s: { stack: Codes[]; expl: Codes[] }): void {
    this.stack = [...s.stack]
    this.expl = [...s.expl]
  }
}

/** What the reader tells the tokenizer about the paper: which commands read their text as \verb does, and which
 *  environments are read by lines. Both are the reader's facts (its table of kinds and the paper's definitions) */
export interface LexRules {
  /** `verb`: \verb's form (a delimiter); `listing`: listings' and minted's inline code (`[keys]`, minted a `{language}`,
   *  then a delimiter or a brace group) */
  inline(name: string): 'verb' | 'listing' | 'minted' | null
  lineEnv(name: string): boolean
  /** commands that read their argument with `%` a character where TeX reads it from the file (url.sty's \url); the
   *  tokenizer reads it so at the file's top level, in no group, where no command can have read it as an argument first */
  raw?(name: string): boolean
}

const NO_RULES: LexRules = { inline: () => null, lineEnv: () => false }

type State = 'N' | 'M' | 'S'
/** a place in the text the tokenizer can come back to */
export type Mark = { pos: number; state: State; codes: ReturnType<Catcodes['save']> }

/**
 * A file's tokens, one at a time. `next` reads the next token as TeX's eyes would; `group` reads a balanced brace group as
 * TeX reads an argument; `rawGroup` a group as url.sty reads its argument from the file. No recursion anywhere: a group's
 * depth is a counter.
 */
export class Lexer {
  pos = 0
  private state: State = 'N'
  /** whether \endinput was read: the file ends at the end of the line it stands on */
  private stopAt = -1
  /** the brace depth from the file's start, and whether a command that reads its argument raw was just read there */
  private depth = 0
  private raw = false
  readonly text: string
  readonly codes: Catcodes
  readonly rules: LexRules
  constructor(text: string, codes: Catcodes = new Catcodes(), rules: LexRules = NO_RULES, start = 0) {
    this.text = text
    this.codes = codes
    this.rules = rules
    this.pos = start
  }
  get end(): number {
    return this.stopAt >= 0 ? Math.min(this.stopAt, this.text.length) : this.text.length
  }
  mark(): Mark {
    return { pos: this.pos, state: this.state, codes: this.codes.save() }
  }
  reset(m: Mark): void {
    this.pos = m.pos
    this.state = m.state
    this.codes.restore(m.codes)
  }
  /** \endinput: TeX reads the rest of the line it stands on, then no more of the file */
  endInput(): void {
    const nl = this.text.indexOf('\n', this.pos)
    this.stopAt = nl < 0 ? this.text.length : nl + 1
  }
  private cat(i: number): number {
    return this.codes.cat(this.text.charCodeAt(i))
  }
  /** the character at `i` as TeX reads it: `^^` and two lower-case hex digits, or `^^` and a character of code < 128 (its
   *  code ± 64), stand for one character (The TeXbook p. 45); [code, length] */
  private charAt(i: number): [number, number] {
    const t = this.text
    const c = t.charCodeAt(i)
    if (this.codes.cat(c) === CAT.sup && t.charCodeAt(i + 1) === c && i + 2 < this.end) {
      const h = /^[0-9a-f]{2}/.exec(t.slice(i + 2, i + 4))
      if (h) return [Number.parseInt(h[0], 16), 4]
      const d = t.charCodeAt(i + 2)
      if (d < 128) return [d < 64 ? d + 64 : d - 64, 3]
    }
    const cp = t.codePointAt(i) as number
    return [cp, cp > 0xffff ? 2 : 1]
  }

  /** the next token, or null at the file's end */
  next(): Token | null {
    const t = this.text
    const end = this.end
    if (this.pos >= end) return null
    const s = this.pos
    if (this.raw) {
      const c = this.cat(s)
      if (c === CAT.begin) {
        this.raw = false
        const r = this.rawGroup()
        if (r) return r
      } else if (c !== CAT.space) this.raw = false
    }
    const [code, len] = this.charAt(s)
    // (a line end the text writes in ^^ notation, ^^J or ^^M, is no line of the file: a character of the text; LaTeX's own
    // uses of them are \typeout's and \newlinechar's)
    const cat = len >= 3 && (code === 10 || code === 13) ? CAT.other : this.codes.cat(code)
    switch (cat) {
      case CAT.eol: {
        // a line end: in mid-line a space, at a line's start (or after blanks there) \par, after a space nothing
        const blank = this.blankLines(s)
        if (blank > s) {
          this.pos = blank
          this.state = 'N'
          return { k: 'par', s, e: blank }
        }
        if (this.state === 'N') {
          this.pos = s + 1
          return { k: 'par', s, e: s + 1 }
        }
        // the blanks that begin the next line are TeX's skipped indent, taken with this line end
        let k = s + 1
        while (k < end && this.cat(k) === CAT.space) k++
        const skipped = this.state === 'S'
        this.pos = k
        this.state = 'N'
        return skipped ? { k: 'space', s, e: k, skipped: true } : { k: 'space', s, e: k }
      }
      case CAT.space:
      case CAT.ignored: {
        let k = s + 1
        while (k < end && (this.cat(k) === CAT.space || this.cat(k) === CAT.ignored)) k++
        const skipped = this.state !== 'M' || cat === CAT.ignored
        // at a line's start, TeX's skipped indent: a line end after it is the next token's (an empty line: \par)
        if (this.state === 'N') {
          this.pos = k
          return { k: 'space', s, e: k, skipped: true }
        }
        // a line end after them: one space with the next line's indent; a blank line after them: they end here, and the
        // line end is \par's
        let state: State = 'S'
        if (k < end && this.cat(k) === CAT.eol && this.blankLines(k) === k) {
          k++
          while (k < end && this.cat(k) === CAT.space) k++
          state = 'N'
        }
        this.pos = k
        this.state = state
        return skipped ? { k: 'space', s, e: k, skipped: true } : { k: 'space', s, e: k }
      }
      case CAT.comment: {
        const nl = t.indexOf('\n', s)
        const e = nl < 0 || nl >= end ? end : nl + 1
        this.pos = e
        this.state = 'N'
        return { k: 'comment', s, e }
      }
      case CAT.escape:
        return this.controlSequence(s, len)
      case CAT.letter: {
        this.pos = s + len
        this.state = 'M'
        return { k: 'letter', s, e: s + len }
      }
      default: {
        this.pos = s + len
        this.state = 'M'
        if (cat === CAT.begin) {
          this.codes.push()
          this.depth++
        } else if (cat === CAT.end) {
          this.codes.pop()
          this.depth = Math.max(0, this.depth - 1)
        }
        return { k: 'char', s, e: s + len, cat: cat === CAT.invalid ? CAT.other : cat, ch: String.fromCodePoint(code) }
      }
    }
  }

  /** where a run of empty lines after the line end at `s` ends (after the last one's line end), or `s` where the next line
   *  is not empty */
  private blankLines(s: number): number {
    const t = this.text
    const end = this.end
    let last = s
    let k = s + 1
    for (;;) {
      while (k < end && (t[k] === ' ' || t[k] === '\t')) k++
      if (k < end && t[k] === '\n') {
        last = k + 1
        k++
        continue
      }
      break
    }
    return last
  }

  private controlSequence(s: number, len: number): Token {
    const end = this.end
    let k = s + len
    if (k >= end) {
      this.pos = end
      this.state = 'M'
      return { k: 'cs', s, e: end, name: '' }
    }
    const [c1, l1] = this.charAt(k)
    let name: string
    if (c1 < 128 && this.codes.cat(c1) === CAT.letter) {
      // a control word: its letters (ASCII ones: a name is ASCII in every engine the corpus uses)
      let n = ''
      while (k < end) {
        const [c, l] = this.charAt(k)
        if (c >= 128 || this.codes.cat(c) !== CAT.letter) break
        n += String.fromCharCode(c)
        k += l
      }
      name = n
      this.pos = k
      this.state = 'S'
    } else {
      name = String.fromCodePoint(c1)
      k += l1
      this.pos = k
      // a control space leaves TeX skipping blanks; a backslash at a line's end (`\^^M`, a control space too) ends the line;
      // any other control symbol, mid-line
      const c = this.codes.cat(c1)
      this.state = c === CAT.eol ? 'N' : c === CAT.space ? 'S' : 'M'
    }
    const tok: Token = { k: 'cs', s, e: k, name }
    return this.lexical(tok) ?? tok
  }

  /** what a control sequence does to the reading itself: category changes, \verb-like text, environments read by lines */
  private lexical(tok: Token & { k: 'cs' }): Token | null {
    const name = tok.name
    switch (name) {
      case 'makeatletter':
        this.codes.set(64, CAT.letter)
        return null
      case 'makeatother':
        this.codes.set(64, CAT.other)
        return null
      case 'ExplSyntaxOn':
        this.codes.explOn()
        return null
      case 'ExplSyntaxOff':
        this.codes.explOff()
        return null
      // (\begingroup and \endgroup bound TeX's changes too, but they stand unpaired in definitions' bodies, which a reader
      // does not run: only braces, which a body's own pair, bound the changes the tokenizer makes)
      case 'catcode':
        this.catcodeAssignment()
        return null
      case 'begin':
        return this.lineEnvironment(tok)
    }
    const inline = this.rules.inline(name)
    if (!inline && this.depth === 0 && this.rules.raw?.(name)) this.raw = true
    return inline ? this.inlineCode(tok, inline) : null
  }

  /** `\catcode<number>=<number>` where both are written out (a character constant, decimal, `"` hex, `'` octal; the value
   *  also \active, \other, \letter): TeX's assignment, made now. One whose numbers are not literal (`\catcode`#1`, a
   *  register) changes nothing the reader can know */
  private catcodeAssignment(): void {
    const t = this.text
    const m =
      /^[ \t]*(?:`(?:\\(.)|(.))|(\d+)|"([0-9A-F]+)|'([0-7]+))[ \t]*=?[ \t]*(?:(\d+)|\\(active|other|letter|escape)(?![A-Za-z@]))/.exec(
        t.slice(this.pos, this.pos + 40),
      )
    if (!m) return
    const ch = m[1] ?? m[2]
    const code =
      ch !== undefined
        ? ch.charCodeAt(0)
        : m[3] !== undefined
          ? Number(m[3])
          : m[4] !== undefined
            ? Number.parseInt(m[4], 16)
            : Number.parseInt(m[5] as string, 8)
    const named = { active: CAT.active, other: CAT.other, letter: CAT.letter, escape: CAT.escape } as const
    const value = m[6] !== undefined ? Number(m[6]) : named[m[7] as keyof typeof named]
    if (!(value >= 0 && value <= 15)) return
    this.pos += m[0].length
    this.state = 'S'
    this.codes.set(code, value)
  }

  /** `\begin{env}` of an environment read by lines: the whole environment one token, to the first `\end{env}` as the
   *  line reader finds it (verbatim.sty and latex.ltx's \@xverbatim match the characters `\end{env}`), or the file's end */
  private lineEnvironment(tok: Token & { k: 'cs' }): Token | null {
    const t = this.text
    const m = /^[ \t]*\{([^{}\\%\n]+)\}/.exec(t.slice(tok.e, tok.e + 200))
    if (!m) return null
    const env = (m[1] as string).trim()
    if (!this.rules.lineEnv(env)) return null
    const body = tok.e + m[0].length
    const close = `\\end{${env}}`
    const at = t.indexOf(close, body)
    const bodyEnd = at < 0 || at >= this.end ? this.end : at
    const e = at < 0 || at >= this.end ? this.end : at + close.length
    this.pos = e
    this.state = 'M'
    return { k: 'verbatim', s: tok.s, e, env, body, bodyEnd }
  }

  /** a \verb-like command's text read as it reads it: \verb (and a star) then any character as its delimiter, up to that
   *  character again; listings' \lstinline[keys] and minted's \mintinline[opts]{language} then a delimiter or a brace group.
   *  LaTeX makes a line end inside \verb's text end it (with an error), and the file's end ends it too */
  private inlineCode(tok: Token & { k: 'cs' }, form: 'verb' | 'listing' | 'minted'): Token {
    const t = this.text
    const end = this.end
    let k = tok.e
    if (form === 'verb') {
      if (t[k] === '*') k++
    } else {
      // (blanks before the options: the reader's skipping of spaces before an argument)
      const opt = /^[ \t]*\[[^\]\n]*\]/.exec(t.slice(k, k + 400))
      if (opt) k += opt[0].length
      if (form === 'minted') {
        const lang = /^[ \t]*\{[^{}\n]*\}/.exec(t.slice(k, k + 200))
        if (lang) k += lang[0].length
      }
    }
    if (k >= end) return this.verbToken(tok, k, k, end, 'file')
    const d = t[k] as string
    const body = k + 1
    if (form !== 'verb' && d === '{') {
      // a brace group, braces counted
      let depth = 1
      for (let j = body; j < end; j++) {
        const c = t[j]
        if (c === '{') depth++
        else if (c === '}' && --depth === 0) return this.verbToken(tok, body, j, j + 1, 'delimiter')
        else if (c === '\n') return this.verbToken(tok, body, j, j, 'line')
      }
      return this.verbToken(tok, body, end, end, 'file')
    }
    for (let j = body; j < end; j++) {
      const c = t[j]
      if (c === d) return this.verbToken(tok, body, j, j + 1, 'delimiter')
      if (c === '\n') return this.verbToken(tok, body, j, j, 'line')
    }
    return this.verbToken(tok, body, end, end, 'file')
  }
  private verbToken(
    tok: Token & { k: 'cs' },
    body: number,
    bodyEnd: number,
    e: number,
    ended: 'delimiter' | 'line' | 'file',
  ): Token {
    this.pos = e
    this.state = 'M'
    return { k: 'verb', s: tok.s, e, name: tok.name, body, bodyEnd, ended }
  }

  /** the tokens of the brace group whose `{` is the next token (blanks before it are not skipped here), read as TeX reads
   *  an argument: up to its matching `}`. Null, and nothing read, where no group opens here or none closes before the end */
  group(): { s: number; e: number; tokens: Token[] } | null {
    const m = this.mark()
    const first = this.next()
    if (first?.k !== 'char' || first.cat !== CAT.begin) {
      this.reset(m)
      return null
    }
    const tokens: Token[] = []
    let depth = 1
    for (;;) {
      const tok = this.next()
      if (!tok) {
        this.reset(m)
        return null
      }
      if (tok.k === 'char' && tok.cat === CAT.begin) depth++
      else if (tok.k === 'char' && tok.cat === CAT.end && --depth === 0) return { s: first.s, e: tok.e, tokens }
      tokens.push(tok)
    }
  }

  /** a brace group read as url.sty reads its argument from the file: braces counted, a backslash and the character after
   *  it a pair, everything else (a `%` too) a character. Null where no `{` is next */
  rawGroup(): Token | null {
    const end = this.end
    if (this.pos >= end || this.cat(this.pos) !== CAT.begin) return null
    let depth = 0
    for (let j = this.pos; j < end; j++) {
      const c = this.cat(j)
      if (c === CAT.escape) {
        j++
        continue
      }
      if (c === CAT.begin) depth++
      else if (c === CAT.end && --depth === 0) {
        const tok: Token = { k: 'raw', s: this.pos, e: j + 1 }
        this.pos = j + 1
        this.state = 'M'
        return tok
      }
    }
    return null
  }
}

/** a whole file's tokens, as a reader that takes no special readings sees them (each in TeX's order: a \verb or a line
 *  environment whole) */
export function tokenize(text: string, rules: LexRules = NO_RULES, codes = new Catcodes()): Token[] {
  const lx = new Lexer(text, codes, rules)
  const out: Token[] = []
  for (let t = lx.next(); t; t = lx.next()) out.push(t)
  return out
}

/** CR LF and CR end a line as LF does: web2c's input_line reads a line up to any of the three (texmfmp.c), so a file is read
 *  through that rule before anything else */
export const texText = (s: string): string => s.replace(/\r\n?/g, '\n')

export const isCs = (t: Token | null | undefined, name?: string): t is Token & { k: 'cs' } =>
  !!t && t.k === 'cs' && (name === undefined || t.name === name)
export const isChar = (t: Token | null | undefined, cat: number, ch?: string): t is Token & { k: 'char' } =>
  !!t && t.k === 'char' && t.cat === cat && (ch === undefined || t.ch === ch)
/** whether a token is nothing TeX reads as material: a blank TeX skips, a comment */
export const isTrivia = (t: Token | null | undefined): boolean =>
  !!t && (t.k === 'comment' || (t.k === 'space' && t.skipped === true))

/**
 * The file name after \input, \include and their kin, in every form TeX and LaTeX read: a brace group (LaTeX's \input{…},
 * \include{…}), or TeX's own file name, unbraced (`\input sections/intro`): blanks skipped, then characters up to a blank, a
 * line end or a character that is no part of a name (TeX's scan_file_name ends at the first non-character token: a control
 * sequence, a brace, a comment). Read from the lexer's place; null where no name follows. `e` where the name ends
 */
export function fileName(lx: Lexer): { name: string; s: number; e: number; braced: boolean } | null {
  const t = lx.text
  let k = lx.pos
  while (k < lx.end && (t[k] === ' ' || t[k] === '\t')) k++
  if (t[k] === '\n') {
    k++
    while (k < lx.end && (t[k] === ' ' || t[k] === '\t')) k++
  }
  if (t[k] === '{') {
    const close = t.indexOf('}', k)
    if (close < 0) return null
    const name = t.slice(k + 1, close).trim()
    lx.pos = close + 1
    return name ? { name, s: k, e: close + 1, braced: true } : null
  }
  const m = /^[^\s{}\\%]+/.exec(t.slice(k, k + 512))
  if (!m) return null
  // (the blank that ends an unbraced name is TeX's, read with it)
  let e = k + m[0].length
  lx.pos = e
  if (t[e] === ' ') lx.pos = ++e
  return { name: m[0], s: k, e, braced: false }
}
