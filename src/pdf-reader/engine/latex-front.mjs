// C1 front end, spike: a LaTeX project → prose units with byte ranges and placeholders → the same project with each unit's
// range replaced by its translation, everything else byte for byte. The approach the evidence favours (REPORT §4 and the
// second addendum): patch source ranges in place, mask math, citations, references and unknown commands, send whole
// paragraphs. Not a parser: a scanner that knows which constructs carry prose and treats everything else as opaque.
// Runs the same in Node (the spikes) and in the browser (the reader): a project's files come as a file system of two
// operations (`folder` for a directory under Node, `inMemory` for an unpacked source), and bytes are Uint8Arrays.

// ---------------------------------------------------------------- files and bytes
// Node's file system for the spikes; in the page the branch is never taken, and the bundler is told not to follow it
const nodeFs = typeof process !== 'undefined' && process.versions?.node ? await import(/* @vite-ignore */ 'node:fs') : null
/** a directory under Node, as a project's file system: { list(): relative paths, read(path): bytes or null } */
export function folder(dir) {
  const { readdirSync, readFileSync } = nodeFs
  const walk = rel => readdirSync(rel ? `${dir}/${rel}` : dir, { withFileTypes: true }).flatMap(e => { const p = rel ? `${rel}/${e.name}` : e.name; return e.isDirectory() ? walk(p) : [p] })
  let names = null
  return { list: () => (names ??= walk('')), read: p => { try { return readFileSync(`${dir}/${p}`) } catch { return null } } }
}
/** unpacked files (a Map of relative path → bytes) as a project's file system */
export function inMemory(map) { return { list: () => [...map.keys()], read: p => map.get(p) ?? null } }
const asFiles = root => (typeof root === 'string' ? folder(root) : root)
/** a/./b/../c → a/c: a file as the package holds it (tar.mjs untar names each so) and as TeX's file system has it,
 *  whatever spelling named it — one name for one file, so that a file written back replaces it rather than sitting
 *  beside it (2608.08350's \input{./sections/a.tex}: the compile set the English over the translation) */
export const normalizePath = p => { const out = []; for (const seg of p.split('/')) { if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg) } return out.join('/') }
/** the name TeX gives what it writes for a main file, its .aux and .bbl: the file's own name without its extension, in
 *  the package's root, where TeX runs whatever directory the main file is in (arXiv's compile, the TeX page's) */
export const jobName = main => main.slice(main.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '')
/** bytes as a string of the same code units (latin1, byte for byte): the scanner's view of a source */
export const latin1 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return s }
export const latin1Bytes = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b }
const utf8Bytes = s => new TextEncoder().encode(s)
const bytesOf = (s, enc) => (enc === 'utf8' ? utf8Bytes(s) : latin1Bytes(s))
const concat = parts => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }

// ---------------------------------------------------------------- what carries prose
const HEADINGS = new Set(['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'title'])
/** a sectioning command's depth, as LaTeX's article and book classes count it: the reader's contents rank it (outline.ts);
 *  a paragraph heading is not in the contents */
const DEPTH = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3 }
const OWN_UNIT_ARG = new Set(['caption', 'subcaption', 'subcaptionbox', 'footnote', 'thanks', 'abstract', 'keywords']) // the argument is a unit of its own
const CAPTIONS = new Set(['caption', 'subcaption', 'subcaptionbox'])
/** the front matter's blocks of names and places: their notes (\\thanks, \\footnote) each a footnote of its own
 *  (1706.03762's author block: its footnotes stayed in English, the whole block one opaque command), and the names and
 *  places between them units of kind 'author' — translated where the target's script writes names its own way
 *  (scripts.mjs authorsTranslated), else kept as the paper has them; the marks, addresses and spacing stay */
const FRONT_MATTER = new Set(['author', 'affil', 'affiliation', 'institute', 'address'])
/** commands inside an author block whose argument is a name or a place: IEEEtran's blocks, acmart's parts of an
 *  affiliation. Anything else there — \\email, \\orcid, \\inst{1}, \\textsuperscript — stays as it is */
const FRONT_PROSE = new Set(['IEEEauthorblockN', 'IEEEauthorblockA', 'institution', 'department', 'city', 'state', 'country'])
/** IEEEtran's blocks, each a group of lines the class sets on its own in a cell of a table: a unit each, so that a
 *  line of names is fitted to its box alone (AUTHOR_WIDE), apart from the places' block and its line breaks */
const FRONT_LINES = new Set(['IEEEauthorblockN', 'IEEEauthorblockA'])
/** import.sty's commands that read a file from a directory, {dir}{file}: whether the directory is the one imported last's */
const IMPORTS = new Map([['import', false], ['inputfrom', false], ['includefrom', false], ['subimport', true], ['subinputfrom', true], ['subincludefrom', true]])
const INLINE_TEXT = new Set(['textbf', 'textit', 'emph', 'textsl', 'textsc', 'underline', 'textup', 'textrm', 'textsf', 'textmd', 'uline'])
// commands whose last required argument is typeset as it stands — a scaled table, a boxed or coloured phrase, a TikZ
// picture fitted to the column — by how many required arguments they take, that one included. The others (a width,
// an angle, a colour) stay as they are
const CONTENT_BOX = new Map([['resizebox', 3], ['scalebox', 2], ['adjustbox', 2], ['rotatebox', 2], ['raisebox', 2], ['fbox', 1], ['mbox', 1], ['framebox', 1], ['makebox', 1], ['parbox', 2], ['colorbox', 2], ['fcolorbox', 3], ['textcolor', 2]])
/** declarations that take no argument: a brace group after one is a group of its own, never its argument. Taken for
 *  \\centering's argument, the {\\small …} a table sat in stayed untranslated whole (five of 2608.05876's eight
 *  tables). The rules take an optional width alone (\\toprule[1pt]) */
const NO_ARGS = new Set(['centering', 'raggedright', 'raggedleft', 'noindent', 'indent', 'normalfont', 'rmfamily', 'sffamily', 'ttfamily', 'bfseries', 'mdseries', 'itshape', 'upshape', 'slshape', 'scshape', 'em', 'bf', 'it', 'rm', 'sf', 'tt', 'sc', 'sl', 'normalsize', 'small', 'footnotesize', 'scriptsize', 'tiny', 'large', 'Large', 'LARGE', 'huge', 'Huge', 'selectfont', 'smallskip', 'medskip', 'bigskip', 'hfill', 'vfill', 'hfil', 'vfil', 'newline', 'clearpage', 'newpage', 'cleardoublepage', 'maketitle', 'appendix', 'toprule', 'midrule', 'bottomrule', 'hline', 'arraybackslash', 'protect', 'relax', 'leavevmode', 'strut', 'null', 'quad', 'qquad', 'enspace', 'thinspace', 'nobreak', 'allowbreak', 'sloppy', 'fussy', 'ignorespaces', 'unskip'])
const OPT_ONLY = new Set(['toprule', 'midrule', 'bottomrule'])
/** how many required arguments some commands of fixed arity take, after any optional ones: a brace group after them is
 *  a group of its own (\\hspace{1mm}{#1}, the bulleted headings of 2608.06007) */
const ARITY = new Map([['hspace', 1], ['vspace', 1], ['addvspace', 1], ['color', 1], ['label', 1], ['ref', 1], ['eqref', 1], ['pageref', 1], ['setlength', 2], ['addtolength', 2], ['rule', 2], ['includegraphics', 1]])
const MATH_ENVS = /^(equation|align|alignat|gather|multline|flalign|eqnarray|math|displaymath|dmath|IEEEeqnarray|subequations)\*?$/
const SKIP_ENVS = /^(verbatim|Verbatim|lstlisting|minted|comment|tcblisting|tcboutputlisting|alltt|BVerbatim|LVerbatim|tikzpicture|pgfpicture|forest|array|algorithmic|algorithm2e|thebibliography|bibdiv|biblist|filecontents|picture|asy|pspicture|axis|circuitikz|dot2tex|pythontex|sagesilent)\*?$/
/**
 * Environments TeX reads line by line until a line that holds their \\end: the verbatim kind (the kernel's and
 * verbatim.sty's, fancyvrb's, listings', minted's, moreverb's), filecontents, those of the packages that write their
 * lines out (asy, dot2tex, pythontex, sagetex), and comment.sty's. Nothing of ours may follow their \\begin or their
 * \\end on its line (lineBound): comment.sty ends its environment only at a line that is its \\end and nothing more, and
 * skips the rest of its \\begin's line; verbatim.sty and fancyvrb drop what follows their \\end. 2608.16117's
 * `\\end{comment}\\axtlines{14}` kept its comment open to the end of its file: the marked original failed, and every
 * translation after it. Nor may one go into an argument (FIT_DEF's \\axtfit), which TeX reads whole before the
 * environment could read its lines. The paper's own (lineEnvsOf) are found in its files; acmart's comments
 * (\\specialcomment{acks}, \\excludecomment{CCSXML} …) are listed, since a paper need not ship the class
 */
const LINE_ENVS = /^(?:verbatim|Verbatim|BVerbatim|LVerbatim|SaveVerbatim|VerbatimOut|lstlisting|minted|comment|filecontents|tcblisting|tcboutputlisting|verbatimwrite|verbatimtab|boxedverbatim|asy|asydef|dot2tex|pythontex|pycode|pyblock|pyverbatim|sagesilent|sageblock|sagecommandline|acks|CCSXML|printonly|screenonly|anonsuppress)\*?$/
/** the environments of the paper's own that TeX reads by lines (LINE_ENVS), as its files define them — a class it
 *  ships among them (acmart's \\excludecomment{CCSXML}): comment.sty's, fancyvrb's, listings', tcolorbox's and minted's
 *  definitions, and an environment that begins as comment.sty's or a verbatim does (\\newenvironment{x}{\\comment}…,
 *  \\let\\x\\comment) */
const lineEnvsOf = texts => {
  const text = texts.map(uncommented).join('\n'), out = new Set()
  for (const m of text.matchAll(/\\(?:(?:exclude|include|special|general|process)comment|(?:Re)?CustomVerbatimEnvironment|DefineVerbatimEnvironment|lstnewenvironment|(?:new|renew)tcblisting|(?:Declare|New|Renew|Provide)TCBListing)\s*\*?\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) out.add(m[1].trim())
  for (const m of text.matchAll(/\\(?:re)?newenvironment\s*\*?\s*\{([^}]+)\}\s*(?:\[[^\]]*\]\s*)*\{\s*\\(?:comment|verbatim|Verbatim|BVerbatim|LVerbatim|lstlisting|minted)(?![A-Za-z])|\\let\s*\\([A-Za-z]+)\s*=?\s*\\(?:comment|verbatim|Verbatim)(?![A-Za-z])/g)) out.add((m[1] ?? m[2]).trim())
  // minted's \\newminted[name]{lexer}{options}: the environment `name`, else <lexer>code
  for (const m of text.matchAll(/\\newminted\s*(?:\[([^\]]+)\])?\s*\{([^}]+)\}/g)) out.add(m[1]?.trim() || `${m[2].trim()}code`)
  return out
}
/** whether `env` is read by lines (LINE_ENVS, or the paper's own `lineEnvs`) */
const isLineEnv = (env, lineEnvs) => LINE_ENVS.test(env) || !!lineEnvs?.has(env.replace(/\*$/, ''))
/** whether the line `at` stands on holds, before it, the \\begin or the \\end of an environment read by lines: nothing
 *  of ours goes there (LINE_ENVS) */
const lineBound = (text, at, lineEnvs) => {
  const from = text.lastIndexOf('\n', at - 1) + 1
  for (const m of text.slice(from, at).matchAll(/\\(?:begin|end)\s*\{([^}]+)\}/g)) if (isLineEnv(m[1].trim(), lineEnvs) && !inComment(text, from + m.index)) return true
  return false
}
const ACCENTS = new Set(["'", '`', '"', '^', '~', '=', '.', 'u', 'v', 'H', 'c', 'd', 'b', 't', 'r', 'k'])
// a number with an optional unit; spaces and tabs only, never a line end — the next line is not the command's
const DIMEN = String.raw`[-+]?[ \t]*(?:\d+(?:\.\d*)?|\.\d+)[ \t]*(?:true[ \t]*)?(?:pt|em|ex|cm|mm|in|bp|sp|pc|dd|cc|mu|fill?l?|\\[A-Za-z@]+)?`
// \looseness=-1, \parindent=\z@, \vskip 3pt plus 1fil, \penalty-100: a number, or = followed by a value; and the
// relation of a comparison, \ifdim\lastskip>0pt, \ifnum\value{x}<3
const ASSIGNMENT = new RegExp(String.raw`^[ \t]*(?:[=<>][ \t]*(?:${DIMEN}|\\[A-Za-z@]+)|${DIMEN})(?:[ \t]*(?:plus|minus)[ \t]*${DIMEN})*(?![A-Za-z])`)
// \hrule height 0.9pt, \vrule width .4pt depth 2pt: a rule's own keywords and sizes
const RULE_SPEC = new RegExp(String.raw`^(?:[ \t]*(?:height|depth|width)[ \t]*${DIMEN})+(?![A-Za-z])`)
const TABLE_ENVS = /^(tabular|tabularx|tabular\*|longtable|tabu|tabulary|supertabular|xtabular)\*?$/
/** tabularray's tables, \\begin{tblr}[outer]{inner}, and the paper's own (\\NewTblrEnviron): their cells are math where
 *  the table says so — mode = math, imath or dmath, for the cells, a column, a row or one cell, in the table's own
 *  specifications or in \\SetTblrInner for every table. Such a table is math throughout, as an array is: nothing in it
 *  is prose. Walked as prose, its formulas went to the translator, which wrote their parentheses full-width, and a
 *  \\left before one stopped TeX (2608.29181: every way of setting it failed, biber's "bcf is malformed" all it said) */
