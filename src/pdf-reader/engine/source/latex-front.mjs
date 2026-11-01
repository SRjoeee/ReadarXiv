// C1 front end, spike: a LaTeX project → prose units with byte ranges and placeholders → the same project with each unit's
// range replaced by its translation, everything else byte for byte. The approach the evidence favours (exp-freeze-2026-10-07:experiments/pdf-bilingual/REPORT.md §4 and the
// second addendum): patch source ranges in place, mask math, citations, references and unknown commands, send whole
// paragraphs. Not a parser: a scanner that knows which constructs carry prose and treats everything else as opaque.
// Runs the same in Node (the spikes) and in the browser (the reader): a project's files come as a file system of two
// operations (`inMemory` for an unpacked source; node-files.mjs `folder`, which only Node loads, for a directory), and bytes
// are Uint8Arrays.

// ---------------------------------------------------------------- files and bytes
import { commandParams, environmentParams, FRONT_ROLES, inOwnCall, overriddenFallback, paperOf, paperParams, paramsOf, readArgs } from '../rules/arg-roles.mjs'
import { TEXT_SYMBOLS } from '../rules/text-symbols.mjs'
/** unpacked files (a Map of relative path → bytes) as a project's file system */
export function inMemory(map) { return { list: () => [...map.keys()], read: p => map.get(p) ?? null } }
/** a/./b/../c → a/c: a file as the package holds it (tar.mjs untar names each so) and as TeX's file system has it,
 *  whatever spelling named it — one name for one file, so that a file written back replaces it rather than sitting
 *  beside it (2608.08350's \input{./sections/a.tex}: the compile set the English over the translation) */
export const normalizePath = p => { const out = []; for (const seg of p.split('/')) { if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg) } return out.join('/') }
/** the name TeX gives what it writes for a main file, its .aux and .bbl: the file's own name without its extension, in
 *  the package's root, where TeX runs whatever directory the main file is in (arXiv's compile, the TeX page's) */
export const jobName = main => main.slice(main.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '')
/** bytes as a string of the same code units (latin1, byte for byte): the scanner's view of a source */
export const latin1 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return s }
/**
 * A source file's bytes as TeX reads its lines: latin1, each line's end an LF. web2c's input_line (texmfmp.c) ends a line
 * at a CR or an LF and takes the LF of a CRLF with its CR, so a CR, an LF or a CRLF is one line's end, and a blank line
 * a paragraph's end whatever the editor wrote. Every rule of the front end reads lines by their LF: a CRLF source's
 * blank lines were none, and 2610.10069v1's introduction (ten paragraphs) and a whole proof (sixteen) were one unit
 * each. A file the front end writes back (patch: its units' marks and translations) is written from this text, with LF,
 * which TeX reads the same. Every other file is copied as it is, a class or a package the front end read among them;
 * the passes live.mjs runs over such a copy (literalNames, stripPdftexOption, localizeNames) give the same text on its
 * own line ends as on this one (the 12 CR files of 180 papers, 2026-10-20). So do the guard's brace balance and the
 * probe of the main file, which read through this too
 */
export const texText = bytes => latin1(bytes).replace(/\r\n?/g, '\n')
export const latin1Bytes = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b }
const utf8Bytes = s => new TextEncoder().encode(s)
const bytesOf = (s, enc) => (enc === 'utf8' ? utf8Bytes(s) : latin1Bytes(s))
const UTF8 = new TextDecoder('utf-8', { fatal: true }), UTF8_LAX = new TextDecoder()
/** whether a source's text (its bytes read latin1) is UTF-8: a file that is never decodes as UTF-8 */
const isUtf8Text = t => { try { UTF8.decode(latin1Bytes(t)); return true } catch { return false } }
/**
 * A file's input encoding as its characters (S2 of 2026-10-24): a unit's text is UTF-8 bytes read latin1 (mt.mjs utf8
 * decodes it), so a file that is not UTF-8 has each of its text pieces turned into UTF-8 by the encoding the main file's
 * \\usepackage[…]{inputenc} declares — latin1 its characters as they are, cp1252 (ansinew) Windows' — and by latin1, what
 * pdfTeX reads a byte as, where it declares none or one this table does not hold. Read as UTF-8, 2610.20581's latin1
 * bytes were each a U+FFFD and the translator was sent "Universit Gustave Eiffel". A UTF-8 file is never decoded again
 */
const INPUT_ENCODINGS = { latin1: s => s, cp1252: s => CP1252.decode(latin1Bytes(s)), ansinew: s => CP1252.decode(latin1Bytes(s)) }
const CP1252 = new TextDecoder('windows-1252')
/** the paper's files that are not UTF-8, each with the decoding of its text (loadProject sets it for its walk) */
let decoders = new Map()
/** a source text piece, raw, as the engine's text: its file's characters as UTF-8 bytes read latin1 */
const asEngineText = (file, s) => { const d = decoders.get(file); return d && !ASCII_ONLY.test(s) ? latin1(utf8Bytes(d(s))) : s }
const ASCII_ONLY = /^[\t\n\r -~]*$/
const concat = parts => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }

// ---------------------------------------------------------------- what carries prose
const HEADINGS = new Set(['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'title'])
/** a sectioning command's depth, as LaTeX's article and book classes count it: the reader's contents rank it (outline.ts);
 *  a paragraph heading is not in the contents */
const DEPTH = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3 }
const OWN_UNIT_ARG = new Set(['caption', 'subcaption', 'subcaptionbox', 'captionof', 'tablecaption', 'footnote', 'footnotetext', 'thanks', 'abstract', 'keywords']) // the argument is a unit of its own
/** a figure's or a table's caption: caption's \\captionof{figure}{…} outside a float, a deluxetable's \\tablecaption{…}
 *  (their text found by the role table, 2608.24961, 2608.12606) */
const CAPTIONS = new Set(['caption', 'subcaption', 'subcaptionbox', 'captionof', 'tablecaption'])
/** the front matter's blocks of names and places: their notes (\\thanks, \\footnote) each a footnote of its own
 *  (1706.03762's author block: its footnotes stayed in English, the whole block one opaque command), and the names and
 *  places between them units of their own (frontBlock): the authors' names of kind 'author', the affiliations,
 *  institutions and addresses of kind 'affiliation', both the reader's "names" (the whole block one toggle:
 *  docs/route/orphan-text.md §5, the owner's ruling of 2026-10-30); the marks, e-mail and web addresses, ORCIDs and spacing
 *  stay */
const FRONT_MATTER = new Set(['author', 'affil', 'affiliation', 'institute', 'address'])
/** the author blocks whose text opens with the authors' names (frontBlock's `names`): LaTeX's \\author and its kin of the role
 *  table (FRONT_ROLES' `author`); every other such block — \\affil, \\affiliation, \\institute, \\address, ICML's
 *  \\icmlaffiliation, AAAI's \\affiliations, REVTeX's \\altaffiliation, a \\curraddr — is places throughout */
const FRONT_NAMES = new Set(['author', 'icmlauthor', 'editor', 'editors', 'translator', 'collaboration', 'contrib', 'speaker'])
/** an author block's role by its command: one that opens with names (FRONT_NAMES), else places (frontBlock) */
const roleOf = name => (FRONT_NAMES.has(name) ? 'names' : 'places')
/** a unit of an author block: its names (kind 'author') or its places (kind 'affiliation') */
const AUTHOR_KINDS = new Set(['author', 'affiliation'])
/** whether a unit is of an author block (AUTHOR_KINDS): what the TeX path sets and keeps as one block, names and places alike */
export const inAuthorBlock = u => AUTHOR_KINDS.has(u?.kind)
/** the kind of the units an environment makes, `kind` (a table's cells, an abstract, a theorem), but inside an author block:
 *  there every unit is the block's own, its names or its places as frontBlock cuts them, whatever environment TeX sets it in
 *  (2610.35877v1's `\author{\begin{tabular}{cc} Ayush Mittal & Dhruv Gupta\\ …\end{tabular}}`: its names were table
 *  cells, of the tables' toggle, translated with the author block's off) */
const blockKind = (b, kind) => (AUTHOR_KINDS.has(b.kind) ? b.kind : kind)
/** commands inside an author block whose argument is a name or a place: IEEEtran's blocks, acmart's parts of an
 *  affiliation. Anything else there — \\email, \\orcid, \\inst{1}, \\textsuperscript — stays as it is */
const FRONT_PROSE = new Set(['IEEEauthorblockN', 'IEEEauthorblockA', 'institution', 'department', 'city', 'state', 'country'])
/** the boxes a row of an author block is set in, a line of its own: plain TeX's and LaTeX's \\centerline (\\line{\\hss#1\\hss}),
 *  its argument the row's text, a name or a place (ICLR 2021's `\\author{\\centerline{Alexey Dosovitskiy$^{*,\\dagger}$, …}
 *  \\vspace{1mm}\\\\ … \\centerline{$^*$equal technical contribution, …}\\\\ \\centerline{Google Research, Brain Team}\\\\ …}`,
 *  2010.11929v2: read as one placeholder a row, its block had no unit, and its names, notes and places were one orphan's ink unit,
 *  translated and set in the names' bold). Walked as FRONT_PROSE is, inside an author block alone; elsewhere one placeholder, as
 *  before. Its row is read through it (rowText), so that a row it opens with a mark is a place */
const FRONT_BOXES = new Set(['centerline'])
/** IEEEtran's blocks, each a group of lines the class sets on its own in a cell of a table: a unit each, so that a
 *  line of names is fitted to its box alone (AUTHOR_WIDE), apart from the places' block and its line breaks; the block of
 *  names (\\IEEEauthorblockN) every line of it names, the block of places (\\IEEEauthorblockA) every line places */
const FRONT_LINES = new Map([['IEEEauthorblockN', 'author'], ['IEEEauthorblockA', 'affiliation']])
/** import.sty's commands that read a file from a directory, {dir}{file}: whether the directory is the one imported last's */
const IMPORTS = new Map([['import', false], ['inputfrom', false], ['includefrom', false], ['subimport', true], ['subinputfrom', true], ['subincludefrom', true]])
const INLINE_TEXT = new Set(['textbf', 'textit', 'emph', 'textsl', 'textsc', 'underline', 'textup', 'textrm', 'textsf', 'textmd', 'textnormal', 'uline'])
// commands whose last required argument is typeset as it stands — a scaled table, a boxed or coloured phrase, a TikZ
// picture fitted to the column — by how many required arguments they take, that one included. The others (a width,
// an angle, a colour) stay as they are
const CONTENT_BOX = new Map([['resizebox', 3], ['scalebox', 2], ['adjustbox', 2], ['rotatebox', 2], ['raisebox', 2], ['fbox', 1], ['mbox', 1], ['framebox', 1], ['makebox', 1], ['parbox', 2], ['colorbox', 2], ['fcolorbox', 3], ['textcolor', 2]])
/** declarations that take no argument: a brace group after one is a group of its own, never its argument. Taken for
 *  \\centering's argument, the {\\small …} a table sat in stayed untranslated whole (five of 2608.05876's eight
 *  tables). The rules take an optional width alone (\\toprule[1pt]) */
const NO_ARGS = new Set(['centering', 'raggedright', 'raggedleft', 'noindent', 'indent', 'normalfont', 'rmfamily', 'sffamily', 'ttfamily', 'bfseries', 'mdseries', 'itshape', 'upshape', 'slshape', 'scshape', 'em', 'bf', 'it', 'rm', 'sf', 'tt', 'sc', 'sl', 'normalsize', 'small', 'footnotesize', 'scriptsize', 'tiny', 'large', 'Large', 'LARGE', 'huge', 'Huge', 'selectfont', 'smallskip', 'medskip', 'bigskip', 'newblock', 'BIBentryALTinterwordspacing', 'BIBentrySTDinterwordspacing', 'hfill', 'vfill', 'hfil', 'vfil', 'newline', 'clearpage', 'newpage', 'cleardoublepage', 'maketitle', 'appendix', 'toprule', 'midrule', 'bottomrule', 'hline', 'arraybackslash', 'protect', 'relax', 'leavevmode', 'strut', 'null', 'quad', 'qquad', 'enspace', 'thinspace', 'nobreak', 'allowbreak', 'sloppy', 'fussy', 'ignorespaces', 'unskip'])
/** NO_ARGS by its exported name: the layout marks take a placeholder of one for one that sets no ink (layout/marks.mjs) */
export const NO_ARG_COMMANDS = NO_ARGS
const OPT_ONLY = new Set(['toprule', 'midrule', 'bottomrule'])
const MATH_ENVS = /^(equation|align|alignat|gather|multline|flalign|eqnarray|math|displaymath|dmath|IEEEeqnarray|subequations)\*?$/
/** environments whose body is no prose, kept as the paper has it: code, a bibliography's own form, and the drawings, whose body
 *  a package reads with its own parser (TikZ's, PSTricks', xy-pic's: a mark of ours there is a parse error). Which environment
 *  is one shows in no source but by its name, so each is named: xy-pic's `xy` since 2610.21884v1, whose table cells of
 *  `\\ar@{-}(0,0)*++!D{…}` were four cell units, 46 TeX errors at their marks and two compiles of the guard's */
const SKIP_ENVS = /^(verbatim|Verbatim|lstlisting|minted|comment|tcblisting|tcboutputlisting|alltt|BVerbatim|LVerbatim|tikzpicture|pgfpicture|forest|array|algorithmic|algorithm2e|thebibliography|bibdiv|biblist|filecontents|picture|asy|pspicture|axis|circuitikz|xy|dot2tex|pythontex|sagesilent)\*?$/
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
  for (const m of text.matchAll(/\\(?:(?:exclude|include|special|general|process)comment|(?:Custom|Recustom|Define)VerbatimEnvironment|lstnewenvironment|(?:new|renew)tcblisting|(?:Declare|New|Renew|Provide)TCBListing)\s*\*?\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) out.add(m[1].trim())
  for (const m of text.matchAll(/\\(?:re)?newenvironment\s*\*?\s*\{([^}]+)\}\s*(?:\[[^\]]*\]\s*)*\{\s*\\(?:comment|verbatim|Verbatim|BVerbatim|LVerbatim|lstlisting|minted)(?![A-Za-z])|\\let\s*\\([A-Za-z]+)\s*=?\s*\\(?:comment|verbatim|Verbatim)(?![A-Za-z])/g)) out.add((m[1] ?? m[2]).trim())
  // minted's \\newminted[name]{lexer}{options}: the environment `name`, else <lexer>code
  for (const m of text.matchAll(/\\newminted\s*(?:\[([^\]]+)\])?\s*\{([^}]+)\}/g)) out.add(m[1]?.trim() || `${m[2].trim()}code`)
  return out
}
/** a display's opening (group 1) and its close (group 2) in an environment's code: a math environment's \\begin or its
 *  command, \\[ or $$ (group 3, either) */
const DISPLAY_NAMES = '(?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath|IEEEeqnarray)\\*?'
const DISPLAY_TOKEN = new RegExp(String.raw`(\\begin\s*\{\s*${DISPLAY_NAMES}\s*\}|\\${DISPLAY_NAMES}(?![A-Za-z@*])|\\\[)|(\\end\s*\{\s*${DISPLAY_NAMES}\s*\}|\\end${DISPLAY_NAMES}(?![A-Za-z@*])|\\\])|(\$\$)`, 'g')
/** the displays code opens and closes, in order: 1 an opening, -1 a close. TeX's \\\\ and \\$ are no part of one (a
 *  line break's \\\\[2pt] is no \\[) */
const displayTokens = code => [...code.replace(/\\[\\$]/g, '  ').matchAll(DISPLAY_TOKEN)].map(m => (m[1] ? 1 : m[2] ? -1 : 0))
/** whether an environment's begin code leaves a display open where it ends, and its end code closes that one before
 *  anything else (a $$ the one or the other, by where it stands) */
const setsDisplay = (begin, end) => {
  let depth = 0
  for (const d of displayTokens(begin)) depth = Math.max(0, depth + (d || (depth ? -1 : 1)))
  const first = displayTokens(end)[0]
  return depth > 0 && first !== undefined && first !== 1
}
/** the environments of the paper's own that set a display: their begin code opens one that their end code closes
 *  (\\newenvironment{eqsplit}{\\equation\\aligned}{\\endaligned\\endequation}, \\NewDocumentEnvironment{x}{…}{\\[}{\\]}),
 *  by their last definition, as TeX takes it (\\provide… defines nothing a definition before it made). Their body is
 *  math: read as prose, 2310.20360's 89 eqsplit displays were cut into units, whose marks came between a subscript's _
 *  and its operand (\\bfm_\\leavevmode\\axtmark{…}1: "Missing { inserted"). Not one whose begin code sets a display of
 *  its own and closes it, its body the text after it */
const displayEnvsOf = defs => new Set([...defs].filter(([, d]) => d.begin !== undefined && setsDisplay(d.begin, d.end)).map(([name]) => name))
/** a listing package's definers of an environment (listings', fancyvrb's, tcolorbox's), its name in group 1; then
 *  minted's \\newminted[name]{lexer}, and a command \\let to a verbatim (\\let\\x\\verbatim, not \\verbatim@font) */
const LISTING_DEFINERS = /\\(?:lstnewenvironment|(?:Define|Custom|Recustom)VerbatimEnvironment|(?:re)?newtcblisting|(?:Declare|New|Renew|Provide)TCBListing)\s*\*?\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g
const NEWMINTED = /\\newminted\s*(?:\[([^\]]+)\])?\s*\{([^}]+)\}/g
const LET_VERBATIM = /\\let\s*\\([A-Za-z]+)\s*=?\s*\\(?:verbatim|Verbatim)(?![A-Za-z@])/g
const ENV_DEFINERS = /\\(?:(?:re)?newenvironment|provideenvironment|(?:New|Renew|Provide|Declare)DocumentEnvironment)\s*\*?\s*\{([^}]+)\}/g
/**
 * The paper's own environments, by name, as the last of their definitions in its files leaves them, as TeX takes them
 * (\\provide… defines nothing a definition before it made): `{ begin, end }`, the code of one \\newenvironment or an
 * xparse definer made; `{ listing: true }`, one a listing package's definer made (minted's \\newminted{python}{} the
 * environment pythoncode, \\newminted[name]{…} `name`, each with its star) or a \\let to a verbatim. A \\renewenvironment
 * after \\lstnewenvironment{snippet} makes snippet the paper's own again
 */
const envDefinitionsOf = texts => {
  const out = new Map()
  const define = (name, def, provide) => { if (!(provide && out.has(name))) out.set(name, def) }
  for (const t of texts.map(uncommented)) {
    const at = []
    for (const m of t.matchAll(LISTING_DEFINERS)) at.push([m.index, () => define(m[1].trim(), { listing: true }, /^\\Provide/.test(m[0]))])
    for (const m of t.matchAll(NEWMINTED)) { const name = m[1]?.trim() || `${m[2].trim()}code`; at.push([m.index, () => { define(name, { listing: true }); define(`${name}*`, { listing: true }) }]) }
    for (const m of t.matchAll(LET_VERBATIM)) at.push([m.index, () => define(m[1], { listing: true })])
    for (const m of t.matchAll(ENV_DEFINERS)) {
      const doc = m[0].includes('DocumentEnvironment'), name = m[1].trim()
      let k = skipSpaces(t, m.index + m[0].length)
      // \\newenvironment's [n][default]; a document environment's argument specification, a group
      if (doc) { if (t[k] !== '{') continue; const g = matchGroup(t, k); if (g < 0) continue; k = skipSpaces(t, g) } else for (let n = 0; n < 2 && t[k] === '['; n++) { const e = matchGroup(t, k, '[', ']'); if (e < 0) break; k = skipSpaces(t, e) }
      if (t[k] !== '{') continue
      const b = matchGroup(t, k), k2 = b > 0 ? skipSpaces(t, b) : -1, e = t[k2] === '{' ? matchGroup(t, k2) : -1
      if (e > 0) at.push([m.index, () => define(name, { begin: t.slice(k + 1, b - 1), end: t.slice(k2 + 1, e - 1) }, /^\\(?:provide|Provide)/.test(m[0]))])
    }
    for (const [, run] of at.sort((a, b) => a[0] - b[0])) run()
  }
  return out
}
/** the code environments a package defines, whose body the paper's own may open (codeEnvsOf) */
const LISTINGS = new Set(['verbatim', 'Verbatim', 'BVerbatim', 'LVerbatim', 'lstlisting', 'minted', 'alltt', 'tcblisting'])
/**
 * The environments a paper defines as code (envDefinitionsOf, by their last definition), whose body stays as the paper
 * has it and is never a unit, as a listing package's own are not (SKIP_ENVS): `code`, one a listing package's definer
 * made or a \\let to a verbatim; one of the paper's own whose begin code opens a code environment — a package's
 * (LISTINGS: \\verbatim, \\begin{Verbatim}), or another of these —; and one whose begin code sets its body as alltt
 * does, in typewriter type with its lines obeyed. Only what the begin code does where it stands: a definition in it
 * (\\def\\code{\\begin{alltt}}, \\newcommand\\code[1]{{\\tt ##1}}) does nothing until it is used (texCommands'
 * `inDef`). `lines`, those of them TeX reads by lines, as the verbatim they open or the listing package that made them
 * (LINE_ENVS): nothing of the reader's on their \\begin's and \\end's lines, their \\end{document} none. 2610.19159's
 * transcripts (\\newenvironment{trajectoryCode}{\\begingroup…\\ttfamily…\\obeylines…}{…}): 832 units of code lines
 * and terminal output sent to the translator, their ASCII punctuation sent back full-width. Not typewriter type alone (a
 * prompt box, whose words are prose: 2608.03063's seqbox) nor lines obeyed alone (verse)
 */
const codeEnvsOf = defs => {
  const code = new Set([...defs].filter(([, d]) => d.listing).map(([name]) => name)), lines = new Set(code)
  const opened = new Map()
  for (const [name, d] of defs) {
    if (d.begin === undefined) continue
    const cmds = texCommands(d.begin).filter(c => !c.inDef), has = n => cmds.some(c => c.name === n)
    if ((has('ttfamily') || has('tt')) && has('obeylines')) code.add(name)
    opened.set(name, cmds.flatMap(c => (c.name !== 'begin' ? [c.name] : c.env ? [c.env, c.env.replace(/\*$/, '')] : [])))
  }
  // an environment that opens one found here is found in turn: until a pass finds none
  for (let found = true; found;) {
    found = false
    for (const [name, names] of opened) {
      if (!code.has(name) && names.some(n => LISTINGS.has(n) || code.has(n))) { code.add(name); found = true }
      if (!lines.has(name) && names.some(n => (LISTINGS.has(n) && LINE_ENVS.test(n)) || lines.has(n))) { lines.add(name); found = true }
    }
  }
  return { code, lines }
}
/** whether `env` is read by lines (LINE_ENVS, or the paper's own `lineEnvs`: by its name, a star in it as defined
 *  (`\\DefineVerbatimEnvironment{Code*}`), or by the name its star is added to) */
const isLineEnv = (env, lineEnvs) => LINE_ENVS.test(env) || !!lineEnvs?.has(env) || !!lineEnvs?.has(env.replace(/\*$/, ''))
/** whether the line `at` stands on holds, before it, the \\begin or the \\end of an environment read by lines: nothing
 *  of ours goes there (LINE_ENVS) */
const lineBound = (text, at, lineEnvs) => {
  const from = text.lastIndexOf('\n', at - 1) + 1
  for (const m of text.slice(from, at).matchAll(/\\(?:begin|end)\s*\{([^}]+)\}/g)) if (isLineEnv(m[1].trim(), lineEnvs) && !inComment(text, from + m.index)) return true
  return false
}
const ACCENTS = new Set(["'", '`', '"', '^', '~', '=', '.', 'u', 'v', 'H', 'c', 'd', 'b', 't', 'r', 'k'])
/** the text accents whose letter goes into its word (accentLetter), by the combining mark each puts on its letter */
const ACCENT_MARKS = { '`': '\u0300', "'": '\u0301', '^': '\u0302', '~': '\u0303', '"': '\u0308', c: '\u0327', v: '\u030c', u: '\u0306', H: '\u030b', '.': '\u0307' }
/**
 * The letters those accents make on an ASCII letter (or \\i, \\j) that every way of setting a translation sets as it
 * sets the source's accent: LaTeX's UTF-8 table declares each (utf8enc.dfu, the accent itself under pdfLaTeX, in OT1,
 * T1, T2A and inside CJKutf8's environment alike), and Latin Modern, TeX Gyre (Termes, Heros, Cursor, Pagella) and CMU
 * hold each in every face, upright, bold, italic, sans, mono and small capitals (XeLaTeX with fontspec and xeCJK; a
 * paper's own XeLaTeX font sets the same letter for the source's accent, its TU composite). Measured on TL 2026,
 * 2026-10-05: of the 221 letters the ten accents make, 167 are declared, and the fonts lack 22 of those (Ḃ Ḟ Ẏ Ḱ Ẑ Ǩ
 * in either case, and CMU but for its upright roman the cedilla's Ģ Ķ Ļ Ņ Ŗ): 145 letters. Any other accent or letter
 * keeps the accent a placeholder, as before
 */
const SETTABLE = new Set('ÀÁÂÃÄÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäçèéêëìíîïñòóôõöùúûüýÿĂăĆćĈĉĊċČčĎďĔĕĖėĚěĜĝĞğĠġĤĥĨĩĬĭİĴĵĹĺĽľŃńŇňŎŏŐőŔŕŘřŚśŜŝŞşŠšŢţŤťŨũŬŭŰűŴŵŶŷŸŹźŻżŽžǍǎǏǐǑǒǓǔǦǧǰǴǵṅỲỳ')
/** the letter an accent's argument at s[k] names, as TeX reads it after the accent (spaces skipped): an ASCII letter, or
 *  \\i or \\j — its control word's spaces, and an empty group ending it, with it —, bare or alone in braces; with where
 *  its source ends, or null */
function accentBase(s, k, to) {
  k = skipSpaces(s, k)
  if (k < to && /[A-Za-z]/.test(s[k])) return { base: s[k], end: k + 1 }
  if (s[k] === '\\' && /^[ij](?![A-Za-z@])/.test(s.slice(k + 1, k + 3))) {
    let e = skipSpaces(s, k + 2)
    if (s.startsWith('{}', e)) e += 2
    return e <= to ? { base: s[k + 1], end: e } : null
  }
  if (s[k] !== '{') return null
  const e = matchGroup(s, k)
  if (e < 0 || e > to) return null
  const inner = accentBase(s, k + 1, e - 1)
  return inner && skipSpaces(s, inner.end) === e - 1 ? { base: inner.base, end: e } : null
}
/**
 * The letter an accent command at s[i] makes (`end` past its name): \\~n, \\~{n}, \\v c, \\'\\i, \\'{\\i} → ñ, ñ, č, í, í,
 * where the letter is one Unicode has, every strategy sets it (SETTABLE) and the paper keeps the accent its own (not
 * one of `own`, the accents it defines anew: \\def\\v{\\varphi}); with where its source ends, or null. A letter in its
 * word, the engine reads the word whole: El Ni{\\~n}o went out as `El Ni @d#@e#@f# o southern oscillations`, and came
 * back without the word's end (2610.02069)
 */
function accentLetter(s, i, end, name, to, own) {
  const mark = ACCENT_MARKS[name]
  if (!mark || own?.has(name)) return null
  const arg = accentBase(s, end, to)
  const letter = arg && (arg.base + mark).normalize('NFC')
  return letter && SETTABLE.has(letter) ? { letter, end: arg.end } : null
}
/** the kernel's letters of Latin scripts (TEXT_SYMBOLS: \\o, \\O, \\ss, \\ae, \\AE, \\oe, \\OE, \\aa, \\AA, \\l, \\L), each the one
 *  letter it sets; not the dotless \\i and \\j, which a paper makes its own as often as not (text-symbols.mjs) */
const LETTER_COMMANDS = new Map(['o', 'O', 'ss', 'ae', 'AE', 'oe', 'OE', 'aa', 'AA', 'l', 'L'].map(n => [n, TEXT_SYMBOLS[`\\${n}`]]))
/**
 * The letter a letter command at s[i] sets (`end` past its name), as TeX sets it in its word: the spaces after the control
 * word TeX skips, and an empty group ending it, with it — `\\L ukasz`, `\\L{}ukasz`, `Bj\\o rn`, `Stra\\ss e` are Łukasz, Bjørn,
 * Straße —; where the paper does not define the command itself (\\def\\o{\\omega}: ownLetters); with where its source ends, or
 * null.
 * A placeholder, it went out as a marker, and the marker a word touches gets a space of ours (mt.mjs serialize): 2010.11929v2's
 * `{\\L}ukasz Kaiser` came back as "Ł ukasz Kaiser"
 */
