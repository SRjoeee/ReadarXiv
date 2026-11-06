// A paper's files as the source reader holds them: each file's text, its tokens read once in TeX's order (the category codes
// the files before it left in force), and the matching end of each group, so that every reader of a file walks the same
// tokens and finds a group's end in one step, however deep it is nested.
import { fileText, findFile, type Tree } from './definitions.ts'
import { CAT, Catcodes, Lexer, type LexRules, type Mark, type Token } from './tokens.ts'

export class SourceFile {
  readonly path: string
  readonly text: string
  readonly toks: Token[]
  /** for a begin-group token, the index of its matching end-group token; -1 for any other token or one that never closes */
  readonly close: Int32Array
  /** the category codes in force at each token that reads a file (\input and its kin), by token index: the included file is
   *  read under them */
  readonly codesAt: Map<number, Mark['codes']>
  /** the codes in force where the file ends */
  readonly after: Mark['codes']
  constructor(path: string, text: string, codes: Catcodes, rules: LexRules, inputs: ReadonlySet<string>) {
    this.path = path
    this.text = text
    const lx = new Lexer(text, codes, rules)
    const toks: Token[] = []
    const codesAt = new Map<number, Mark['codes']>()
    for (let t = lx.next(); t; t = lx.next()) {
      if (t.k === 'cs' && inputs.has(t.name)) codesAt.set(toks.length, codes.save())
      if (t.k === 'cs' && t.name === 'endinput') {
        toks.push(t)
        lx.endInput()
        continue
      }
      toks.push(t)
    }
    this.toks = toks
    this.codesAt = codesAt
    this.after = codes.save()
    const close = new Int32Array(toks.length).fill(-1)
    const open: number[] = []
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i] as Token
      if (t.k !== 'char') continue
      if (t.cat === CAT.begin) open.push(i)
      else if (t.cat === CAT.end) {
        const o = open.pop()
        if (o !== undefined) close[o] = i
      }
    }
    this.close = close
  }
  /** the source of tokens [a, b) */
  src(a: number, b: number): string {
    if (b <= a) return ''
    return this.text.slice((this.toks[a] as Token).s, (this.toks[b - 1] as Token).e)
  }
  /** the source offset where token i begins (the file's end past the last) */
  at(i: number): number {
    return i < this.toks.length ? (this.toks[i] as Token).s : this.text.length
  }
}

/** the paper's files, each read once when TeX first reads it */
export class Files {
  readonly tree: Tree
  readonly rules: LexRules
  readonly inputs: ReadonlySet<string>
  private readonly read = new Map<string, SourceFile>()
  constructor(tree: Tree, rules: LexRules, inputs: ReadonlySet<string>) {
    this.tree = tree
    this.rules = rules
    this.inputs = inputs
  }
  /** a file of the tree by its path, read under `codes` (a copy: its changes go on in the file's own reading) */
  file(path: string, codes: Mark['codes'] | null): SourceFile | null {
    const have = this.read.get(path)
    if (have) return have
    const bytes = this.tree.files.get(path)
    if (!bytes) return null
    const c = new Catcodes()
    if (codes) c.restore(codes)
    // (a package's or a class's own file is read with @ a letter, as \usepackage reads it)
    if (/\.(?:sty|cls)$/i.test(path)) c.set(64, CAT.letter)
    const f = new SourceFile(path, fileText(bytes), c, this.rules, this.inputs)
    this.read.set(path, f)
    return f
  }
  find(name: string, dirs: readonly string[] = []): string | null {
    return findFile(this.tree, name, dirs)
  }
}