const TBLR_ENVS = ['tblr', 'longtblr', 'talltblr']
const TBLR_MATH = /\bmode\s*=\s*[id]?math\b/
const uncommented = text => text.replace(/(^|[^\\])%.*$/gm, '$1')

// ---------------------------------------------------------------- scanning primitives
const isLetter = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '@'
function commandAt(s, i) { // s[i] === '\\'
  let j = i + 1
  if (j < s.length && isLetter(s[j])) { while (j < s.length && isLetter(s[j])) j++; if (s[j] === '*') j++; return { name: s.slice(i + 1, j).replace(/\*$/, ''), end: j } }
  return { name: s[j] ?? '', end: j + 1 }
}
function skipComment(s, i) { while (i < s.length && s[i] !== '\n') i++; return i }
function matchGroup(s, i, open = '{', close = '}') { // s[i] === open; returns index after the matching close, or -1
  let depth = 0
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (c === '\\') { j++; continue }
    if (c === '%') { j = skipComment(s, j); continue }
    if (c === open) depth++
    else if (c === close && --depth === 0) return j + 1
  }
  return -1
}
/** spaces and tabs, and at most one line end: TeX lets an argument follow on the next line, but a blank line is \par */
function skipSpaces(s, i) {
  let lines = 0
  while (i < s.length) {
    if (s[i] === ' ' || s[i] === '\t') i++
    else if (s[i] === '\n' && lines === 0) { lines++; i++ }
    else break
  }
  return i
}
/** the arguments right after a command: [..] and {..} groups, optional spaces between, no blank line */
function argsAfter(s, i, max = 9) {
  const args = []
  for (let n = 0; n < max; n++) {
    let k = skipSpaces(s, i)
    if (s[k] === '*' && (s[k + 1] === '{' || s[k + 1] === '[')) k++
    if (s[k] === '[') { const e = matchGroup(s, k, '[', ']'); if (e < 0) break; args.push({ kind: 'opt', start: k, end: e }); i = e; continue }
    if (s[k] === '{') { const e = matchGroup(s, k); if (e < 0) break; args.push({ kind: 'req', start: k, end: e }); i = e; continue }
    break
  }
  return { args, end: i }
}
/** a command's arguments: every adjacent one, or for a command of fixed arity (ARITY) its optional ones and then that
 *  many required */
function commandArgs(s, i, name) {
  const want = ARITY.get(name)
  if (want === undefined) return argsAfter(s, i)
  const args = []
  for (let got = 0; got < want;) {
    let k = skipSpaces(s, i)
    if (s[k] === '*' && (s[k + 1] === '{' || s[k + 1] === '[')) k++
    const e = s[k] === '[' ? matchGroup(s, k, '[', ']') : s[k] === '{' ? matchGroup(s, k) : -1
    if (e < 0) break
    args.push({ kind: s[k] === '[' ? 'opt' : 'req', start: k, end: e }); i = e
    if (s[k] === '{') got++
  }
  return { args, end: i }
}
/** after a command that takes no required argument: past its optional ones when it has any, else where it ends */
function optsAfter(s, i, opts) {
  if (!opts) return { end: i }
  for (;;) { const k = skipSpaces(s, i); if (s[k] !== '[') return { end: i }; const e = matchGroup(s, k, '[', ']'); if (e < 0) return { end: i }; i = e }
}
function endOfEnv(s, i, name) { // i just after \begin{name}; returns [bodyEnd, afterEnd]
  const re = new RegExp(`\\\\(begin|end)\\s*\\{${name.replace(/[*]/g, '\\*')}\\}`, 'g')
  re.lastIndex = i
  let depth = 1, m
  while ((m = re.exec(s))) {
    // a match inside a comment does not count
    const lineStart = s.lastIndexOf('\n', m.index) + 1
    if (/(^|[^\\])%/.test(s.slice(lineStart, m.index))) continue
    if (m[1] === 'begin') depth++
    else if (--depth === 0) return [m.index, m.index + m[0].length]
  }
  return [s.length, s.length]
}
function mathEnd(s, i) { // s[i] is '$' or starts \( \[ ; returns index after the closing delimiter
  if (s.startsWith('$$', i)) { const e = s.indexOf('$$', i + 2); return e < 0 ? -1 : e + 2 }
  if (s[i] === '$') { for (let j = i + 1; j < s.length; j++) { if (s[j] === '\\') { j++; continue } if (s[j] === '$') return j + 1 } return -1 }
  const close = s[i + 1] === '(' ? '\\)' : '\\]'
  const e = s.indexOf(close, i + 2)
  return e < 0 ? -1 : e + 2
}

/**
 * Where a macro body sets its parameters: `text` those it typesets as prose — bare, in a group, in \\textbf and the
 * like, in the content of a box — and `other` those it hands to anything else: \\label, \\ref, a width, math
 */
function paramUse(s, from, to, textual = true, use = { text: new Set(), other: new Set() }) {
  let i = from
  while (i < to) {
    const c = s[i]
    if (c === '%') { i = skipComment(s, i) + 1; continue }
    if (c === '#') { if (/\d/.test(s[i + 1] ?? '')) (textual ? use.text : use.other).add(Number(s[i + 1])); i += 2; continue }
    if (c === '$' || (c === '\\' && (s[i + 1] === '(' || s[i + 1] === '['))) { const e = mathEnd(s, i); if (e < 0 || e > to) { i++; continue } paramUse(s, i + 1, e - 1, false, use); i = e; continue }
    if (c === '{') { const e = matchGroup(s, i); if (e < 0 || e > to) { i++; continue } paramUse(s, i + 1, e - 1, textual, use); i = e; continue }
    if (c !== '\\') { i++; continue }
    const { name, end } = commandAt(s, i)
    if (NO_ARGS.has(name) || !/^[A-Za-z@]+$/.test(name)) { i = end; continue }
    const { args, end: e } = commandArgs(s, end, name)
    const reqs = args.filter(a => a.kind === 'req')
    const prose = INLINE_TEXT.has(name) ? reqs[0] : CONTENT_BOX.has(name) ? reqs[CONTENT_BOX.get(name) - 1] : null
    for (const a of args) paramUse(s, a.start + 1, a.end - 1, textual && a === prose, use)
    i = e
  }
  return use
}
/**
 * The paper's own macros, by name: `params` they take and `opt` whether the first is optional, as \\newcommand (or \\def)
 * declares them, and `prose`, which one they typeset as prose, when one does. \\newcommand{\\nosection}[1]{\\vspace{3pt}
 * \\noindent\\textbf{#1}} gives the run-in headings of 2608.06007, and as any command the paper defines its argument
 * stayed in English, the heading's words with it. A macro with two such arguments has no `prose`: an engine that swapped
 * them would swap the arguments. The count alone matters too: TeX takes a token for an argument without braces
 * (\\inline{\\onenode x}, 2608.12096), and translated, the x became a character pdfTeX could not take
 */