function letterCommand(s, i, end, name, to, own) {
  const letter = LETTER_COMMANDS.get(name)
  if (!letter || own?.has(name) || !s.startsWith(name, i + 1)) return null
  // (from the control word's own end: commandAt's takes a star after it, which none of these has, `Gro\\ss*` a star of the text)
  const word = i + 1 + name.length
  let e = skipSpaces(s, word)
  // (a blank line after it is a paragraph's end, TeX's \\par: none of it the letter's)
  if (s[e] === '\n') e = word
  if (s.startsWith('{}', e)) e += 2
  return e <= to ? { letter, end: e } : null
}
/** the letter commands a paper's own files define anew (\\renewcommand{\\o}{\\omega}, \\def\\L{\\mathcal{L}}, a \\let): there the
 *  command is the paper's, and no letter is made of it */
const ownLetters = texts => {
  const out = new Set()
  for (const m of texts.map(uncommented).join('\n').matchAll(/\\(?:(?:(?:re)?newcommand|providecommand)\*?|DeclareRobustCommand\*?|(?:New|Renew|Provide|Declare)DocumentCommand|[gex]?def|let)\s*\{?\s*\\([A-Za-z]+)(?![A-Za-z@])/g)) if (LETTER_COMMANDS.has(m[1])) out.add(m[1])
  return out
}
/** the accents a paper's own files define anew (\\def\\v{\\varphi}, \\renewcommand{\\H}{\\mathcal{H}}, a package's
 *  \\let\\'…): there the command is the paper's, and no letter is made of it */
const ownAccents = texts => {
  const out = new Set()
  for (const m of texts.map(uncommented).join('\n').matchAll(/\\(?:(?:(?:re)?newcommand|providecommand)\*?|DeclareRobustCommand\*?|(?:New|Renew|Provide|Declare)DocumentCommand|[gex]?def|let)\s*\{?\s*\\([cvuH]|[.'`^~"])(?![A-Za-z@])/g)) out.add(m[1])
  return out
}
// a number with an optional unit; spaces and tabs only, never a line end — the next line is not the command's
const DIMEN = String.raw`[-+]?[ \t]*(?:\d+(?:\.\d*)?|\.\d+)[ \t]*(?:true[ \t]*)?(?:pt|em|ex|cm|mm|in|bp|sp|pc|dd|cc|mu|fill?l?|\\[A-Za-z@]+)?`
// \looseness=-1, \parindent=\z@, \vskip 3pt plus 1fil, \penalty-100: a number, or = followed by a value; and the
// relation of a comparison, \ifdim\lastskip>0pt, \ifnum\value{x}<3
const ASSIGNMENT = new RegExp(String.raw`^[ \t]*(?:[=<>][ \t]*(?:${DIMEN}|\\[A-Za-z@]+)|${DIMEN})(?:[ \t]*(?:plus|minus)[ \t]*${DIMEN})*(?![A-Za-z])`)
// \hrule height 0.9pt, \vrule width .4pt depth 2pt: a rule's own keywords and sizes
const RULE_SPEC = new RegExp(String.raw`^(?:[ \t]*(?:height|depth|width)[ \t]*${DIMEN})+(?![A-Za-z])`)
const TABLE_ENVS = /^(tabular|tabularx|tabular\*|longtable|tabu|tabulary|supertabular|xtabular)\*?$/
/** the floats: what TeX sets away from where the source has it, so that a unit written inside one (`inFloat`, whatever holds
 *  it there: a minipage, a subfigure) is no neighbour in the text of the units around it. A longtable breaks across pages where
 *  it stands, and is none */
const FLOAT_ENVS = /^(?:figure\*?|table\*?|wrapfigure|sidewaystable|algorithm|listing)$/
/** tabularray's tables, \\begin{tblr}[outer]{inner}, and the paper's own (\\NewTblrEnviron): their cells are math where
 *  the table says so — mode = math, imath or dmath, for the cells, a column, a row or one cell, in the table's own
 *  specifications or in \\SetTblrInner for every table. Such a table is math throughout, as an array is: nothing in it
 *  is prose. Walked as prose, its formulas went to the translator, which wrote their parentheses full-width, and a
 *  \\left before one stopped TeX (2608.29181: every way of setting it failed, biber's "bcf is malformed" all it said) */
const TBLR_ENVS = ['tblr', 'longtblr', 'talltblr']
/** a rule across the whole table (booktabs', array's, arydshln's, hhline's, makecell's) and a longtable's head ending,
 *  either of which ends the header; \\cline and \\cmidrule rule part of it, and do not */
const FULL_RULE = /^(?:hline|hdashline|firsthline|lasthline|Hline|toprule|midrule|bottomrule|specialrule|Xhline|thickhline|hhline|tabucline|endhead|endfirsthead)$/
/** the commands that stand in a cell without being its content — rules, spacing, colour, a strut — each with the
 *  arguments it takes: `o` an optional [..], `p` an optional (..), a digit that many required {..}. Read by their own
 *  arity, so that a cell's first group after them (\\hline {\\bf Parser}) stays the cell's; colortbl's \\rowcolor with its
 *  overhangs after its colour, as the role table reads it (arg-roles.mjs) */
const NOT_CONTENT = new Map(Object.entries({
  hline: '', hdashline: '', firsthline: '', lasthline: '', Hline: '', thickhline: '', endhead: '', endfirsthead: '', morecmidrules: '',
  toprule: 'o', midrule: 'o', bottomrule: 'o', addlinespace: 'o', specialrule: '3', Xhline: '1', hhline: '1', tabucline: 'o1',
  cline: '1', cdashline: '1', cmidrule: 'op1', vspace: '1', noalign: '1', rowcolor: 'o1oo', arrayrulecolor: 'o1', rule: 'o2',
  centering: '', raggedright: '', raggedleft: '', relax: '', noindent: '', strut: '', nopagebreak: 'o', pagebreak: 'o', newpage: '',
}))
/** past a command's arguments by its spec (NOT_CONTENT) */
function argsBySpec(s, i, spec) {
  for (const a of spec) {
    const k = skipSpaces(s, i)
    if (a === 'o' || a === 'p') { const [open, close] = a === 'o' ? ['[', ']'] : ['(', ')']; if (s[k] === open) { const e = matchGroup(s, k, open, close); if (e > 0) i = e } continue }
    for (let n = Number(a); n > 0; n--) { const q = skipSpaces(s, i); if (s[q] !== '{') return i; const e = matchGroup(s, q); if (e < 0) return i; i = e }
  }
  return i
}
/**
 * A table's body as its cells lay it out (Problem 1 of the table-groups brief, 2026-10-07): each cell's stretch of the
 * source [start, end) between its separators — `&` and the row's end (`\\\\`, `\\tabularnewline`), outside braces, math,
 * comments and nested environments —, its row, its first column and the columns it spans (\\multicolumn{n}), and whether
 * its row is the header's. The header is the rows from the first that holds anything up to the first rule across the
 * whole table after it (FULL_RULE; a partial \\cmidrule under a spanning heading does not end it), when fewer rows stand
 * above that rule than below it: a table with no such rule, or with its only one before the last rows, has no header,
 * and every cell of it belongs to its column (a rule-based reading, the same for every table: the bold of a heading
 * row is not read). `rowEnds`, the paper's macros that end a row as `\\\\` does (rowEndsOf): each one ends it here too, an
 * empty group after it with it, so that the cells after it are placed where the walk cuts them (2610.21924v1's \\tightrow)
 */
export function tableGrid(s, from, to, rowEnds = null, rowEndsAfter = null) {
  const cells = [], rows = [{ rule: false, filled: false }]
  let row = 0, col = 0, span = 1, start = from, content = false
  const fill = () => { content = true; rows[row].filled = true }
  const cut = end => { cells.push({ start, end, row, col, span }); col += span; span = 1 }
  let i = from
  while (i < to) {
    const c = s[i]
    if (c === '%') { i = skipComment(s, i); continue }
    if (c === '{') { const e = matchGroup(s, i); if (e < 0 || e > to) { i++; continue } if (/\S/.test(s.slice(i + 1, e - 1).replace(/(^|[^\\])%.*$/gm, '$1'))) fill(); i = e; continue }
    if (c === '$') { const e = mathEnd(s, i); if (e < 0 || e > to) { i++; continue } fill(); i = e; continue }
    if (c === '&') { cut(i); i++; start = i; continue }
    if (c !== '\\') { if (!/\s/.test(c)) fill(); i++; continue }
    const { name, end } = commandAt(s, i)
    // (a macro that ends the row after its arguments, rowEndsAfterOf: the call the row's last cell's, the row ended after it)
    if (rowEndsAfter?.has(name)) {
      // (its arguments as TeX reads them, and the walk (macroArgs): a group, or one token)
      const call = macroArgs(s, end, { params: rowEndsAfter.get(name), opt: false }, to)
      if (call) {
        const e = call.end
        fill(); cut(e)
        row++; col = 0; content = false; rows[row] = { rule: false, filled: false }
        i = e; start = e; continue
      }
    }
    const ownEnd = !!rowEnds?.has(name)
    if (name === '\\' || name === 'tabularnewline' || ownEnd) {
      cut(i)
      let e = end
      if (ownEnd) { const k = skipSpaces(s, e); if (s.startsWith('{}', k)) e = k + 2 }
      else {
        if (s[e] === '*') e++
        const opt = argsAfter(s, e, 1)
        if (opt.args[0]?.kind === 'opt') e = opt.end
      }
      row++; col = 0; content = false; rows[row] = { rule: false, filled: false }
      i = e; start = e; continue
    }
    if (name === '(' || name === '[') { const e = mathEnd(s, i); if (e > 0 && e <= to) { fill(); i = e; continue } }
    if (name === 'begin') {
      const m = s.slice(end).match(/^\s*\{([^}]+)\}/)
      if (m) { const [, after] = endOfEnv(s, end + m[0].length, m[1].trim()); fill(); i = Math.min(after, to); continue }
    }
    if (name === 'verb') { const d = s[end], e = d ? s.indexOf(d, end + 1) : -1; fill(); i = e < 0 || e >= to ? end : e + 1; continue }
    if (name === 'multicolumn') {
      const { args, end: e } = argsAfter(s, end, 3)
      if (args.length === 3) { span = Math.max(1, Number.parseInt(s.slice(args[0].start + 1, args[0].end - 1), 10) || 1); if (/\S/.test(s.slice(args[2].start + 1, args[2].end - 1))) fill(); i = e; continue }
    }
    if (NOT_CONTENT.has(name)) { if (FULL_RULE.test(name) && !content) rows[row].rule = true; i = argsBySpec(s, end, NOT_CONTENT.get(name)); continue }
    fill(); i = end
  }
  cut(to)
  // the header: the filled rows up to the first full rule after the first of them, fewer than the filled rows below it
  const filled = rows.map((r, k) => (r.filled ? k : -1)).filter(k => k >= 0)
  let head = new Set()
  for (let n = 0; n + 1 < filled.length; n++) {
    if (!rows.slice(filled[n] + 1, filled[n + 1] + 1).some(r => r.rule)) continue
    if (n + 1 < filled.length - (n + 1)) head = new Set(filled.slice(0, n + 1))
    break
  }
  return cells.map(cell => ({ ...cell, head: head.has(cell.row) }))
}
/** each cell unit of a table walked from `file` given its cell's place in the grid (tableGrid): the cell whose stretch
 *  holds the unit's start. `table` numbers the paper's tables in the order they are walked */
function placeCells(units, file, grid, table) {
  for (const u of units) {
    if (u.kind !== 'cell' || u.file !== file) continue
    const g = grid.find(c => c.start <= u.start && u.start < c.end) ?? grid.find(c => c.start <= u.start && u.start <= c.end)
    if (g) u.cell = { table, row: g.row, col: g.col, span: g.span, head: g.head }
  }
}
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
/**
 * A web address's `%` as TeX reads it in a `.bbl`'s entries. url.sty's \\url and \\path, hyperref's \\nolinkurl, breakurl's \\burl
 * and the first argument of hyperref's \\href (REVTeX's .bbl's too: `\\begingroup \\@sanitize@url \\@href`) read their argument
 * with `%` a character where TeX has not read those characters already, so `\\href {https://doi.org/…?urlappend=%3Fref%3DPDF…}
 * {…}` is one address. Read as a comment, the address's group never closed, and in a .bbl every entry after it read as one
 * (2610.21770v1's 44 to 61; an MNRAS .bbl's `\\href {…2017A%26A…}`, 2608.18626v1). Only there: a BibTeX-written .bbl's entries,
 * whose structure is the style's, from each \\bibitem of its thebibliography on, an address at the entry's top level (in no
 * group: \\href's own first argument, as both papers have it). Anywhere else, the body included, the `%` stays a comment as the
 * walk read it before: body text can hold any of TeX's constructs (an argument, a definition, a conditional, a verbatim), and
 * no local source writes such an address there (none of 183 papers' .tex, .sty and .cls files). Each such `%` is written as
 * LITERAL_PERCENT, the same length, so that every reading of the walk (groups, comments, a bibliography's \\bibitem) sees what
 * TeX sees and every place stays where it is; the units take their `%` back (restorePercents). A file of another name, a text
 * that holds LITERAL_PERCENT already, or no `%`, is returned as it is
 */
export function urlPercents(text, file) {
  if (!/\.bbl$/i.test(file ?? '') || !text.includes('%') || text.includes(LITERAL_PERCENT)) return text
  const begin = /\\begin\s*\{thebibliography\}/.exec(text)
  if (!begin) return text
  const end = text.indexOf('\\end{thebibliography}', begin.index), to = end < 0 ? text.length : end
  const n = text.length, out = text.split('')
  let changed = false, depth = 0, entry = false
  for (let i = begin.index + begin[0].length; i < to; i++) {
    const c = text[i]
    if (c === '%') { i = skipComment(text, i); continue }
    if (c === '{') { depth++; continue }
    if (c === '}') { depth = Math.max(0, depth - 1); continue }
    if (c !== '\\') continue
    const m = /^\\(?:([A-Za-z@]+)|[\s\S])/.exec(text.slice(i, i + 64))
    const name = m?.[1] ?? null, at = i + (m?.[0].length ?? 1)
    i = at - 1
    if (name === 'bibitem') { entry = true; depth = 0; continue }
    if (!entry || depth > 0 || !URL_READERS.has(name)) continue
    let k = at
    while (text[k] === ' ' || text[k] === '\t' || text[k] === '\n') k++
    if (name === 'href' && text[k] === '[') { const e = matchGroup(text, k, '[', ']'); if (e > 0) { k = e; while (text[k] === ' ' || text[k] === '\t' || text[k] === '\n') k++ } }
    if (text[k] !== '{') continue
    // (the argument as these commands read it: braces counted, `%` a character, `\\` before any character escaping it)
    let d = 0, e = -1
    for (let j = k; j < n; j++) {
      if (text[j] === '\\') { j++; continue }
      if (text[j] === '{') d++
      else if (text[j] === '}' && --d === 0) { e = j + 1; break }
    }
    if (e < 0) continue
    // (read as the boundary is: a `\` and the character after it a pair, so that `\%` is the command \% and `\\%` a backslash
    // pair and then the character)
    for (let j = k; j < e; j++) { if (text[j] === '\\') { j++; continue } if (text[j] === '%') { out[j] = LITERAL_PERCENT; changed = true } }
    i = e - 1
  }
  return changed ? out.join('') : text
}
/** what urlPercents writes a `%` TeX reads as a character as: a code no TeX source holds */
const LITERAL_PERCENT = '\u0000'
/** the commands whose argument TeX reads with `%` a character (urlPercents): hyperref's \\href, its first */
const URL_READERS = new Set(['url', 'nolinkurl', 'path', 'burl', 'href'])
/** a unit's strings and its pieces' with each LITERAL_PERCENT a `%` again, as the paper writes it (urlPercents) */
function restorePercents(units) {
  const fix = o => { for (const k of Object.keys(o)) if (typeof o[k] === 'string' && o[k].includes(LITERAL_PERCENT)) o[k] = o[k].replaceAll(LITERAL_PERCENT, '%') }
  for (const u of units) { fix(u); for (const p of u.pieces ?? []) fix(p) }
}
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
/** spaces and tabs, and at most one line end: TeX lets an argument follow on the next line, but a blank line is \par.
 *  A comment goes with the line end it takes, and an empty line after it is still \par: an argument after
 *  `\includegraphics[width=\textwidth]%{old.png}` on the next line is the command's (2608.23517's {sqrt.png}, walked as
 *  text, stopped TeX at "Missing \endcsname") */
function skipSpaces(s, i) {
  let lines = 0, fresh = false
  while (i < s.length) {
    if (s[i] === ' ' || s[i] === '\t') i++
    else if (s[i] === '%') { const e = s.indexOf('\n', i); if (e < 0) return s.length; i = e + 1; fresh = true }
    else if (s[i] === '\n' && lines === 0 && !fresh) { lines++; i++; fresh = true }
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
/** the arguments of a command whose form is known, as argsAfter reads groups: `form` one character per parameter, `[` an
 *  optional one where it is given, `{` a required group (where none is, the reading stops), a star before the first where
 *  written. Nothing past the form: a group after it is the text's */
function argsOfForm(s, i, form) {
  const args = []
  const k0 = skipSpaces(s, i)
  if (s[k0] === '*' && (s[k0 + 1] === '{' || s[k0 + 1] === '[')) i = k0 + 1
  for (const shape of form) {
    const k = skipSpaces(s, i)
    if (shape === '[') { if (s[k] !== '[') continue; const e = matchGroup(s, k, '[', ']'); if (e < 0) break; args.push({ kind: 'opt', start: k, end: e }); i = e; continue }
    if (s[k] !== '{') break
    const e = matchGroup(s, k); if (e < 0) break
    args.push({ kind: 'req', start: k, end: e }); i = e
  }
  return { args, end: i }
}
/**
 * A front matter command's call as its class reads it (FRONT_MATTER): its form's arguments (argsOfForm), and every optional
 * argument right after its text, which a class reads by looking past it (\\@ifnextchar[): the Elsevier classes' \\author[1]{Name}
 * [orcid=…]. Read short, the option was walked as the text after the call, a unit of its own "[orcid=0000-…]" whose start mark
 * stood between the call and its option: the class no longer saw it, set the bracket as text and the marked original ran a page
 * longer than the paper (2610.21084v1, cas-sc: 50 pages against 49, refused). `to` bounds the reading
 */
function frontArgs(s, i, name, ctx, to = s.length) {
  const { args, end: formEnd } = argsOfForm(s, i, unitForm(name, ctx))
  let end = formEnd
  if (args.at(-1)?.kind === 'req') for (;;) {
    const k = skipSpaces(s, end)
    if (s[k] !== '[') break
    const e = matchGroup(s, k, '[', ']')
    if (e < 0 || e > to) break
    args.push({ kind: 'opt', start: k, end: e }); end = e
  }
  return { args, end }
}
/** the forms of the commands whose argument is a unit of their own (HEADINGS, OWN_UNIT_ARG, FRONT_MATTER) where it is not
 *  `[{`: LaTeX's sectioning commands (\\@startsection) take a star, a short title and the title, a caption, a footnote, a
 *  \\thanks, a \\title and an author block (authblk's \\author[1]{…}, elsarticle's \\address[a]{…}) an optional argument and
 *  their text. subcaption's \\subcaptionbox[list]{heading}[width][pos]{contents}: up to its contents, which are walked as
 *  they stand. Taken as `up to two groups`, the stray `{` on the line after 2610.31660v1's \\subsection{…}, closed 330
 *  lines later, was the heading's second argument, and §II.A to mid-§IV had no unit (57 units, now 126) */
const UNIT_FORMS = { subcaptionbox: '[{[[', captionof: '{[{', tablecaption: '{' }
/** such a command's form: the paper's own definition where it gives one an arity (\\renewcommand{\\section}[2]{…}, in its
 *  files or a class it ships), else LaTeX's. One of no parameter (\\renewcommand\\section{\\@startsection…}) reads on in its
 *  body: LaTeX's form is what it reads */
function unitForm(name, ctx) {
  const macro = ctx.macros.get(name)
  if (macro?.params > 0) return (macro.opt ? '[' : '') + '{'.repeat(macro.params - (macro.opt ? 1 : 0))
  return UNIT_FORMS[name] ?? '[{'
}
/** a citation command: natbib's, biblatex's, apacite's (\cite, \citep, \citet, \parencite, \textcite, \citeA, \citeNP,
 *  \fullcite …) */
const CITATION = /^[A-Za-z]*cite[A-Za-z]*$/i
/** apacite's prenote at s[k] (`<`), \cite<e.g.,>[p.~5]{key}: after its closing `>`, outside every brace group and
 *  within the paragraph; -1 where there is none */
function angleGroup(s, k) {
  let depth = 0
  for (let j = k + 1; j < s.length; j++) {
    const c = s[j]
    if (c === '\\') { j++; continue }
    if (c === '%') { j = skipComment(s, j); continue }
    if (c === '\n' && /^\n[ \t]*\n/.test(s.slice(j, j + 80))) return -1
    if (c === '{') depth++
    else if (c === '}' && --depth < 0) return -1
    else if (c === '>' && depth === 0) return j + 1
  }
  return -1
}
/**
 * A citation's arguments, the whole call one placeholder: apacite's prenote in angle brackets, or biblatex's notes for
 * all of a multicite's citations in parentheses (\cites(see)(and more)[p.~2]{a}{b}), then every adjacent [..] and {..}
 * as for any command (natbib's \citep[see][p.~5]{key}). Read as text, apacite's
 * \cite<>[available at \url{…}]{modified_code} sent `<>[available at` and the key's words to the engine, the key's `_`
 * a placeholder, and the translated key stopped TeX (2610.02069, fault B). Those notes only where a key follows them,
 * within the paragraph: a `<` or a `(` after a citation that takes none is the text's
 */
function citationArgs(s, i, name) {
  const notes = []
  let at = i
  for (let n = 0; n < 2; n++) {
    const k = skipSpaces(s, at), multi = /cites$/i.test(name)
    const e = !multi && !n && s[k] === '<' ? angleGroup(s, k) : multi && s[k] === '(' ? matchGroup(s, k, '(', ')') : -1
    if (e < 0 || /\n[ \t]*\n/.test(s.slice(k, e))) break
    notes.push({ kind: 'opt', start: k, end: e }); at = e
  }
  const rest = notes.length ? argsAfter(s, at) : null
  return rest?.args.some(a => a.kind === 'req') ? { args: [...notes, ...rest.args], end: rest.end } : argsAfter(s, i)
}
/** the paper loadProject reads (arg-roles.mjs paperOf): its LaTeXML bindings and the commands its own files define,
 *  whose arguments the table cannot know (melba.cls's \\def\\firstname{…}, which LaTeXML's moderncv gives one). Set for
 *  the time a project is read — loadProject is synchronous —, else null: the kernel's forms and those written out */
let paper = null
/**
 * A command's arguments: a citation's every adjacent one, its notes in angle brackets or parentheses with them
 * (citationArgs); one whose parameters the role table knows (arg-roles.mjs), exactly those as TeX takes them — a group
 * or a single token each, an optional one where it is given; a bracket after them is the text's (Assumption~\\ref{a}[(i)
 * and (iii)], 2608.10322), one before a required argument an optional one the table does not know of; else, a command
 * the table does not know, every adjacent one (some prose stays untranslated, nothing breaks). Taken as every adjacent group, \setlength\tabcolsep{1.0mm}'s {1.0mm} and the group of three tables after it
 * were \tabcolsep's (2307.16209: three captions in English). `known`, read by the table; each argument's `role` and
 * `param` (its parameter's index) then too. A register (\tabcolsep) takes none: TeX's assignment after it is read with it
 */
function commandArgs(s, i, name, to = s.length) {
  if (CITATION.test(name)) return citationArgs(s, i, name)
  const params = paperParams(name, paper)
  if (params) {
    if (params.length === 1 && params[0].shape === '=') return { args: [], end: i, known: true }
    const r = readArgs(s, i, params, to)
    if (r.complete) {
      const args = r.args.map(a => ({ ...a, kind: a.shape === '[' ? 'opt' : 'req' }))
      // a last argument TeX takes as one token that is a command it sets (text, content, an untyped argument): TeX hands
      // the command the token, which reads its own arguments where it stands, so the call ends past them
      // (\\raise2pt\\hbox{…}) — the walk never ends a placeholder between a command and its arguments, where a lead or a
      // mark would be written. Taken alone, a \\begin read as a box's content left its {center} a group of text, and the
      // lead was written inside the environment's name (#407's review). The token's own groups of text and content come
      // with it (`kind` 'inner', no `param`: no argument of this command's), so that the walk sets their words as it
      // would the token's call alone: its pair opens with `\\raise2pt\\hbox{`, and nothing goes between the two
      const last = args.at(-1), token = last && last.end === r.end && last.kind === 'req' && 'tca'.includes(last.role) && s[last.start] === '\\' ? commandAt(s, last.start) : null
      if (token && token.end === last.end && /^[A-Za-z@]+$/.test(token.name)) {
        const own = commandArgs(s, token.end, token.name, to)
        const inner = own.known ? own.args.filter(a => (a.kind === 'req' || a.kind === 'inner') && s[a.start] === '{' && (a.role === 't' || a.role === 'c')).map(({ param: _, ...a }) => ({ ...a, kind: 'inner' })) : []
        if (own.end > last.end) return { args: [...args.slice(0, -1), { ...last, end: own.end }, ...inner], end: own.end, known: true }
      }
      return { args, end: r.end, known: true }
    }
  }
  return argsAfter(s, i)
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
function paramUse(s, from, to, textual = true, use = { text: new Set(), other: new Set(), typeset: new Set(), stored: new Set() }, storing = false) {
  let i = from
  while (i < to) {
    const c = s[i]
    if (c === '%') { i = skipComment(s, i) + 1; continue }
    if (c === '#') { if (/\d/.test(s[i + 1] ?? '')) { const n = Number(s[i + 1]); if (textual) { use.text.add(n); (storing ? use.stored : use.typeset).add(n) } else use.other.add(n) } i += 2; continue }
    if (c === '$' || (c === '\\' && (s[i + 1] === '(' || s[i + 1] === '['))) { const e = mathEnd(s, i); if (e < 0 || e > to) { i++; continue } paramUse(s, i + 1, e - 1, false, use, storing); i = e; continue }
    if (c === '{') { const e = matchGroup(s, i); if (e < 0 || e > to) { i++; continue } paramUse(s, i + 1, e - 1, textual, use, storing); i = e; continue }
    if (c !== '\\') { i++; continue }
    const { name, end } = commandAt(s, i)
    if (NO_ARGS.has(name) || !/^[A-Za-z@]+$/.test(name)) { i = end; continue }
    // a math environment's body is math (2608.23517's \def\al#1{\begin{align}#1\end{align}}: its displays went out as
    // prose, and TeX stopped at "Double subscript")
    const env = name === 'begin' && /^\s*\{([^}]+)\}/.exec(s.slice(end, end + 100))
    if (env && MATH_ENVS.test(env[1].trim())) { const [bodyEnd, afterEnd] = endOfEnv(s, end + env[0].length, env[1].trim()); paramUse(s, end + env[0].length, Math.min(bodyEnd, to), false, use, storing); i = Math.min(afterEnd, to); continue }
    const { args, end: e, known } = commandArgs(s, end, name)
    const reqs = args.filter(a => a.kind === 'req')
    // typeset as prose: the text of a font command or a box, of a caption or a footnote (2608.06007's
    // \\ncaption{…} = \\caption{\\textnormal{#1}}), the role table's text and content, and what a definition inside the
    // body stores (\\gdef\\@tablecaption{#1}: LaTeX keeps a title so, for \\maketitle to set)
    const definer = DEF_PRIMITIVES.has(name) || /^(?:(?:re)?newcommand|providecommand)$/.test(name)
    const prose = INLINE_TEXT.has(name) || name === 'footnote' || (CAPTIONS.has(name) && name !== 'captionof') ? reqs[0] : CONTENT_BOX.has(name) ? reqs[CONTENT_BOX.get(name) - 1] : definer ? args.at(-1) : null
    for (const a of args) paramUse(s, a.start + 1, a.end - 1, textual && (a === prose || (!!known && (a.role === 't' || a.role === 'c'))), use, storing || (definer && a === prose))
    // a command the table does not know reads what follows as its arguments, up to delimiters only its definition gives:
    // a parameter in the run of tokens right after it is handed to it (acmart.cls's \\ccsdesc{…} =
    // \\ccsdesc@parse#1~#2~~…, whose #2 goes into a \\csname: marked, it stopped TeX six times in 2608.09189)
    if (!known && !CITATION.test(name)) for (let k = skipSpaces(s, e); k < to && !/[\s}]/.test(s[k]); k++) {
      if (s[k] === '\\') k++
      else if (s[k] === '{') { const g = matchGroup(s, k); if (g < 0 || g > to) break; for (const m of s.slice(k, g).matchAll(/#(\d)/g)) use.other.add(Number(m[1])); k = g - 1 }
      else if (s[k] === '#' && /\d/.test(s[k + 1] ?? '')) use.other.add(Number(s[++k]))
    }
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
function paperMacros(files) {
  const out = new Map()
  const re = /\\(?:((?:re)?newcommand|providecommand|DeclareRobustCommand)\*?\s*(?:\{\s*\\([A-Za-z@]+)\s*\}|\\([A-Za-z@]+))\s*(?:\[(\d)\])?|(?:[egx]?def)\s*\\([A-Za-z@]+)\s*((?:#\d\s*)*)(?=\{))/g
  for (const { file, text: t } of files) for (const m of t.matchAll(re)) {
    const name = m[2] ?? m[3] ?? m[5], params = m[1] ? Number(m[4] ?? 0) : (m[6].match(/#\d/g) ?? []).length
    // (one inside its own call's argument is local to that call: CVPR's \\twocolumn[{\\renewcommand\\twocolumn…}])
    if (inComment(t, m.index) || inOwnCall(t, m.index, name)) continue
    // \\providecommand defines nothing a definition before it made (2608.16190's \\def\\cpanauthor{…} and its fallback)
    if (m[1] === 'providecommand' && out.has(name)) continue
    // nor is a fallback a package the paper loads overrides (arg-roles.mjs overriddenFallback: llncs.cls'
    // \\@ifundefined{url}{\\def\\url#1{#1}}{} under hyperref, read as \\url's own, made its argument a group, and hyperref's
    // \\url printed a mark in it)
    if (overriddenFallback(t, m.index, name, m[1] ?? 'def', paper?.packages)) continue
    let k = skipSpaces(t, m.index + m[0].length), opt = false
    if (m[4] && t[k] === '[') { const e = matchGroup(t, k, '[', ']'); if (e < 0) continue; k = skipSpaces(t, e); opt = true }
    if (t[k] !== '{') continue
    const e = matchGroup(t, k); if (e < 0) continue
    // one that takes no argument but whose body reads on (\\textcolor{red}, \\includegraphics[width=3cm], \\@ifstar…): what
    // follows a call is the body's arguments, not known here
    if (!params && readsOn(t.slice(k + 1, e - 1))) { out.delete(name); continue }
    const use = paramUse(t, k + 1, e - 1)
    const prose = [...use.text].filter(n => n <= params && !use.other.has(n) && !(opt && n === 1))
    // one that only stores its prose (\\def\\@copyrightclause{#1}: ceurart's, set on the first page and in the PDF's
    // metadata) has it set elsewhere, perhaps more than once: a front unit, with no mark (2608.12096's \\conference,
    // marked where it was called, left a translation's leading on every page after it)
    const p0 = prose.length === 1 ? prose[0] : undefined
    const then = params ? tailOf(t.slice(k + 1, e - 1)) : null
    out.set(name, { params, opt, prose: p0, def: t.slice(k + 1, e - 1), defFile: file, ...(p0 && use.stored.has(p0) && !use.typeset.has(p0) ? { stores: true } : {}), ...(params ? {} : { body: { file, start: k + 1, end: e - 1 } }), ...(then ? { then } : {}) })
  }
  return out
}
/** every way a file defines a command, its name in group 1 (arg-roles.mjs OWN_COMMANDS' forms, \\let and the expanded
 *  definitions among them): a definition completeMacros does not read makes what the command does unknown */
const ANY_DEFINITION = /\\(?:(?:(?:re)?newcommand|providecommand)\*?|DeclareRobustCommand\*?|(?:New|Renew|Provide|Declare)(?:Expandable)?DocumentCommand|[gex]?def|let|futurelet|newtoks|DeclareMathOperator\*?|DeclareTextCommand|DeclareTextSymbol|DeclareTextCommandDefault|newcounter|newlength|newif)\s*\{?\s*\\([A-Za-z@]+)/g
/** a body that may read on in a way readsOn does not see: it ends in an argument (`\\newcommand\\pair[2]{#1#2}`: the call's
 *  last argument, `\\bert` = BERT\\xspace, is the body's last token), it defines or changes a command (`\\renewcommand\\s{#1}`,
 *  `\\let`, `\\global`), or it names an argument past its own arity (a definition inside another's body, whose #1 is that one's) */
const readsOnToo = (body, arity) => {
  const t = uncommented(body).trimEnd()
  if (/#\d$/.test(t)) return true
  if (/\\(?:(?:re)?newcommand|providecommand|DeclareRobustCommand|(?:New|Renew|Provide|Declare)(?:Expandable)?DocumentCommand|[gex]?def|let|global|futurelet|csdef|csgdef|newtoks|newcounter|newlength|setlength|addtolength|setcounter|addtocounter)(?![A-Za-z@])/.test(t)) return true
  return [...t.matchAll(/#(\d)/g)].some(m => Number(m[1]) > arity)
}
/** a body that sets more than a piece of a line: an environment, a paragraph's end, an alignment's row or cell, a list's item,
 *  a page's end. No mark stands beside a call of one in a line, and set in the mark probe's box (marks.mjs probeSamples) it is
 *  errors TeX may not get past (the kernel's \\and, `\\end{tabular}\\hskip1em\\begin{tabular}`, made a hundred in one paragraph
 *  and stopped a probe) */
const STRUCTURAL = /\\(?:begin|end|par|item|cr|crcr|noalign|hline|tabularnewline|newline|newpage|clearpage)(?![A-Za-z@])|\\\\|(?<!\\)&/
/** \\NewDocumentCommand and its kin, all their arguments mandatory (`m`, `+m`): name, spec, at the body's brace */
const DOCUMENT_COMMAND = /\\(?:New|Renew|Provide|Declare)DocumentCommand\s*(?:\{\s*\\([A-Za-z@]+)\s*\}|\\([A-Za-z@]+))\s*\{([^{}]*)\}\s*/g
/**
 * The paper's macros that read nothing past their own arguments, as [name, arity] by name: each definition of the name in the
 * package's files one completeMacros reads — \\newcommand, \\renewcommand, \\providecommand, \\DeclareRobustCommand (starred
 * or not, with `[n]` and no optional first argument), \\def\\x#1#2 (\\edef, \\gdef, \\xdef), \\NewDocumentCommand with a spec of
 * mandatory arguments alone —, all of one arity, and none whose body reads on (readsOn: \\@ifnextchar, \\@ifstar, \\futurelet,
 * \\xspace or any command at its end that may take what follows; readsOnToo: an argument at its end, a definition in it), nor
 * one that sets more than a piece of a line (STRUCTURAL: an environment, a paragraph's end, an alignment's cell). A
 * call of such a macro that holds its arguments (layout/marks.mjs) reads nothing after it, so a layout mark after it is none
 * of its arguments — what a mark does to the punctuation after it is TeX's to answer (the mark probe). A name defined in any
 * other way (\\let, a delimited \\def, \\DeclareMathOperator) is not one: what it reads is not known
 */
export function completeMacros(files) {
  const found = new Map(), every = new Map()
  const add = (name, arity) => (found.get(name) ?? found.set(name, []).get(name)).push(arity)
  // (a \\def's parameters written against each other and its brace: white space after a parameter is a delimiter TeX
  // matches, `\\def\\foo#1 #2{…}` whose first argument runs to a space, and a closing mark after a call of it would be read
  // into that argument; white space after the name is none, TeX skips it)
  const defs = /\\(?:((?:re)?newcommand|providecommand|DeclareRobustCommand)\*?\s*(?:\{\s*\\([A-Za-z@]+)\s*\}|\\([A-Za-z@]+))\s*(?:\[(\d)\])?|(?:[egx]?def)\s*\\([A-Za-z@]+)\s*((?:#\d)*)(?=\{))/g
  for (const { text: t } of files) {
    for (const m of t.matchAll(ANY_DEFINITION)) if (!inComment(t, m.index) && !inOwnCall(t, m.index, m[1])) every.set(m[1], (every.get(m[1]) ?? 0) + 1)
    // (each definition with its body's range: one inside another's body is that macro's doing, made when it is called, not the
    // definition in effect where the paper calls it)
    const here = []
    for (const m of t.matchAll(defs)) {
      const name = m[2] ?? m[3] ?? m[5], params = m[1] ? Number(m[4] ?? 0) : (m[6].match(/#\d/g) ?? []).length
      if (inComment(t, m.index) || inOwnCall(t, m.index, name)) continue
      const k = skipSpaces(t, m.index + m[0].length)
      here.push({ name, params, at: m.index, k, e: t[k] === '{' ? matchGroup(t, k) : -1, bracket: t[k] === '[' })
    }
    for (const d of here) {
      const nested = here.some(o => o !== d && o.e > 0 && d.at > o.k && d.at < o.e)
      // (an optional first argument: the call looks ahead for its bracket, so it may read what follows)
      if (nested || d.bracket || d.e < 0) { add(d.name, -1); continue }
      const body = t.slice(d.k + 1, d.e - 1)
      add(d.name, readsOn(body) || readsOnToo(body, d.params) || STRUCTURAL.test(uncommented(body)) ? -1 : d.params)
    }
    for (const m of t.matchAll(DOCUMENT_COMMAND)) {
      const name = m[1] ?? m[2], spec = m[3].trim().split(/\s+/).filter(Boolean)
      if (inComment(t, m.index) || inOwnCall(t, m.index, name)) continue
      const k = m.index + m[0].length, e = t[k] === '{' ? matchGroup(t, k) : -1
      const body = e < 0 ? '' : t.slice(k + 1, e - 1)
      add(name, e < 0 || !spec.every(s => s === 'm' || s === '+m') || readsOn(body) || readsOnToo(body, spec.length) || STRUCTURAL.test(uncommented(body)) ? -1 : spec.length)
    }
  }
  const out = []
  for (const [name, arities] of found) if (arities.every(a => a >= 0 && a === arities[0]) && every.get(name) === arities.length) out.push([name, arities[0]])
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}
/**
 * The command a macro's body ends in, none of its arguments given there, by name: TeX's reading goes on past the call's
 * own arguments into that command's (`then`, the walker's: the call is walked as that command). 2106.10165's
 * \\newcommand{\\strangechapter}[1]{\\renewcommand{\\thechapter}{#1}\\chapter}, called as
 * \\strangechapter{$\\infty$}{The End of Training}: the chapter's title is the group after the call, which the walk took
 * for a paragraph of its own, and its line probe, written before the unit, came between \\chapter and its title: \\chapter
 * took \\axtlines for the title, and the book of 471 pages stopped TeX. Null where the body ends otherwise, in a
 * declaration that takes no argument (NO_ARGS), or in a command's operand, which TeX does not run (\\string\\section)
 */
function tailOf(body) {
  const t = uncommented(body).trimEnd()
  // its tokens: a control word (a star after it with it, as commandAt reads it), a control symbol, a character
  const at = []
  for (let i = 0; i < t.length; i++) { if (/\s/.test(t[i])) continue; at.push(i); if (t[i] === '\\') i = commandAt(t, i).end - 1 }
  const word = k => (at[k] !== undefined && t[at[k]] === '\\' && isLetter(t[at[k] + 1] ?? '') ? commandAt(t, at[k]).name : null)
  const n = at.length - 1, name = word(n)
  if (!name || NO_ARGS.has(name)) return null
  // one an operand of the command before it, which TeX does not run: \\string\\section, \\let\\saved\\section,
  // \\let\\saved=\\section, \\def\\section…
  const before = t[at[n - 1]] === '=' ? n - 2 : n - 1
  return OPERAND_OF.has(word(n - 1)) || SECOND_OPERAND_OF.has(word(before - 1)) ? null : name
}
/** the commands whose operand is the token after them (tailOf): it is printed, compared or defined, not run */
const OPERAND_OF = new Set(['string', 'noexpand', 'meaning', 'show', 'let', 'futurelet', 'def', 'gdef', 'edef', 'xdef', 'ifx', 'newcommand', 'renewcommand', 'providecommand', 'DeclareRobustCommand', 'chardef', 'mathchardef', 'countdef', 'dimendef', 'skipdef', 'toksdef'])
/** …and those whose operand is the second token after them, the first a name (\\let\\saved\\section, \\ifx\\a\\section,
 *  \\renewcommand\\saved\\section) */
const SECOND_OPERAND_OF = new Set(['let', 'ifx', 'newcommand', 'renewcommand', 'providecommand', 'DeclareRobustCommand'])
/** whether a macro body ends where something after a call goes on being read: in a command whose arguments it does not
 *  all give (by the role table), in one the table does not know, after a bracket (\\includegraphics[…]), or with a
 *  look ahead anywhere in it */
function readsOn(body) {
  if (/\\(?:@ifnextchar|@ifstar|kernel@ifnextchar|@ifnch|@testopt|@protected@testopt|@dblarg|futurelet|afterassignment|expandafter|csname|IfBooleanTF|NewDocumentCommand)(?![A-Za-z@])/.test(body)) return true
  const t = uncommented(body).trimEnd()
  if (!t || /\\[A-Za-z@]+\*?$|\]$|#\d$|\\$/.test(t)) return !!t && !/^[^\\]*$/.test(t)
  // the last command at the body's top level, and whether the text goes on after its arguments
  let last = -1, depth = 0
  for (let i = 0; i < t.length; i++) { if (t[i] === '\\') { if (depth === 0 && isLetter(t[i + 1] ?? '')) last = i; i++; continue } if (t[i] === '{') depth++; else if (t[i] === '}') depth-- }
  if (last < 0) return false
  const { name, end } = commandAt(t, last)
  if (NO_ARGS.has(name)) return false
  const params = paperParams(name, paper)
  if (!params) return !/[^\s{}]/.test(t.slice(argsAfter(t, end).end))
  const r = readArgs(t, end, params)
  return !r.complete
}
/** a paper macro's arguments at a call, as TeX takes them: its optional one when given, then each required one a brace
 *  group or a single token; null when the call runs past `to` */
/** the pieces the walk reads a macro's body as, with `args` in place of its parameters (none: each parameter empty), in a
 *  walk of its own that changes nothing of the paper's: null where the body ends or starts a unit */
/** how many macro expansions may nest (S1): past it the call is one placeholder */
const EXPANSION_DEPTH = 3
function bodyPieces(macro, args, file, ctx) {
  // (each part in the engine's text by its own file's encoding: the body by the file that defines it, the arguments by the
  // caller's, so that a Latin-1 macros.tex's letter is not read as UTF-8 under a UTF-8 main file; walked as no file's)
  const body = asEngineText(macro.defFile, macro.def).replace(/#(\d)/g, (m, n) => (args?.[Number(n) - 1] === undefined ? '' : asEngineText(file, args[Number(n) - 1])))
  const units = [], b = new Builder(null, units, body, ctx.bodies, null)
  walk(body, 0, body.length, b, { ...ctx, called: null, fits: [], skipped: {}, ended: false, visit: () => {}, visitFront: () => {} })
  return units.length ? null : (b.cur?.pieces ?? [])
}
/** whether a macro's body sets words of its own beside what its parameters hold: a word outside every group, command and
 *  formula of it (Notebook~#1; \\textbf{#1}, \\textcolor{red}{#1}, #1\\xspace and \\rowcolor{gray!8}\\multicolumn{6}{…}{#1}
 *  hold none, and stay the pair they were) */
function setsWords(macro) {
  if (macro.words === undefined) {
    // (a formula's letters are no words, in any of the forms the walk reads one: $…$, $$…$$, \\(…\\), \\[…\\], a math environment)
    let t = typeof macro.def === 'string' ? uncommented(macro.def).replace(/\\begin\s*\{\s*([A-Za-z]+\*?)\s*\}[\s\S]*?\\end\s*\{\s*\1\s*\}/g, (m, env) => (MATH_ENVS.test(env) ? ' ' : m)).replace(/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$]*\$/g, ' ') : ''
    for (let n = 0; n < 20 && /\{[^{}]*\}/.test(t); n++) t = t.replace(/\{[^{}]*\}/g, ' ')
    // (an optional argument's brackets, a box's [c][14.5pt], and a dimension after a command, \\rowcolor{gray!8}[0pt], are no words)
    t = t.replace(/\[[^\]]*\]/g, ' ').replace(/[-+]?(?:\d+\.?\d*|\.\d+)\s*(?:pt|em|ex|cm|mm|in|bp|sp|pc|dd|cc|mu)\b/g, ' ')
    macro.words = /\p{L}{2}/u.test(t.replace(/\\(?:[A-Za-z@]+|.)/g, ' ').replace(/#\d/g, ' '))
  }
  return macro.words
}
/** a call's expansion as plain text (the call's arguments' sources, `args`, put in its body), in Unicode: text pieces, an
 *  accent's letter, and a tie or a control space as a space; null where it holds anything else (a command, a group, math) */
function expandedText(macro, args, file, ctx) {
  const pieces = bodyPieces(macro, args, file, ctx)
  if (!pieces?.length) return null
  let out = ''
  for (const p of pieces) {
    if (p.t === 'text') out += UTF8_LAX.decode(latin1Bytes(p.s))
    else if (p.t === 'ph' && /^(?:~|\\ )$/.test(p.src)) out += ' '
    else return null
  }
  // (an address in it is the paper's, kept as it is (keepAddresses): the call one placeholder, never a text keepAddresses
  // would cut while each part kept the whole call for its source)
  return /\p{L}/u.test(out) && !HAS_EMAIL.test(out) ? out : null
}
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
    for (const m of t.matchAll(/\\(?:(?:(?:re)?newcommand|providecommand)\*?\s*\{?\s*\\([A-Za-z@]+)\s*\}?\s*(?:\[\d\]\s*)?(?:\[[^\]]*\]\s*)?|def\s*\\([A-Za-z@]+)\s*(?:#\d\s*)*|DeclareMathOperator\*?\s*\{\s*\\([A-Za-z@]+)\s*\}\s*)(?=\{)/g)) {
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
// A unit: { file, kind, start, end, pieces: [{t:'text', s} | {t:'ph', src} | {t:'open', id, src} | {t:'close', id, src}] }.
// `floats`: the units written inside a float (FLOAT_ENVS), which the project gives as their indices (inFloat)
/**
 * The text pieces that begin a line after a comment's line end, with the length of the indent TeX skips there: TeX ends a
 * line at its comment, and the next line begins in state N, its leading spaces and tabs read as nothing. The walk passes over
 * the comment, so a piece's text holds that indent where the line end was, and written back from the pieces the indent
 * was a space TeX set where the paper has none (`hyphen-%⏎  ated` written `hyphen-  ated`; 2608.30640v1's `performance.%⏎    }`,
 * 2610.39617v1's `{%⏎    \\includegraphics`). Kept beside the pieces, never in them, so that no unit's pieces and no hash move:
 * patch writes such a piece without its indents. Keyed by the piece object, each indent [offset, length] in the text patch
 * writes of it (its `src` where it has one, else its `s`), carried where flush makes pieces anew of it: a piece joined with
 * a letter's (joinLetters), cut around an address or a number (keepAddresses, escapedLocals, keepNumbers), transcoded
 */
const SKIPPED = new WeakMap()
/** whether a paper makes the space character active anywhere (\\obeyspaces, a \\catcode of the space set to 13): there TeX reads
 *  a line's indent after a comment as active spaces, not as nothing, and the walk keeps every indent (SKIPPED stays empty).
 *  `\\catcode32=13` or `=\\active`, in any of the paper's own files */
const activeSpacesIn = texts => texts.some(t => /\\obeyspaces(?![A-Za-z@])|\\catcode\s*(?:`\\? |32\b|"20\b|'40\b)\s*=?\s*(?:13\b|\\active(?![A-Za-z@]))/.test(uncommented(t)))
/** the text patch writes of a piece */
const written = p => p.src ?? p.s
/** `q`, the text `p` writes from `from` to `to` (written), keeps the indents TeX skips there (SKIPPED) */
const sliceSkips = (p, q, from = 0, to = written(p).length) => {
  const r = SKIPPED.get(p)
  if (!r || q === p) return q
  const kept = r.filter(([o, n]) => o >= from && o + n <= to).map(([o, n]) => [o - from, n])
  if (kept.length) SKIPPED.set(q, kept)
  return q
}
/** `q`, the text of `a` and then `b` (joinLetters), keeps the indents TeX skips in either */
const joinSkips = (a, b, q) => {
  const r = [...(SKIPPED.get(a) ?? []), ...(SKIPPED.get(b) ?? []).map(([o, n]) => [o + written(a).length, n])]
  if (r.length) SKIPPED.set(q, r)
  return q
}
class Builder {
  constructor(file, units, src = '', macros = new Map(), floats = null) { this.file = file; this.units = units; this.src = src; this.macros = macros; this.floats = floats; this.cur = null; this.pairId = 0; this.displays = new WeakSet() }
  text(s, start, end) {
    if (!this.cur) { if (!s.trim()) return; this.cur = { file: this.file, kind: this.kind ?? 'para', start, end, pieces: [] } }
    const p = { t: 'text', s }, skip = start === this.lineAfterComment ? /^[ \t]*/.exec(s)[0].length : 0
    if (skip) SKIPPED.set(p, [[0, skip]])
    this.cur.pieces.push(p); this.cur.end = end
  }
  /** `display`: a formula set on lines of its own (displayOutside) */
  ph(src, start, end, display = false) { if (!this.cur) this.cur = { file: this.file, kind: this.kind ?? 'para', start, end, pieces: [] }; const p = { t: 'ph', src }; if (display) this.displays.add(p); this.cur.pieces.push(p); this.cur.end = end; return true }
  /** (the unit's range holds the opening: a unit that ends with it, its close in the next unit, is written over it, which
   *  else stayed in the source after the unit's range and was set twice — a pgffor loop's `{{`, 2610.21377) */
  open(src, start) { if (!this.cur) this.cur = { file: this.file, kind: this.kind ?? 'para', start, end: start, pieces: [] }; const id = ++this.pairId; this.cur.pieces.push({ t: 'open', id, src }); this.cur.end = Math.max(this.cur.end, start + src.length); return id }
  close(id, src, end) { if (this.cur) { this.cur.pieces.push({ t: 'close', id, src }); this.cur.end = end } }
  /** a letter an accent made (accentLetter): text, its UTF-8 bytes read as the source's are, and `src` the accent as
   *  the source writes it — what is set wherever the unit is set untranslated (patch). Joined with its word at flush */
  letter(letter, src, start, end) { if (!this.cur) this.cur = { file: this.file, kind: this.kind ?? 'para', start, end, pieces: [] }; this.cur.pieces.push({ t: 'text', s: latin1(utf8Bytes(letter)), src }); this.cur.end = end }
  flush() {
    const u = this.cur; this.cur = null
    if (!u) return
    // (a file that is not UTF-8: each text piece as UTF-8, `src` its own bytes, which patch writes back, before its letters join it)
    // (an entry's numbers kept before its letters join their words: a number between two letters of a kernel's command or an
    // accent, `S{\\o}ren. 2020. The {\\O}resund study.`, stands in a joined piece whose source keepNumbers cannot cut)
    const read = keepAddresses(u.pieces).map(p => { if (p.t !== 'text' || p.src !== undefined) return p; const t = asEngineText(this.file, p.s); return t === p.s ? p : sliceSkips(p, { t: 'text', s: t, src: p.s }) })
    u.pieces = joinLetters(BIB_KINDS.has(u.kind) ? keepNumbers(read) : read)
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
    // (written inside a float: told beside the units, by index — no field of the unit, whose objects a nested piece holds
    // and its parent's hash reads)
    if (this.inFloat) this.floats?.add(u)
    this.units.push(u)
  }
}

/** each letter an accent made joined with the text on either side of it (Builder.letter), so that its word is one
 *  text piece: `s` the word as the engine reads it, `src` as the source writes it. After keepAddresses, which cuts text
 *  pieces as their `s` has them */
const joinLetters = pieces => {
  const out = []
  for (const p of pieces) {
    const last = out.at(-1)
    if (p.t === 'text' && last?.t === 'text' && (p.src !== undefined || last.src !== undefined)) out[out.length - 1] = joinSkips(last, p, { t: 'text', s: last.s + p.s, src: (last.src ?? last.s) + (p.src ?? p.s) })
    else out.push(p)
  }
  return out
}
// an e-mail address or a web address — the latter's last stop, comma or parenthesis the sentence's —, an ORCID written out
// (0000-0002-1825-0097), and the domain after a list of names in braces
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b(?:https?|ftp):\/\/[^\s{}\\]*[^\s{}\\.,;:!?)\]]|\bwww\.[\w-]+(?:\.[\w-]+)+(?:\/[^\s{}\\]*[^\s{}\\.,;:!?)\]])?|\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/g, HAS_EMAIL = new RegExp(EMAIL.source)
const AT_DOMAIN = /^@[\w-]+(?:\.[\w-]+)+/
/** an e-mail whose local part TeX escapes (`goh\_siong\_thye@a-star.edu.sg`, 2608.11884; `tang\_chao@xtu.edu.cn`, 2608.29778):
 *  each `\_` a placeholder of its own, which parted the address, its first words left text ("goh siong", "tang", sent to the
 *  translator). The words before the address that its `\_` join, the `\_` and the address are one placeholder, as the paper
 *  has them; a word apart from it by white space or anything else stays as it is */
function escapedLocals(pieces) {
  const out = []
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k]
    if (p.t === 'ph' && p.src === '\\_' && out.at(-1)?.t === 'text' && out.at(-1).src === undefined && /[\w.+-]$/.test(out.at(-1).s)) {
      // (the run of `\_` and plain words up to a text that opens with the rest of an address)
      let j = k
      while (pieces[j]?.t === 'ph' && pieces[j].src === '\\_' && pieces[j + 1]?.t === 'text' && pieces[j + 1].src === undefined && /^[\w.+-]*$/.test(pieces[j + 1].s)) j += 2
      const tail = pieces[j]?.t === 'ph' && pieces[j].src === '\\_' ? pieces[j + 1] : null
      const rest = tail?.t === 'text' && tail.src === undefined ? /^[\w.+-]*@[\w-]+(?:\.[\w-]+)+/.exec(tail.s)?.[0] : null
      if (rest) {
        const before = out.pop(), head = /[\w.+-]+$/.exec(before.s)[0]
        if (before.s.length > head.length) out.push(sliceSkips(before, { ...before, s: before.s.slice(0, -head.length) }, 0, before.s.length - head.length))
        out.push({ t: 'ph', src: head + pieces.slice(k, j + 1).map(x => x.src ?? x.s).join('') + rest })
        if (tail.s.length > rest.length) out.push(sliceSkips(tail, { ...tail, s: tail.s.slice(rest.length) }, rest.length))
        k = j + 1
        continue
      }
    }
    out.push(p)
  }
  return out
}
/** An address is not prose: an e-mail in a unit's text (jatin@us.ibm.com), an ORCID, a web address a link shows as its text
 *  (\\href{https://osf.io/gjvbs}{https://osf.io/gjvbs}, now that a link's text is text: 2608.14893), and a list of names
 *  in escaped braces with its domain ({sl225, samand2, reyhaneh}@illinois.edu), each become a placeholder, kept as the
 *  paper has it. Sent as text, a machine translation spelled one of 2608.06701's names in katakana and joined the list
 *  with the ideographic comma */
function keepAddresses(pieces) {
  pieces = escapedLocals(pieces)
  const lists = []
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k], names = pieces[k + 1], shut = pieces[k + 2], after = pieces[k + 3]
    const domain = after?.t === 'text' && AT_DOMAIN.exec(after.s)?.[0]
    if (p.t === 'ph' && p.src === '\\{' && names?.t === 'text' && shut?.t === 'ph' && shut.src === '\\}' && domain) {
      lists.push({ t: 'ph', src: p.src + names.s + shut.src + domain })
      if (after.s.length > domain.length) lists.push(sliceSkips(after, { ...after, s: after.s.slice(domain.length) }, domain.length))
      k += 3
    } else lists.push(p)
  }
  return lists.flatMap(p => {
    if (p.t !== 'text' || !HAS_EMAIL.test(p.s)) return [p]
    const out = []
    let at = 0
    for (const m of p.s.matchAll(EMAIL)) {
      if (m.index > at) out.push(sliceSkips(p, { ...p, s: p.s.slice(at, m.index) }, at, m.index))
      out.push({ t: 'ph', src: m[0] })
      at = m.index + m[0].length
    }
    if (at < p.s.length) out.push(sliceSkips(p, { ...p, s: p.s.slice(at) }, at))
    return out
  })
}

/**
 * The texts of a TikZ picture, each a unit of kind 'figure': a node's brace group (\\node … {text}, … node[…] (name) at
 * (x, y) {text}, in TikZ's own syntax whatever the picture draws), a pgfplots legend entry (\\addlegendentry{text}) and
 * an axis label or title in braces (xlabel={text}, ylabel=, zlabel=, title=). TeX sets them, so a translation is set in
 * the translation's fonts and a node grows to fit it. Everything else in the picture stays byte for byte. The layer route
 * sends none of them (layer-proto/rows.mjs TIKZ_KIND): the layout compile marks none, and the picture's glyphs are the
 * figure ink units' (layout/figure-text.mjs), translated once; they stay units of the bundle at their ids.
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
function branchEnd(s, from, to, ifs, { toFi = false } = {}) {
  let depth = 0
  for (let k = from; k < to; k++) {
    if (s[k] === '%') { k = skipComment(s, k); continue }
    if (s[k] !== '\\') continue
    const { name, end } = commandAt(s, k)
    // (a \\fi, an \\else, an \\or ends at its own name: commandAt's end takes a star after it, which none of them has, `\\fi*`'s
    // star the text's, and the branches are measured back from their terminator's name)
    const own = k + 1 + name.length
    if (isConditional(name, ifs)) depth++
    else if (name === 'fi') { if (depth-- === 0) return own }
    else if ((name === 'else' || name === 'or') && depth === 0 && !toFi) return own
    k = end - 1
  }
  return -1
}
/** a conditional's branches after its test's name at `end`: `then` up to its \\else (or its \\fi), `else` after it up to the
 *  \\fi (-1 where it has none), and `end` past the \\fi; null where no \\fi closes it before `to`. The test's own tokens are
 *  the then branch's first (conditionalValue says where they end where it reads them) */
function conditionalAt(s, end, to, ifs) {
  const first = branchEnd(s, end, to, ifs)
  if (first < 0) return null
  const firstName = commandBefore(s, first)
  if (firstName === 'or') return null
  if (firstName === 'fi') return { thenFrom: end, thenTo: first - 3, elseFrom: -1, elseTo: -1, end: first }
  const fi = branchEnd(s, first, to, ifs, { toFi: true })
  return fi < 0 ? null : { thenFrom: end, thenTo: first - 5, elseFrom: first, elseTo: fi - 3, end: fi }
}
/**
 * The letter an \\ifmmode at s[i] sets in a paragraph's text (`end` past its name), where its \\else branch is one letter alone
 * (an accent and its letter, a letter command): TeX in text mode takes that branch, never the first, a math form of the same
 * letter (REVTeX's .bbl writes a name's accent both ways: `Louren\\ifmmode~\\mbox{\\c{c}}\\else \\c{c}\\fi{}o`, read with both
 * branches as "Louren ç ç o", 2610.20716v1); the spaces TeX skips after \\fi, and an empty group ending it, with it. With
 * where its source ends, or null
 */
function ifmmodeLetter(s, end, to, ctx) {
  const c = conditionalAt(s, end, to, ctx.ifs)
  if (!c || c.elseFrom < 0 || consumes(s, end, c.end)) return null
  const k = skipSpaces(s, c.elseFrom)
  let one = null
  if (s[k] === '\\') {
    const cmd = commandAt(s, k)
    one = accentLetter(s, k, cmd.end, cmd.name, c.elseTo, ctx.ownAccents) || letterCommand(s, k, cmd.end, cmd.name, c.elseTo, ctx.ownLetters)
  } else if (s[k] === '{' && s[k + 1] === '\\') {
    const g = matchGroup(s, k), cmd = commandAt(s, k + 1)
    const inner = g > 0 && g <= c.elseTo && (accentLetter(s, k + 1, cmd.end, cmd.name, g - 1, ctx.ownAccents) || letterCommand(s, k + 1, cmd.end, cmd.name, g - 1, ctx.ownLetters))
    if (inner && inner.end === g - 1) one = { letter: inner.letter, end: g }
  }
  // (the branch the letter alone, up to its \\fi: a space after an accent's group is a word's end, `\\'{e} \\fi`, left to the walk)
  if (!one || one.end !== c.elseTo) return null
  let e = skipSpaces(s, c.end)
  if (s[e] === '\n') e = c.end
  if (s.startsWith('{}', e)) e += 2
  return e <= to ? { letter: one.letter, end: e } : null
}
/** the control word that ends at `at` (branchEnd's \\fi, \\else, \\or) */
const commandBefore = (s, at) => /\\([A-Za-z]+)$/.exec(s.slice(Math.max(0, at - 6), at))?.[1]
/** whether s[from, to) holds words TeX would set: letters outside comments, math, commands' names and their arguments — but
 *  a font command's or a box's, whose argument is text (\\end{document}, \\url{…} hold no words; \\textbf{Final words} does) */
const wordsIn = (s, from, to) => from < to && /\p{L}{2}/u.test(s.slice(from, to).replace(/(^|[^\\])%.*$/gm, '$1').replace(/\$[^$]*\$/g, ' ')
  .replace(/\\([A-Za-z@]+)\*?((?:\s*\[[^\]]*\])*(?:\s*\{[^{}]*\})*)/g, (m, name, args) => (INLINE_TEXT.has(name) || CONTENT_BOX.has(name) || name === 'footnote' ? ` ${args} ` : ' ')))
/**
 * A conditional's value where its own text decides it: \\iftrue, \\if of two characters (an author's \\if 0 … \\fi around a
 * passage) and \\ifx of two characters; null for every other, which the paper's definitions or TeX's state decide (\\ifdefined,
 * \\ifcsname, a \\newif, \\ifx of commands, \\ifnum). Not asked of TeX, and not worked out from the paper's definitions:
 * the units are cut before any compile, the same on every reader, and following definitions through the files, their
 * groups and every \\let that clears one is TeX's own work (the review of #457 found a fault in each of three rounds of it)
 */
function conditionalValue(name, s, end) {
  if (name === 'iftrue') return true
  if (name === 'if' || name === 'ifx') { const two = ifChars(s, end); return two ? two[0] === two[1] : null }
  return null
}
/** the two characters \\if compares where both are characters (neither a command, a group, a parameter nor a comment),
 *  a space or a line's end after the first a space; else null */
function ifChars(s, end) {
  const k = skipSpaces(s, end), a = s[k], b = s[k + 1]
  if (!a || /[\\{}%#\s]/.test(a) || !b || /[\\{}%#]/.test(b)) return null
  return [a, /\s/.test(b) ? ' ' : b]
}
/** where the tokens of the tests conditionalValue reads end (the then branch begins there): \\if's and \\ifx's two
 *  characters; any other's at its name */
/** whether s[from, to) holds what branchEnd cannot scan as TeX would: \\verb or inline code, a verbatim-like environment,
 *  or a definition (whose body TeX stores, its \\else and \\fi among it) */
const consumes = (s, from, to) => /\\(?:verb|lstinline|mintinline|[gex]?def|let|(?:re)?newcommand|providecommand|DeclareRobustCommand|(?:New|Renew|Provide|Declare)DocumentCommand|(?:re)?newenvironment)(?![A-Za-z@])|\\begin\s*\{\s*(?:verbatim|Verbatim|lstlisting|minted|comment|alltt)/.test(s.slice(from, to))
function testEnd(name, s, end) {
  const k = skipSpaces(s, end)
  return (name === 'if' || name === 'ifx') && ifChars(s, end) ? k + 2 : end
}
/** a control word TeX takes as a conditional, which a \\fi ends: TeX's own, the paper's \\newif ones, LaTeX's internal
 *  \\if@… — not etoolbox's \\ifdefempty{…}{…}{…} and the like, macros that no \\fi ends */
const isConditional = (name, ifs) => TEX_IFS.has(name) || ifs.has(name) || /^if@/.test(name)
/**
 * The paper's \\newif conditionals TeX resolves the same wherever it reads them: one set true or false (\\longtrue) only
 * where TeX surely acts on it, never in a definition's body, and always to the same value; one never set, false, as
 * \\newif leaves it. A Map of the conditional's name to its value; one set otherwise is not in it
 */
function newifValues(texts, ifs) {
  const set = new Map()
  if (!ifs.size) return set
  // only a file that sets one is read (a package's files mostly do not)
  const sets = new RegExp(String.raw`\\(?:${[...ifs].map(n => n.slice(2).replace(/@/g, '\\@')).join('|')})(?:true|false)(?![A-Za-z@])`)
  for (const t of texts.filter(x => sets.test(x))) for (const c of texCommands(t, { ifs })) {
    const m = /^(.+?)(true|false)$/.exec(c.name), name = m && `if${m[1]}`
    if (!name || !ifs.has(name)) continue
    if (c.inDef || !c.sure) { set.set(name, null); continue }
    if (set.get(name) !== null) (set.get(name) ?? set.set(name, new Set()).get(name)).add(m[2] === 'true')
  }
  const out = new Map()
  for (const name of ifs) { const v = set.get(name); if (v === undefined) out.set(name, false); else if (v?.size === 1) out.set(name, [...v][0]) }
  return out
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
    const { args, end } = argsOfForm(s, at + m[0].length, unitForm(m[0].slice(1), ctx))
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
/** a row's end in an author block, at its top level: the tabular a class sets the block in (LaTeX's \\maketitle, the conference
 *  styles'). Not authblk's \\authorcr, which begins another row of names (its places are its \\affil's) */
const FRONT_ROW = /^(?:\\|newline|tabularnewline|cr|crcr)$/
/** an author's block's end, at its top level, the next block begun: LaTeX's \\and, NeurIPS' \\And and \\AND, llncs' \\and
 *  between institutes */
const FRONT_AND = /^(?:and|And|AND)$/
/** what may stand before a row's first text and is none of it: white space, a comment, a group's opening, a declaration of no
 *  argument (\\small, \\it: NO_ARGS), a space of TeX's, a \\vspace or an \\hspace */
const ROW_LEAD = /^(?:\s+|%[^\n]*(?:\n|$)|\{|\\(?:vspace|hspace|vskip)\*?\s*\{[^{}]*\}|\\[,;:! ]|\\([A-Za-z@]+)(?![A-Za-z@]))/
/** an affiliation's mark opening a row (a numbered list of places, `$^1$University of X`): a superscript, IEEEtran's
 *  \\IEEEauthorrefmark, a style's \\affmark. A row of names sets its marks after each name, never before the first */
const MARK_FIRST = /^(?:\$\s*(?:\{\s*\})?\s*\^|\\\(\s*(?:\{\s*\})?\s*\^|\\(?:textsuperscript|IEEEauthorrefmark|affmark)(?![A-Za-z@]))/
/** the same mark after a name's last letter (`Marcelo Kuperman$^{3,4}$`): a row of names, wherever it stands in its block —
 *  names that run over two rows, their places set elsewhere (2608.14893's second row of names, read as a place). A place opens
 *  with its mark, never sets one after its words */
const MARK_AFTER = /[^\s{$\\]\s*(?:\$\s*(?:\{\s*\})?\s*\^|\\\(\s*(?:\{\s*\})?\s*\^|\\(?:textsuperscript|IEEEauthorrefmark|affmark)(?![A-Za-z@]))/
/** a row of an author block that opens with the word "and" (`\\\\and Rafael F. Schaefer, \\emph{Senior Member, IEEE}`, IEEEtran's
 *  journal form, 2610.21880v1): the list of names its row before broke, never a place */
const AND_FIRST = /^and(?![A-Za-z@])/
/** a row of an author block with what stands before its text taken off (ROW_LEAD) */
function rowText(src) {
  let t = src
  for (;;) {
    const m = ROW_LEAD.exec(t)
    // (a row's box, FRONT_BOXES, and its brace taken off as what stands before the text: `\\centerline{$^*$equal …` opens with its mark)
    if (!m || (m[1] !== undefined && !NO_ARGS.has(m[1]) && !FRONT_BOXES.has(m[1]))) break
    t = t.slice(m[0].length)
  }
  return t
}
/** whether a row of an author block opens with an affiliation's mark (MARK_FIRST), what stands before its text aside */
function markFirst(src) { return MARK_FIRST.test(rowText(src)) }
/** an author block's row and block ends at its top level ({ at, end, and }), in order: no group, formula or environment is
 *  looked into (a row TeX ends inside a tabular of the block's own is that tabular's), nor a conditional (`ifs`, the paper's
 *  \\newif names; TeX's own): a row's end in one of its branches (`\\ifanonymous … \\\\ … \\else … \\fi`) is that branch's, and a
 *  cut there would part the \\if from its \\fi over two units, each written back with its own marks */
function frontEnds(s, from, to, ifs = new Set()) {
  const out = []
  for (let k = from; k < to;) {
    const c = s[k]
    if (c === '%') { k = skipComment(s, k) + 1; continue }
    if (c === '{') { const e = matchGroup(s, k); k = e < 0 || e > to ? k + 1 : e; continue }
    if (c === '$') { const e = mathEnd(s, k); k = e < 0 || e > to ? k + 1 : e; continue }
    if (c !== '\\') { k++; continue }
    const { name, end } = commandAt(s, k)
    if (isConditional(name, ifs)) { const e = branchEnd(s, end, to, ifs, { toFi: true }); k = e < 0 ? end : e; continue }
    if (name === '(' || name === '[') { const e = mathEnd(s, k); k = e < 0 || e > to ? end : e; continue }
    if (name === 'begin') { const m = /^\s*\{([^}]+)\}/.exec(s.slice(end, to)); if (m) { const [, after] = endOfEnv(s, end + m[0].length, m[1].trim()); k = Math.min(Math.max(after, end), to); continue } }
    if (FRONT_ROW.test(name)) {
      // (LaTeX's \\\\, its star and its optional space with it)
      let e = end
      if (name === '\\') { if (s[e] === '*') e++; const j = skipSpaces(s, e); if (s[j] === '[') { const g = matchGroup(s, j, '[', ']'); if (g > 0 && g <= to) e = g } }
      out.push({ at: k, end: e, and: false }); k = e; continue
    }
    if (FRONT_AND.test(name)) { out.push({ at: k, end, and: true }); k = end; continue }
    k = end
  }
  return out
}
/**
 * A front-matter argument (docs/route/orphan-text.md §5, "Names"): its notes as frontNotes cuts them, and the text between them
 * units of an author block's kinds by what TeX sets it as. `role` 'names', a block that opens with the authors' names
 * (FRONT_NAMES: \\author): each author's block (between its top level's \\and, FRONT_AND) is the rows of the tabular the class
 * sets it in (FRONT_ROW), its names the first row and the rest its places — `Name\\thanks{…} \\\\ Department \\\\ University \\\\
 * \\texttt{e-mail}` —, but in a block whose places are a numbered list, each opening with its mark (`$^1$University of X`,
 * markFirst), the rows before the first such row are its names, however many (names that run over two rows), and a row that
 * holds an author's note (\\thanks, \\footnotemark) is names, a row an affiliation's mark opens never; 'places', a block
 * of places throughout (\\affil, \\affiliation, \\institute, \\address: places, its rows units of kind 'affiliation' each).
 * IEEEtran's \\IEEEauthorblockN and \\IEEEauthorblockA inside a block are their own (walk, FRONT_LINES). One written as keys and
 * values (elsarticle's organization={…}, city={…}) keeps its text, notes aside, unless it is places: then each value a unit of
 * its own (frontValues). An e-mail or a web address in any of them, an ORCID, a mark, stays as it is (keepAddresses, the
 * placeholders)
 */
function frontBlock(s, from, to, b, ctx, role = 'names') {
  if (/(^|[,{\s])[A-Za-z]+\s*=\s*\{/.test(s.slice(from, to))) { if (role === 'places') frontValues(s, from, to, b, ctx); else frontNotes(s, from, to, b, ctx); return }
  // the notes, wherever they are in the argument (as frontNotes finds them), and the rows' and blocks' ends at its top level
  const notes = []
  for (const m of s.slice(from, to).matchAll(/\\(?:thanks|footnote)(?![A-Za-z@])/g)) {
    const at = from + m.index
    if ((notes.length && at < notes.at(-1).end) || inComment(s, at)) continue
    const { args, end } = argsOfForm(s, at + m[0].length, unitForm(m[0].slice(1), ctx))
    if (args.some(a => a.kind === 'req')) notes.push({ at, end })
  }
  const ends = frontEnds(s, from, to, ctx.ifs).filter(e => !notes.some(n => e.at >= n.at && e.at < n.end))
  // each block's rows and each row's kind
  const blocks = [[]]
  let start = from
  for (const e of ends) { blocks.at(-1).push([start, e.at]); start = e.end; if (e.and) blocks.push([]) }
  blocks.at(-1).push([start, to])
  const kindAt = []
  for (const rows of blocks) {
    const led = rows.map(([x, y]) => markFirst(s.slice(x, y))), marked = led.indexOf(true)
    // (a row of names: the block's first, every row before its numbered places where it has them, a row that holds an
    // author's note, which LaTeX's \\thanks is and a note's mark sets after a name, and a row that sets an affiliation's mark
    // after a name (MARK_AFTER) or opens with "and" (AND_FIRST); never one an affiliation's mark opens)
    const noted = ([x, y]) => notes.some(n => n.at >= x && n.at < y) || /\\footnotemark(?![A-Za-z@])/.test(s.slice(x, y))
    rows.forEach((row, r) => kindAt.push([row[0], role === 'names' && !led[r] && (r === 0 || (marked >= 0 && r < marked) || noted(row) || MARK_AFTER.test(s.slice(row[0], row[1])) || AND_FIRST.test(rowText(s.slice(row[0], row[1])))) ? 'author' : 'affiliation']))
  }
  const kindOf = at => kindAt.findLast(([x]) => x <= at)?.[1] ?? 'affiliation'
  // (the units' numbers: what PIPELINE 29 cut the text between two notes into, its walk as one author block's (olderUnits), keeps
  // its units' numbers — each of its units' the first unit cut inside its range, then the first left, in order —, and every
  // other unit cut there is `later`, numbered after every other unit of the source (entriesLast), so that no unit's number
  // moves: a translation held by a unit's number is still that unit's)
  let span = [], spanFrom = from
  const made = []
  const unit = (x, y) => {
    if (y <= x) return
    b.flush(); const saved = b.kind, before = b.units.length; b.kind = kindOf(x); walk(s, x, y, b, ctx); b.flush(); b.kind = saved
    span.push(...b.units.slice(before))
    made.push(...b.units.slice(before))
  }
  const close = at => {
    // (a unit nested in another, a note inside a row's group, goes where its own unit goes: none of the numbering)
    const top = topUnits(span), older = olderUnits(s, spanFrom, at, b, ctx), kept = new Set()
    for (const [x, y] of older) { const u = top.find(v => !kept.has(v) && v.start >= x && v.start < y) ?? top.find(v => !kept.has(v)); if (u) kept.add(u) }
    for (const u of top) if (!kept.has(u)) u.later = true
    span = []
  }
  // the text between the cuts, each a unit of its row's kind; a note a front note
  let past = from
  for (const c of [...notes.map(n => ({ ...n, note: true })), ...ends].sort((p, q) => p.at - q.at)) {
    if (c.at < past) continue
    unit(past, c.at)
    if (c.note) { close(c.at); frontNote(s, c.at, c.end, b, ctx); spanFrom = c.end }
    past = c.end
  }
  unit(past, to)
  close(to)
  // (the block each unit was cut from, and its whole text: what a class compares, frontMarks; beside the unit, never in it, so
  // that no unit's pieces, nor a unit that nests it, carry it: sourceHash)
  const block = { text: s.slice(from, to) }
  for (const u of made) BLOCK_OF.set(u, block)
}
/** an author block's unit's block (frontBlock): its command's whole argument, by unit */
const BLOCK_OF = new WeakMap()
/** the units of a list no other of it nests */
const topUnits = list => { const nested = new Set(list.flatMap(u => u.pieces.filter(p => p.t === 'nested').map(p => p.unit))); return list.filter(u => !nested.has(u)) }
/** the pairs the walk counts over s[from, to) without the letters it makes of a letter command and of \\ifmmode (ctx.letters
 *  false: PIPELINE 30's reading), walked in a shadow of the walk's context and builder: what a span read as one letter now
 *  spends of the pairs' ids, as a group around an accent spends its own, so that every pair after it keeps its id (a copy's
 *  translations are found again by the units' pieces: cache.mjs sourceHash) */
function pairsOf(s, from, to, b, ctx) {
  if (to <= from) return 0
  const shadow = { ...ctx, letters: false, called: null, fits: [], bibliography: [], floats: new Set(), visit: () => {}, visitFront: () => {}, ends: new Map(ctx.ends), skipped: { ...ctx.skipped }, dirs: [...ctx.dirs] }
  const sb = new Builder(b.file, [], s, ctx.bodies, shadow.floats)
  if (b.inFloat) sb.inFloat = true
  sb.kind = b.kind; walk(s, from, to, sb, shadow); sb.flush()
  return sb.pairId
}
/** the ranges of the units PIPELINE 29 cut the text of an author block between two notes into (its walk whole, of kind
 *  author), walked in a shadow of the walk's context and builder, so that nothing it counts, numbers or reads (a call of the
 *  paper's macro, a table's number, a file) is counted twice */
function olderUnits(s, from, to, b, ctx) {
  if (to <= from) return []
  // (`boxesUnread`: PIPELINE 29's walk read no row's box, FRONT_BOXES, so that the units a \\centerline row is cut into now are
  // all `later`, every other unit keeping its number: 2010.11929v2's footnote stays u1)
  const shadow = { ...ctx, called: null, fits: [], bibliography: [], floats: new Set(), visit: () => {}, visitFront: () => {}, ends: new Map(ctx.ends), skipped: { ...ctx.skipped }, dirs: [...ctx.dirs], boxesUnread: true }
  const out = [], sb = new Builder(b.file, out, s, ctx.bodies, shadow.floats)
  if (b.inFloat) sb.inFloat = true
  sb.kind = 'author'; walk(s, from, to, sb, shadow); sb.flush()
  return topUnits(out).map(u => [u.start, u.end])
}
/** a key of an affiliation's values whose value is no prose: a postcode */
const CODE_KEY = /^(?:postcode|postalcode|zipcode|zip)$/i
/** an affiliation written as keys and values (elsarticle's \\affiliation[a]{organization={Department of X}, city={Paris},
 *  country={France}}, which the class prints one value after another): each value with a word in it a unit of places of its
 *  own, its marks inside the value's braces, where the class keeps the value's tokens as they are; the keys, the separators,
 *  a postcode (CODE_KEY) and a value of no word as they are, and its notes as frontNotes cuts them */
function frontValues(s, from, to, b, ctx) {
  frontNotes(s, from, to, b, ctx)
  const block = { text: s.slice(from, to) }
  for (const m of s.slice(from, to).matchAll(/(?:^|[,{\s])([A-Za-z]+)\s*=\s*\{/g)) {
    const open = from + m.index + m[0].length - 1
    if (inComment(s, open) || CODE_KEY.test(m[1])) continue
    const close = matchGroup(s, open)
    if (close < 0 || close > to || !wordsIn(s, open + 1, close - 1) || /\\(?:thanks|footnote)(?![A-Za-z@])/.test(s.slice(open, close))) continue
    b.flush(); const saved = b.kind, before = b.units.length; b.kind = 'affiliation'; walk(s, open + 1, close - 1, b, ctx); b.flush(); b.kind = saved
    // (no unit before PIPELINE 30's: each numbered after every other, frontBlock's `later`; its block the argument, frontMarks)
    for (const u of topUnits(b.units.slice(before))) u.later = true
    for (const u of b.units.slice(before)) BLOCK_OF.set(u, block)
  }
}
/** a command's text and content arguments (commandArgs, `known`), walked: within a paragraph each one a pair around its
 *  text, the command's other arguments kept with the pair's open or close; one that holds paragraphs, a figure or a
 *  table ends the paragraph before the command and is walked as an environment's body is, the command's own source left
 *  as it stands (\\IfFileExists{…}{\\begin{figure}…}{}, whose caption stayed in English: 2608.28697) */
function walkArgs(s, i, end, walked, b, ctx) {
  // content given as an optional argument is set apart from the paragraph: \\twocolumn[…], ICML's title block and a
  // CVPR teaser's figure across the page's top
  if (walked.some(a => a.shape === '[' || holdsBlock(s.slice(a.start + 1, a.end - 1)))) {
    b.flush()
    for (const a of walked) { const before = b.units.length; walk(s, a.start + 1, a.end - 1, b, ctx); b.flush(); if (a.shape === '[') for (const u of b.units.slice(before)) u.bracketed = true }
    return
  }
  let from = i
  walked.forEach((a, k) => {
    // (an argument after one whose walk ended the paragraph — an \\input in it, read as a file of its own — is walked as a
    // body is: a pair opened there would begin a unit between two of the command's arguments, where the marked original
    // writes the unit's line probe, which TeX then reads as the next argument. 2610.37818v1's
    // \\IfFileExists{…}{\\input{…}}{\\figph{…}}: the probe was the branch TeX drops, the placeholder it never sets was set,
    // Figure 6 grew by its box and the paper by a page)
    if (k > 0 && !b.cur) { walk(s, a.start + 1, a.end - 1, b, ctx); b.flush(); from = a.end; return }
    const id = b.open(s.slice(from, a.start + 1), from)
    walk(s, a.start + 1, a.end - 1, b, ctx)
    const last = k === walked.length - 1
    b.close(id, last ? s.slice(a.end - 1, end) : s[a.end - 1], last ? end : a.end)
    from = a.end
  })
}
/** the running heads' commands: their text, short and set on every page, is kept as it is — a mark in it would be set
 *  on every page (llncs' \\titlerunning, a token register, made a marked unit with its leading, and 2608.10091's zh final
 *  two pages longer) */
const RUNNING_HEADS = new Set(['markboth', 'markright', 'titlerunning', 'authorrunning', 'toctitle', 'tocauthor'])
/** hyperref's \\texorpdfstring{TeX}{PDF}: the first argument the text typeset, the second the bookmark's string, kept with the
 *  command as it is. The role table leaves both untyped (LaTeXML's prototype), so the call was one placeholder, and a heading
 *  wholly one no unit: 13 of 2307.16209's 14 */
const PDF_STRING = new Set(['texorpdfstring'])
/** the parameters of a theorem-like environment: its title, optional */
const THEOREM_PARAMS = paramsOf('[t')
/**
 * An environment's arguments after its \\begin{name}: those its definition takes — the paper's own (\\newenvironment's
 * count), a theorem's optional title, else the role table's (arg-roles.mjs environmentParams) — and any optional ones
 * after them, which a package may add (enumitem's keys after a list's \\begin); else, an environment nothing defines,
 * every adjacent group. Their end, and `title`, a theorem's: its optional argument, unless that is a list of keys
 * (thmtools' name=…, label=…)
 */
function envArgs(s, at, to, env, ctx) {
  const params = ctx.envs.get(env) ?? (ctx.theorems.has(env) ? THEOREM_PARAMS : null) ?? (ctx.ownEnvs.has(env) || isLineEnv(env, ctx.lineEnvs) ? null : environmentParams(env, paper?.bindings ?? null))
  const r = params && readArgs(s, at, params, to)
  if (!r?.complete) return { end: argsAfter(s, at).end, title: null }
  let end = r.end
  for (;;) { const k = skipSpaces(s, end); if (s[k] !== '[') break; const e = matchGroup(s, k, '[', ']'); if (e < 0 || e > to) break; end = e }
  const t = r.args.find(a => a.role === 't' && a.shape === '[')
  return { end, title: t && !/^\s*[A-Za-z][\w\s-]*=/.test(uncommented(s.slice(t.start + 1, t.end - 1))) ? t : null }
}
/**
 * A front matter command (FRONT_ROLES, the role table's hooks), in the preamble or the body: the argument its hook takes
 * walked by what it is — a title or subtitle a heading, names and places an author block (frontBlock), a note a front
 * note, an abstract or keywords a unit of their kind, a line of prose (a dedication, a date) a front unit —, its other
 * arguments as they are. Where the table knows its parameters the hook's is found by its index, else it is its n-th
 * required argument or its last. Its end, or -1 where it has no such argument
 */
function frontCommand(s, end, name, to, b, ctx, { front = false } = {}) {
  const [role, n] = FRONT_ROLES[name]
  const call = commandArgs(s, end, name, to)
  const reqs = call.args.filter(a => a.kind === 'req' && s[a.start] === '{')
  const arg = call.known ? call.args.find(a => a.param === n - 1 && s[a.start] === '{') : reqs[n - 1] ?? reqs.at(-1)
  if (!arg) return -1
  b.flush()
  const from = arg.start + 1, upTo = arg.end - 1, saved = b.kind, before = b.units.length
  if (role === 'author') frontBlock(s, from, upTo, b, ctx, roleOf(name))
  else if (role === 'note' || role === 'prose') { b.kind = role === 'note' ? 'footnote' : 'para'; walk(s, from, upTo, b, ctx); b.flush(); b.kind = saved; for (const u of b.units.slice(before)) u.front = true }
  else { b.kind = role === 'abstract' ? 'abstract' : 'heading'; b.title = role === 'title'; walk(s, from, upTo, b, ctx); b.flush(); b.title = false; b.kind = saved }
  if (front) for (const u of b.units.slice(before)) u.front = true
  return call.end
}
function walk(s, from, to, b, ctx) {
  let i = from, textStart = -1
  const endText = () => { if (textStart >= 0 && textStart < i) b.text(s.slice(textStart, i), textStart, i); textStart = -1 }
  const startText = () => { if (textStart < 0) textStart = i }
  // the command a paper macro's call ends in (its `then`, tailOf), walked next as that command where an argument follows
  // the call: { name, end } with `end` the call's, and s[i…end) the call's source still to place (none where its own
  // arguments were walked). Every unit then begins and ends outside the call and the arguments TeX reads after it — a
  // unit's leading and line probe, which go before its first piece, cannot come between them. Only a command whose
  // arguments the walk knows: a heading's or a caption's, another of the paper's macros, one of the role table's; one it
  // does not know (\\xspace, \\fi) leaves what follows the call as it was read before. `thens`, how many in a row: a
  // macro that ends in itself goes no further than a few
  let then = null, thens = 0
  const goOn = (macro, call, at) => {
    const name = macro.then, params = name && paperParams(name, paper), tail = name && ctx.macros.get(name)
    if (!name || thens >= 4 || !(HEADINGS.has(name) || OWN_UNIT_ARG.has(name) || tail || params)) return false
    const next = argsAfter(s, call.end, 1).args[0]
    if (next) { if (next.end > to) return false; then = { name, end: call.end }; i = at; return true }
    // a single token where that command takes a required argument, which TeX takes for it (\\chapter X, \\chapter\\name):
    // it goes with the call, in one piece — the call's placeholder, or the close of the pair its text was walked in —, or
    // where the call's arguments were walked as units of their own, stays in the source after it: no unit begins, and no
    // layout mark goes, between the two
    const k = skipSpaces(s, call.end)
    const takes = HEADINGS.has(name) || OWN_UNIT_ARG.has(name) || (tail ? tail.params > (tail.opt ? 1 : 0) : params.some(p => p.shape === '{' || p.shape === '_'))
    if (!takes || k >= to || /[\s{}[\]$%#&^_]/.test(s[k])) return false
    const token = s[k] === '\\' ? commandAt(s, k) : null, e = token ? token.end : k + 1, last = b.cur?.pieces.at(-1)
    if (e > to || (at === call.end && last && last.t !== 'close')) return false
    if (at < call.end) b.ph(s.slice(at, e), at, e)
    else if (last) { last.src += s.slice(call.end, e); b.cur.end = e }
    // (a call of the paper's macro of no argument counted as any is: storedBodies)
    if (token && ctx.macros.get(token.name)?.params === 0) ctx.called?.(token.name, b.kind)
    i = e
    return true
  }
  while (i < to && !ctx.ended) {
    const c = then ? '\\' : s[i]
    // a comment takes its line's end with it; a blank line after it is still \\par, as TeX reads it (`text % note`, then
    // an empty line: two paragraphs, which one unit set as one)
    // (where the next line begins, the indent TeX skips there: Builder.text, SKIPPED)
    if (c === '%') { endText(); i = skipComment(s, i) + 1; if (!ctx.activeSpaces) b.lineAfterComment = i; let k = i; while (k < to && (s[k] === ' ' || s[k] === '\t')) k++; if (k < to && s[k] === '\n' && b.cur) { b.flush(); i = k + 1 } continue }
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
      // a group around an accent alone, El Ni{\~n}o: the letter, in its word (accentLetter). The pair's id is spent as
      // the group's would be, so that every pair after it keeps its id, and the units without such a letter their
      // pieces (a copy's translations are found again by them: cache.mjs sourceHash)
      const k = skipSpaces(s, i + 1), accent = s[k] === '\\' ? commandAt(s, k) : null
      const letter = accent && accentLetter(s, k, accent.end, accent.name, e - 1, ctx.ownAccents)
      if (letter && skipSpaces(s, letter.end) === e - 1) { endText(); b.pairId++; b.letter(letter.letter, s.slice(i, e), i, e); i = e; continue }
      // (and around a letter command alone, {\\L}ukasz, {\\ss}, or an \\ifmmode whose \\else is one, Abell{\\ifmmode\\acute{a}\\else
      // \\'{a}\\fi}n: the letter in its word, the group's id spent as the accent's is)
      // (the group the letter alone, no space inside it: `{ \\L}` and `{\\ss{} }` set a space too, left to the walk)
      const kernelLetter = !letter && accent && k === i + 1 && ctx.letters !== false && (letterCommand(s, k, accent.end, accent.name, e - 1, ctx.ownLetters) || (accent.name === 'ifmmode' ? ifmmodeLetter(s, accent.end, e - 1, ctx) : null))
      if (kernelLetter && kernelLetter.end === e - 1) { endText(); b.pairId += pairsOf(s, i, e, b, ctx); b.letter(kernelLetter.letter, s.slice(i, e), i, e); i = e; continue }
      endText(); const id = b.open('{', i); walk(s, i + 1, e - 1, b, ctx); b.close(id, '}', e); i = e; continue
    }
    if (c === '&' && b.cellMode) { endText(); b.flush(); i++; continue }
    if (c === '}' || c === '&' || c === '#' || c === '^' || c === '_') { endText(); b.ph(c, i, i + 1); i++; continue }
    if (c !== '\\') { startText(); i++; continue }
    // a command, or the one a macro's call ends in (goOn)
    const { name, end } = then ?? commandAt(s, i)
    thens = then ? thens + 1 : 0; then = null
    // \\iffalse … \\fi, and \\if followed by words (an author's way of commenting a passage out): nothing there is typeset,
    // so nothing there is a unit — and a mark or a translated first word would change what \\if compares
    if (name === 'iffalse' || (name === 'if' && /^[ \t]*\n?[ \t]*[A-Za-z]{2}/.test(s.slice(end, end + 8)))) {
      const stop = branchEnd(s, end, to, ctx.ifs)
      if (stop > 0) { endText(); b.flush(); ctx.skipped[name] = (ctx.skipped[name] ?? 0) + 1; i = stop; continue }
    }
    // any other conditional TeX closes with a \\fi: one branch is what TeX sets (S4 of 2026-10-24: 2610.21098's
    // \\ifdefined\\BottleneckPreprint, both its branches' sentences one unit). Where its own text decides it
    // (conditionalValue: \\iftrue, \\if 0) the live branch is walked, the rest stays in the source; where it does not and
    // both branches hold words, neither branch is the translator's (`skipped.ifUnknown`): left English, never the branch
    // TeX does not set. One whose branches hold no words (wordsIn) has its pieces as they were
    // \\ifmmode whose \\else branch is one letter: that letter in its word, as TeX sets it in text (ifmmodeLetter)
    // (not under \\unless, which inverts it: that one TeX's conservative reading below, neither branch the translator's)
    const mathOr = name === 'ifmmode' && ctx.letters !== false && !/\\unless\s*$/.test(s.slice(Math.max(0, i - 12), i)) ? ifmmodeLetter(s, end, to, ctx) : null
    if (mathOr) { endText(); b.pairId += pairsOf(s, i, mathOr.end, b, ctx); b.letter(mathOr.letter, s.slice(i, mathOr.end), i, mathOr.end); i = mathOr.end; continue }
    if (isConditional(name, ctx.ifs) && name !== 'ifcase') {
      // (one whose span holds what TeX reads otherwise than as tokens there — \\verb, inline code, a verbatim environment, a
      // definition's body — may have its \\else where TeX has none: its value is not taken, neither branch is text)
      const c = conditionalAt(s, end, to, ctx.ifs)
      // (\\unless inverts the test: not taken, neither branch is text)
      // (\\ifmmode in the walk's text, never math, is false: TeX in text mode takes its \\else)
      const value = c && !consumes(s, end, c.end) && !/\\unless\s*$/.test(s.slice(Math.max(0, i - 12), i)) ? (name === 'ifmmode' && ctx.letters !== false ? false : conditionalValue(name, s, end)) : null
      if (c) c.thenFrom = Math.min(testEnd(name, s, end), c.thenTo)
      if (c && (value !== null || (wordsIn(s, c.thenFrom, c.thenTo) && c.elseFrom >= 0 && wordsIn(s, c.elseFrom, c.elseTo)))) {
        const [from, upto] = value === true ? [c.thenFrom, c.thenTo] : value === false ? (c.elseFrom >= 0 ? [c.elseFrom, c.elseTo] : [c.thenTo, c.thenTo]) : [-1, -1]
        // (\\ifmmode's first branch is math, never text, whatever it holds: only its \\else is walked)
        const mathFirst = name === 'ifmmode' && ctx.letters !== false
        const dead = value === null ? true : value ? c.elseFrom >= 0 && wordsIn(s, c.elseFrom, c.elseTo) : mathFirst || wordsIn(s, c.thenFrom, c.thenTo)
        if (dead) {
          const block = holdsBlock(s.slice(c.thenFrom, c.end))
          endText()
          if (value === null) { ctx.skipped.ifUnknown = (ctx.skipped.ifUnknown ?? 0) + 1; if (block) b.flush(); else b.ph(s.slice(i, c.end), i, c.end); i = c.end; continue }
          // (\\ifmmode's pairs as the walk counted them before it read its \\else alone, so that every pair after it keeps its id)
          const ids = mathFirst ? [b.pairId, pairsOf(s, i, c.end, b, ctx)] : null
          if (block) { b.flush(); walk(s, from, upto, b, ctx); b.flush(); if (ids) b.pairId = Math.max(b.pairId, ids[0] + ids[1]); i = c.end; continue }
          b.ph(s.slice(i, from), i, from); walk(s, from, upto, b, ctx); endText(); if (upto < c.end) b.ph(s.slice(upto, c.end), upto, c.end)
          if (ids) b.pairId = Math.max(b.pairId, ids[0] + ids[1])
          i = c.end; continue
        }
      }
    }
    if (name === '(' || name === '[') { const e = mathEnd(s, i); if (e > 0 && e <= to) { endText(); b.ph(s.slice(i, e), i, e, name === '['); i = e; continue } }
    const shorthand = ctx.envMacros.get(name)
    if (shorthand?.side === 'begin' && (MATH_ENVS.test(shorthand.env) || ctx.displayEnvs.has(shorthand.env) || SKIP_ENVS.test(shorthand.env) || ctx.skipEnvs.has(shorthand.env))) {
      // the block ends at the partner macro or at a literal \end{env}
      const ends = [...ctx.envMacros].filter(([, v]) => v.side === 'end' && v.env === shorthand.env).map(([k]) => k)
      const re = new RegExp(`\\\\(?:${ends.map(e => e.replace(/[@*]/g, m => `\\${m}`)).join('|') || '(?!)'})(?![A-Za-z@])|\\\\end\\s*\\{${shorthand.env.replace(/\*/g, '\\*')}\\}`, 'g')
      re.lastIndex = end
      const m = re.exec(s)
      const stop = m && m.index < to ? m.index + m[0].length : end
      endText(); b.ph(s.slice(i, stop), i, stop, displayEnv(shorthand.env) || ctx.displayEnvs.has(shorthand.env)); i = stop; continue
    }
    if (name === 'begin') {
      const m = s.slice(end).match(/^\s*\{([^}]+)\}/); if (!m) { i = end; continue }
      const env = m[1].trim(), afterBegin = end + m[0].length
      const [bodyEnd, afterEnd] = endOfEnv(s, afterBegin, env)
      if (MATH_ENVS.test(env) || ctx.displayEnvs.has(env)) { endText(); b.ph(s.slice(i, afterEnd), i, afterEnd, displayEnv(env) || ctx.displayEnvs.has(env)); i = afterEnd; continue }
      endText(); b.flush()
      // a TikZ picture: only its texts are prose (tikzText); the drawing stays as it is
      if (env === 'tikzpicture') { tikzText(s, afterBegin, bodyEnd, b, ctx); i = afterEnd; continue }
      // the bibliography: each \\bibitem's entry its units (bibliography), not one the paper defines anew
      if (env === 'thebibliography' && !ctx.skipEnvs.has(env)) { bibliography(s, afterBegin, bodyEnd, b, ctx); i = afterEnd; continue }
      if (SKIP_ENVS.test(env) || ctx.skipEnvs.has(env)) { ctx.skipped[env] = (ctx.skipped[env] ?? 0) + 1; i = afterEnd; continue }
      if (ctx.tblrEnvs.has(env) && (ctx.tblrMath || argsOfForm(s, afterBegin, '[{').args.some(a => TBLR_MATH.test(uncommented(s.slice(a.start, a.end)))))) { ctx.skipped[env] = (ctx.skipped[env] ?? 0) + 1; i = afterEnd; continue }
      if (TABLE_ENVS.test(env)) {
        if (!ctx.tables) { ctx.skipped[env] = (ctx.skipped[env] ?? 0) + 1; i = afterEnd; continue }
        // a table: each cell is a unit of its own; & and \\ end it. The column specification and width stay as they are. In an
        // author block its cells are the block's units, cut at & and \\ as cells are (blockKind), placed in no grid
        const tp = ctx.ownEnvs.has(env) ? null : environmentParams(env, paper?.bindings ?? null), tr = tp && readArgs(s, afterBegin, tp, bodyEnd)
        // (one the table does not know by its form: tabularx's, tabular*'s and tabulary's {width}[pos]{spec}, else [pos]{spec})
        const argsEnd = tr?.complete ? tr.end : argsOfForm(s, afterBegin, env.startsWith('tabularx') || env === 'tabular*' || env === 'tabulary' ? '{[{' : '[{').end
        // (the paper's tables numbered in the order they begin, a table nested in a cell after the one it is in)
        const saved = b.kind, savedCell = b.cellMode, first = b.units.length, table = (ctx.tableCount = (ctx.tableCount ?? 0) + 1); b.kind = blockKind(b, 'cell'); b.cellMode = true
        walk(s, argsEnd, bodyEnd, b, ctx); b.flush(); b.kind = saved; b.cellMode = savedCell
        // each cell unit's place in the table's grid (tableGrid), by which its consistency group is found (groups.mjs):
        // a table nested in a cell gives its units the outer cell's place, set after its own
        placeCells(b.units.slice(first), b.file, tableGrid(s, argsEnd, bodyEnd, ctx.rowEnds, ctx.rowEndsAfter), table)
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
      // the paper's environment that begins a table in its begin code (tableWrapsOf): its own arguments as its definition takes
      // them, its body the table's rows, each cell a unit placed in its grid. Never fitted: the table is in the definition
      if (ctx.tableWraps?.has(env)) {
        if (!ctx.tables) { ctx.skipped[env] = (ctx.skipped[env] ?? 0) + 1; i = afterEnd; continue }
        const { end: argsEnd } = envArgs(s, afterBegin, bodyEnd, env, ctx)
        const saved = b.kind, savedCell = b.cellMode, first = b.units.length, table = (ctx.tableCount = (ctx.tableCount ?? 0) + 1); b.kind = blockKind(b, 'cell'); b.cellMode = true
        walk(s, argsEnd, bodyEnd, b, ctx); b.flush(); b.kind = saved; b.cellMode = savedCell
        placeCells(b.units.slice(first), b.file, tableGrid(s, argsEnd, bodyEnd, ctx.rowEnds, ctx.rowEndsAfter), table)
        i = afterEnd; continue
      }
      // everything else is a container: its body is walked, its own arguments stay ({width} of a minipage, a list's
      // options) — those its definition takes (envArgs), a group after them the body's (\\begin{proof}{…}: 2608.25304's
      // eleven proofs in English) —, but a theorem's title, a heading of its own (\\begin{theorem}[Convergence of X]:
      // the reader sees it as the body's words)
      const { end: argsEnd, title } = envArgs(s, afterBegin, bodyEnd, env, ctx)
      // (a float's units, and those of whatever it holds, `inFloat`)
      const outside = b.inFloat
      if (FLOAT_ENVS.test(env)) b.inFloat = true
      // (its units `bracketed`: written back in its brackets, a translation's own ] would end them, patch)
      if (title) { const saved = b.kind, before = b.units.length; b.kind = 'heading'; walk(s, title.start + 1, title.end - 1, b, ctx); b.flush(); b.kind = saved; for (const u of b.units.slice(before)) u.bracketed = true }
      const saved = b.kind; b.kind = blockKind(b, env === 'abstract' ? 'abstract' : ctx.theorems.has(env) ? 'theorem' : saved)
      walk(s, argsEnd, bodyEnd, b, ctx); b.flush(); b.kind = saved
      b.inFloat = outside
      i = afterEnd; continue
    }
    if (name === 'end') {
      endText(); b.flush(); const m = s.slice(end).match(/^\s*\{([^}]+)\}/), at = i; i = end + (m ? m[0].length : 0)
      // \end{document} where the walk reaches it, in whatever file: TeX stops there, and nothing after it is typeset
      // (its \begin, in the main file, is before the walk; a subfile's own is walked as an environment, its \end with it)
      // — one TeX surely reaches (documentEnds): not one in a conditional's branch it skips or cannot tell
      if (m?.[1].trim() === 'document' && (ctx.ends?.get(b.file)?.has(at) ?? true)) { ctx.ended = true; return }
      continue
    }
    // \\bibliography{…}: TeX reads the job's .bbl there, which the package holds (BibTeX's output, shipped, or the one BibTeX
    // writes in the prepare's first pass: layout/paper.mjs madeBibliography), its thebibliography a paragraph's end (its
    // heading's); none read, it sets nothing, and the paragraph before it ends there all the same, so that the source's units
    // are the same with the .bbl and without it (`bibliography`, the names it reads: whether the paper has one to make)
    if (name === 'bibliography') {
      const { args, end: e } = argsAfter(s, end, 1)
      if (args[0]?.kind === 'req') {
        endText(); b.flush()
        ctx.bibliography.push(...s.slice(args[0].start + 1, args[0].end - 1).split(',').map(x => x.trim()).filter(Boolean))
        if (ctx.bbl) ctx.visit(ctx.bbl, [], b.inFloat)
        i = e; continue
      }
    }
    // in a bibliography entry, a command that sets its text argument as it stands (BIB_TEXT): a pair around it, its other
    // arguments kept with the opening; a \\bibinfo of a field that is no prose (BIB_KEPT_FIELD) one placeholder
    if (BIB_KINDS.has(b.kind) && BIB_TEXT.has(name)) {
      const before = BIB_TEXT.get(name), { args, end: e } = argsAfter(s, end, before + 1), reqs = args.filter(a => a.kind === 'req')
      if (args.length === before + 1 && reqs.length === before + 1) {
        const text = reqs[before], field = before ? s.slice(reqs[0].start + 1, reqs[0].end - 1).trim() : ''
        endText()
        if (name === 'bibinfo' && BIB_KEPT_FIELD.test(field)) { b.ph(s.slice(i, e), i, e); i = e; continue }
        const id = b.open(s.slice(i, text.start + 1), i); walk(s, text.start + 1, text.end - 1, b, ctx); b.close(id, '}', e); i = e; continue
      }
    }
    if (name === 'item') { endText(); b.flush(); const { args, end: e } = argsAfter(s, end, 1); i = args.length && args[0].kind === 'opt' ? e : end; continue }
    if (name === 'input' || name === 'include' || name === 'subfile' || IMPORTS.has(name)) {
      endText(); b.flush(); const { args, end: e } = argsAfter(s, end, IMPORTS.has(name) ? 2 : 1)
      const [a, f] = args.map(x => s.slice(x.start + 1, x.end - 1).trim())
      // import.sty: \import{dir}{file} reads dir/file and puts dir first on the path an \input in it is looked for on,
      // \subimport the same from the directory imported last; subfiles loads \subfile{dir/file} by \subimport{dir}{file}
      // (the file read inside a float is the float's: its units in `inFloat`, as TeX sets them there)
      const imported = (dir, file) => ctx.visit(file, [normalizePath(dir), ...ctx.dirs], b.inFloat)
      if (IMPORTS.has(name)) { if (f !== undefined) imported(IMPORTS.get(name) ? `${ctx.dirs[0] ?? ''}/${a}` : a, f) }
      else if (name === 'subfile') { if (a) imported(`${ctx.dirs[0] ?? ''}/${a.slice(0, a.lastIndexOf('/') + 1)}`, a.slice(a.lastIndexOf('/') + 1)) }
      else if (a) ctx.visit(a, ctx.dirs, b.inFloat)
      i = e; continue
    }
    if (HEADINGS.has(name) || OWN_UNIT_ARG.has(name)) {
      // its text: where the role table knows a text argument, that one (\\captionof's after its {figure}); else its first
      // required argument (\\captionof's last), an optional one before it (a short caption, a heading's for the contents)
      // kept as it is. What it takes is its form (unitForm), and a group after it is the text's
      const read = name === 'captionof' || name === 'tablecaption' ? commandArgs(s, end, name, to) : null
      const { args, end: e } = read?.known ? read : argsOfForm(s, end, unitForm(name, ctx))
      const req = read?.known ? args.findLast(a => a.kind === 'req' && a.role === 't') : name === 'captionof' ? args.findLast(a => a.kind === 'req') : args.find(a => a.kind === 'req')
      if (!req) { endText(); b.ph(s.slice(i, end), i, end); i = end; continue }
      const saved = b.kind
      if (name === 'footnote' || name === 'footnotetext' || name === 'thanks') {
        // the footnote's text is a unit of its own, rendered inside its paragraph's unit so the two ranges never overlap
        endText()
        const parent = b.cur, before = b.units.length
        // …and never the title, even inside it: \title{A\thanks{Supported by B}}
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
      // an abstract given as an argument (sn-jnl's \\abstract{…}) is the paper's abstract, as its environment is
      b.kind = CAPTIONS.has(name) ? 'caption' : name === 'abstract' ? 'abstract' : 'heading'; b.title = name === 'title'; b.depth = DEPTH[name]; walk(s, req.start + 1, req.end - 1, b, ctx); b.flush(); b.title = false; b.depth = undefined; b.kind = saved
      i = e; continue
    }
    // \multicolumn{n}{spec}{text}, \multirow[v]{n}{width}[shift]{text}, \makecell[pos]{text}: only the content is prose,
    // the arguments read as the role table gives them. Read as `up to one group more than it needs`, the group after a
    // \multicolumn{2}{c}{…} was taken for its content and the content itself never sent
    if ((name === 'multicolumn' || name === 'multirow' || name === 'makecell' || name === 'shortstack') && b.cellMode) {
      const read = commandArgs(s, end, name, to), last = read.known ? read.args.findLast(a => a.kind === 'req' && a.role === 'c') : null
      if (last && s[last.start] === '{' && last.end === read.end) { endText(); const id = b.open(s.slice(i, last.start + 1), i); walk(s, last.start + 1, last.end - 1, b, ctx); b.close(id, '}', read.end); i = read.end; continue }
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
      const { args, end: e } = frontArgs(s, end, name, ctx, to)
      endText(); b.flush()
      for (const a of args) { if (a.kind === 'req') frontBlock(s, a.start + 1, a.end - 1, b, ctx, roleOf(name)); else frontNotes(s, a.start + 1, a.end - 1, b, ctx) }
      i = e; continue
    }
    if ((FRONT_PROSE.has(name) || (FRONT_BOXES.has(name) && !ctx.boxesUnread)) && AUTHOR_KINDS.has(b.kind)) {
      const { args, end: e } = argsAfter(s, end, 1)
      if (args[0]?.kind === 'req') {
        endText()
        // (IEEEtran's block a unit of its own, of its kind: \\IEEEauthorblockN's names, \\IEEEauthorblockA's places)
        const lines = FRONT_LINES.get(name), saved = b.kind
        if (lines) { b.flush(); b.kind = lines }
        const id = b.open(s.slice(i, args[0].start + 1), i); walk(s, args[0].start + 1, args[0].end - 1, b, ctx); b.close(id, '}', e)
        if (lines) { b.flush(); b.kind = saved }
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
    // a macro of the paper's whose body ends a table's row, in a cell (\\newcommand{\\tightrow}{\\\\[-4pt]}: rowEndsOf): the row's end,
    // as `\\\\` is there, an empty group after it with it. Read as a placeholder, the next row's first cell ran on in the cell it
    // ends (2610.21924v1's 30 cells)
    if (b.cellMode && ctx.rowEnds?.has(name)) { endText(); b.flush(); const k = skipSpaces(s, end); i = s.startsWith('{}', k) && k + 2 <= to ? k + 2 : end; continue }
    // (an accent the paper defines anew as a macro of no argument stays the accent's placeholder with its letter, below)
    const macro = ctx.macros.get(name), own = macro && !(macro.params === 0 && ACCENTS.has(name))
    const call = own && macroArgs(s, end, macro, to)
    // (one whose body ends the row after its arguments, in a cell (rowEndsAfterOf): a row of its own, its text a cell inside
    // its argument's group, the row ended after the call. Read as a pair, its text ran on into the next row's first cell)
    // (not one that stores its text, which the paper sets elsewhere: a front unit with no mark, below)
    if (call && b.cellMode && ctx.rowEndsAfter?.has(name) && !macro.stores) {
      // (the pair's id spent as the call's pair spent it: the pairs after it keep theirs, and their units their hashes)
      endText(); b.flush(); b.pairId++
      const arg = macro.prose ? call.reqs[macro.prose - 1 - (macro.opt ? 1 : 0)] : null
      if (arg?.group) { walk(s, arg.start + 1, arg.end - 1, b, ctx); b.flush() }
      i = call.end; continue
    }
    // a front matter command the paper's own class defines, its text handed elsewhere too (icml2024.sty's \\icmltitle:
    // the running head and the PDF's title): a unit of what it is, with no mark, which would be set wherever the class
    // sets it (2608.07584 had no title). The text before it ends where the command begins (endText first): the
    // paragraph's unit must not run over the call, whose source no piece of it holds — written back, the call was gone
    // (the re-review's N1, \note{…} mid-paragraph)
    if (call && !macro.prose && FRONT_ROLES[name]?.[1]) { endText(); const e = frontCommand(s, end, name, to, b, ctx, { front: true }); if (e > 0) { i = e; continue } }
    if (call && macro.prose) {
      const arg = call.reqs[macro.prose - 1 - (macro.opt ? 1 : 0)]
      if (arg?.group && macro.stores) {
        endText(); b.flush()
        const before = b.units.length, saved = b.kind; b.kind = 'para'; walk(s, arg.start + 1, arg.end - 1, b, ctx); b.flush(); b.kind = saved
        // (`held`: its text is the macro's to use, as text or not: elsarticle's \\biboptions{semicolon} holds natbib's options)
        for (const u of b.units.slice(before)) { u.front = true; u.held = true }
        i = call.end; goOn(macro, call, i); continue
      }
      // a macro whose body sets words of its own around its argument (\\newcommand{\\nb}[1]{Notebook~#1}) is no wrapper: its
      // call is its expansion, text whose source is the call (expandedText), or where the body is more than text, the
      // call one placeholder. As a pair around its argument, the translator was sent "(4--6)" for "(Notebook 4--Notebook
      // 6)" (2610.21547's eleven units, S1 of 2026-10-24)
      if (arg && !macro.then && setsWords(macro)) {
        // (a macro inside its own expansion, or expansions nested past a few levels — a recursive call in a branch TeX never
        // takes, \\a calling \\b calling \\a —, and any failure of the expansion leave the call one placeholder)
        const expanding = ctx.expanding ?? new Set()
        let text = null
        if (!macro.opt && !expanding.has(name) && expanding.size < EXPANSION_DEPTH) {
          try { text = expandedText(macro, call.reqs.map(r => s.slice(r.group ? r.start + 1 : r.start, r.group ? r.end - 1 : r.end)), b.file, { ...ctx, expanding: new Set([...expanding, name]) }) } catch { text = null }
        }
        // (the pair's id spent as the pair's was: the pairs after it keep theirs, and their units their hashes)
        endText(); b.pairId++
        if (text) b.letter(text, s.slice(i, call.end), i, call.end)
        else b.ph(s.slice(i, call.end), i, call.end)
        i = call.end; continue
      }
      if (arg?.group) {
        // an argument that holds paragraphs, a figure or a proof (\\techreport{…}, \\revised{…} around whole passages)
        // is walked as an environment's body is; one within a paragraph is part of it, the call around it a pair
        if (holdsBlock(s.slice(arg.start + 1, arg.end - 1))) { endText(); b.flush(); walk(s, arg.start + 1, arg.end - 1, b, ctx); b.flush(); i = call.end; goOn(macro, call, i); continue }
        endText(); const id = b.open(s.slice(i, arg.start + 1), i); walk(s, arg.start + 1, arg.end - 1, b, ctx); b.close(id, s.slice(arg.end - 1, call.end), call.end); i = call.end; goOn(macro, call, i); continue
      }
    }
    if (call) {
      let e = call.end
      // a macro of no argument: an empty group after it ends its name, and goes with it (\\method{} is); each call the
      // walk meets is counted, its prose body walked where every call is one (storedBodies)
      if (!macro.params) { const k = skipSpaces(s, e); if (s.startsWith('{}', k)) e = k + 2; ctx.called?.(name, b.kind) }
      endText()
      // the call's source then goes with the command it ends in: in that command's placeholder, or before its own unit
      if (goOn(macro, call, i)) continue
      b.ph(s.slice(i, e), i, e); i = e; continue
    }
    if (name === 'verb') { const d = s[end]; const e = s.indexOf(d, end + 1); const stop = e < 0 ? end : e + 1; endText(); b.ph(s.slice(i, stop), i, stop); i = stop; continue }
    // listings' and minted's inline code, read as \verb is: its keys, minted's language, then a brace group or a
    // delimiter (\lstinline|x = y|, \lstinline{x = y}, \mintinline{py}|x|) — code, never the translator's
    if (name === 'lstinline' || name === 'mintinline') { const stop = inlineCodeEnd(s, end, name); if (stop > 0 && stop <= to) { endText(); b.ph(s.slice(i, stop), i, stop); i = stop; continue } }
    // an inline TikZ picture, read as TikZ reads it: \tikz[options]{…}, or \tikz[options] and one path to its `;` (tikzCallEnd):
    // one placeholder, the drawing's. Read as a command, \tikz\fill[natural] (0,0) circle (.5ex); was \tikz, \fill and the
    // path's own syntax sent as text, and the mark probe asked about \tikz alone, which opens a picture it never closes
    // (2010.11929v2's legend dots)
    if (name === 'tikz') { const stop = tikzCallEnd(s, end, to); if (stop > 0) { endText(); b.ph(s.slice(i, stop), i, stop); i = stop; continue } }
    if (name === 'par') { endText(); b.flush(); i = end; continue }
    // an accent and its letter: the letter itself in its word where it is one every strategy sets (accentLetter), else
    // one opaque piece, \'o, \'{o}, \"\i, \v c. Left as text, the letter would be translated away and the accent put on
    // whatever comes next — pdfTeX stops at a CJK character there
    const letter = ACCENTS.has(name) && accentLetter(s, i, end, name, to, ctx.ownAccents)
    if (letter) { endText(); b.letter(letter.letter, s.slice(i, letter.end), i, letter.end); i = letter.end; continue }
    // a letter command, \\L ukasz, \\L{}ukasz, Bj\\o rn: the letter in its word (letterCommand), TeX's skipped spaces with it
    const kernelLetter = ctx.letters !== false && letterCommand(s, i, end, name, to, ctx.ownLetters)
    if (kernelLetter) { endText(); b.pairId += pairsOf(s, i, kernelLetter.end, b, ctx); b.letter(kernelLetter.letter, s.slice(i, kernelLetter.end), i, kernelLetter.end); i = kernelLetter.end; continue }
    if (ACCENTS.has(name)) {
      let k = /^[A-Za-z]$/.test(name) ? skipSpaces(s, end) : end
      if (s[k] === '{') k = matchGroup(s, k)
      else if (s[k] === '\\') k = commandAt(s, k).end
      else k = k + 1
      if (k > 0 && k <= to) { endText(); if (!b.ph(s.slice(i, k), i, k)) startText(); i = k; continue }
    }
    if (name === '\\') { const { args, end: e } = argsAfter(s, end, 1); const stop = args[0]?.kind === 'opt' ? e : end; endText(); if (b.cellMode) { b.flush(); i = stop; continue } b.ph(s.slice(i, stop), i, stop); i = stop; continue }
    // the front matter's commands the role table knows by their hook (FRONT_ROLES: AAAI's \affiliations, amsart's
    // \dedicatory, a \date): their text a unit of what it is, the text before them ended first (above)
    if (FRONT_ROLES[name]?.[1]) { endText(); const e = frontCommand(s, end, name, to, b, ctx); if (e > 0) { i = e; continue } }
    // a running head, kept as it is with its arguments (2608.04322's \markboth{…}%\n{…}, whose second argument was walked
    // as text only while a comment kept it from the command)
    if (RUNNING_HEADS.has(name)) { const call = commandArgs(s, end, name, to); endText(); b.ph(s.slice(i, call.end), i, call.end); i = call.end; continue }
    // any other command: its arguments as the role table reads them (commandArgs) — its text and a box's content among
    // them walked (walkArgs), the rest kept with it —, or with every adjacent argument where the table does not know it
    // (some prose stays untranslated, nothing breaks). booktabs' \cmidrule(lr){2-5} and \cmidrule[w](lr){2-5}: a trim
    // argument in parentheses
    let from = end
    if (name === 'cmidrule') { const k0 = skipSpaces(s, argsAfter(s, end, 1).end); if (s[k0] === '(') { const c0 = s.indexOf(')', k0); if (c0 > 0 && c0 < to) from = c0 + 1 } }
    const args = !/^[A-Za-z@]+$/.test(name) || NO_ARGS.has(name) ? null : commandArgs(s, from, name, to)
    // (\\texorpdfstring's first argument whether or not the paper's packages tell the role table of it: a class may define it)
    const pdfString = PDF_STRING.has(name) && args?.args.length >= 2 && s[args.args[0].start] === '{' && s[args.args[1].start] === '{'
    const walked = pdfString ? args.args.slice(0, 1) : args?.known ? args.args.filter(a => (a.role === 't' || a.role === 'c') && (s[a.start] === '{' || a.shape === '[')) : []
    // (its call ends with its second argument: where the table does not know it, every adjacent group was read as one of its)
    const callEnd = pdfString ? args.args[1].end : args?.end
    if (walked.length) { endText(); walkArgs(s, i, callEnd, walked, b, ctx); i = callEnd; continue }
    let { end: e } = !/^[A-Za-z@]+$/.test(name) ? { end } : NO_ARGS.has(name) ? optsAfter(s, from, OPT_ONLY.has(name)) : args
    // an empty group after a command the table knows ends its name, and goes with it (\\LaTeX{} is), as before the table
    if (args?.known) { const k = skipSpaces(s, e); if (s.startsWith('{}', k) && k + 2 <= to) e = k + 2 }
    // TeX's own assignment and glue syntax belongs to the command: \looseness=-1, \parindent=0pt, \vskip 3pt plus 1fil,
    // \penalty-100 — to a register or a primitive that reads a value, never to a declaration that takes no argument
    // (NO_ARGS) or a command the table knows takes no parameter: `{\bfseries 100}`, `\noindent 38 papers` and `\noindent
    // = 40` set their digits, which a placeholder took out of the text (2610.19159's tables and lists), and `\S4 in` its
    // section number and the word after it, read as a length in inches (2608.15334; 2608.30730's `\textyen 45 in`)
    if (e === end && /^[A-Za-z@]+$/.test(name) && !NO_ARGS.has(name) && !(args?.known && paperParams(name, paper)?.length === 0)) { const m = s.slice(e, Math.min(to, e + 120)).match(name === 'hrule' || name === 'vrule' ? RULE_SPEC : ASSIGNMENT); if (m) e += m[0].length }
    endText(); b.ph(s.slice(i, e), i, e)
    // a command with a letter name eats the following spaces in TeX; keep them with it
    i = e
  }
  endText()
}

/** the paper's macros of no argument whose body ends a table's row (ROW_END), by name: a name every definition of which, in any of
 *  the package's files and in any form, takes no parameter and has such a body — `\\newcommand{\\x}{…}`, \\renewcommand,
 *  \\providecommand, \\DeclareRobustCommand (starred or not, no `[n]` after the name), `\\def\\x{…}`, \\gdef, \\edef, \\xdef (no
 *  parameter text). A name also defined otherwise — with parameters (`\\renewcommand{\\x}[1]{…}`, `\\def\\x#1{…}`), by \\let, by
 *  xparse's commands, or with another body — is none (the review of #501's fix round: a row end later redefined with an argument
 *  split its cell) */
/** a definition of a command in any form the walk reads: LaTeX's, TeX's, a \\let, a document command's (its name the first group set) */
const DEFINITION = /\\(?:(?:(?:re)?newcommand|providecommand|DeclareRobustCommand)\*?\s*(?:\{\s*\\([A-Za-z@]+)\s*\}|\\([A-Za-z@]+))|[egx]?def\s*\\([A-Za-z@]+)|let\s*\\([A-Za-z@]+)|(?:New|Renew|Provide|Declare)(?:Expandable)?DocumentCommand\s*(?:\{\s*\\([A-Za-z@]+)\s*\}|\\([A-Za-z@]+)))/g
function rowEndsOf(texts) {
  const out = new Set(), other = new Set()
  for (const t of texts.map(uncommented)) {
    for (const m of t.matchAll(DEFINITION)) {
      if (m.index > 0 && t[m.index - 1] === '\\') continue
      const [, nc, nb, nd, nl, nx, ny] = m, name = nc ?? nb ?? nd ?? nl ?? nx ?? ny, k = skipSpaces(t, m.index + m[0].length)
      // (a definition of no parameter: its body's group right after the name, white space between; any other form is none)
      const e = (nc ?? nb ?? nd) && t[k] === '{' ? matchGroup(t, k) : -1
      if (e > 0 && ROW_END.test(t.slice(k + 1, e - 1).trim())) out.add(name); else other.add(name)
    }
  }
  for (const n of other) out.delete(n)
  return out
}
/**
 * The paper's macros of parameters whose body ends a table's row after what it sets (2610.40576v1's
 * \\cseg[2]{\\specialrule{…}\\multicolumn{2}{…}{\\textcolor{#2}{\\bfseries #1}}\\\\[4pt]}): name → its arguments' count, \\newcommand's
 * and \\renewcommand's form with no optional one, whose body sets one cell (no `&`). Read in a table as a row of its own: its
 * text a cell, the row ended after its arguments (tableGrid, the walk). A name defined otherwise as well is none
 */
function rowEndsAfterOf(texts) {
  const out = new Map(), other = new Set()
  for (const t of texts.map(uncommented)) {
    // (every definition of a name, in any form (DEFINITION): one of LaTeX's with arguments and no optional one may be a row's
    // end; any other makes the name none, as a later \\def of it is TeX's)
    for (const d of t.matchAll(DEFINITION)) {
      if (d.index > 0 && t[d.index - 1] === '\\') continue
      const name = d[1] ?? d[2] ?? d[3] ?? d[4] ?? d[5] ?? d[6]
      const m = (d[1] ?? d[2]) ? /^\s*\[\s*(\d)\s*\]\s*(\[[^\]]*\])?\s*/.exec(t.slice(d.index + d[0].length)) : null
      if (!m) { other.add(name); continue }
      const n = Number(m[1]), k = d.index + d[0].length + m[0].length, e = t[k] === '{' ? matchGroup(t, k) : -1
      // (one whose body sets cells of its own, `&` between them, is read as the paper's macro is anywhere: its arguments' cells
      // are not known here)
      const body = e > 0 ? t.slice(k + 1, e - 1).trim() : ''
      if (n > 0 && !m[2] && e > 0 && ROW_END_TAIL.test(body) && !/(?:^|[^\\])&/.test(body)) out.set(name, n); else other.add(name)
    }
  }
  for (const n of other) out.delete(n)
  return out
}
/** a body's end that ends a table's row, as ROW_END reads a whole body: `\\\\` (starred, its space and option), \\tabularnewline
 *  or \\cr, the rules after it, not a `\\\\\\\\` that is a line end's own backslash */
const ROW_END_TAIL = /(?:^|[^\\])(?:\\\\\*?\s*(?:\[[^\]]*\])?|\\tabularnewline|\\cr)\s*(?:\\(?:hline|midrule|toprule|bottomrule|cline\s*\{[^}]*\}|cmidrule\s*(?:\([^)]*\))?\s*\{[^}]*\}|addlinespace(?:\s*\[[^\]]*\])?)\s*)*$/
/** a macro's body that ends a table's row and does nothing else but draw its rules: `\\\\` (starred, with its space), \\tabularnewline,
 *  \\cr, a rule of booktabs' or LaTeX's after it */
const ROW_END = /^(?:\\\\\*?\s*(?:\[[^\]]*\])?|\\tabularnewline|\\cr)\s*(?:\\(?:hline|midrule|toprule|bottomrule|cline\s*\{[^}]*\}|cmidrule\s*(?:\([^)]*\))?\s*\{[^}]*\}|addlinespace(?:\s*\[[^\]]*\])?)\s*)*$/
/** where an inline TikZ picture that starts at s[at], after \\tikz, ends, as TikZ reads it: past its options (`[…]`), its
 *  group where one follows, else past the first `;` outside every group (a node's text in braces may hold one), within the
 *  paragraph (no blank line) and `to`; -1 where it does not */
function tikzCallEnd(s, at, to) {
  let k = skipSpaces(s, at)
  if (s[k] === '[') { const e = matchGroup(s, k, '[', ']'); if (e < 0 || e > to) return -1; k = skipSpaces(s, e) }
  if (s[k] === '{') { const e = matchGroup(s, k); return e < 0 || e > to ? -1 : e }
  for (let j = k, depth = 0; j < to; j++) {
    const c = s[j]
    if (c === '\\') { j++; continue }
    if (c === '%') { j = skipComment(s, j); continue }
    if (c === '\n' && /^\n[ \t]*\n/.test(s.slice(j, j + 40))) return -1
    if (c === '{') depth++
    else if (c === '}') { if (--depth < 0) return -1 }
    else if (c === ';' && depth === 0) return j + 1
  }
  return -1
}
/** where an inline listing that starts at s[at], after its command's name, ends: past its optional keys, minted's
 *  language, and its code in a brace group or between two of a delimiter; -1 where it does not */
function inlineCodeEnd(s, at, name) {
  let k = at
  if (s[k] === '[') { const e = matchGroup(s, k, '[', ']'); if (e < 0) return -1; k = e }
  if (name === 'mintinline') { k = skipSpaces(s, k); if (s[k] !== '{') return -1; const e = matchGroup(s, k); if (e < 0) return -1; k = e }
  if (s[k] === '{') return matchGroup(s, k)
  if (!s[k] || /\s/.test(s[k])) return -1
  const e = s.indexOf(s[k], k + 1)
  return e < 0 || s.slice(k, e).includes('\n') ? -1 : e + 1
}

// ---------------------------------------------------------------- project
const listSources = fsys => fsys.list().filter(f => /\.(tex|sty)$/i.test(f))

/** TeX's macro definitions whose parameter text runs up to the body's brace: what stands in it is no command TeX runs */
const DEF_PRIMITIVES = new Set(['def', 'gdef', 'edef', 'xdef'])
/** LaTeX's definitions, whose body (their last argument, as the role table reads them) TeX runs only where the command
 *  or environment is used */
const DEFINERS = /^(?:(?:(?:re)?newcommand|providecommand)|DeclareRobustCommand|(?:re)?newenvironment|(?:New|Renew|Provide|Declare)Document(?:Command|Environment))$/
/**
 * The control words of s[from, to) that TeX acts on where they stand, in order, each { name, at, end, depth, env, inDef,
 * sure }: none in a comment, in a definition's parameter text (\\def\\x#1\\end{document}{…}), in a branch TeX skips
 * (\\iffalse … \\fi, \\iftrue's \\else, a \\newif's whose value it knows: `ifs` the paper's conditionals, `ifValues` the
 * values, newifValues), in an environment TeX reads by lines (LINE_ENVS, the paper's `lineEnvs`: a filecontents in the
 * preamble that writes a whole document out), in \\verb, or after the line of an \\endinput TeX acts on, where it stops
 * reading the file. `depth`, the brace groups open around it — a definition's body among them (\\def\\edo{…
 * \\end{document}}, 2608.23517's preamble) —; `inDef`, whether it stands in a definition's body, which TeX runs only
 * where the definition is used; `sure`, whether TeX surely acts on it: no conditional whose branch it cannot tell
 * (\\ifdefined, \\ifx, a \\newif set two ways) is open around it; `env`, an environment's name for \\begin and \\end
 */
function texCommands(s, { from = 0, to = s.length, lineEnvs = null, ifs = new Set(), ifValues = null } = {}) {
  const out = [], defs = [], conds = []
  let depth = 0
  for (let i = from; i < to; i++) {
    const c = s[i]
    if (c === '%') { i = skipComment(s, i); continue }
    if (c === '{') { depth++; continue }
    if (c === '}') { if (depth > 0) depth--; continue }
    if (c !== '\\') continue
    const { name, end } = commandAt(s, i)
    if (!/^[A-Za-z@]+$/.test(name)) { i = end - 1; continue }
    while (defs.length && defs.at(-1) <= i) defs.pop()
    const inDef = defs.length > 0, sure = conds.every(x => x.known)
    // conditionals where TeX reads them (one in a definition's body is that body's: \\def\\iffa{\\iffalse} skipped
    // 2608.23517's \\begin{document} to a \\fi): a branch TeX skips is passed over, \\iffalse's and a \\newif's set false,
    // or the \\else of \\iftrue and of one set true; any other one's branches are both read, neither surely
    if (!inDef && isConditional(name, ifs)) {
      const value = name === 'iftrue' ? true : name === 'iffalse' ? false : ifValues?.get(name)
      if (value === false) { const stop = branchEnd(s, end, to, ifs); if (stop > 0) { if (/\\else$/.test(s.slice(stop - 5, stop))) conds.push({ known: true }); i = stop - 1; continue } }
      conds.push({ known: value === true }); i = end - 1; continue
    }
    if (!inDef && (name === 'else' || name === 'or') && conds.length) {
      if (conds.at(-1).known) { const stop = branchEnd(s, end, to, ifs, { toFi: true }); if (stop > 0) { conds.pop(); i = stop - 1; continue } }
      i = end - 1; continue
    }
    if (!inDef && name === 'fi') { conds.pop(); i = end - 1; continue }
    // \\newif\\ifx and \\let\\ifx\\iftrue name a conditional, which TeX does not open there
    if (name === 'newif' || name === 'let') {
      let k = skipSpaces(s, end)
      if (s[k] === '\\') k = commandAt(s, k).end
      if (name === 'let') { k = skipSpaces(s, k); if (s[k] === '=') k = skipSpaces(s, k + 1); if (s[k] === '\\') k = commandAt(s, k).end }
      out.push({ name, at: i, end, depth, inDef, sure }); i = k - 1; continue
    }
    // \\endinput: TeX reads the rest of its line, then nothing more of the file
    if (name === 'endinput' && !inDef && sure) { const eol = s.indexOf('\n', end); to = Math.min(to, eol < 0 ? s.length : eol) }
    if (name === 'verb' || name === 'lstinline') { const d = s[end]; const e = d && !/[\s{[]/.test(d) ? s.indexOf(d, end + 1) : -1; if (e > 0) { i = e; continue } }
    if (DEF_PRIMITIVES.has(name)) {
      // \\def\\x<parameter text>{body}: the name and the parameter text, which ends at the body's brace
      let k = skipSpaces(s, end)
      k = s[k] === '\\' ? commandAt(s, k).end : k + 1
      while (k < to && s[k] !== '{' && s[k] !== '%') k++
      out.push({ name, at: i, end, depth, inDef, sure })
      const e = s[k] === '{' ? matchGroup(s, k) : -1
      if (e > 0) defs.push(e)
      i = k - 1; continue
    }
    if (DEFINERS.test(name)) { const params = commandParams(name), r = params && readArgs(s, end, params, to); if (r?.complete && r.end > end) defs.push(r.end) }
    const m = (name === 'begin' || name === 'end') && /^\s*\{([^{}]*)\}/.exec(s.slice(end, end + 200))
    if (m) {
      const env = m[1].trim(), after = end + m[0].length
      out.push({ name, at: i, end: after, depth, env, inDef, sure })
      // (one in a definition's body is read where the definition is used, not here: \\newcommand\\start{\\begin{fx}} in a
      // preamble read to the body's \\end{fx} past the real \\begin{document})
      if (name === 'begin' && !inDef && isLineEnv(env, lineEnvs)) { i = endOfEnv(s, after, env)[1] - 1; continue }
      i = after - 1; continue
    }
    out.push({ name, at: i, end, depth, inDef, sure })
    i = end - 1
  }
  return out
}
/**
 * The document's bounds in a main file as TeX finds them (texCommands): `begin` where its \\begin{document} stands and
 * `body` where the body starts after it, the first one outside every brace group; `end` where the first \\end{document}
 * after it stands, outside every group, or the text's end. -1 for `begin` and `body` where the file has none. Taken as
 * the first match of the raw text, a commented `%\\end{document}` ended ResNet's walk before its appendix C
 * (1512.03385), a comment's "until \\end{document}" ended 2608.11084's four lines into its body, and a \\def in the
 * preamble that holds one gave 2608.23517 no unit at all. A text whose groups never close at a \\begin{document} (a
 * brace TeX reads otherwise than the scanner) has the first one at any depth
 */
export function documentBounds(s, options = {}) {
  return boundsOf(texCommands(s, options), s)
}
/** documentBounds from a file's commands (texCommands), read once for all a file's readers */
function boundsOf(cmds, s) {
  const isDoc = (c, name) => c.name === name && c.env === 'document'
  // the first TeX surely acts on outside every group (none in a conditional it cannot tell: \\ifdefined\\x\\end{document}\\fi),
  // else the first outside every group, else the first
  const first = list => list.find(c => c.depth === 0 && c.sure) ?? list.find(c => c.depth === 0) ?? list[0]
  const begin = first(cmds.filter(c => isDoc(c, 'begin')))
  const end = first(cmds.filter(c => isDoc(c, 'end') && (!begin || c.at > begin.at)))
  return { begin: begin ? begin.at : -1, body: begin ? begin.end : -1, end: end ? end.at : endinputCut(cmds, s) }
}
/** where TeX stops reading a file: the end of the line of an \\endinput it surely acts on (its commands, texCommands),
 *  else its end */
function endinputCut(cmds, s) {
  const c = cmds.find(x => x.name === 'endinput' && x.sure && !x.inDef)
  if (!c) return s.length
  const eol = s.indexOf('\n', c.end)
  return eol < 0 ? s.length : eol
}
/** the \\end{document}s of a file TeX surely acts on where they stand (its commands, texCommands), by where each starts:
 *  the walk stops at one of them, and at no other (one TeX never reaches: after an \\endinput, in a \\newif's false
 *  branch, the review's I4) */
function documentEnds(cmds) {
  return new Set(cmds.filter(c => c.name === 'end' && c.env === 'document' && c.sure && !c.inDef).map(c => c.at))
}
/** the main file's \\usepackage[…]{inputenc} that TeX acts on, the first in its preamble (LaTeX loads a package once: a
 *  second with other options is an option clash, not a switch): { start, end, options } or null */
export function inputencOf(s, options = {}) {
  return inputencFrom(texCommands(s, options), s)
}
/** inputencOf from a file's commands (texCommands), read once for all a file's readers */
function inputencFrom(cmds, s) {
  const { begin } = boundsOf(cmds, s)
  for (const c of cmds) {
    if (begin >= 0 && c.at >= begin) break
    if (c.name !== 'usepackage') continue
    const m = /^\s*\[([^\]]*)\]\s*\{\s*inputenc\s*\}/.exec(s.slice(c.end, c.end + 400))
    if (m) return { start: c.at, end: c.end + m[0].length, options: m[1] }
  }
  return null
}

/** the package's tabularray tables (TBLR_ENVS and the names \\NewTblrEnviron gives), and whether \\SetTblrInner makes
 *  every table's cells math; comments taken out first */
const tblrOf = texts => {
  const text = texts.map(uncommented).join('\n')
  const named = [...text.matchAll(/\\NewTblrEnviron\s*\{\s*([^}\s]+)\s*\}/g)].map(m => m[1])
  const inner = [...text.matchAll(/\\SetTblrInner\s*(?:\[[^\]]*\])?\s*\{/g)].map(m => { const e = matchGroup(text, m.index + m[0].length - 1); return e > 0 ? text.slice(m.index, e) : '' })
  return { tblrEnvs: new Set([...TBLR_ENVS, ...named]), tblrMath: inner.some(t => TBLR_MATH.test(t)) }
}

// ---------------------------------------------------------------- the bibliography
/** an entry's unit's kind, one unit an entry (bibliography; PIPELINE 29's `refnames`, an entry's names cut apart, is made no
 *  more: PIPELINE 30) */
const BIB_KINDS = new Set(['reference'])
/**
 * The source's units with an author block's later units (frontBlock's `later`: the rows cut apart from what was one unit, its
 * names or its places), then a bibliography's entries, moved after every other, each in their order (in place): they are numbered
 * after the last of the rest, so that no other unit's number is what it was before they were units of their own (a translation
 * held by a unit's number, the gate pack's, is still that unit's: what was one unit of an author block keeps its number in the
 * first unit cut from it), and the units a host cuts before the job's .bbl is made keep their numbers when the entries come
 * after it (layout/paper.mjs madeBibliography). Nothing reads a place or an entry by its place among the units: their marks place
 * them on the page, a place is searched on arXiv's page as a float is (it is set where the class sets it: amsart's addresses at
 * the paper's end; make.mjs FLOATING), the ledger's zone reads the entries' marks. But for the anchoring, which reads the text's
 * order: a unit without marks is searched between its marked neighbours in the order TeX sets the text (anchors.mjs matchUnits),
 * so the order the walk met the units in is given beside them. Returns it, the units' new indices in that order (`texOrder`),
 * or null where nothing moved: 1810.04805v2's appendix comes after its bibliography, whose entries, numbered last, were the
 * appendix's last paragraphs' next neighbour, on page 10, and those of its page 16 the marks did not bound were found nowhere
 */
function entriesLast(units) {
  const later = units.filter(u => u.later && !BIB_KINDS.has(u.kind)), entries = units.filter(u => BIB_KINDS.has(u.kind))
  if (!later.length && !entries.length) return null
  const walked = units.slice()
  const rest = units.filter(u => !u.later && !BIB_KINDS.has(u.kind))
  units.length = 0
  units.push(...rest, ...later, ...entries)
  const index = new Map(units.map((u, i) => [u, i]))
  return walked.map(u => index.get(u))
}
/** the commands of a bibliography that set their last argument as text, by how many arguments come before it: REVTeX's and
 *  acmart's fields (\\bibinfo{title}{…}, \\bibfield{author}{…}), REVTeX's name fonts, a quoted or shown title, IEEEtran's
 *  language. Any other command of a .bbl is what the walk makes of it elsewhere: \\newblock a placeholder, \\url and \\href
 *  theirs, \\emph a pair */
const BIB_TEXT = new Map([['bibinfo', 1], ['bibfield', 1], ['bibnamefont', 0], ['bibfnamefont', 0], ['citenamefont', 0], ['enquote', 0], ['showarticletitle', 0], ['BIBforeignlanguage', 1]])
/** a \\bibinfo field that is no prose: kept as the paper has it, one placeholder */
const BIB_KEPT_FIELD = /^(?:doi|url|eprint|isbn|issn|archive|archiveprefix|primaryclass|eid|lccn|mrnumber|zbl)$/i
/**
 * A bibliography (thebibliography's body, `from` after its \\begin, `to` its \\end): each \\bibitem's entry, from its key's
 * group to the next \\bibitem or the end, is one unit of kind `reference` (the reader's "References"), whole: the names it
 * opens with are the entry's, never a unit of their own nor of the "names" toggle (the owner's ruling of 2026-10-28: the
 * references and the author block are each their own toggle's, decoupled — "names" is the author block under the title alone —,
 * and an entry is never set in two pieces styled apart). Its label (\\bibitem's optional argument, set in the list's label
 * box) and its key are no piece of it; what precedes the first \\bibitem (the style's \\providecommand's) is no unit, nor is
 * REVTeX's \\BibitemOpen and \\BibitemShut. In an entry its numbers stay the original's ink (keepNumbers), its web addresses
 * and formulas too, as everywhere. A bibliography a paper sets otherwise (biblatex's \\printbibliography, from biber's data)
 * has no \\bibitem here: its text is the ledger's `references`, between its name and the next unit. The entries' units are
 * numbered after every other unit of the source (entriesLast)
 */
function bibliography(s, from, to, b, ctx) {
  const { end: start } = argsOfForm(s, from, '{')
  const scan = c => texCommands(s, { from: c[0], to: c[1], lineEnvs: ctx.lineEnvs, ifs: ctx.ifs, ifValues: ctx.ifValues }).filter(x => x.depth === 0 && !x.inDef)
  const items = scan([start, to]).filter(c => c.name === 'bibitem')
  const saved = b.kind
  b.flush()
  items.forEach((c, n) => {
    let a = argsOfForm(s, c.end, '[{').end, z = n + 1 < items.length ? items[n + 1].at : to
    const cmds = scan([a, z])
    // (REVTeX's entry: its text between \\BibitemOpen and \\BibitemShut{…})
    const open = cmds.find(x => x.name === 'BibitemOpen'), shut = cmds.find(x => x.name === 'BibitemShut')
    if (open && !/\S/.test(s.slice(a, open.at).replace(/%.*$/gm, ''))) a = open.end
    if (shut && shut.at > a) z = shut.at
    const before = b.units.length
    b.kind = 'reference'; walk(s, a, z, b, ctx); b.flush()
    // (the list backref sets after the entry, the pages that cite it: a piece of the unit that ends the entry's first paragraph,
    // where backref's parscan reads the entry to (`#2\par`) and sets the list, after its numbers are kept, so that it is never
    // what a number stands beside; an entry's later paragraphs, a paper's own \bibitem in a macro (\mbibitem), are TeX's other
    // entries, whose lists are set after them, and their units hold no piece: their lists the page's as before)
    if (ctx.backref) {
      const made = b.units.slice(before).filter(u => u.kind === 'reference' && u.file === b.file).sort((x, y) => x.start - y.start)
      const ends = (u, next) => PARAGRAPH_END.test(uncommented(s.slice(u.end, next ? next.start : z)))
      const first = made.find((u, j) => ends(u, made[j + 1])) ?? made.at(-1)
      first?.pieces.push({ t: 'ph', src: BACKREF_LIST })
    }
  })
  b.kind = saved
}
/**
 * The placeholder of the list backref.sty sets at a bibliography entry's end (hyperref's `backref` and `pagebackref`): the pages
 * or sections that cite it, each a link back. With its default parscan, backref reads the whole entry as an argument (\bibitem
 * redefined, `\BR@@bibitem#1#2\par`), sets it, then the list (\BR@backref, through \backrefalt or \backref), so the list is
 * TeX's, after the entry's text and its end mark, in none of its pieces: left on the page where the entry is drawn translated
 * over it (2610.37668v1's "2, 25"). The unit that ends the entry's first paragraph ends in this piece: no byte of the source
 * (patch writes none), its marks set by LAYOUT_TEX's hook around the list itself (layout/marks.mjs layoutMarking: `\axtbrname`),
 * so that the list is its ink, which the layer draws after the entry's translation, its links with it; an entry TeX sets no list
 * for has none there (EMPTY: the maker)
 */
export const BACKREF_LIST = '\\axtbackref'
/** a paragraph's end in TeX's source: a blank line or \\par (the end of what backref's parscan reads of an entry) */
const PARAGRAPH_END = /\n[ \t]*\n|\\par(?![A-Za-z@])/
/** whether the package turns backref's lists on at a bibliography's entries: in one of its files (a class's too: myarxiv.cls,
 *  weco_paper.cls), a command that loads a package or sets its options (\\usepackage, \\RequirePackage, \\PassOptionsToPackage,
 *  \\documentclass, \\LoadClass, \\hypersetup) names backref or hyperref's option (`backref`, `pagebackref`: a word of its own, not
 *  `=false`) in its arguments, and none says \\backrefparscanfalse, under which the list is set where the entry's \\backrefprint
 *  stands, inside its text. A mention elsewhere (prose, a test such as \\@ifpackagewith) turns nothing on, and one that turns
 *  nothing on all the same gives each entry a piece TeX sets nothing for (EMPTY) */
function backrefOf(texts) {
  const t = texts.map(uncommented).join('\n')
  if (/\\backrefparscanfalse(?![A-Za-z@])/.test(t)) return false
  for (const m of t.matchAll(BACKREF_SETTERS)) {
    // (the command's arguments, optional and braced, as many as follow it: white space between)
    let k = m.index + m[0].length, args = ''
    for (;;) {
      k = skipSpaces(t, k)
      const close = t[k] === '[' ? ']' : t[k] === '{' ? '}' : null
      if (!close) break
      const e = matchGroup(t, k, t[k], close)
      if (e < 0) break
      args += ` ${t.slice(k + 1, e - 1)}`
      k = e
    }
    if (BACKREF_WORD.test(args)) return true
  }
  return false
}
/** the commands that load a package or set its options (backrefOf) */
const BACKREF_SETTERS = /\\(?:usepackage|RequirePackage|PassOptionsToPackage|documentclass|LoadClass|hypersetup)(?![A-Za-z@])/g
/** backref's name, or hyperref's option that loads it, as a word of an argument, not set false */
const BACKREF_WORD = /(?<![A-Za-z@\\])(?:page)?backref(?![A-Za-z@]|\s*=\s*false\b)/
/** a token of an entry's text that is a number and no word — a year, pages, a volume and its issue: "1994.", "157--166,",
 *  "5(2):157--166" — a digit in it, no letter, white space or a piece that sets none on either side; or a DOI written out,
 *  letters and all ("10.1007/s00125-020-05190-9."), whose left may be any character but a letter or a digit ("doi:10.…") */
const NUMBER_TOKEN = /[^\s\p{L}]*\d[^\s\p{L}]*/gu
const DOI_TOKEN = /10\.\d{4,9}\/\S+/gu
/** a text's tokens of either, in order: its DOIs, then its numbers outside them */
function numberTokens(s) {
  const dois = [...s.matchAll(DOI_TOKEN)].map(m => ({ index: m.index, text: m[0], doi: true }))
  const inDoi = (a, b) => dois.some(d => a < d.index + d.text.length && b > d.index)
  const numbers = [...s.matchAll(NUMBER_TOKEN)].filter(m => !inDoi(m.index, m.index + m[0].length)).map(m => ({ index: m.index, text: m[0], doi: false }))
  return [...dois, ...numbers].sort((a, b) => a.index - b.index)
}
/** a piece beside which a token stands apart: none (the unit's edge), a group's open or close, a tie, a space of TeX's or a
 *  penalty, a kern or glue of its own (natbib's `\\penalty0` between a volume, its issue and its pages) */
const APART = p => !p || p.t === 'open' || p.t === 'close' || (p.t === 'ph' && /^(?:~|\\[ ,;:!]|\\(?:newblock|quad|qquad|enspace|thinspace|space|penalty|allowbreak|nobreak|hskip|kern)(?![A-Za-z@]))/.test(p.src ?? ''))
/**
 * An entry's numbers, each a placeholder: what the original's ink keeps (the owner, 2026-10-25: labels, numbers, years, DOIs,
 * web addresses and formulas stay the original's ink), each token of a text piece that holds a digit and no letter, with white
 * space or a piece that sets no letter on either side (APART), so that no mark of its goes inside a word or between two glyphs
 * TeX kerns. A piece whose source is other bytes than its text (an accent's letter joined into its word, a file transcoded:
 * `src`) is cut only where the two are the same bytes, in their common head or their common tail, each part keeping its own
 * source where it differs from its text: `\\"{o}verview, 2020.`'s year is the year's own placeholder
 */
function keepNumbers(pieces) {
  return pieces.flatMap((p, k) => {
    if (p.t !== 'text' || !/\d/.test(p.s)) return [p]
    const src = p.src ?? p.s, n = p.s.length, d = src.length - n
    let head = 0
    while (head < n && head < src.length && p.s[head] === src[head]) head++
    let tail = 0
    while (tail < n - head && tail < src.length - head && p.s[n - 1 - tail] === src[src.length - 1 - tail]) tail++
    /** a cut of the text where the source is cut the same way, or -1 */
    const at = i => (i <= head ? i : i >= n - tail ? i + d : -1)
    const part = (x, y) => {
      const t = p.s.slice(x, y), from = src.slice(at(x), at(y)), { src: _, ...plain } = p
      return sliceSkips(p, from === t ? { ...plain, s: t } : { ...p, s: t, src: from }, at(x), at(y))
    }
    const out = []
    let last = 0
    for (const m of numberTokens(p.s)) {
      const end = m.index + m.text.length
      const left = m.index > 0 ? (m.doi ? /[^\p{L}\d]/u : /\s/).test(p.s[m.index - 1]) : APART(pieces[k - 1]), right = end < n ? /\s/.test(p.s[end]) : APART(pieces[k + 1])
      if (!left || !right || at(m.index) < 0 || at(end) < 0 || src.slice(at(m.index), at(end)) !== m.text) continue
      if (m.index > last) out.push(part(last, m.index))
      out.push({ t: 'ph', src: m.text })
      last = end
    }
    if (!out.length) return [p]
    if (last < n) out.push(part(last, n))
    return out
  })
}
/**
 * The preamble's prose, in the order it is written. TeX sets nothing there, but a class keeps the front matter's text
 * for \\maketitle, and each is a unit as the body would make it: the title TeX keeps (the last \\title it acts on — a
 * commented one never: 2608.23818's old title was translated, its real one stayed English), the author blocks and their
 * notes (FRONT_MATTER), every front matter command the role table knows (FRONT_ROLES: AAAI's \\affiliations, \\keywords,
 * a \\thanks, a \\date; frontCommand), an abstract or keywords written as an environment or as \\abstract{…}
 * (2608.08903, 2608.01482), and the same in a file the preamble \\inputs (2608.13505's abstract, 2608.03994's title and
 * affiliation). Nothing in a comment, a skipped conditional or a definition's body, which TeX runs only where it is used
 */
function frontMatter(s, from, to, b, ctx) {
  const cmds = texCommands(s, { from, to, lineEnvs: ctx.lineEnvs, ifs: ctx.ifs, ifValues: ctx.ifValues }).filter(c => !c.inDef)
  const titles = cmds.filter(c => c.name === 'title'), title = titles.filter(c => c.depth === 0).at(-1) ?? titles.at(-1)
  let past = from
  for (const c of cmds) {
    if (c.at < past) continue
    if (c.name === 'title') {
      if (c !== title) continue
      const { args, end } = argsOfForm(s, c.end, unitForm('title', ctx)), req = args.find(a => a.kind === 'req')
      if (req) { b.kind = 'heading'; b.title = true; walk(s, req.start + 1, req.end - 1, b, ctx); b.flush(); b.title = false; b.kind = undefined; past = end }
      continue
    }
    if (FRONT_MATTER.has(c.name)) { const { args, end } = frontArgs(s, c.end, c.name, ctx, to); for (const a of args) { if (a.kind === 'req') frontBlock(s, a.start + 1, a.end - 1, b, ctx, roleOf(c.name)); else frontNotes(s, a.start + 1, a.end - 1, b, ctx) } past = end; continue }
    // a \thanks of its own (revtex's, after \author{…}): a front note, as in the body
    if (c.name === 'thanks') { const { args, end } = argsOfForm(s, c.end, unitForm('thanks', ctx)); if (args.some(a => a.kind === 'req')) { b.flush(); frontNote(s, c.at, end, b, ctx); past = end } continue }
    if (c.name === 'begin' && FRONT_ROLES[`env:${c.env}`]) {
      const [bodyEnd, afterEnd] = endOfEnv(s, c.end, c.env), { end: argsEnd } = envArgs(s, c.end, bodyEnd, c.env, ctx), saved = b.kind
      b.flush(); b.kind = FRONT_ROLES[`env:${c.env}`][0] === 'abstract' ? 'abstract' : 'heading'; walk(s, argsEnd, bodyEnd, b, ctx); b.flush(); b.kind = saved
      past = afterEnd; continue
    }
    // \abstract{…}, where a class takes the abstract as an argument (sn-jnl, MELBA)
    if (c.name === 'abstract' && s[skipSpaces(s, c.end)] === '{') {
      const k = skipSpaces(s, c.end), e = matchGroup(s, k)
      if (e > 0) { const saved = b.kind; b.flush(); b.kind = 'abstract'; walk(s, k + 1, e - 1, b, ctx); b.flush(); b.kind = saved; past = e }
      continue
    }
    if (c.name === 'input' || c.name === 'include') {
      const m = /^\s*(?:\{([^{}]+)\}|([^\s{}%\\]+))/.exec(s.slice(c.end, c.end + 300))
      if (m) { ctx.visitFront?.((m[1] ?? m[2]).trim(), ctx.dirs); past = c.end + m[0].length }
      continue
    }
    if (FRONT_ROLES[c.name]?.[1]) { const e = frontCommand(s, c.end, c.name, to, b, ctx); if (e > 0) past = e }
  }
  b.flush()
}
/** LaTeX's and its packages' ways of defining a theorem-like environment, the name it defines in group 1 */
const THEOREM_DEFINERS = /\\(?:newtheorem\*?|spnewtheorem\*?|newmdtheoremenv|newproof|newdefinition|newexample|newremark)\s*(?:\[[^\]]*\]\s*)?\{([^}]+)\}|\\declaretheorem\s*(?:\[[^\]]*\]\s*)?\{([^}]+)\}/g
/** the theorem-like environments of a paper, as its files define them (\\newtheorem, thmtools' \\declaretheorem, llncs'
 *  \\spnewtheorem, elsarticle's \\newproof, mdframed's), and those the common classes define themselves */
const theoremsOf = texts => {
  const names = new Set(['proof', 'theorem', 'lemma', 'corollary', 'proposition', 'definition', 'remark', 'example'])
  for (const m of texts.map(uncommented).join('\n').matchAll(THEOREM_DEFINERS)) for (const n of (m[1] ?? m[2]).split(',')) if (n.trim()) names.add(n.trim())
  return names
}
/** every environment a paper's files define, by whatever package: none of them is the role table's environment of the
 *  same name */
const OWN_ENVS = /\\(?:(?:re)?newenvironment|provideenvironment|(?:New|Renew|Provide|Declare)DocumentEnvironment|(?:re)?newtcolorbox|(?:New|Renew|Declare|Provide)TColorBox|newtcbtheorem|newmdenv|newlist|DeclareFloatingEnvironment|newfloat|lstnewenvironment|(?:exclude|include|special|general|process)comment|newtheorem|declaretheorem|spnewtheorem|newmdtheoremenv|DefineVerbatimEnvironment|newminted|NewTblrEnviron)\s*\*?\s*(?:\[[^\]]*\]\s*)?\{([^}]+)\}/g
const ownEnvsOf = texts => new Set([...texts.map(uncommented).join('\n').matchAll(OWN_ENVS)].flatMap(m => m[1].split(',').map(x => x.trim())))
/** the paper's own environments' parameters, as its files define them: \\newenvironment{name}[n][default] takes n
 *  arguments, the first optional where it has a default; one defined twice, the last (a \\provideenvironment only where it
 *  is not defined yet) */
const envDefs = texts => {
  const out = new Map(), begins = new Map()
  for (const t of texts) for (const m of t.matchAll(/\\(?:(?:re)?newenvironment|provideenvironment)\s*\*?\s*\{([^}]+)\}\s*(?:\[\s*(\d)\s*\])?\s*(\[)?/g)) {
    if (inComment(t, m.index)) continue
    const n = Number(m[2] ?? 0), opt = !!m[3] && n > 0, name = m[1].trim()
    // (a \\provideenvironment of one defined already, by the paper's files or a package the role table knows, is one TeX does
    // not act on)
    if (m[0].startsWith('\\provide') && (out.has(name) || environmentParams(name, paper?.bindings ?? null))) continue
    out.set(name, paramsOf((opt ? '[a' : '') + '{a'.repeat(n - (opt ? 1 : 0))))
    begins.delete(name)
    // (one of no parameter whose begin code ends by beginning another environment: that one reads its arguments from what
    // follows \\begin{name}, so they are this one's — ieeecolor's \\newenvironment{IEEEbiography}{\\begin{biography}}{…}, whose
    // biography takes [photo]{name}: 2610.30034v1's names were read as the body's text, and the line probe written before
    // each was the argument the class set as the name)
    if (n) continue
    const k = skipSpaces(t, m.index + m[0].length - (m[3] ? 1 : 0)), e = t[k] === '{' ? matchGroup(t, k) : -1
    const inner = e > 0 ? /\\begin\s*\{([^{}]+)\}$/.exec(uncommented(t.slice(k + 1, e - 1)).trim()) : null
    if (inner) begins.set(name, inner[1].trim())
  }
  // (the begun environment's parameters as the walk reads it: the paper's own definition, else the role table's; a chain of
  // such environments followed to its end, a cycle to none)
  const paramsAt = (name, seen = new Set()) => {
    if (!begins.has(name)) return out.get(name) ?? environmentParams(name, paper?.bindings ?? null)
    if (seen.has(name)) return null
    seen.add(name)
    return paramsAt(begins.get(name), seen)
  }
  for (const name of begins.keys()) { const p = paramsAt(name); if (p?.length) out.set(name, p) }
  return out
}

/** a table environment begun or ended in TeX's two spellings: \begin{tabularx} and \tabularx, \end{tabularx} and \endtabularx */
const TABLE_BEGIN = /\\begin\s*\{\s*((?:tabular|tabularx|longtable|tabu|tabulary|supertabular|xtabular)\*?)\s*\}|\\(tabular|tabularx|longtable|tabu|tabulary|supertabular|xtabular)(?![A-Za-z@*])/g
const TABLE_END = /\\end\s*\{\s*((?:tabular|tabularx|longtable|tabu|tabulary|supertabular|xtabular)\*?)\s*\}|\\end(tabular|tabularx|longtable|tabu|tabulary|supertabular|xtabular)(?![A-Za-z@*])/g
/**
 * The paper's own environments whose begin code begins a table it does not end, and whose end code ends it (the table's
 * family, TABLE_ENVS, in either spelling: \\begin{tabularx}{…}{…} or \\tabularx{…}{…}): their body is that table's rows,
 * read as a table's are. 2610.40576v1's casetable begins a tabularx and its header row; read as a container, its body was one
 * paragraph across its rows, our marks between a row's end and the next row's \\specialrule ("Misplaced \\noalign" eighteen
 * times). By name, from \\newenvironment's and \\renewenvironment's two groups; the last definition of a name counts
 */
const tableWrapsOf = texts => {
  const out = new Set(), count = (code, re) => [...code.matchAll(re)].length
  for (const t of texts) for (const m of t.matchAll(/\\(?:re)?newenvironment\s*\*?\s*\{([^}]+)\}\s*(?:\[\s*\d\s*\])?\s*(?:\[[^\]]*\])?\s*(?=\{)/g)) {
    if (inComment(t, m.index)) continue
    const name = m[1].trim(), k = m.index + m[0].length, e = matchGroup(t, k), k2 = e > 0 ? skipSpaces(t, e) : -1, e2 = t[k2] === '{' ? matchGroup(t, k2) : -1
    out.delete(name)
    if (e2 < 0) continue
    const begin = uncommented(t.slice(k + 1, e - 1)), end = uncommented(t.slice(k2 + 1, e2 - 1))
    const open = count(begin, TABLE_BEGIN) - count(begin, TABLE_END)
    if (open > 0 && count(end, TABLE_END) - count(end, TABLE_BEGIN) >= open) out.add(name)
  }
  return out
}

/**
 * The prose a paper keeps in a macro of no argument, set wherever it is called (2608.04322's case-study table, each cell
 * a \\newcommand of paragraphs; 2608.16190's \\def\\cpanauthor{…} in its \\author{…}): its body walked where it is
 * defined, its units `stored` — set where it is called, perhaps more than once, so with no mark —, of the kind of the
 * place it is called from (an author block's names and places, a cell, a paragraph). Only a body that holds prose (four
 * words or more; names and places in an author block whatever their count: one short name, \\newcommand\\model{Transformer},
 * read alone is no sentence a translator can tell the sense of), and only where every use of the macro in the package's
 * files is a call the walk met in running text (`calls`): one inside a \\label, a file name or a comparison stays as it is.
 * Never a package's or a class's own definition (a .sty or a .cls file's: jcappub's \\maketitle and \\@fpheader, whose
 * bodies are its own code, set where the class sets them: 2609.20976v1's "! ! ! ! Abstract. ! ! Keywords:", read as prose
 * and translated for nothing), whose text is the class's to set and no unit's.
 * An author block's unit of a macro called once (`once`: 2609.20976v1's \\affiliation[a]{\\CU}, \\CU a \\newcommand of the
 * affiliation's text) is set once, where TeX expands that call, with the call's own surroundings: marked where it is defined
 * (frontMarks), it is the unit TeX sets, its marks once on the page, as the same text written in the block is
 */
function storedBodies(calls, { ctx, files, units, own }) {
  ctx.ended = false
  let all = null
  for (const [name, call] of calls) {
    const macro = ctx.macros.get(name)
    if (!macro?.body || call.kinds.size !== 1) continue
    const { file, start, end } = macro.body, kind = [...call.kinds][0]
    if (/\.(?:sty|cls)$/i.test(file)) continue
    all ??= own.map(x => uncommented(x.text)).join('\n')
    const named = new RegExp(String.raw`\\${name}(?![A-Za-z@])`, 'g'), defined = new RegExp(String.raw`\\(?:(?:(?:re)?newcommand|providecommand)\*?\s*\{?\s*|DeclareRobustCommand\*?\s*\{?\s*|[gex]?def\s*|let\s*)\\${name}(?![A-Za-z@])`, 'g')
    if ((all.match(named)?.length ?? 0) - (all.match(defined)?.length ?? 0) !== call.n) continue
    const text = files.get(file) ?? own.find(x => x.file === file)?.text
    if (text === undefined || units.some(u => u.file === file && u.start < end && u.end > start)) continue
    const had = files.has(file), before = units.length, b = new Builder(file, units, text, ctx.bodies, ctx.floats)
    if (AUTHOR_KINDS.has(kind)) frontBlock(text, start, end, b, ctx, kind === 'author' ? 'names' : 'places')
    else { b.kind = kind; walk(text, start, end, b, ctx); b.flush() }
    // the words its units hold, as they would be sent: fewer than four, and it is no prose (\contentsname's
    // "Contents", set in a heading)
    const words = units.slice(before).flatMap(u => u.pieces.filter(p => p.t === 'text').map(p => p.s)).join(' ').match(/\p{L}{2,}/gu)?.length ?? 0
    if (!AUTHOR_KINDS.has(kind) && words < 4) { units.length = before; continue }
    for (const u of units.slice(before)) { u.stored = true; if (call.n === 1 && AUTHOR_KINDS.has(u.kind)) u.once = true }
    if (units.length > before && !had) files.set(file, text)
  }
}

/** `fsys`: a file system (inMemory, or node-files.mjs folder under Node) */
export function loadProject(fsys, main, { tables = false } = {}) {
  // each file's text read once: the package's TeX (.tex, .sty, .cls) is read by several of the passes below
  const texts = new Map(), sourceText = f => texts.get(f) ?? texts.set(f, texText(fsys.read(f))).get(f)
  const own = fsys.list().filter(f => /\.(tex|sty|cls)$/i.test(f)).map(f => ({ file: f, text: sourceText(f) }))
  const outer = paper, outerDecoders = decoders
  paper = paperOf(own.map(x => x.text))
  // (the job's .bbl, which \\bibliography reads, decoded as the package's own TeX is: BibTeX writes it in the .bib's bytes, the
  // encoding the paper declares; it is read as none of the package's own files otherwise)
  const mainRel = [normalizePath(main), normalizePath(`${main}.tex`)].find(f => fsys.read(f)), bbl = mainRel ? normalizePath(`${jobName(mainRel)}.bbl`) : null
  decoders = decodersOf(bbl && fsys.read(bbl) ? [...own, { file: bbl, text: sourceText(bbl) }] : own, sourceText, main)
  try { return readProject(fsys, main, tables, sourceText, own) } finally { paper = outer; decoders = outerDecoders }
}
/** each of the package's files that is not UTF-8, by its normalized name, with its decoding (INPUT_ENCODINGS): the one the
 *  main file declares, else latin1 */
function decodersOf(own, sourceText, main) {
  const out = new Map(), bad = own.filter(x => !isUtf8Text(x.text))
  if (!bad.length) return out
  const mainText = own.find(x => x.file === normalizePath(main) || x.file === normalizePath(`${main}.tex`))?.text ?? ''
  const declared = inputencOf(mainText)?.options.split(',').map(x => x.trim()).find(x => x in INPUT_ENCODINGS)
  for (const x of bad) out.set(x.file, INPUT_ENCODINGS[declared ?? 'latin1'])
  return out
}
/**
 * The package's TeX files (.tex, .sty, .cls, in the file system's order), each as its characters: a UTF-8 file decoded as
 * UTF-8, one that is not by the encoding the main file declares, else latin1 (decodersOf, as the units' text is): what a
 * name the paper defines reads as (source/paper-names.mjs)
 */
export function texFilesOf(fsys, main) {
  const own = fsys.list().filter(f => /\.(tex|sty|cls)$/i.test(f)).map(f => ({ file: f, text: texText(fsys.read(f)) }))
  const dec = decodersOf(own, null, main)
  return own.map(x => { const d = dec.get(x.file); return d ? d(x.text) : UTF8_LAX.decode(latin1Bytes(x.text)) })
}
function readProject(fsys, main, tables, sourceText, own) {
  const ownTexts = own.map(x => x.text)
  // a file as TeX finds it — in the directories import.sty puts on its path (`dirs`, the last imported first), then from
  // the package's root, where TeX runs — and by the name the package holds it under, whatever spelling named it
  // (\input{./sections/a.tex}): the units' file and the translation's key, which must replace that file rather than
  // sit beside it — under ./sections/a.tex the compile set the English over every unit of 2608.08350 past its abstract
  const read = (rel, dirs = []) => { for (const dir of [...dirs, '']) for (const cand of [rel, `${rel}.tex`]) { const key = normalizePath(`${dir}/${cand}`), bytes = fsys.read(key); if (bytes) return { rel: key, text: texText(bytes) } } return null }
  const units = [], files = new Map(), seen = new Set()
  const mainFile = read(main)
  if (!mainFile) throw new Error(`main file ${main} not found`)
  const all = mainFile.text
  const skipped = {}
  // \newcommand{\be}{\begin{equation}}, \def\ee{\end{equation}} and the like, in any .tex or .sty of the package
  const envMacros = new Map()
  const sources = listSources(fsys)
  for (const f of sources) {
    const t = sourceText(f)
    for (const m of t.matchAll(/\\(?:(?:(?:re)?newcommand|providecommand)\*?\s*\{?\\([A-Za-z@]+)\}?|def\\([A-Za-z@]+))\s*\{\s*\\(begin|end)\s*\{([^}]+)\}\s*\}/g)) envMacros.set(m[1] ?? m[2], { side: m[3], env: m[4].trim() })
  }
  // the paper's macros twice over, each for its own reader: `macros`, how a call takes its arguments and which it sets
  // as prose (paperMacros, the walker's); `bodies`, what each expands to (macroBodies, a display's letters)
  // the environments of the paper's own that are code (codeEnvsOf), kept as they are
  const definitions = envDefinitionsOf(ownTexts), codeEnvs = codeEnvsOf(definitions), skipEnvs = codeEnvs.code
  // the environments of the paper's own that TeX reads by lines (LINE_ENVS), in a class it ships too, and the code
  // environments that open one
  const lineEnvs = new Set([...lineEnvsOf(ownTexts), ...codeEnvs.lines])
  // the theorem-like environments, as any of the package's files defines them (theoremsOf), and the paper's own
  // environments' arguments (envDefs)
  const theorems = theoremsOf(ownTexts)
  // the paper's \\newif conditionals, and those whose value TeX reads the same everywhere (newifValues)
  const ifs = new Set([...sources.map(sourceText).join('\n').matchAll(/\\newif\s*\\(if[A-Za-z@]+)/g)].map(m => m[1]))
  const ifValues = newifValues(sources.map(sourceText), ifs)
  // (the job's .bbl, where the package holds it and it is BibTeX's, a thebibliography: what \\bibliography reads. Not biber's,
  // which is biblatex's data — \\entry, \\field — and no text, which \\bibliography, biblatex's alias of \\addbibresource, never reads)
  const bblName = `${jobName(mainFile.rel)}.bbl`, bblBytes = fsys.read(bblName)
  const bbl = bblBytes && /\\begin\s*\{thebibliography\}/.test(texText(bblBytes)) ? bblName : null
  const ctx = { rowEnds: rowEndsOf(sources.map(sourceText)), rowEndsAfter: rowEndsAfterOf(sources.map(sourceText)), bbl, tables, theorems, envs: envDefs(ownTexts), tableWraps: tableWrapsOf(ownTexts), activeSpaces: activeSpacesIn([...sources.map(sourceText), ...ownTexts]), ownEnvs: ownEnvsOf(ownTexts), displayEnvs: displayEnvsOf(definitions), fits: [], lineEnvs, ownAccents: ownAccents(ownTexts), ownLetters: ownLetters(ownTexts), macros: paperMacros(own), envMacros, ifs, ifValues, ends: new Map(), skipEnvs, skipped, visit: (rel, dirs, inFloat) => visit(rel, dirs, inFloat), dirs: [], bodies: macroBodies(sources.map(sourceText)), floats: new Set(), bibliography: [], backref: backrefOf(ownTexts), ...tblrOf(sources.map(sourceText)) }
  const scan = { lineEnvs, ifs, ifValues }
  let mainCmds = null
  /** `dirs`: the directories import.sty puts on the path an \input in the file is looked for on, the last imported first;
   *  `inFloat`: whether the file is read inside a float (the walk's builder there) */
  function visit(rel, dirs = [], inFloat = false) {
    const f = read(rel, dirs); if (!f || seen.has(f.rel)) return
    seen.add(f.rel); files.set(f.rel, f.text)
    // (the file as the walk reads it: a .bbl entry's web address's `%` a character, as TeX reads it, urlPercents; the file's own
    // text is what patch writes around the units)
    const text = urlPercents(f.text, f.rel)
    const b = new Builder(f.rel, units, text, ctx.bodies, ctx.floats), outer = ctx.dirs
    if (inFloat) b.inFloat = true
    ctx.dirs = dirs
    // the file as TeX reads it: up to the line of an \endinput it acts on; its \end{document}s, where the walk stops,
    // those it surely reaches (documentEnds)
    const cmds = texCommands(text, scan)
    if (f.rel === mainFile.rel) mainCmds = cmds
    let from = 0, to = endinputCut(cmds, text)
    ctx.ends.set(f.rel, documentEnds(cmds))
    if (f.rel === mainFile.rel) {
      // the document as TeX finds it (documentBounds): its preamble's front matter (frontMatter), then its body up to
      // the \end{document} TeX acts on, where the walk stops too
      const bounds = boundsOf(cmds, text)
      if (bounds.begin >= 0) { frontMatter(text, 0, bounds.begin, b, ctx); from = bounds.body }
      to = Math.min(to, bounds.end)
    }
    walk(text, from, to, b, ctx); b.flush()
    ctx.dirs = outer
  }
  /** a file the preamble \inputs, read as the preamble is (frontMatter): its front matter's units, the file among the
   *  project's only where it has any */
  function visitFront(rel, dirs = []) {
    const f = read(rel, dirs); if (!f || seen.has(f.rel)) return
    seen.add(f.rel)
    const text = urlPercents(f.text, f.rel), before = units.length, b = new Builder(f.rel, units, text, ctx.bodies, ctx.floats)
    frontMatter(text, 0, text.length, b, ctx); b.flush()
    if (units.length > before) files.set(f.rel, f.text)
  }
  ctx.visitFront = visitFront
  const calls = new Map()
  ctx.called = (name, kind) => { const c = calls.get(name) ?? calls.set(name, { n: 0, kinds: new Set() }).get(name); c.n++; c.kinds.add(kind ?? 'para') }
  visit(mainFile.rel)
  storedBodies(calls, { ctx, files, units, own })
  restorePercents(units)
  const texOrder = entriesLast(units)
  // a source declared in a Latin-1 family encoding: its bytes read as latin1 are already the right characters
  const enc = inputencFrom(mainCmds ?? texCommands(all, scan), all)?.options.split(',').map(x => x.trim()).find(x => /^(latin1|latin9|ansinew|cp1252|cp1250|latin2|applemac|decmulti)$/.test(x))
  const isUtf8 = t => { try { new TextDecoder('utf-8', { fatal: true }).decode(latin1Bytes(t)); return true } catch { return false } }
  const transcode = enc ? new Set([...files].filter(([, t]) => !isUtf8(t)).map(([f]) => f)) : new Set()
  // the units written inside a float, by their index in `units`, rising: a number survives a copy of the units, a clone and JSON
  const inFloat = units.flatMap((u, i) => (ctx.floats.has(u) ? [i] : []))
  // (the paper's macros that read nothing past their arguments: the layout marking's, layout/marks.mjs layoutMarking `complete`)
  // (the bibliographies \\bibliography reads, by the names it gives, where the walk met it: what BibTeX writes the job's .bbl of)
  return { main: mainFile.rel, files, units, inFloat, texOrder, skipped, fits: ctx.fits, lineEnvs, inputenc: enc ?? null, transcode, complete: completeMacros(own), bibliography: ctx.bibliography }
}

/** whether bytes of TeX hold a ] outside every group and not escaped: one that would close an optional argument */
function closesBracket(bytes) {
  let depth = 0
  for (let k = 0; k < bytes.length; k++) {
    const c = bytes[k]
    if (c === 0x5c) k++
    else if (c === 0x7b) depth++
    else if (c === 0x7d) depth--
    else if (c === 0x5d && depth <= 0) return true
  }
  return false
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
 * four papers of four document classes (parked/lab/spikes/lang-ratio.mjs, 2026-09-22; each language's quartiles lie within 10 %
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
 *  between the word and its comma, and a lost kern there respaces the whole line.
 *  `asSource`, a Set of units: each written as the paper's own bytes, its range as the file holds it (a top-level unit's
 *  range copied as the text around it is, a nested one's piece as its source between the outer unit's text), with no
 *  mark and no span: the layout guard's unit left unmarked (layout/guard.mjs), whose pieces or marks would not be the
 *  paper (2610.21377's pgffor loop header written back with its body's brace doubled). Empty or absent: as before */
export function patch(project, translated /* Map unit -> pieces */, { guardControlWords = true, mark, spans = null, asSource = null, pastBegin = false } = {}) {
  const out = new Map()
  const sourced = asSource?.size ? asSource : null
  // `inner`, where asked for: each unit nested in this one, at any depth, its range in the bytes this gives and the
  // length of what closes it after it (its piece's `post`)
  const render = (u, inner = null) => {
    const srcEnc = project.transcode?.has(u.file) ? 'utf8' : 'latin1'
    // a source's text as the source writes it: a letter an accent made (Builder.letter) is the accent again
    // (backref's list, BACKREF_LIST, is no byte of the source: written as nothing; the marked original's copy holds its marks instead)
    // (and a piece that begins a line after a comment's line end without the indent TeX skips there: SKIPPED)
    // (a piece the indents leave empty writes nothing and is no piece: the control word before it meets the text after it.
    // `bared`, the piece an indent stood before where it stands now: the control word guard below reads it)
    const pieces = []
    let bare = false
    for (const p of (translated.get(u) ?? u.pieces).filter(x => !(x.t === 'ph' && x.src === BACKREF_LIST))) {
      const q = p.t === 'text' && !p.tr && p.src !== undefined ? { ...p, s: p.src } : p, r = p.t === 'text' && !p.tr ? SKIPPED.get(p) : null
      if (!r) { pieces.push(bare ? { ...q, bared: true } : q); bare = false; continue }
      let t = q.s
      // (an indent right after a control word in the piece, before a letter, becomes one space, which TeX skips there: the
      // name ends where the source ended it)
      for (const [o, n] of [...r].sort((x, y) => y[0] - x[0])) t = t.slice(0, o) + (/\\[A-Za-z@]+$/.test(t.slice(0, o)) && /^[A-Za-z@\u0080-\uffff]/.test(t.slice(o + n)) ? ' ' : '') + t.slice(o + n)
      if (!t) { bare = true; continue }
      pieces.push({ ...q, s: t, ...(bare || r.some(([o]) => o === 0) ? { bared: true } : {}) })
      bare = false
    }
    const m = mark?.(u)
    // before the first word, inside any font command's group (nothing precedes it there to kern with); before an
    // inline formula or citation that comes first; before the macro when the word is glued to one (\\name's: between
    // the two the mark would cost the kern, and a macro that looks ahead, as \\xspace does, would see the mark). Any
    // other command at the head of the paragraph is passed over — \\noindent, \\vspace, a run-in heading macro — since
    // \\leavevmode ahead of it would start the paragraph early and indent or move it. A text piece is cut after its
    // leading space, which is ASCII, so the cut never falls inside a UTF-8 sequence of source text read as latin1. A group that
    // closes before the first word holding the unit's first letter as a command alone (LETTER_GROUP: `{\\L}ukasz Kaiser`, a row
    // of 1706.03762v7's \\author, which had no start mark): the mark goes before the group, so that the letter is the unit's own
    // ink. Any other group before the first word is as before (REVTeX's empty `\\bibfield {number} {  }`, before which a mark
    // set the entry's text 7 pt right: 2610.20716v1)
    let startAt = -1, startCut = 0, opened = -1
    if (m) for (let k = 0; k < pieces.length; k++) {
      const p = pieces[k]
      if (p.t === 'text') {
        const w = /^[ \t\r\n]*(?=[^ \t\r\n])/.exec(p.s)
        if (!w) continue
        const prev = pieces[k - 1]
        if (w[0].length === 0 && prev?.t === 'ph' && /\\[A-Za-z@]+\*?$/.test(prev.src)) { startAt = k - 1; startCut = -1 } else { startAt = k; startCut = w[0].length }
        break
      }
      if (p.t === 'open') { if (opened < 0) opened = k; continue }
      if (p.t === 'close' && opened >= 0 && LETTER_GROUP(pieces.slice(opened + 1, k))) { startAt = opened; startCut = -1; break }
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
    // line — the paper's choice — is marked where it begins, as before. Where asked (`pastBegin`: the marked original, our
    // base page), it goes past the white space that opens the unit always, where the start mark goes: a space TeX skips —
    // after a control word (`\\item Which`), or \\begin's or \\item's \\ignorespaces — would be set after ours, a real one
    // after its `}` (IEEEtran's abstract run in after its dash: 2608.19431's a line longer; paralist's inline items: 2610.21098's
    // paragraph re-broken from page 1), and one TeX sets is set as before, ahead of it. (piece `beforeAt`, at `beforeCut` in
    // its text, or before it at -1)
    let beforeAt = 0, beforeCut = -1
    const file = m?.before && !pastBegin ? (project.files?.get(u.file) ?? '') : '', begun = pastBegin && !!m?.before
    if (m?.before && (begun || lineBound(file, u.start, project.lineEnvs))) {
      let k = 0, crossed = false, cut = -1
      for (; k < pieces.length && pieces[k].t === 'text'; k++) {
        const ws = /^[ \t\r\n]*/.exec(pieces[k].s)[0]
        crossed ||= ws.includes('\n')
        if (ws.length < pieces[k].s.length) { cut = ws.length; break }
      }
      if (crossed || begun) { beforeAt = k; beforeCut = cut }
    }
    const parts = [], nested = inner && []
    for (let k = 0; k < pieces.length; k++) {
      const p = pieces[k]
      if (m?.before && k === beforeAt && beforeCut === -1) parts.push(utf8Bytes(m.before))
      if (p.t === 'nested') {
        // (a nested unit written as the paper's own: its bytes between the outer unit's, no span of its own)
        if (sourced?.has(p.unit)) { parts.push(bytesOf(p.pre + (project.files?.get(p.unit.file) ?? '').slice(p.unit.start, p.unit.end) + p.post, srcEnc)); continue }
        const sub = inner && []
        parts.push(bytesOf(p.pre, srcEnc))
        nested?.push([parts.length, p.unit, sub])
        parts.push(render(p.unit, sub), bytesOf(p.post, srcEnc))
        continue
      }
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
      // (the source's own word right after a control word: in the source a comment stood between them, which ends the name and
      // which the walk passes over — `\\bfseries%⏎Youqing`, written \\bfseriesYouqing, one undefined name: 2610.40394v1's author
      // block, four TeX errors and its names gone from the base page. A space ends it as the comment did; TeX skips it)
      // the same where an indent TeX skips was all that stood between them (SKIPPED, `bared`): before an address a placeholder
      // holds, and before a letter past ASCII, which XeTeX and LuaTeX read as a letter of the name. Only there: a source that
      // writes \\fooé itself has TeX read the name it reads)
      else if (/\\[A-Za-z@]+$/.test(p.src) && next?.t === 'text' && !next.tr && /^[A-Za-z@]/.test(next.s)) parts.push(utf8Bytes(' '))
      else if (/\\[A-Za-z@]+$/.test(p.src) && next?.bared && /^[A-Za-z@\u0080-\uffff]/.test(next.t === 'text' ? next.s : next.src ?? '')) parts.push(utf8Bytes(' '))
    }
    if (m?.before && beforeAt === pieces.length && beforeCut === -1) parts.push(utf8Bytes(m.before))
    if (nested?.length) {
      let size = 0
      const starts = parts.map(b => { const at = size; size += b.length; return at })
      for (const [k, unit, sub] of nested) inner.push({ unit, from: starts[k], to: starts[k] + parts[k].length, post: parts[k + 1].length }, ...sub.map(x => ({ ...x, from: x.from + starts[k], to: x.to + starts[k] })))
    }
    return concat(parts)
  }
  const byFile = new Map()
  // (a top-level unit written as the paper's own is no unit here: its range is copied with the text around it)
  for (const u of project.units) if (!u.nested && !sourced?.has(u)) (byFile.get(u.file) ?? byFile.set(u.file, []).get(u.file)).push(u)
  for (const [file, text] of project.files) {
    const us = (byFile.get(file) ?? []).sort((a, b) => a.start - b.start)
    const parts = []
    const enc = project.transcode?.has(file) ? 'utf8' : 'latin1'
    // a table with a translated cell goes into \\axtfit with its original, which sets it no wider than the wider of
    // the line and the original (FIT_DEF)
    const fits = (project.fits ?? []).filter(f => f.file === file && us.some(u => u.start >= f.start && u.end <= f.end && translated.has(u)))
    // (a tabular* between \\axtstar and \\axtstarbody, which measure its body at its columns' width)
    const inserts = fits.flatMap(f => [[f.start, [utf8Bytes(f.star ? '\\axtfit{\\axtstar' : '\\axtfit{')]], ...(f.star ? [[f.star, [utf8Bytes('\\axtstarbody')]]] : []), [f.end, [utf8Bytes('}{'), bytesOf(text.slice(f.start, f.end), enc), utf8Bytes('}')]]]).sort((a, b) => a[0] - b[0])
    // the bytes written so far, where `spans` is asked for: each top-level unit's range in the file as written, and each
    // unit nested in one, inside its range, with the top-level unit it is written in (`outer`), which a compile's error
    // is located by (tex-errors.mjs)
    let size = 0
    const add = (...bytes) => { parts.push(...bytes); if (spans) for (const b of bytes) size += b.length }
    const copy = (from, to) => {
      for (const [pos, bytes] of inserts) if (pos >= from && pos < to) { add(bytesOf(text.slice(from, pos), enc), ...bytes); from = pos }
      add(bytesOf(text.slice(from, to), enc))
    }
    let at = 0
    for (const u of us) {
      if (u.start < at) continue
      copy(at, u.start)
      const inner = spans && [], b = render(u, inner)
      // a unit written back inside an optional argument's brackets (a theorem's title): a ] its translation holds outside
      // any group would end them early (a translated "Convergence [see the appendix]"), so the unit goes in a group of its own
      const group = u.bracketed && closesBracket(b)
      if (group) add(utf8Bytes('{'))
      spans?.push({ file, unit: u, from: size, to: size + b.length }, ...inner.map(x => ({ file, unit: x.unit, from: size + x.from, to: size + x.to, post: x.post, outer: u })))
      add(b)
      if (group) add(utf8Bytes('}'))
      at = u.end
    }
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
  else if (inAuthorBlock(u)) pieces = pieces.flatMap(wordsKept)
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
/** whether a compiler is arXiv's `latex` (its 00README's, or the one guessed for a package of EPS figures alone: paper-meta.mjs):
 *  pdfTeX in DVI mode, \\pdfoutput 0, whose DVI arXiv makes a PDF by dvips and ps2pdf, and a host by dvipdfmx
 *  (live.d.mts CompileRequest), which reads the marks' specials (DVI_MARK_DEF) */
export const dviEngine = engine => engine === 'latex'
/** MARK_DEF's destination under `latex` (dviEngine), where pdfTeX writes no PDF itself and its \\pdfdest sets nothing: xdvipdfmx's,
 *  as MARK_DEF sets it under XeTeX, a `pdf:dest` special of an XYZ where it stands (\\axt@dvidest, LAYOUT_TEX's too:
 *  DVI_LAYOUT_TEX), and the config dvipdfmx is told at the first page, which keeps every destination nothing refers to
 *  (C 0x0010, "do not optimize PDF destinations": it drops them otherwise). A paper that sets \\pdfoutput 1 is set as pdfLaTeX
 *  sets it, MARK_DEF's. After MARK_DEF, for such a paper alone (live.mjs originalFiles, probeFiles), so that every other
 *  engine's files are byte for byte as before; one line, no comment, so that no line of the paper moves */
export const DVI_MARK_DEF = '\\makeatletter\\def\\axt@dvidest#1{\\special{pdf:dest (axt-#1) [@thispage /XYZ @xpos @ypos null]}}\\let\\axt@pdfdest\\axt@dest\\def\\axt@dest#1{\\ifnum\\pdfoutput>0 \\axt@pdfdest{#1}\\else\\axt@dvidest{#1}\\fi}\\ifdefined\\AddToHook\\AddToHook{shipout/firstpage}{\\ifnum\\pdfoutput>0 \\else\\special{dvipdfmx:config C 0x0010}\\fi}\\fi\\makeatother'
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
 *  which a destination's position does not follow), not a macro's body (storedBodies: set where it is called, perhaps
 *  more than once), not one TeX reads in math mode (inMath) */
export const markUnits = (units, translated = null) => {
  const id = new Map(units.map((u, i) => [u, i]))
  return u => (inAuthorBlock(u) ? (translated?.has(u) && fitsWide(u) ? AUTHOR_WIDE : null) : u.kind === 'heading' || u.kind === 'cell' || u.kind === 'figure' || u.front || u.stored || inMath(u) ? null : { start: `\\leavevmode\\axtmark{${id.get(u)}s}`, end: `\\axtend{${id.get(u)}e}` })
}
/**
 * Whether a unit holds a subscript or a superscript of its own (a piece `_` or `^`, outside every formula the walker
 * knows): TeX reads it in math mode — a display of an environment the walker cannot tell, a key in an argument, lines
 * TeX skips — and nothing proves a place in it lies between two whole operands. A mark is put only where the patch can
 * tell it stands between two of TeX's units — before a command and its arguments, after a whole argument, inside a
 * group — and in math a word's first letter may be an operand: \\bfm_\\leavevmode\\axtmark{…}1 gave "Missing {
 * inserted" (2310.20360), \\hat \\leavevmode x would take \\leavevmode for the accent's. So none goes into such a unit,
 * and neither does its leading or its line probe, which come with the mark
 */
const inMath = u => u.pieces.some(p => p.t === 'ph' && (p.src === '_' || p.src === '^'))
/** a unit's source as its pieces write it, its white space one space: what a class that compares two of its front matter's
 *  texts compares */
const sourceText = u => u.pieces.map(p => (p.t === 'text' ? p.src ?? p.s : p.t === 'nested' ? `${p.pre}\u0000${p.post}` : p.src ?? '')).join('').replace(/\s+/g, ' ').trim()
/** whether a group's pieces (between its open and its close) are one command that sets a letter of its own, LaTeX's text symbols
 *  (\\L, \\o, \\ss, \\ae, \\aa, \\i…), white space around it: a word's first letter in a group of its own (`{\\L}ukasz`) */
const LETTER_GROUP = inner => {
  const real = inner.filter(p => !(p.t === 'text' && !/\S/.test(p.s)))
  return real.length === 1 && real[0].t === 'ph' && /^\\(?:L|l|O|o|ss|SS|ae|AE|oe|OE|aa|AA|i|j|DH|dh|TH|th|NG|ng|DJ|dj)\s*$/.test(real[0].src ?? '')
}
/**
 * Marks for the front matter's units in the layout compile alone (the marked original, our base page: layout/marks.mjs
 * layoutMarking): the author block's names and places and the front matter's own units the role table knows (a \\thanks,
 * elsarticle's \\cortext, a \\date, a class's command whose text it hands elsewhere too), each a unit's start and end mark as
 * markUnits writes them, which the page's
 * reading of each unit's own ink (its stream order between the two) needs as any unit's. markUnits leaves them out for the
 * translation, which sets them again where the class copies them; in the layout compile what TeX sets is the paper's own,
 * and a copy's marks set nothing where TeX writes (MARK_DEF's \\axtmark is \\protected: \\thanks's \\protected@xdef keeps it
 * for the note it sets) or ships it as a running head (the gate, LAYOUT_TEX). Not a heading (its own marks), not one stored
 * (set where it is called, perhaps more than once) but an author block's of a macro called once (storedBodies' `once`, marked
 * in its definition: the one place TeX sets it), not one read in math (markUnits'), and not one whose text another such unit's
 * equals: a class compares them (revtex sets authors' equal affiliations, and their equal notes, once), and two marks of their own
 * would make them two. An author block's unit by its command's whole argument (frontBlock's `block`), which is what a class
 * compares: two rows of one block are two (article sets each row of its \\author where it stands: 1706.03762v7's "Google Brain"
 * three times), two equal commands one. Not one a macro
 * of the paper's or its class's only stores (`held`: elsarticle's \\biboptions{semicolon}, read as prose, is natbib's options,
 * and a mark there one natbib does not know: 2608.16117 lost a page). The \\date too: a class sets its front matter where it
 * likes (amsart: the date in a note of the first page, the addresses at the paper's end), and an unmarked unit is searched
 * between its marked neighbours, so the addresses' marks alone took 2610.21037's date out of its search
 */
/** a block's text as TeX reads its tokens, for comparing two: no comment, a blank line a paragraph's end, any other run of white
 *  space one space, none at either end */
const asTokens = t => t.replace(/(?<!\\)%[^\n]*(?:\n[ \t]*)?/g, '').replace(/[ \t]*\n[ \t]*\n\s*/g, '\u2029').replace(/[ \t\n]+/g, ' ').trim()
export function frontMarks(units) {
  const id = new Map(units.map((u, i) => [u, i]))
  const front = units.filter(u => (inAuthorBlock(u) || (u.front && u.kind !== 'heading' && !u.held)) && (!u.stored || (u.once && inAuthorBlock(u))) && !inMath(u))
  // (what a class compares is a command's whole argument: an author block's unit by its block's text, which two commands share
  // where they are equal — revtex's two equal \\affiliation{…}, set once —, never two rows of one block, which the class sets
  // each where it stands: 1706.03762v7's three "Google Brain" rows of one \\author; a note by its own text)
  // (a block's text as TeX reads it: a comment none, a space's run one space, a blank line a paragraph's end — two equal
  // \\affiliation{…} that differ in their lines' breaks are one to REVTeX)
  const keyOf = u => (BLOCK_OF.has(u) ? `b:${asTokens(BLOCK_OF.get(u).text)}` : `u:${sourceText(u)}`)
  const seen = new Map()
  for (const u of front) { const k = keyOf(u), owners = seen.get(k) ?? seen.set(k, new Set()).get(k); owners.add(BLOCK_OF.get(u) ?? u) }
  const marked = new Set(front.filter(u => seen.get(keyOf(u)).size === 1))
  return u => (marked.has(u) ? { start: `\\leavevmode\\axtmark{${id.get(u)}s}`, end: `\\axtend{${id.get(u)}e}` } : null)
}
/** A translated line of names or places goes into \\axtwide (FIT_DEF), all of it — its marks, a \\IEEEauthorrefmark
 *  after the last name — inside the braces that hold it: in a box that does not wrap (a table's c column, where
 *  article and IEEEtran set their author blocks) a line the translation made wider than the page is set as a paragraph
 *  of the line's width instead (2608.06701: Japanese names ran 126 pt past the page). Not one that breaks its own lines
 *  or holds a note: \\axtwide sets its argument twice to measure it, and a \\thanks set twice is kept twice; nor one
 *  that holds \\and, which in article ends the table the names are set in, and cannot be set inside a box; nor any
 *  other row's end of a table's (authblk's \\authorcr: 2608.03994's authors, an \\author{\\authorcr …} in a box,
 *  stopped TeX at \\maketitle with a hundred "Missing } inserted") */
const AUTHOR_WIDE = { start: '\\axtwide{', end: '}', whole: true }
const fitsWide = u => !u.pieces.some(p => p.t === 'nested' || (p.t === 'ph' && /\\(?:\\|newline|linebreak|par|thanks|footnote|footnotemark|and|And|AND|authorcr|cr|crcr|tabularnewline)(?![A-Za-z@])|^\\\\/.test(p.src ?? '')))

/** Goes before \\begin{document} of the original's own compile: the log then says which font families the document set
 *  for its roles, however it set them (its class, a package, a conference style) */
export const FONT_PROBE = '\\AtEndDocument{\\typeout{AXT-FONTS rm=\\rmdefault;sf=\\sfdefault;tt=\\ttdefault;body=\\familydefault;}}\n'
/** The TeX log of a compile's last pass. The browser's compiler (parked/tex-page/poc-site/tex.js) joins each step's log with its terminal
 *  output — `$ <command>`, then `LOG:` … `==` `STDOUT:` — and the terminal output repeats the errors; the last TeX step's
 *  log is taken, as the one that made the PDF, whatever the earlier passes' logs hold (BusyTeX's pipeline empties them
 *  today). bibtex, biber, makeindex, xdvipdfmx and dvipdfmx (latex's driver) are no TeX passes. A native compile's .log is
 *  the last pass's already. Every reader of a compile's log lines takes it (live.mjs lostIn, typeset/tex.mjs readLines,
 *  readForced, typeset/density.mjs readWidthProbe, readSizeProbe): read whole, the echo invents a forced break before a
 *  pass's first unit */
export const lastTexLog = log => {
  if (!(log ?? '').includes('\n==\nSTDOUT:')) return log ?? ''
  const steps = [...log.matchAll(/^\$ (\S+)[^\n]*\n[\s\S]*?^LOG:\n([\s\S]*?)\n==\nSTDOUT:/gm)]
  return steps.filter(m => !/^(?:bibtex|biber|makeindex|x?dvipdfmx)/.test(m[1])).at(-1)?.[2] ?? ''
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