function paperMacros(texts) {
  const out = new Map()
  const re = /\\(?:(?:re|provide)?newcommand|DeclareRobustCommand)\*?\s*(?:\{\s*\\([A-Za-z@]+)\s*\}|\\([A-Za-z@]+))\s*\[(\d)\]|\\(?:[egx]?def)\s*\\([A-Za-z@]+)((?:#\d)+)(?=\s*\{)/g
  for (const t of texts) for (const m of t.matchAll(re)) {
    if (inComment(t, m.index)) continue
    const name = m[1] ?? m[2] ?? m[4], params = m[3] ? Number(m[3]) : m[5].length / 2
    let k = skipSpaces(t, m.index + m[0].length), opt = false
    if (m[3] && t[k] === '[') { const e = matchGroup(t, k, '[', ']'); if (e < 0) continue; k = skipSpaces(t, e); opt = true }
    if (t[k] !== '{') continue
    const e = matchGroup(t, k); if (e < 0) continue
    const use = paramUse(t, k + 1, e - 1)
    const prose = [...use.text].filter(n => n <= params && !use.other.has(n) && !(opt && n === 1))
    out.set(name, { params, opt, prose: prose.length === 1 ? prose[0] : undefined })
  }
  return out
}
/** a paper macro's arguments at a call, as TeX takes them: its optional one when given, then each required one a brace
 *  group or a single token; null when the call runs past `to` */
function macroArgs(s, i, macro, to) {
  const reqs = []
  let k = i
  if (macro.opt) { const k0 = skipSpaces(s, k); if (s[k0] === '[') { const e0 = matchGroup(s, k0, '[', ']'); if (e0 < 0 || e0 > to) return null; k = e0 } }
  while (reqs.length < macro.params - (macro.opt ? 1 : 0)) {
    const k0 = skipSpaces(s, k)
    const e0 = s[k0] === '{' ? matchGroup(s, k0) : s[k0] === '\\' ? commandAt(s, k0).end : k0 + 1
    if (e0 < 0 || e0 > to || k0 >= to || s[k0] === '}') return null
    reqs.push({ start: k0, end: e0, group: s[k0] === '{' }); k = e0
  }
  return { reqs, end: k }
}
/** what a paragraph cannot hold: a paragraph break, an item, a heading, a caption, or an environment other than math */
const BLOCK = /\n[ \t]*\n|\\(?:par|item|part|chapter|(?:sub)*section|(?:sub)?paragraph|caption)(?![A-Za-z@])|\\begin\s*\{([^}]+)\}/g
const holdsBlock = text => [...text.matchAll(BLOCK)].some(m => !m[1] || !MATH_ENVS.test(m[1].trim()))

// ---------------------------------------------------------------- units
/** the kinds set in the running text, which a display standing alone after them belongs to */
const IN_TEXT = new Set(['para', 'theorem', 'abstract'])
/** a display environment: a math environment but the inline one */
const displayEnv = env => MATH_ENVS.test(env) && !/^math\*?$/.test(env)
/**
 * A display's letters as the page sets them, for telling its lines from a float's (anchors.mjs): the source's letters,
 * the paper's own macros put in (`macros`, name → body: `\\rmx` is `\\mathbf{x}`, `\\E` is `\\mathbb{E}`) and the commands
 * left out, run together — a subscript runs on with its letter, `N_{\\text{out}}` → `nout` — then the commands' names,
 * which some set as words (`\\log`, `\\softmax`)
 */
export function displayLetters(src, macros = new Map()) {
  let s = src
  for (let depth = 0; depth < 3 && macros.size; depth++) {
    const t = s.replace(/\\([A-Za-z@]+)/g, (m, name) => (macros.has(name) ? ` ${macros.get(name)} ` : m))
    if (t === s || t.length > 20000) break
    s = t
  }
  // the commands that set a Latin letter (ℓ reads as l)
  s = s.replace(/\\(ell|imath|jmath)(?![A-Za-z@])/g, (m, c) => ({ ell: 'l', imath: 'i', jmath: 'j' })[c]).normalize('NFKC').toLowerCase()
  return `${s.replace(/\\[a-z@]+/g, '').replace(/[^\p{L}]/gu, '')} ${[...new Set([...s.matchAll(/\\([a-z]+)/g)].map(m => m[1]))].join(' ')}`
}
/** the bodies of the macros a paper defines in its sources (\\newcommand, \\def, \\DeclareMathOperator), by name */
function macroBodies(texts) {
  const out = new Map()
  for (const t of texts) {
    for (const m of t.matchAll(/\\(?:(?:re|provide)?newcommand\*?\s*\{?\s*\\([A-Za-z@]+)\s*\}?\s*(?:\[\d\]\s*)?(?:\[[^\]]*\]\s*)?|def\s*\\([A-Za-z@]+)\s*(?:#\d\s*)*|DeclareMathOperator\*?\s*\{\s*\\([A-Za-z@]+)\s*\}\s*)(?=\{)/g)) {
      const at = m.index + m[0].length, e = matchGroup(t, at)
      if (e > 0) out.set(m[1] ?? m[2] ?? m[3], t.slice(at + 1, e - 1))
    }
  }
  return out
}
/**
 * The displays a unit sets before its first words (`lead`) or after its last (`trail`), outside its marks, which stand
 * in running text (patch: the start mark before the first word or inline formula, the end mark after the last word),
 * and between them (`inner`): their letters (displayLetters), or null — the reader's anchors take a display beyond the
 * marks, or across a page break inside them, only on lines its letters explain. Nothing typeset depends on it
 */
function displayOutside(pieces, displays, macros) {
  const first = pieces.findIndex(p => (p.t === 'text' && /[^ \t\r\n]/.test(p.s)) || (p.t === 'ph' && INLINE.test(p.src)))
  const last = pieces.findLastIndex(p => p.t === 'text' && /[^ \t\r\n]/.test(p.s))
  const letters = ps => { const ds = ps.filter(p => displays.has(p)); return ds.length ? ds.map(p => displayLetters(p.src, macros)).join(' ') : null }
  return { lead: first > 0 ? letters(pieces.slice(0, first)) : null, trail: last >= 0 ? letters(pieces.slice(last + 1)) : null, inner: first >= 0 && last > first ? letters(pieces.slice(first + 1, last)) : null }
}
// A unit: { file, kind, start, end, pieces: [{t:'text', s} | {t:'ph', src} | {t:'open', id, src} | {t:'close', id, src}] }
class Builder {
  constructor(file, units, src = '', macros = new Map()) { this.file = file; this.units = units; this.src = src; this.macros = macros; this.cur = null; this.pairId = 0; this.displays = new WeakSet() }
  text(s, start, end) { if (!this.cur) { if (!s.trim()) return; this.cur = { file: this.file, kind: this.kind ?? 'para', start, end, pieces: [] } } this.cur.pieces.push({ t: 'text', s }); this.cur.end = end }
  /** `display`: a formula set on lines of its own (displayOutside) */
  ph(src, start, end, display = false) { if (!this.cur) this.cur = { file: this.file, kind: this.kind ?? 'para', start, end, pieces: [] }; const p = { t: 'ph', src }; if (display) this.displays.add(p); this.cur.pieces.push(p); this.cur.end = end; return true }
  open(src, start) { if (!this.cur) this.cur = { file: this.file, kind: this.kind ?? 'para', start, end: start, pieces: [] }; const id = ++this.pairId; this.cur.pieces.push({ t: 'open', id, src }); return id }
  close(id, src, end) { if (this.cur) { this.cur.pieces.push({ t: 'close', id, src }); this.cur.end = end } }
  flush() {
    const u = this.cur; this.cur = null
    if (!u) return
    u.pieces = keepAddresses(u.pieces)
    // trim placeholders and whitespace at both ends out of the unit: they stay in the source untouched
    const letters = u.pieces.filter(p => p.t === 'text').map(p => p.s).join('')
    if ((letters.match(/\p{L}/gu) ?? []).length < 2) {
      // a display standing alone between blank lines is read with the paragraph it follows, nothing but white space
      // and comments between them
      const prev = this.units.at(-1), shown = u.pieces.filter(p => this.displays.has(p)).map(p => displayLetters(p.src, this.macros))
      if (shown.length && prev?.file === u.file && IN_TEXT.has(prev.kind) && !this.src.slice(prev.end, u.start).replace(/(^|[^\\])%.*$/gm, '$1').trim()) prev.trail = [prev.trail, ...shown].filter(Boolean).join(' ')
      return
    }
    const { lead, trail, inner } = displayOutside(u.pieces, this.displays, this.macros)
    if (lead) u.lead = lead
    if (trail) u.trail = trail
    if (inner) u.inner = inner
    // the paper's title, which goes with every batch to an LLM as the HTML page's does (DESIGN §8.2)
    if (this.title) u.title = true
    if (this.depth !== undefined) u.depth = this.depth
    this.units.push(u)
  }
}

// an e-mail address, and the domain after a list of names in braces
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, HAS_EMAIL = new RegExp(EMAIL.source)
const AT_DOMAIN = /^@[\w-]+(?:\.[\w-]+)+/
/** An address is not prose: an e-mail in a unit's text (jatin@us.ibm.com), and a list of names in escaped braces with
 *  its domain ({sl225, samand2, reyhaneh}@illinois.edu), each become a placeholder, kept as the paper has it. Sent as
 *  text, a machine translation spelled one of 2608.06701's names in katakana and joined the list with the ideographic
 *  comma */
function keepAddresses(pieces) {
  const lists = []
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k], names = pieces[k + 1], shut = pieces[k + 2], after = pieces[k + 3]
    const domain = after?.t === 'text' && AT_DOMAIN.exec(after.s)?.[0]
    if (p.t === 'ph' && p.src === '\\{' && names?.t === 'text' && shut?.t === 'ph' && shut.src === '\\}' && domain) {
      lists.push({ t: 'ph', src: p.src + names.s + shut.src + domain })
      if (after.s.length > domain.length) lists.push({ ...after, s: after.s.slice(domain.length) })
      k += 3
    } else lists.push(p)
  }
  return lists.flatMap(p => {
    if (p.t !== 'text' || !HAS_EMAIL.test(p.s)) return [p]
    const out = []
    let at = 0
    for (const m of p.s.matchAll(EMAIL)) {
      if (m.index > at) out.push({ ...p, s: p.s.slice(at, m.index) })
      out.push({ t: 'ph', src: m[0] })
      at = m.index + m[0].length
    }
    if (at < p.s.length) out.push({ ...p, s: p.s.slice(at) })
    return out
  })
}

/**
 * The texts of a TikZ picture, each a unit of kind 'figure': a node's brace group (\\node … {text}, … node[…] (name) at
 * (x, y) {text}, in TikZ's own syntax whatever the picture draws), a pgfplots legend entry (\\addlegendentry{text}) and
 * an axis label or title in braces (xlabel={text}, ylabel=, zlabel=, title=). TeX sets them, so a translation is set in
 * the translation's fonts and a node grows to fit it. Everything else in the picture stays byte for byte.
 */
function tikzText(s, from, to, b, ctx) {
  const re = /\\node\b|\bnode\b|\\addlegendentry\b|\b(?:xlabel|ylabel|zlabel|title)\s*=\s*(?=\{)/g
  const ws = k => { while (k < to && /\s/.test(s[k])) k++; return k }
  re.lastIndex = from
  let m
  while ((m = re.exec(s)) && m.index < to) {
    const lineStart = s.lastIndexOf('\n', m.index) + 1
    if (/(^|[^\\])%/.test(s.slice(lineStart, m.index))) continue
    let k = m.index + m[0].length
    if (/node$/.test(m[0])) {
      // between `node` and its text TikZ allows options, a name and a position, in any order
      for (;;) {
        k = ws(k)
        if (s[k] === '[') { const e = matchGroup(s, k, '[', ']'); if (e < 0) break; k = e; continue }
        if (s[k] === '(') { const e = matchGroup(s, k, '(', ')'); if (e < 0 || e > to) break; k = e; continue }
        if (s.startsWith('at', k) && /[\s(]/.test(s[k + 2])) { k += 2; continue }
        break
      }
    } else if (m[0].startsWith('\\addlegendentry')) { k = ws(k); if (s[k] === '[') { const e = matchGroup(s, k, '[', ']'); if (e > 0) k = ws(e) } }
    if (s[k] !== '{') continue
    const e = matchGroup(s, k)
    if (e < 0 || e > to) continue
    const saved = b.kind
    b.flush(); b.kind = 'figure'
    walk(s, k + 1, e - 1, b, ctx); b.flush(); b.kind = saved
    re.lastIndex = e
  }
}

/** walk a span of body text; every prose run becomes a unit */
// TeX's own conditionals: each is closed by a \\fi (etoolbox's \\ifdef, \\ifbool … are macros that take braces instead)
const TEX_IFS = new Set(['if', 'ifx', 'ifnum', 'ifdim', 'ifodd', 'ifcase', 'ifcat', 'iftrue', 'iffalse', 'ifvmode', 'ifhmode', 'ifmmode', 'ifinner', 'ifvoid', 'ifhbox', 'ifvbox', 'ifeof', 'ifdefined', 'ifcsname', 'iffontchar', 'ifincsname', 'ifpdfprimitive'])
/** where a skipped conditional branch ends: after its \\fi, or at an \\else of the same depth (that branch is typeset) */
function branchEnd(s, from, to, ifs) {
  let depth = 0
  for (let k = from; k < to; k++) {
    if (s[k] === '%') { k = skipComment(s, k); continue }
    if (s[k] !== '\\') continue
    const { name, end } = commandAt(s, k)
    if (TEX_IFS.has(name) || ifs.has(name)) depth++
    else if (name === 'fi') { if (depth-- === 0) return end }
    else if ((name === 'else' || name === 'or') && depth === 0) return end
    k = end - 1
  }
  return -1
}

/** whether s[at] is inside a comment: an unescaped % before it on its line */
function inComment(s, at) {
  for (let k = s.lastIndexOf('\n', at - 1) + 1; k < at; k++) {
    if (s[k] === '\\') k++
    else if (s[k] === '%') return true
  }
  return false
}
/** each \\thanks or \\footnote in s[from, to), walked alone: a footnote unit of its own, with no paragraph around it */
function frontNotes(s, from, to, b, ctx) {
  let past = from
  for (const m of s.slice(from, to).matchAll(/\\(?:thanks|footnote)(?![A-Za-z@])/g)) {
    const at = from + m.index
    if (at < past || inComment(s, at)) continue
    const { args, end } = argsAfter(s, at + m[0].length, 2)
    if (!args.some(a => a.kind === 'req')) continue
    frontNote(s, at, end, b, ctx)
    past = end
  }
}
/** a front-matter note, a unit with no mark: a class compares its notes' text (revtex sets two authors' equal
 *  "contributed equally" once), and a mark of its own would set the same note twice (2608.06233) */
function frontNote(s, at, end, b, ctx) {
  const before = b.units.length
  walk(s, at, end, b, ctx); b.flush()
  for (const u of b.units.slice(before)) u.front = true
}
/** a front-matter argument: its notes as frontNotes cuts them, the names and places between them units of kind
 *  'author'. One written as keys and values (elsarticle's organization={…}, city={…}) keeps its text, notes aside */
function frontBlock(s, from, to, b, ctx) {
  if (/(^|[,{\s])[A-Za-z]+\s*=\s*\{/.test(s.slice(from, to))) { frontNotes(s, from, to, b, ctx); return }
  const names = (x, y) => { if (y <= x) return; b.flush(); const saved = b.kind; b.kind = 'author'; walk(s, x, y, b, ctx); b.flush(); b.kind = saved }
  let past = from
  for (const m of s.slice(from, to).matchAll(/\\(?:thanks|footnote)(?![A-Za-z@])/g)) {
    const at = from + m.index
    if (at < past || inComment(s, at)) continue
    const { args, end } = argsAfter(s, at + m[0].length, 2)
    if (!args.some(a => a.kind === 'req')) continue
    names(past, at)
    frontNote(s, at, end, b, ctx)
    past = end
  }
  names(past, to)
}
function walk(s, from, to, b, ctx) {
  let i = from, textStart = -1
  const endText = () => { if (textStart >= 0 && textStart < i) b.text(s.slice(textStart, i), textStart, i); textStart = -1 }
  const startText = () => { if (textStart < 0) textStart = i }
  while (i < to) {
    const c = s[i]
    if (c === '%') { endText(); i = skipComment(s, i) + 1; continue }
    if (c === '\n') {
      // blank line: paragraph break
      let k = i + 1; while (k < to && (s[k] === ' ' || s[k] === '\t')) k++
      if (s[k] === '\n') { endText(); b.flush(); i = k + 1; continue }
      startText(); i++; continue
    }
    if (c === '$') { const e = mathEnd(s, i); if (e < 0 || e > to) { i++; continue } endText(); b.ph(s.slice(i, e), i, e, s.startsWith('$$', i)); i = e; continue }
    if (c === '~') { endText(); b.ph('~', i, i + 1); i++; continue }
    if (c === '{') {
      const e = matchGroup(s, i); if (e < 0 || e > to) { i++; continue }
      endText(); const id = b.open('{', i); walk(s, i + 1, e - 1, b, ctx); b.close(id, '}', e); i = e; continue
    }
    if (c === '&' && b.cellMode) { endText(); b.flush(); i++; continue }
    if (c === '}' || c === '&' || c === '#' || c === '^' || c === '_') { endText(); b.ph(c, i, i + 1); i++; continue }
    if (c !== '\\') { startText(); i++; continue }
    // a command
    const { name, end } = commandAt(s, i)
    // \\iffalse … \\fi, and \\if followed by words (an author's way of commenting a passage out): nothing there is typeset,
    // so nothing there is a unit — and a mark or a translated first word would change what \\if compares
    if (name === 'iffalse' || (name === 'if' && /^[ \t]*\n?[ \t]*[A-Za-z]{2}/.test(s.slice(end, end + 8)))) {
      const stop = branchEnd(s, end, to, ctx.ifs)
      if (stop > 0) { endText(); b.flush(); ctx.skipped[name] = (ctx.skipped[name] ?? 0) + 1; i = stop; continue }
    }
    if (name === '(' || name === '[') { const e = mathEnd(s, i); if (e > 0 && e <= to) { endText(); b.ph(s.slice(i, e), i, e, name === '['); i = e; continue } }
    const shorthand = ctx.envMacros.get(name)
    if (shorthand?.side === 'begin' && (MATH_ENVS.test(shorthand.env) || SKIP_ENVS.test(shorthand.env))) {
      // the block ends at the partner macro or at a literal \end{env}
      const ends = [...ctx.envMacros].filter(([, v]) => v.side === 'end' && v.env === shorthand.env).map(([k]) => k)
      const re = new RegExp(`\\\\(?:${ends.map(e => e.replace(/[@*]/g, m => `\\${m}`)).join('|') || '(?!)'})(?![A-Za-z@])|\\\\end\\s*\\{${shorthand.env.replace(/\*/g, '\\*')}\\}`, 'g')
      re.lastIndex = end
      const m = re.exec(s)
      const stop = m && m.index < to ? m.index + m[0].length : end
      endText(); b.ph(s.slice(i, stop), i, stop, displayEnv(shorthand.env)); i = stop; continue
    }
    if (name === 'begin') {
      const m = s.slice(end).match(/^\s*\{([^}]+)\}/); if (!m) { i = end; continue }
      const env = m[1].trim(), afterBegin = end + m[0].length
      const [bodyEnd, afterEnd] = endOfEnv(s, afterBegin, env)
      if (MATH_ENVS.test(env)) { endText(); b.ph(s.slice(i, afterEnd), i, afterEnd, displayEnv(env)); i = afterEnd; continue }
      endText(); b.flush()
      // a TikZ picture: only its texts are prose (tikzText); the drawing stays as it is
      if (env === 'tikzpicture') { tikzText(s, afterBegin, bodyEnd, b, ctx); i = afterEnd; continue }
      if (SKIP_ENVS.test(env) || ctx.skipEnvs.has(env)) { ctx.skipped[env] = (ctx.skipped[env] ?? 0) + 1; i = afterEnd; continue }
      if (ctx.tblrEnvs.has(env) && (ctx.tblrMath || argsAfter(s, afterBegin, 2).args.some(a => TBLR_MATH.test(uncommented(s.slice(a.start, a.end)))))) { ctx.skipped[env] = (ctx.skipped[env] ?? 0) + 1; i = afterEnd; continue }
      if (TABLE_ENVS.test(env)) {
        if (!ctx.tables) { ctx.skipped[env] = (ctx.skipped[env] ?? 0) + 1; i = afterEnd; continue }
        // a table: each cell is a unit of its own; & and \\ end it. The column specification and width stay as they are
        const { end: argsEnd } = argsAfter(s, afterBegin, env.startsWith('tabularx') || env === 'tabular*' || env === 'tabulary' ? 3 : 2)
        const saved = b.kind, savedCell = b.cellMode; b.kind = 'cell'; b.cellMode = true
        walk(s, argsEnd, bodyEnd, b, ctx); b.flush(); b.kind = saved; b.cellMode = savedCell
        // fitted to the line once translated (patch, FIT_DEF): a plain tabular, whose width is its columns'; a tabular*,
        // set to a width it cannot shrink below, measured at its columns' width first (\\axtstar) — not one with a
        // position argument, which \\axtstar does not read. tabularx and tabulary keep their width and read their own
        // body, which they cannot inside an argument (2608.02991: "Missing \\endgroup inserted"); one that breaks across
        // pages cannot be boxed; \\verb and the like cannot go into an argument either, nor an environment TeX reads by
        // lines (LINE_ENVS: a row hidden in a comment). What stands in a TeX comment (`\\\\ % \\begin{comment} …`) TeX
        // never reads, so it keeps the table fitted
        const body = s.slice(i, afterEnd), read = m => !inComment(s, i + m.index)
        const verbatim = [...body.matchAll(/\\(?:verb|lstinline|mintinline)(?![A-Za-z])/g)].some(read) || [...body.matchAll(/\\begin\s*\{([^}]+)\}/g)].some(m => isLineEnv(m[1].trim(), ctx.lineEnvs) && read(m))
        if (/^tabu(lar)?$/.test(env) && !verbatim) ctx.fits.push({ file: b.file, start: i, end: afterEnd })
        if (env === 'tabular*' && !verbatim && !/^\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*\[/.test(s.slice(afterBegin).trimStart())) ctx.fits.push({ file: b.file, start: i, end: afterEnd, star: bodyEnd })
        i = afterEnd; continue
      }
      // everything else is a container: its body is walked, its own arguments ([Name] of a theorem, {width} of a minipage) stay
      const { end: argsEnd } = argsAfter(s, afterBegin)
      const saved = b.kind; b.kind = env === 'abstract' ? 'abstract' : ctx.theorems.has(env) ? 'theorem' : saved
      walk(s, argsEnd, bodyEnd, b, ctx); b.flush(); b.kind = saved
      i = afterEnd; continue
    }
    if (name === 'end') { endText(); b.flush(); const m = s.slice(end).match(/^\s*\{[^}]+\}/); i = end + (m ? m[0].length : 0); continue }
    if (name === 'item') { endText(); b.flush(); const { args, end: e } = argsAfter(s, end, 1); i = args.length && args[0].kind === 'opt' ? e : end; continue }
    if (name === 'input' || name === 'include' || name === 'subfile' || IMPORTS.has(name)) {
      endText(); b.flush(); const { args, end: e } = argsAfter(s, end, IMPORTS.has(name) ? 2 : 1)
      const [a, f] = args.map(x => s.slice(x.start + 1, x.end - 1).trim())
      // import.sty: \import{dir}{file} reads dir/file and puts dir first on the path an \input in it is looked for on,
      // \subimport the same from the directory imported last; subfiles loads \subfile{dir/file} by \subimport{dir}{file}
      const imported = (dir, file) => ctx.visit(file, [normalizePath(dir), ...ctx.dirs])
      if (IMPORTS.has(name)) { if (f !== undefined) imported(IMPORTS.get(name) ? `${ctx.dirs[0] ?? ''}/${a}` : a, f) }
      else if (name === 'subfile') { if (a) imported(`${ctx.dirs[0] ?? ''}/${a.slice(0, a.lastIndexOf('/') + 1)}`, a.slice(a.lastIndexOf('/') + 1)) }
      else if (a) ctx.visit(a, ctx.dirs)
      i = e; continue
    }
    if (HEADINGS.has(name) || OWN_UNIT_ARG.has(name)) {
      const { args, end: e } = argsAfter(s, end, 2)
      const req = args.find(a => a.kind === 'req')
      if (!req) { endText(); b.ph(s.slice(i, end), i, end); i = end; continue }
      const saved = b.kind
      if (name === 'footnote' || name === 'thanks') {
        // the footnote's text is a unit of its own, rendered inside its paragraph's unit so the two ranges never overlap
        endText()
        const parent = b.cur, before = b.units.length
        // …and never the title, even inside it: \title{A\thanks{Supported by B}} (Devin and Codex on #296)
        const title = b.title, depth = b.depth
        b.cur = null; b.kind = 'footnote'; b.title = false; b.depth = undefined; walk(s, req.start + 1, req.end - 1, b, ctx); b.flush(); b.kind = saved; b.title = title; b.depth = depth
        const made = b.units.length - before
        // a \\thanks is the title's or an author's note wherever it is written (revtex takes it after \\author{…}): no
        // mark, as frontNote gives the author block's
        if (name === 'thanks') for (const u of b.units.slice(before)) u.front = true
        b.cur = parent
        if (parent && made === 1) { const inner = b.units[b.units.length - 1]; inner.nested = true; parent.pieces.push({ t: 'nested', pre: s.slice(i, inner.start), unit: inner, post: s.slice(inner.end, e) }); parent.end = e }
        else if (parent && made === 0) { parent.pieces.push({ t: 'ph', src: s.slice(i, e) }); parent.end = e }
        else if (parent) b.flush() // a footnote of several paragraphs: the paragraph ends before it
        i = e; continue
      }
      endText(); b.flush()
      b.kind = CAPTIONS.has(name) ? 'caption' : 'heading'; b.title = name === 'title'; b.depth = DEPTH[name]; walk(s, req.start + 1, req.end - 1, b, ctx); b.flush(); b.title = false; b.depth = undefined; b.kind = saved
      i = e; continue
    }
    // \multicolumn{n}{spec}{text}, \multirow{n}{width}{text}, \makecell{text}: only the last argument is prose
    if ((name === 'multicolumn' || name === 'multirow' || name === 'makecell' || name === 'shortstack') && b.cellMode) {
      const want = name === 'multicolumn' || name === 'multirow' ? 3 : 1
      const { args, end: e } = argsAfter(s, end, want + 1)
      const reqs = args.filter(a => a.kind === 'req'), last = reqs.at(-1)
      if (last && reqs.length >= want) { endText(); const id = b.open(s.slice(i, last.start + 1), i); walk(s, last.start + 1, last.end - 1, b, ctx); b.close(id, '}', e); i = e; continue }
    }
    // subfig's \subfloat[caption]{content}: the caption in the optional argument, the content walked
    if (name === 'subfloat') {
      const { args } = argsAfter(s, end, 3)
      const opt = args[0]?.kind === 'opt' ? args[0] : null, content = args.find(a => a.kind === 'req')
      if (content) {
        endText(); b.flush()
        if (opt) { const saved = b.kind; b.kind = 'caption'; walk(s, opt.start + 1, opt.end - 1, b, ctx); b.flush(); b.kind = saved }
        walk(s, content.start + 1, content.end - 1, b, ctx); b.flush()
        i = content.end; continue
      }
    }
    if (FRONT_MATTER.has(name)) {
      const { args, end: e } = argsAfter(s, end, 3)
      endText(); b.flush()
      for (const a of args) (a.kind === 'req' ? frontBlock : frontNotes)(s, a.start + 1, a.end - 1, b, ctx)
      i = e; continue
    }
    if (FRONT_PROSE.has(name) && b.kind === 'author') {
      const { args, end: e } = argsAfter(s, end, 1)
      if (args[0]?.kind === 'req') {
        endText()
        if (FRONT_LINES.has(name)) b.flush()
        const id = b.open(s.slice(i, args[0].start + 1), i); walk(s, args[0].start + 1, args[0].end - 1, b, ctx); b.close(id, '}', e)
        if (FRONT_LINES.has(name)) b.flush()
        i = e; continue
      }
    }
    if (CONTENT_BOX.has(name)) {
      const { args } = argsAfter(s, end, 8)
      const content = args.filter(a => a.kind === 'req')[CONTENT_BOX.get(name) - 1]
      if (content) { endText(); const id = b.open(s.slice(i, content.start + 1), i); walk(s, content.start + 1, content.end - 1, b, ctx); b.close(id, '}', content.end); i = content.end; continue }
    }
    if (INLINE_TEXT.has(name)) {
      const { args, end: e } = argsAfter(s, end, 1)
      if (args[0]?.kind === 'req') { endText(); const id = b.open(s.slice(i, args[0].start + 1), i); walk(s, args[0].start + 1, args[0].end - 1, b, ctx); b.close(id, '}', e); i = e; continue }
    }
    const macro = ctx.macros.get(name)
    const call = macro && macroArgs(s, end, macro, to)
    if (call && macro.prose) {
      const arg = call.reqs[macro.prose - 1 - (macro.opt ? 1 : 0)]
      if (arg?.group) {
        // an argument that holds paragraphs, a figure or a proof (\\techreport{…}, \\revised{…} around whole passages)
        // is walked as an environment's body is; one within a paragraph is part of it, the call around it a pair
        if (holdsBlock(s.slice(arg.start + 1, arg.end - 1))) { endText(); b.flush(); walk(s, arg.start + 1, arg.end - 1, b, ctx); b.flush(); i = call.end; continue }
        endText(); const id = b.open(s.slice(i, arg.start + 1), i); walk(s, arg.start + 1, arg.end - 1, b, ctx); b.close(id, s.slice(arg.end - 1, call.end), call.end); i = call.end; continue
      }
    }
    if (call) { endText(); b.ph(s.slice(i, call.end), i, call.end); i = call.end; continue }
    if (name === 'verb') { const d = s[end]; const e = s.indexOf(d, end + 1); const stop = e < 0 ? end : e + 1; endText(); b.ph(s.slice(i, stop), i, stop); i = stop; continue }
    if (name === 'par') { endText(); b.flush(); i = end; continue }
    // an accent and the letter it sits on are one opaque piece: \'o, \'{o}, \"\i, \v c. Left as text, the letter would be
    // translated away and the accent put on whatever comes next — pdfTeX stops at a CJK character there
    if (ACCENTS.has(name)) {
      let k = /^[A-Za-z]$/.test(name) ? skipSpaces(s, end) : end
      if (s[k] === '{') k = matchGroup(s, k)
      else if (s[k] === '\\') k = commandAt(s, k).end
      else k = k + 1
      if (k > 0 && k <= to) { endText(); if (!b.ph(s.slice(i, k), i, k)) startText(); i = k; continue }
    }
    if (name === '\\') { const { args, end: e } = argsAfter(s, end, 1); const stop = args[0]?.kind === 'opt' ? e : end; endText(); if (b.cellMode) { b.flush(); i = stop; continue } b.ph(s.slice(i, stop), i, stop); i = stop; continue }
    // any other command: opaque together with its adjacent arguments
    // (unknown arity: every adjacent argument goes with it — some prose stays untranslated, nothing breaks)
    // booktabs' \cmidrule(lr){2-5} and \cmidrule[w](lr){2-5}: a trim argument in parentheses
    let from = end
    if (name === 'cmidrule') { const k0 = skipSpaces(s, argsAfter(s, end, 1).end); if (s[k0] === '(') { const c0 = s.indexOf(')', k0); if (c0 > 0 && c0 < to) from = c0 + 1 } }
    let { end: e } = !/^[A-Za-z@]+$/.test(name) ? { end } : NO_ARGS.has(name) ? optsAfter(s, from, OPT_ONLY.has(name)) : commandArgs(s, from, name)
    // TeX's own assignment and glue syntax belongs to the command: \looseness=-1, \parindent=0pt, \vskip 3pt plus 1fil, \penalty-100
    if (e === end && /^[A-Za-z@]+$/.test(name)) { const m = s.slice(e, Math.min(to, e + 120)).match(name === 'hrule' || name === 'vrule' ? RULE_SPEC : ASSIGNMENT); if (m) e += m[0].length }
    endText(); b.ph(s.slice(i, e), i, e)
    // a command with a letter name eats the following spaces in TeX; keep them with it
    i = e
  }
  endText()
}

// ---------------------------------------------------------------- project
const listSources = fsys => fsys.list().filter(f => /\.(tex|sty)$/i.test(f))

/** the package's tabularray tables (TBLR_ENVS and the names \\NewTblrEnviron gives), and whether \\SetTblrInner makes
 *  every table's cells math; comments taken out first */
const tblrOf = texts => {
  const text = texts.map(uncommented).join('\n')
  const named = [...text.matchAll(/\\NewTblrEnviron\s*\{\s*([^}\s]+)\s*\}/g)].map(m => m[1])
  const inner = [...text.matchAll(/\\SetTblrInner\s*(?:\[[^\]]*\])?\s*\{/g)].map(m => { const e = matchGroup(text, m.index + m[0].length - 1); return e > 0 ? text.slice(m.index, e) : '' })
  return { tblrEnvs: new Set([...TBLR_ENVS, ...named]), tblrMath: inner.some(t => TBLR_MATH.test(t)) }
}

/** `root`: a directory (Node) or a file system (folder, inMemory) */
export function loadProject(root, main, { tables = false } = {}) {
  const fsys = asFiles(root)
  const sourceText = f => latin1(fsys.read(f))
  // a file as TeX finds it — in the directories import.sty puts on its path (`dirs`, the last imported first), then from
  // the package's root, where TeX runs — and by the name the package holds it under, whatever spelling named it
  // (\input{./sections/a.tex}): the units' file and the translation's key, which must replace that file rather than
  // sit beside it — under ./sections/a.tex the compile set the English over every unit of 2608.08350 past its abstract
  const read = (rel, dirs = []) => { for (const dir of [...dirs, '']) for (const cand of [rel, `${rel}.tex`]) { const key = normalizePath(`${dir}/${cand}`), bytes = fsys.read(key); if (bytes) return { rel: key, text: latin1(bytes) } } return null }
  const units = [], files = new Map(), seen = new Set()
  const mainFile = read(main)
  if (!mainFile) throw new Error(`main file ${main} not found`)
  const all = mainFile.text
  const theorems = new Set([...all.matchAll(/\\newtheorem\*?\s*\{([^}]+)\}/g)].map(m => m[1].trim()).concat(['proof', 'theorem', 'lemma', 'corollary', 'proposition', 'definition', 'remark', 'example']))
  const skipped = {}
  // \newcommand{\be}{\begin{equation}}, \def\ee{\end{equation}} and the like, in any .tex or .sty of the package
  const envMacros = new Map()
  const sources = listSources(fsys)
  for (const f of sources) {
    const t = sourceText(f)
    for (const m of t.matchAll(/\\(?:(?:re|provide)?newcommand\*?\s*\{?\\([A-Za-z@]+)\}?|def\\([A-Za-z@]+))\s*\{\s*\\(begin|end)\s*\{([^}]+)\}\s*\}/g)) envMacros.set(m[1] ?? m[2], { side: m[3], env: m[4].trim() })
  }
  // the paper's macros twice over, each for its own reader: `macros`, how a call takes its arguments and which it sets
  // as prose (paperMacros, the walker's); `bodies`, what each expands to (macroBodies, a display's letters)
  const skipEnvs = new Set([...sources.map(sourceText).join('\n').matchAll(/\\(?:lstnewenvironment|newtcblisting|DeclareTCBListing|NewTCBListing|DefineVerbatimEnvironment|newminted)\s*\*?\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)].map(m => m[1].trim()))
  // the environments of the paper's own that TeX reads by lines (LINE_ENVS), in a class it ships too
  const lineEnvs = new Set([...skipEnvs, ...lineEnvsOf(fsys.list().filter(f => /\.(tex|sty|cls)$/i.test(f)).map(sourceText))])
  const ctx = { tables, theorems, fits: [], lineEnvs, macros: paperMacros(sources.map(sourceText)), envMacros, ifs: new Set([...sources.map(sourceText).join('\n').matchAll(/\\newif\s*\\(if[A-Za-z@]+)/g)].map(m => m[1])), skipEnvs, skipped, visit: (rel, dirs) => visit(rel, dirs), dirs: [], bodies: macroBodies(sources.map(sourceText)), ...tblrOf(sources.map(sourceText)) }
  /** `dirs`: the directories import.sty puts on the path an \input in the file is looked for on, the last imported first */
  function visit(rel, dirs = []) {
    const f = read(rel, dirs); if (!f || seen.has(f.rel)) return
    seen.add(f.rel); files.set(f.rel, f.text)
    const b = new Builder(f.rel, units, f.text, ctx.bodies), outer = ctx.dirs
    ctx.dirs = dirs
    let from = 0, to = f.text.length
    if (f.rel === mainFile.rel) {
      const m = f.text.match(/\\begin\s*\{document\}/)
      // the preamble: the title is prose, and the front matter's notes (FRONT_MATTER), in the order they are written
      const pre = m ? f.text.slice(0, m.index) : ''
      const t = pre.match(/\\title\s*(\[[^\]]*\])?\s*\{/)
      const front = [...pre.matchAll(/\\([A-Za-z@]+)(?![A-Za-z@])\*?/g)].filter(c => FRONT_MATTER.has(c[1]) && !inComment(pre, c.index))
      for (const at of [t?.index, ...front.map(c => c.index)].filter(x => x !== undefined).sort((x, y) => x - y)) {
        if (at === t?.index) { const s0 = t.index + t[0].length - 1, e0 = matchGroup(f.text, s0); if (e0 > 0) { b.kind = 'heading'; b.title = true; walk(f.text, s0 + 1, e0 - 1, b, ctx); b.flush(); b.title = false; b.kind = undefined } continue }
        const c = front.find(x => x.index === at)
        for (const a of argsAfter(f.text, at + c[0].length, 3).args) (a.kind === 'req' ? frontBlock : frontNotes)(f.text, a.start + 1, a.end - 1, b, ctx)
      }
      from = m ? m.index + m[0].length : 0
      const e = f.text.match(/\\end\s*\{document\}/); to = e ? e.index : to
    }
    walk(f.text, from, to, b, ctx); b.flush()
    ctx.dirs = outer
  }
  visit(mainFile.rel)
  // a source declared in a Latin-1 family encoding: its bytes read as latin1 are already the right characters
  const enc = all.match(/\\usepackage\s*\[([^\]]*)\]\s*\{inputenc\}/)?.[1]?.split(',').map(x => x.trim()).find(x => /^(latin1|latin9|ansinew|cp1252|cp1250|latin2|applemac|decmulti)$/.test(x))
  const isUtf8 = t => { try { new TextDecoder('utf-8', { fatal: true }).decode(latin1Bytes(t)); return true } catch { return false } }
  const transcode = enc ? new Set([...files].filter(([, t]) => !isUtf8(t)).map(([f]) => f)) : new Set()
  return { main: mainFile.rel, files, units, skipped, fits: ctx.fits, lineEnvs, inputenc: enc ?? null, transcode }
}

/** the unit as the translator sees it: text with ⟦n⟧ for opaque pieces and ⟦n⟧…⟦/n⟧ for formatting pairs */
export function unitText(u) {
  let n = 0
  return u.pieces.map(p => p.t === 'text' ? p.s : p.t === 'ph' ? `⟦${++n}⟧` : p.t === 'open' ? `⟦b${p.id}⟧` : p.t === 'close' ? `⟦/b${p.id}⟧` : `⟦f${++n}⟧`).join('')
}

// ---------------------------------------------------------------- pseudo-translation
/**
 * Per target language, the length of a real translation in grapheme clusters per letter of the English it comes from,
 * and a sample text (one English sentence as Microsoft's free endpoint translates it). Measured over 48 prose units of
 * four papers of four document classes (spikes/lang-ratio.mjs, 2026-09-22; each language's quartiles lie within 10 %
 * of its ratio): a page count or a line break measured on the pseudo-translation stands for the real one's only if it
 * is as long and written like the language. The first ratios, guessed (zh 0.45, ja 0.55, de 1.15), were a third too
 * long for Chinese and a sixth too short for German.
 */
const PSEUDO = {
  zh: { ratio: 0.344, sample: '本文提出了一种新的数据分析方法，并验证了其在多个基准上的有效性;实验结果显示，该方法在准确性和效率上均优于现有工作。' },
  'zh-Hant': { ratio: 0.348, sample: '本文提出一種新的數據分析方法，並驗證其在多項基準上的有效性;實驗結果顯示，該方法在準確度與效率上均優於現有工作。' },
  ja: { ratio: 0.494, sample: '本論文は新しいデータ解析手法を提案し、その効果を複数のベンチマークで検証します。実験結果は、この手法が精度と効率の両面で既存の研究を上回っていることを示しています。' },
  ko: { ratio: 0.578, sample: '이 논문은 데이터 분석 방법을 제안하고 여러 벤치마크에서 그 효과를 검증합니다; 실험 결과는 이 방법이 정확성과 효율성 모두에서 기존 연구보다 우수한 성능을 보였음을 보여줍니다.' },
  ar: { ratio: 0.983, sample: 'تقترح هذه الورقة طريقة جديدة لتحليل البيانات وتؤكد فعاليتها على عدة معايير؛ تظهر النتائج التجريبية أن الطريقة تتفوق على الأعمال الحالية من حيث الدقة والكفاءة.' },
  ru: { ratio: 1.273, sample: 'В данной статье предлагается новый метод анализа данных и подтверждается его эффективность на нескольких эталонах; Экспериментальные результаты показывают, что метод превосходит существующие работы как по точности, так и по эффективности.' },
  hi: { ratio: 0.815, sample: 'यह पत्र डेटा का विश्लेषण करने के लिए एक नई विधि का प्रस्ताव करता है और कई बेंचमार्क पर इसकी प्रभावशीलता की पुष्टि करता है; प्रायोगिक परिणाम बताते हैं कि विधि सटीकता और दक्षता दोनों में मौजूदा काम से बेहतर प्रदर्शन करती है।' },
  de: { ratio: 1.403, sample: 'Dieses Papier schlägt eine neue Methode zur Datenanalyse vor und überprüft deren Wirksamkeit auf mehreren Benchmarks; Die experimentellen Ergebnisse zeigen, dass die Methode bestehende Arbeit sowohl in Genauigkeit als auch Effizienz übertrifft.' },
  es: { ratio: 1.378, sample: 'Este artículo propone un nuevo método para analizar datos y verifica su efectividad en varios puntos de referencia; Los resultados experimentales muestran que el método supera al trabajo existente tanto en precisión como en eficiencia.' },
  fr: { ratio: 1.422, sample: 'Cet article propose une nouvelle méthode d’analyse des données et en vérifie l’efficacité sur plusieurs références ; Les résultats expérimentaux montrent que la méthode surpasse le travail existant en précision et en efficacité.' },
  pt: { ratio: 1.297, sample: 'Este artigo propõe um novo método para analisar dados e verifica sua eficácia em vários benchmarks; Os resultados experimentais mostram que o método supera o trabalho existente tanto em precisão quanto em eficiência.' },
  vi: { ratio: 1.205, sample: 'Bài báo này đề xuất một phương pháp mới để phân tích dữ liệu và xác minh hiệu quả của nó trên một số tiêu chuẩn; Kết quả thực nghiệm cho thấy phương pháp này vượt trội hơn các công trình hiện có về cả độ chính xác lẫn hiệu quả.' },
}
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })
const clusters = new Map()
/** a language's sample as grapheme clusters; a space-separated one ends with a space, so that it follows on from itself */
const clustersOf = lang => {
  if (!clusters.has(lang)) {
    const { sample } = PSEUDO[lang]
    clusters.set(lang, Array.from(segmenter.segment(/\s/.test(sample) ? `${sample} ` : sample), s => s.segment))
  }
  return clusters.get(lang)
}
/** the same pieces, text replaced by target-language text of similar length; placeholders in the same order. Filled by
 *  grapheme cluster, so a script whose letters combine (Devanagari's vowel signs) is never cut inside one */
export function pseudoTranslate(u, lang) {
  const { ratio } = PSEUDO[lang]
  const sample = clustersOf(lang)
  let k = 0
  return u.pieces.map(p => {
    if (p.t !== 'text') return p
    const letters = (p.s.match(/\p{L}/gu) ?? []).length
    if (!letters) return p
    const n = Math.max(1, Math.round(letters * ratio))
    let out = ''
    for (let i = 0; i < n; i++, k++) out += sample[k % sample.length]
    // keep the piece's leading and trailing whitespace: it separates the text from commands next to it
    return { t: 'text', tr: true, s: (p.s.match(/^\s*/)[0]) + out + (p.s.match(/\s*$/)[0]) }
  })
}

/** the patched files as bytes (Map path → Uint8Array): each top-level unit's range replaced by its translated pieces, the rest untouched.
 *  Source text keeps its bytes (read as latin1); translated text is written as UTF-8.
 *  `mark(u)` → { start, end } or null: TeX inserted before the unit's first word and after the last character of
 *  its last text (before trailing space), so a PDF destination can record where the unit begins and ends on the page.
 *  Both sit in running text on purpose: after a display (\\]) a mark would open a line of its own, and after an
 *  environment it would stand in the vertical list, where \\addvspace no longer sees the skip before it. The start
 *  mark comes with \\leavevmode, which starts the paragraph just as the word would; after the word it would come
 *  between the word and its comma, and a lost kern there respaces the whole line. */
export function patch(project, translated /* Map unit -> pieces */, { guardControlWords = true, mark } = {}) {
  const out = new Map()
  const render = u => {
    const srcEnc = project.transcode?.has(u.file) ? 'utf8' : 'latin1'
    const pieces = translated.get(u) ?? u.pieces
    const m = mark?.(u)
    // before the first word, inside any font command's group (nothing precedes it there to kern with); before an
    // inline formula or citation that comes first; before the macro when the word is glued to one (\\name's: between
    // the two the mark would cost the kern, and a macro that looks ahead, as \\xspace does, would see the mark). Any
    // other command at the head of the paragraph is passed over — \\noindent, \\vspace, a run-in heading macro — since
    // \\leavevmode ahead of it would start the paragraph early and indent or move it. A text piece is cut after its
    // leading space, which is ASCII, so the cut never falls inside a UTF-8 sequence of source text read as latin1
    let startAt = -1, startCut = 0
    if (m) for (let k = 0; k < pieces.length; k++) {
      const p = pieces[k]
      if (p.t === 'text') {
        const w = /^[ \t\r\n]*(?=[^ \t\r\n])/.exec(p.s)
        if (!w) continue
        const prev = pieces[k - 1]
        if (w[0].length === 0 && prev?.t === 'ph' && /\\[A-Za-z@]+\*?$/.test(prev.src)) { startAt = k - 1; startCut = -1 } else { startAt = k; startCut = w[0].length }
        break
      }
      if (p.t === 'open') continue
      if (p.t === 'ph' && INLINE.test(p.src)) { startAt = k; startCut = -1; break }
      if (p.t !== 'ph') break
    }
    let endAt = -1
    if (m) for (let k = pieces.length - 1; k >= 0; k--) if (pieces[k].t === 'text' && /[^ \t\r\n]/.test(pieces[k].s)) { endAt = k; break }
    // a mark around the whole of a unit (AUTHOR_WIDE): from its first piece to its last, inside the groups that open
    // and close it; a command at either end goes inside too
    let endAfter = false
    if (m?.whole) {
      const inside = q => q.t !== 'open' && q.t !== 'close' && !(q.t === 'text' && !/[^ \t\r\n]/.test(q.s))
      startAt = pieces.findIndex(inside)
      startCut = pieces[startAt]?.t === 'text' ? /^[ \t\r\n]*/.exec(pieces[startAt].s)[0].length : -1
      endAt = pieces.findLastIndex(inside)
      endAfter = endAt >= 0 && pieces[endAt].t !== 'text'
    }
    // what acts on the unit's paragraph as a whole — its leading, its line probe — goes where the unit begins, outside
    // every group: inside a run-in label's (\\textbf{Label.}, a paper's \\nosection{…}), where the mark goes, an
    // assignment is undone when the label ends, and those paragraphs kept the paper's leading beside translated ones
    // at 1.3 times it (2608.06007). Where the line the unit begins on holds, before it, the \\begin or \\end of an
    // environment TeX reads by lines (lineBound, LINE_ENVS), it goes past that line's end and the spaces that open the
    // next, before the unit's first word or command: TeX reads the line end's space and then ours, as it read the space
    // before, and the line keeps nothing after the environment's \\begin or \\end. A unit whose own words share that
    // line — the paper's choice — is marked where it begins, as before. (piece `beforeAt`, at `beforeCut` in its text,
    // or before it at -1)
    let beforeAt = 0, beforeCut = -1
    if (m?.before && lineBound(project.files?.get(u.file) ?? '', u.start, project.lineEnvs)) {
      let k = 0, crossed = false, cut = -1
      for (; k < pieces.length && pieces[k].t === 'text'; k++) {
        const ws = /^[ \t\r\n]*/.exec(pieces[k].s)[0]
        crossed ||= ws.includes('\n')
        if (ws.length < pieces[k].s.length) { cut = ws.length; break }
      }
      if (crossed) { beforeAt = k; beforeCut = cut }
    }
    const parts = []
    for (let k = 0; k < pieces.length; k++) {
      const p = pieces[k]
      if (m?.before && k === beforeAt && beforeCut === -1) parts.push(utf8Bytes(m.before))
      if (p.t === 'nested') { parts.push(bytesOf(p.pre, srcEnc), render(p.unit), bytesOf(p.post, srcEnc)); continue }
      if (p.t === 'text') {
        const enc = p.tr ? 'utf8' : srcEnc
        const beforeHere = !!m?.before && k === beforeAt && beforeCut >= 0
        if (!m || (k !== startAt && k !== endAt && !beforeHere)) { parts.push(bytesOf(p.s, enc)); continue }
        // in the order they stand: `before` at the end of the leading space, where the start mark goes too, and after it
        const cuts = beforeHere ? [[beforeCut, m.before]] : []
        if (k === startAt) cuts.push([startCut, m.start])
        if (k === endAt) cuts.push([Math.max(startAt === k ? startCut : 0, p.s.replace(/[ \t\r\n]*$/, '').length), m.end])
        let at = 0
        for (const [c, tex] of cuts) { parts.push(bytesOf(p.s.slice(at, c), enc), utf8Bytes(tex)); at = c }
        parts.push(bytesOf(p.s.slice(at), enc))
        continue
      }
      if (k === startAt && startCut === -1) parts.push(utf8Bytes(m.start))
      parts.push(bytesOf(p.src, srcEnc))
      if (k === endAt && endAfter) parts.push(utf8Bytes(m.end))
      // XeTeX reads CJK characters as letters: \method后 would be one control word. {} ends the name
      const next = pieces[k + 1]
      if (guardControlWords && /\\[A-Za-z@]+\*?$/.test(p.src) && next?.t === 'text' && next.tr && /^[^\s{[]/.test(next.s)) parts.push(utf8Bytes('{}'))
    }
    if (m?.before && beforeAt === pieces.length && beforeCut === -1) parts.push(utf8Bytes(m.before))
    return concat(parts)
  }
  const byFile = new Map()
  for (const u of project.units) if (!u.nested) (byFile.get(u.file) ?? byFile.set(u.file, []).get(u.file)).push(u)
  for (const [file, text] of project.files) {
    const us = (byFile.get(file) ?? []).sort((a, b) => a.start - b.start)
    const parts = []
    const enc = project.transcode?.has(file) ? 'utf8' : 'latin1'
    // a table with a translated cell goes into \\axtfit with its original, which sets it no wider than the wider of
    // the line and the original (FIT_DEF)
    const fits = (project.fits ?? []).filter(f => f.file === file && us.some(u => u.start >= f.start && u.end <= f.end && translated.has(u)))
    // (a tabular* between \\axtstar and \\axtstarbody, which measure its body at its columns' width)
    const inserts = fits.flatMap(f => [[f.start, [utf8Bytes(f.star ? '\\axtfit{\\axtstar' : '\\axtfit{')]], ...(f.star ? [[f.star, [utf8Bytes('\\axtstarbody')]]] : []), [f.end, [utf8Bytes('}{'), bytesOf(text.slice(f.start, f.end), enc), utf8Bytes('}')]]]).sort((a, b) => a[0] - b[0])
    const copy = (from, to) => {
      for (const [pos, bytes] of inserts) if (pos >= from && pos < to) { parts.push(bytesOf(text.slice(from, pos), enc), ...bytes); from = pos }
      parts.push(bytesOf(text.slice(from, to), enc))
    }
    let at = 0
    for (const u of us) { if (u.start < at) continue; copy(at, u.start); parts.push(render(u)); at = u.end }
    copy(at, text.length + 1)
    out.set(file, concat(parts))
  }
  return out
}

/** \\axtend{name}: a unit's end mark, which must not change where a line breaks. A mark after glue — the glue xeCJK sets
 *  after a full-width stop — makes that glue a place to break before it, and in a full last line TeX took it: the mark
 *  alone on a line of its own, one line more in the caption, and no word beside the mark to bound the unit with (the
 *  owner's Figure 1, 2026-09-23, in the browser's XeTeX). So the glue is taken off, the mark set against the last
 *  letter, and the same glue put back after it: where a paragraph ends \\par takes it off as before, and inside a line
 *  it breaks where it did. \\relax first: XeTeX sets a word, and xeCJK's glue after it, only when a command that does
 *  not expand comes, so a test before one would look at the list without them. On one line: a line end in the macro
 *  would be a space */
const END_MARK = [
  '\\protected\\def\\axtend#1{\\relax\\ifhmode\\ifnum\\lastnodetype=11 \\edef\\axtskip{\\the\\lastskip}\\unskip\\nobreak\\axtmark{#1}\\hskip\\axtskip\\relax%',
  '\\else\\axtmark{#1}\\fi\\else\\axtmark{#1}\\fi}',
]
/**
 * A style's abstract heading written out (ICLR's \\centerline{\\large\\sc Abstract}) in place of \\abstractname, which
 * babel sets in the target's language: the word goes by \\abstractname, when it is defined, as the class's own
 * heading does (RT-1's stayed "ABSTRACT" over a translated abstract)
 */
export function localizeNames(text) {
  let out = text
  for (const m of [...text.matchAll(/\\(?:re)?newenvironment\*?\s*\{abstract\}\s*(?:\[[^\]]*\]\s*)*\{/g)].reverse()) {
    const open = m.index + m[0].length - 1, close = matchGroup(out, open)
    if (close < 0) continue
    const body = out.slice(open, close).replace(/(^|[^\\A-Za-z@])(Abstract|ABSTRACT)(?![A-Za-z])/g, (x, pre) => `${pre}\\ifdefined\\abstractname\\abstractname\\else Abstract\\fi{}`)
    out = out.slice(0, open) + body + out.slice(close)
  }
  return out
}
const FORCED_BREAK = /^\\(?:\\\*?(?:\s*\[[^\]]*\])?|newline|linebreak(?:\s*\[[^\]]*\])?)\s*$/
const OWN_LINE_AFTER = /^\\(?:tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge|vspace|vskip|smallskip|medskip|bigskip)(?![A-Za-z])/
const CJK_EDGE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u
/**
 * A translation's line breaks as its own, not the paper's.
 * Room to break inside a long piece of code or an inline formula: after a slash (and after an underscore in code). A
 * path set in \\texttt or a formula like π₀Homeo(X)/π₀Homeo(D⁴) had no point to break at: the line ran past the margin,
 * or TeX set the whole paragraph loose around it (2608.06701's lib/ansible/plugins/callback/__init__.py, 2608.02785).
 * Short ones are left as they are.
 * No forced break in a title or a heading where the translation put it inside a phrase: the author put it where the
 * English line was to end (21 titles of the corpus's 123 papers, "The Missing Tensor Management\\ Layer"), and the engine
 * carried it to wherever its placeholder went — "张量管理\\层", a title of three lines once the first ran full
 * (2608.06007). One the translation keeps after a colon, a dash or a stop parts a title from its subtitle, and one
 * followed by a change of size or a vertical space begins a line of its own by design: both stay.
 * A title that takes two lines takes two of about the same length (\\axtbalance, BALANCE_DEF): set as it came, its
 * last line held one character (2608.06007). And it breaks between words: TeX breaks CJK text between any two
 * characters, and the balanced title's first line ended inside a two-character word
 */
const HAN_KANA = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
/** a translated text piece of a title with its CJK words kept whole: \nobreak between the characters of each word the
 *  segmenter finds, so a line ends between words (Japanese by its kana, Chinese otherwise) */
function wordsKept(p) {
  if (p.t !== 'text' || !p.tr || !HAN_KANA.test(p.s) || typeof Intl?.Segmenter !== 'function') return [p]
  const out = []
  let text = ''
  for (const { segment, isWordLike } of new Intl.Segmenter(/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(p.s) ? 'ja' : 'zh', { granularity: 'word' }).segment(p.s)) {
    const chars = [...segment]
    if (!isWordLike || chars.length < 2 || !chars.every(c => HAN_KANA.test(c))) { text += segment; continue }
    chars.forEach((c, k) => { text += c; if (k < chars.length - 1) { out.push({ ...p, s: text }, { t: 'ph', src: '\\nobreak ' }); text = '' } })
  }
  if (text) out.push({ ...p, s: text })
  return out
}
export function lineBreaks(u, pieces) {
  if (u.title) pieces = [{ t: 'ph', src: '\\axtbalance ' }, ...pieces.flatMap(wordsKept)]
  // a line of names too: where it is set as a paragraph (AUTHOR_WIDE), a name kept whole (2608.06701: "レ" over "イハネ")
  else if (u.kind === 'author') pieces = pieces.flatMap(wordsKept)
  const before = k => { for (let j = k - 1; j >= 0; j--) if (pieces[j].t !== 'text' || /\S/.test(pieces[j].s)) return pieces[j]; return null }
  const after = k => { for (let j = k + 1; j < pieces.length; j++) if (pieces[j].t !== 'text' || /\S/.test(pieces[j].s)) return pieces[j]; return null }
  return pieces.map((p, k) => {
    if (p.t !== 'ph') return p
    if (u.kind === 'heading' && FORCED_BREAK.test(p.src)) {
      const prev = before(k), next = after(k)
      if (prev?.t === 'text' && /[:;.?!\u2013\u2014\u3002\uff01\uff1a\uff1b\uff1f]\s*$/.test(prev.s)) return p
      if (next?.t === 'ph' && OWN_LINE_AFTER.test(next.src)) return p
      const cjk = (prev?.t === 'text' && CJK_EDGE.test(prev.s.trimEnd().slice(-1))) || (next?.t === 'text' && CJK_EDGE.test(next.s.trimStart().slice(0, 1)))
      return { t: 'text', s: cjk ? '' : ' ', tr: true }
    }
    if (p.src.length < 24) return p
    if (/^\$[^$]/.test(p.src) && p.src.endsWith('$') && p.src.includes('/')) return { ...p, src: p.src.replace(/\/(?!\/)/g, '/\\allowbreak ') }
    if (/^\\(?:texttt|path|code|verb)(?![A-Za-z])/.test(p.src) && !/^\\verb/.test(p.src)) return { ...p, src: p.src.replace(/\/(?=[^}])/g, '/\\allowbreak{}').replace(/\\_(?=[A-Za-z0-9])/g, '\\_\\allowbreak{}') }
    return p
  })
}
/** Before \\begin{document} of a translation: nothing past the page. A line TeX cannot fill within tolerance is set a
 *  little looser before it is let run past the margin: a translation breaks its lines elsewhere than the paper did,
 *  and a long inline formula it cannot break then stood out of the column (German 2608.02785: 11 lines over 5 pt, the
 *  original's 2). Paragraphs that set well are set as they were; one that needs it may be set loose throughout, which
 *  EVEN_SPACES and lineBreaks keep down. And a float the translation made taller than the page is set smaller, as a
 *  whole, to the page's height: LaTeX lets it run past the foot (RT-1's model card, a framed page of lists whose
 *  Chinese lines are spaced wider than the English ran over the page number, its last lines and caption lost). The
 *  scaling's rounding is taken back: a float a few sp taller than the page is never placed, and LaTeX stops with "Output
 *  loop---100 consecutive dead cycles" */
export const NO_OVERFLOW = String.raw`\makeatletter\AtBeginDocument{\setlength\emergencystretch{2em}\let\axt@largefloat\@largefloatcheck
\def\@largefloatcheck{\ifdim\dimexpr\ht\@currbox+\dp\@currbox\relax>\textheight\ifdefined\resizebox\axt@floatfit\else\axt@largefloat\fi\fi}}
\def\axt@floatfit{\@latex@warning{Float set smaller to the page's height}\global\setbox\@currbox\vbox{\hbox to\wd\@currbox{\hss\resizebox*{!}{\textheight}{\box\@currbox}\hss}}%
\ifdim\dimexpr\ht\@currbox+\dp\@currbox\relax>\textheight\ht\@currbox\dimexpr\textheight-\dp\@currbox\relax\fi}\makeatother
`
/** Before \\begin{document} of a translation set by pdfTeX: microtype, unless the paper loads it, whose font expansion
 *  evens the word spaces of a language whose words are longer than English's. German on the round's five papers, with
 *  NO_OVERFLOW and lineBreaks: loose lines (badness 1000 and over) 91 → 43, overfull ones 4 → 4. XeTeX expands no
 *  font, and CJK text breaks between any two characters */
export const EVEN_SPACES = '\\makeatletter\\@ifpackageloaded{microtype}{}{\\usepackage{microtype}}\\makeatother\n'
/** \axtfit{translated table}{original table}: the translation set no wider than the wider of the line and the
 *  original, scaled down when its translation made it wider (German in columns that do not wrap ran past the page:
 *  2608.06701's Table I); as it is when it fits, or when no \resizebox is loaded. The original's own width counts: a
 *  table its author let run past a narrow box (RT-1's model card, four p columns 13 cm wide in a minipage a third of
 *  the text wide) was scaled to that box's width, a third of its size and unreadable, although its translation was no
 *  wider than it. The original is set in a box that is never used, every LaTeX counter put back after it. Never boxed
 *  inside a threeparttable, which takes its tabular over to measure it: Springer Nature's class sets every table in
 *  one, and a box around the tabular left its environments unclosed (2608.02991: "Missing \endgroup inserted", 164
 *  errors). With \axtfitheighttrue (the geometry lock, which keeps every block in its original's box, as service H
 *  does, and the generic type) the translation is set no taller than the original either, and with \axt@fitmin never
 *  below that share of its own width: long German cells capped at a short original's height went to a sixth of their
 *  width. A translation narrower than its original keeps the original's width, the table in its middle, so that the
 *  paper's own scaling (adjustbox's max width, a \resizebox to the line) scales it as it scaled the original: a
 *  Japanese Table 9 of 2608.15761 narrower than its original escaped the 0.95 that one was scaled by and stood 5.6 %
 *  larger. The kept width goes into a paragraph as the table itself did (\leavevmode), or \centering has nothing to
 *  centre: a bare \hbox after a float's \label sat at the left margin, 2608.21180's Table 3 80 pt off its original.
 *  \axtstar … \axtstarbody around a tabular* (patch) sets it at its columns' width where that is wider than
 *  the width it was given, which \axtfit then scales back: Japanese Table 1 of 2608.05876 ran 38 pt into the next
 *  column. \axtwide{names} (AUTHOR_WIDE), in a box that does not wrap, sets a line wider than the line as a centred
 *  paragraph of the line's width, and anything else as it is. Goes first in the main file */
/** \axtbalance, at the start of a translated title: its lines of about the same length. A skip that stretches without
 *  limit (\centering, \raggedright) lets TeX fill every line but the last and leave that one short; the same skips with
 *  a finite stretch (the page's width in all, halved when both sides stretch) and no \parfillskip make a short line
 *  cost more than two even ones. Justified text, whose skips do not stretch, is left as it is. Not for headings, whose
 *  text is set again in the table of contents, where \parfillskip draws the dotted line */
export const BALANCE_DEF = String.raw`\protected\def\axtbalance{\ifnum\gluestretchorder\rightskip>0 \ifnum\gluestretchorder\leftskip>0 \leftskip=0pt plus .5\hsize\rightskip=0pt plus .5\hsize\else\rightskip=0pt plus \hsize\fi\parfillskip=0pt\relax\fi}
`
export const FIT_DEF = String.raw`\makeatletter\newsavebox\axt@fitbox\newsavebox\axt@widebox\newdimen\axt@fitwd\newdimen\axt@fitht\newdimen\axt@fittot\newdimen\axt@origwd\newdimen\axt@starwd\newif\ifaxtfitheight\def\axt@tpt{threeparttable}\def\axt@fitmin{0}
\long\def\axtfit#1#2{\ifx\@currenvir\axt@tpt\expandafter\@firstoftwo\else\expandafter\@secondoftwo\fi{#1}{\axt@fit{#1}{#2}}}
\def\axt@counters{\begingroup\def\@elt##1{\global\csname c@##1\endcsname\the\csname c@##1\endcsname\relax}\xdef\axt@countersback{\cl@@ckpt}\endgroup}
\long\def\axt@fit#1#2{\axt@counters\sbox\axt@fitbox{#2}\axt@countersback\axt@origwd=\wd\axt@fitbox\axt@fitwd=\axt@origwd\ifdim\axt@fitwd<\linewidth\axt@fitwd=\linewidth\fi
  \axt@fitht=\dimexpr\ht\axt@fitbox+\dp\axt@fitbox\relax\sbox\axt@fitbox{#1}\axt@fittot=\dimexpr\ht\axt@fitbox+\dp\axt@fitbox\relax
  \ifaxtfitheight\ifdim\axt@fitht>\z@\ifdim\axt@fittot>\axt@fitht\axt@fittot=\dimexpr\wd\axt@fitbox*\axt@fitht/\axt@fittot\relax\ifdim\axt@fittot<\axt@fitmin\wd\axt@fitbox\axt@fittot=\axt@fitmin\wd\axt@fitbox\fi\ifdim\axt@fittot<\axt@fitwd\axt@fitwd=\axt@fittot\fi\fi\fi\fi
  \ifdim\wd\axt@fitbox>\axt@fitwd\ifdefined\resizebox\sbox\axt@fitbox{\resizebox{\axt@fitwd}{!}{\usebox\axt@fitbox}}\fi\fi
  \ifdim\wd\axt@fitbox<\axt@origwd\leavevmode\hbox to\axt@origwd{\hss\usebox\axt@fitbox\hss}\else\usebox\axt@fitbox\fi}
\long\def\axtstar\begin#1#2#3#4\axtstarbody\end#5{\axt@counters\setbox\z@\hbox{\begin{tabular}{#3}#4\end{tabular}}\axt@countersback\axt@starwd=\wd\z@\ifdim\axt@starwd<#2\relax\axt@starwd=#2\relax\fi\begin{tabular*}{\axt@starwd}{#3}#4\end{tabular*}}
\protected\long\def\axtwide#1{\let\axt@next\@firstofone\ifhmode\ifinner\let\axt@next\axt@wide\fi\fi\axt@next{#1}}
\long\def\axt@wide#1{\axt@counters\sbox\axt@widebox{#1}\axt@countersback\ifdim\wd\axt@widebox>\linewidth\expandafter\axt@widepar\else\expandafter\@firstofone\fi{#1}}
\long\def\axt@widepar#1{\parbox[t]{\dimexpr\linewidth-2\tabcolsep\relax}{\centering#1}}
\AtBeginDocument{\ifdefined\pdfstringdefDisableCommands\pdfstringdefDisableCommands{\def\axtwide#1{#1}}\fi}
\makeatother
`

/** \\axtmark{name}: a named destination axt-<name> where it stands (a unit's start and end, axt-<n>s and axt-<n>e). And on
 *  every page, axt-c<columns>-<k>: the columns its compile set it in, 1 or 2 — LaTeX's \\if@twocolumn (\\twocolumn,
 *  \\onecolumn), multicol's and the kernel's \\col@number, revtex's grid (ltxgrid's \\pagegrid@col: it keeps
 *  \\if@twocolumn false) — which places.mjs counts columns by, page by page (a two-column body and a one-column
 *  appendix, Chinese 2608.02163). The most columns in force at any mark made since the last page went out, or as the
 *  page goes out: ltxgrid closes its grid at \\end{document} before the last page goes out (\\close@column@grid), and
 *  read then alone every revtex and aastex paper's last page was one column (the review of 2026-10-01). And as
 *  \\end{document} begins, before the grid closes: a last page with no unit mark on it — the references alone — was
 *  read one column too (2608.20847's page 9, aastex 2608.12606's page 20; the re-review of 2026-10-02) */
export const MARK_DEF = [
  '\\makeatletter\\ifdefined\\XeTeXrevision\\def\\axt@dest#1{\\special{pdf:dest (axt-#1) [@thispage /XYZ @xpos @ypos null]}}',
  '\\ifdefined\\AddToHook\\AddToHook{shipout/firstpage}{\\special{dvipdfmx:config C 0x0010}}\\fi',
  '\\else\\ifdefined\\pdfextension\\def\\axt@dest#1{\\pdfextension dest name{axt-#1} xyz\\relax}',
  '\\else\\ifdefined\\pdfdest\\def\\axt@dest#1{\\ifnum\\pdfoutput>0 \\pdfdest name{axt-#1} xyz\\relax\\fi}',
  '\\else\\def\\axt@dest#1{}\\fi\\fi\\fi',
  '\\def\\axt@colsnow{\\ifdefined\\pagegrid@col\\ifnum\\pagegrid@col>\\@ne 2\\else 1\\fi\\else\\ifnum\\ifdefined\\col@number\\col@number\\else\\@ne\\fi>\\@ne 2\\else\\if@twocolumn 2\\else 1\\fi\\fi\\fi}\\gdef\\axt@colmax{1}',
  '\\def\\axt@colseen{\\ifnum\\axt@colsnow>\\axt@colmax\\relax\\xdef\\axt@colmax{\\axt@colsnow}\\fi}',
  '\\protected\\def\\axtmark#1{\\axt@colseen\\axt@dest{#1}}',
  '\\ifdefined\\AddToHook\\AddToHook{shipout/background}{\\axt@colseen\\put(0,0){\\axt@dest{c\\axt@colmax-\\the\\ReadonlyShipoutCounter}}\\gdef\\axt@colmax{1}}\\AddToHook{enddocument}{\\axt@colseen}\\fi\\makeatother',
  ...END_MARK,
].join('\n') + '\n'
/**
 * The end of a unit's own paragraph, which the unit's leading, size and line probe act on (\axt@whenover{id}{at its
 * end}{at each level back}{at its level}). The unit began at a group level; its paragraph is the next to end at that
 * level, or one ending deeper whose groups close back to it in vertical mode — \begin{itemize} right after a heading's
 * paragraph ends it inside the list's group. Each group closed on the way back is followed (\aftergroup) and the
 * setting put back at its level too, so the list's own units start from the paper's. Only through ordinary groups (a
 * brace group, an environment's): a paragraph ending inside a box, a table's cell, a note or math is one inside the
 * unit, and the hook waits for the next — an \aftergroup there may close its group in an alignment, where the token
 * breaks the next \midrule or \end{align*} (2608.21180, 2608.09038: a hundred errors each). Told by the group's type,
 * not by \ifinner: framed.sty and tcolorbox set a whole box of text in a \vbox, where every paragraph is inner and the
 * setting was put back only at the list's level, never at the unit's — RT-1's model card, whose leading grew unit by
 * unit from 13 pt to 43 pt until the card ran off its page
 */
export const PARA_END_TEX = String.raw`\makeatletter
\def\axt@plain{\ifnum\ifnum\currentgrouptype=1 1\else\ifnum\currentgrouptype=14 1\else0\fi\fi=1 \expandafter\@firstoftwo\else\expandafter\@secondoftwo\fi}
\long\def\axt@whenover#1#2#3#4{\edef\axt@tmp{\noexpand\AddToHookNext{para/after}{\noexpand\axt@over{\the\currentgrouplevel}{#1}\unexpanded{{#2}{#3}{#4}}}}\axt@tmp}
\long\def\axt@over#1#2#3#4#5{\ifnum\currentgrouplevel<#1 \else\ifnum\currentgrouplevel=#1 #3#5\else\axt@plain{#3\axt@ovafter{#1}{#2}{#3}{#4}{#5}}{\AddToHookNext{para/after}{\axt@over{#1}{#2}{#3}{#4}{#5}}}\fi\fi}
\long\def\axt@ovafter#1#2#3#4#5{\expandafter\gdef\csname axt@ob@#2\endcsname{\axt@overback{#1}{#2}{#3}{#4}{#5}}\expandafter\aftergroup\csname axt@ob@#2\endcsname}
\long\def\axt@overback#1#2#3#4#5{\ifnum\currentgrouplevel>#1 \axt@plain{#4\axt@ovafter{#1}{#2}{#3}{#4}{#5}}{\AddToHookNext{para/after}{\axt@over{#1}{#2}{#3}{#4}{#5}}}\else\ifnum\currentgrouplevel=#1 \ifhmode\AddToHookNext{para/after}{\axt@over{#1}{#2}{#3}{#4}{#5}}\else#5\fi\fi\fi}
\makeatother
`
/**
 * \axtlead{name}, before a translated unit's start mark: the unit's own paragraph set at `leading`, TeX for the new
 * \baselineskip — `1.3\baselineskip` (the paper's spacing times the script's factor, scripts.mjs) or
 * `1.3\dimexpr\f@size pt\relax` (the font size times it, the geometry lock); a unit's own factor \axtlead@<name>,
 * when defined, multiplies the font size. The paper's leading comes back once that paragraph is over (PARA_END_TEX;
 * a footnote's paragraph ending first inside a unit, or a list opened right after one, left the unit's leading on the
 * English after it, down to the references: 2608.02163), and it is the leading before the unit's own size when one was
 * set just before (\axt@leadbefore, which the size hands over): read after it, the leading that came back was the
 * smaller size's, and the references after the last unit were set 0.9 as far apart (2608.05876 in Russian). No hook
 * from restricted horizontal mode, where a caption is measured in an \hbox before it is set.
 * With \axtfirstpapertrue (the geometry lock, where each unit stands where its original did) the space from the line
 * before to the unit's first line is the paper's, by \prevdepth, and only the unit's own lines are spaced at its
 * leading: every unit began 2 pt lower than its original (13 pt against RT-1's 11), which no padding can take back.
 * A display inside a unit is set at the paper's leading, as the displays between units are: it is the paper's math,
 * not translated text, and the unit's leading had spread an align's rows a quarter apart (14.9 pt to 18.5 pt).
 * Local, because a \linespread for the whole document also spread what stays English — references, tables, code,
 * algorithms — a third past the paper's (RT-1's references: 1.43 × the font size against 1.10)
 */
export const unitLeadTex = leading => PARA_END_TEX + String.raw`\makeatletter
\protected\def\axtlead#1{\ifhmode\ifinner\else\axt@lead{#1}\fi\else\axt@lead{#1}\fi}
\def\axt@lead#1{\ifdefined\AddToHookNext\ifx\axt@leadbefore\relax\edef\axt@paperlead{\the\baselineskip}\else\let\axt@paperlead\axt@leadbefore\let\axt@leadbefore\relax\fi\edef\axt@tmp{\noexpand\axt@whenover{lead#1}{\baselineskip=\axt@paperlead\relax}{\baselineskip=\axt@paperlead\relax}{\baselineskip=\axt@paperlead\relax}}\axt@tmp\baselineskip=\ifcsname axtlead@#1\endcsname\csname axtlead@#1\endcsname\dimexpr\f@size pt\relax\else ` + leading + String.raw`\fi\relax\edef\axt@unitlead{\the\baselineskip}\ifaxtfirstpaper\ifvmode\ifdim\prevdepth>-1000pt\prevdepth=\dimexpr\prevdepth+\axt@unitlead-\axt@paperlead\relax\fi\fi\fi\fi}
\let\axt@unitlead\relax
\let\axt@leadbefore\relax
\newif\ifaxtfirstpaper
\def\axt@displaylead{\ifx\axt@unitlead\relax\else\ifdim\baselineskip=\axt@unitlead\relax\baselineskip=\axt@paperlead\relax\fi\fi}
\AtBeginDocument{\everydisplay\expandafter{\the\everydisplay\axt@displaylead}}
\makeatother
`
// pieces that are always set on the line: inline formulas and references
const INLINE = /^(?:\$|\\\(|\\ensuremath|\\(?:cite[a-z]*|ref|eqref|autoref|[cC]ref)(?![A-Za-z]))/
/** marks for the units whose place a reader shows: not headings (their text is also typeset in running heads and
 *  tables of contents), not the author block's names, places and notes (typeset again in running heads and the
 *  PDF's metadata, compared by the class, kept as they are for some languages), not table cells, not the texts of a TikZ picture (set through the picture's own transformation,
 *  which a destination's position does not follow) */
export const markUnits = (units, translated = null) => {
  const id = new Map(units.map((u, i) => [u, i]))
  return u => (u.kind === 'author' ? (translated?.has(u) && fitsWide(u) ? AUTHOR_WIDE : null) : u.kind === 'heading' || u.kind === 'cell' || u.kind === 'figure' || u.front ? null : { start: `\\leavevmode\\axtmark{${id.get(u)}s}`, end: `\\axtend{${id.get(u)}e}` })
}
/** A translated line of names or places goes into \\axtwide (FIT_DEF), all of it — its marks, a \\IEEEauthorrefmark
 *  after the last name — inside the braces that hold it: in a box that does not wrap (a table's c column, where
 *  article and IEEEtran set their author blocks) a line the translation made wider than the page is set as a paragraph
 *  of the line's width instead (2608.06701: Japanese names ran 126 pt past the page). Not one that breaks its own lines
 *  or holds a note: \\axtwide sets its argument twice to measure it, and a \\thanks set twice is kept twice; nor one
 *  that holds \\and, which in article ends the table the names are set in, and cannot be set inside a box */
const AUTHOR_WIDE = { start: '\\axtwide{', end: '}', whole: true }
const fitsWide = u => !u.pieces.some(p => p.t === 'nested' || (p.t === 'ph' && /\\(?:\\|newline|linebreak|par|thanks|footnote|footnotemark|and|And|AND)(?![A-Za-z@])|^\\\\/.test(p.src ?? '')))

/** Goes before \\begin{document} of the original's own compile: the log then says which font families the document set
 *  for its roles, however it set them (its class, a package, a conference style) */
export const FONT_PROBE = '\\AtEndDocument{\\typeout{AXT-FONTS rm=\\rmdefault;sf=\\sfdefault;tt=\\ttdefault;body=\\familydefault;}}\n'
/** The TeX log of a compile's last pass. The browser's compiler (poc-site/tex.js) joins each step's log with its terminal
 *  output — `$ <command>`, then `LOG:` … `==` `STDOUT:` — and the terminal output repeats the errors; the last TeX step's
 *  log is taken, as the one that made the PDF, whatever the earlier passes' logs hold (BusyTeX's pipeline empties them
 *  today, Devin and Codex on #294). bibtex, biber, makeindex and xdvipdfmx are no TeX passes. A native compile's .log is
 *  the last pass's already. Every reader of a compile's log lines takes it (live.mjs lostIn, typeset/tex.mjs readLines,
 *  readForced, typeset/density.mjs readWidthProbe, readSizeProbe): read whole, the echo invents a forced break before a
 *  pass's first unit */
export const lastTexLog = log => {
  if (!(log ?? '').includes('\n==\nSTDOUT:')) return log ?? ''
  const steps = [...log.matchAll(/^\$ (\S+)[^\n]*\n[\s\S]*?^LOG:\n([\s\S]*?)\n==\nSTDOUT:/gm)]
  return steps.filter(m => !/^(?:bibtex|biber|makeindex|xdvipdfmx)/.test(m[1])).at(-1)?.[2] ?? ''
}
/** the roles' families from a log written with FONT_PROBE, or null */
export function readFontProbe(log) {
  const m = /AXT-FONTS rm=([^;]*);sf=([^;]*);tt=([^;]*);body=([^;]*);/.exec(log.replace(/\n/g, ''))
  return m ? { rm: m[1], sf: m[2], tt: m[3], body: m[4] } : null
}
// the URW base-35 families by their NFSS names, and the OpenType fonts TeX Gyre made of them (the same designs and
// metrics), by file name: XeTeX finds a font by name through fontconfig, which the browser's TeX does not have, and by
// file name through its own file search. Computer Modern needs nothing: fontspec's default, Latin Modern, is its
// OpenType form
// (NFSS names of the same designs from other packages too: newtx and txfonts for Times, mathpazo and newpx for
// Palatino)
const GYRE = [
  [/^(ptm|qtm|ntx|txr|Tempora)/, 'texgyretermes'], [/^(phv|qhv|txss)/, 'texgyreheros'], [/^(pcr|qcr|txtt)/, 'texgyrecursor'],
  [/^(ppl|qpl|npx|zpl)/, 'texgyrepagella'], [/^(pbk|qbk)/, 'texgyrebonum'], [/^(pnc|qcs)/, 'texgyreschola'], [/^(pag|qag)/, 'texgyreadventor'],
]
const GYRE_FACES = '[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]'
/** Goes after xeCJK (which loads fontspec, whose default face is Latin Modern): each role back in the document's own
 *  face where it has an OpenType form, so widths, line breaks and pages stay the original's */
export function latinFontsFor(probe) {
  if (!probe) return ''
  const face = f => GYRE.find(([re]) => re.test(String(f)))?.[1]
  const out = []
  if (face(probe.rm)) out.push(`\\setmainfont{${face(probe.rm)}}${GYRE_FACES}`)
  if (face(probe.sf)) out.push(`\\setsansfont{${face(probe.sf)}}${GYRE_FACES}`)
  if (face(probe.tt)) out.push(`\\setmonofont{${face(probe.tt)}}${GYRE_FACES}`)
  return out.length ? out.join('\n') + '\n' : ''
}

/** pdfTeX-only primitives that arXiv sources use outside any \\ifpdf, made harmless under XeTeX. Goes first in the main file */
export const XETEX_SHIM = [
  '\\ifdefined\\pdfoutput\\else\\newcount\\pdfoutput\\fi',
  '\\ifdefined\\pdfminorversion\\else\\newcount\\pdfminorversion\\fi',
  '\\ifdefined\\pdfcompresslevel\\else\\newcount\\pdfcompresslevel\\fi',
  '\\ifdefined\\pdfobjcompresslevel\\else\\newcount\\pdfobjcompresslevel\\fi',
  '\\ifdefined\\pdfsuppresswarningpagegroup\\else\\newcount\\pdfsuppresswarningpagegroup\\fi',
  '\\ifdefined\\pdfinfo\\else\\long\\def\\pdfinfo#1{}\\fi',
  '\\ifdefined\\pdfglyphtounicode\\else\\def\\pdfglyphtounicode#1#2{}\\fi',
  '\\ifdefined\\pdfgentounicode\\else\\newcount\\pdfgentounicode\\fi',
].join('\n') + '\n'

// ---------------------------------------------------------------- engine adaptation: rules for known incompatibilities
/** R1, before \documentclass under XeTeX: what pdfTeX papers use that XeLaTeX lacks, and the engine guard of some templates */
export const XETEX_SHIM_R1 = [
  '\\providecommand\\DeclareUnicodeCharacter[2]{}',            // inputenc's, not loaded under XeLaTeX
  '\\RequirePackage{iftex}\\let\\RequirePDFTeX\\relax',         // a template's "pdfTeX only" guard (AAAI 2027)
].join('\n') + '\n'
/** R2, under XeTeX: a pdftex driver option names the wrong backend for hyperref, graphicx, color */
export function stripPdftexOption(text) {
  return text.replace(/\\(documentclass|usepackage|RequirePackage)\s*\[([^\]]*)\]/g, (m, cmd, opts) => {
    const kept = opts.split(',').filter(o => o.trim() !== 'pdftex')
    return kept.length === opts.split(',').length ? m : `\\${cmd}[${kept.join(',')}]`
  })
}
/** R3, before \begin{document}, any engine: a template's "package X is forbidden" errors become warnings */
export const FORBIDDEN_TO_WARNING = [
  '\\makeatletter',
  '\\let\\axt@PackageError\\PackageError',
  '\\long\\def\\PackageError#1#2#3{\\in@{forbid}{#2}\\ifin@\\PackageWarning{#1}{#2}\\else\\in@{must not use}{#2}\\ifin@\\PackageWarning{#1}{#2}\\else\\axt@PackageError{#1}{#2}{#3}\\fi\\fi}',
  '\\makeatother',
].join('\n') + '\n'
