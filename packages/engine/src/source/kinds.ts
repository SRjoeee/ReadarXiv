// The source reader's one table of what TeX's packages are, by name: each entry is a fact about a package that the paper
// need not ship (the image's TeX tree holds it), so its name is all the source shows of it. What the paper defines itself is
// never listed here: it is read from TeX's own answer (definitions.ts).
import type { LexRules } from './tokens.ts'

/** commands that read their text as \verb does (the kernel's \verb; listings' \lstinline [keys] then a delimiter or a group;
 *  minted's \mintinline [opts]{language} then the same) */
export const INLINE_CODE: ReadonlyMap<string, 'verb' | 'listing' | 'minted'> = new Map([
  ['verb', 'verb'],
  ['lstinline', 'listing'],
  ['mintinline', 'minted'],
])

/** environments a package reads line by line up to their \end: the kernel's and verbatim.sty's verbatim, fancyvrb's,
 *  listings', minted's, moreverb's, filecontents, the packages that write their lines out (asy, dot2tex, pythontex,
 *  sagetex), comment.sty's, tcolorbox's listings. A star is the same environment's. Any other environment comment.sty
 *  defines is read by lines where TeX's meaning shows it excluded (acmart's \excludecomment{CCSXML}); one it processes
 *  (acmart's \specialcomment{acks}) is typeset, its lines TeX's tokens (read.ts ownLineEnvs) */
export const LINE_ENVIRONMENTS: ReadonlySet<string> = new Set([
  'verbatim',
  'Verbatim',
  'BVerbatim',
  'LVerbatim',
  'SaveVerbatim',
  'VerbatimOut',
  'lstlisting',
  'minted',
  'comment',
  'filecontents',
  'tcblisting',
  'tcboutputlisting',
  'verbatimwrite',
  'verbatimtab',
  'boxedverbatim',
  'asy',
  'asydef',
  'dot2tex',
  'pythontex',
  'pycode',
  'pyblock',
  'pyverbatim',
  'sagesilent',
  'sageblock',
  'sagecommandline',
])

/** the commands that read their argument with `%` a character (url.sty's \url and \path, hyperref's \nolinkurl and \href's
 *  first, breakurl's \burl) */
export const URL_READERS: ReadonlySet<string> = new Set(['url', 'nolinkurl', 'path', 'burl', 'href'])

const unstarred = (env: string) => (env.endsWith('*') ? env.slice(0, -1) : env)

/** the tokenizer's rules from the packages' table alone, and with the paper's own line environments */
export function lexRules(own: ReadonlySet<string> = new Set()): LexRules {
  return {
    inline: (name) => INLINE_CODE.get(name) ?? null,
    lineEnv: (env) => LINE_ENVIRONMENTS.has(unstarred(env)) || own.has(env) || own.has(unstarred(env)),
    raw: (name) => URL_READERS.has(name),
  }
}
export const LEX_RULES: LexRules = lexRules()

// ---------------------------------------------------------------- what carries prose (LaTeX's and the common packages')
/** LaTeX's sectioning commands and \title: the argument a heading */
export const HEADINGS: ReadonlySet<string> = new Set([
  'part',
  'chapter',
  'section',
  'subsection',
  'subsubsection',
  'paragraph',
  'subparagraph',
  'title',
])
/** a sectioning command's depth, as LaTeX's article and book classes count it */
export const DEPTH: Readonly<Record<string, number>> = {
  part: -1,
  chapter: 0,
  section: 1,
  subsection: 2,
  subsubsection: 3,
}
/** commands whose argument is a unit of its own */
export const OWN_UNIT_ARG: ReadonlySet<string> = new Set([
  'caption',
  'subcaption',
  'subcaptionbox',
  'captionof',
  'tablecaption',
  'footnote',
  'footnotetext',
  'thanks',
  'abstract',
  'keywords',
])
export const CAPTIONS: ReadonlySet<string> = new Set([
  'caption',
  'subcaption',
  'subcaptionbox',
  'captionof',
  'tablecaption',
])
/** the forms of the commands whose argument is a unit, where not `[{` (LaTeX's \@startsection's, a caption's) */
export const UNIT_FORMS: Readonly<Record<string, string>> = {
  subcaptionbox: '[{[[',
  captionof: '{[{',
  tablecaption: '{',
}
/** the front matter's author blocks (names and places), and those that open with names */
export const FRONT_MATTER: ReadonlySet<string> = new Set(['author', 'affil', 'affiliation', 'institute', 'address'])
export const FRONT_NAMES: ReadonlySet<string> = new Set([
  'author',
  'icmlauthor',
  'editor',
  'editors',
  'translator',
  'collaboration',
  'contrib',
  'speaker',
])
/** inside an author block, commands whose argument is a name or a place (IEEEtran's blocks, acmart's parts) */
export const FRONT_PROSE: ReadonlySet<string> = new Set([
  'IEEEauthorblockN',
  'IEEEauthorblockA',
  'institution',
  'department',
  'city',
  'state',
  'country',
])
export const FRONT_BOXES: ReadonlySet<string> = new Set(['centerline'])
export const FRONT_LINES: ReadonlyMap<string, string> = new Map([
  ['IEEEauthorblockN', 'author'],
  ['IEEEauthorblockA', 'affiliation'],
])
/** the kernel's font commands of one argument: a span of their style */
export const INLINE_TEXT: ReadonlyMap<string, string> = new Map([
  ['textbf', 'bold'],
  ['textit', 'italic'],
  ['emph', 'italic'],
  ['textsl', 'slanted'],
  ['textsc', 'smallcaps'],
  ['underline', 'underline'],
  ['textup', 'upright'],
  ['textrm', 'roman'],
  ['textsf', 'sans'],
  ['textmd', 'medium'],
  ['textnormal', 'normal'],
  ['uline', 'underline'],
])
/** boxes whose last required argument is typeset as it stands, by how many required arguments they take */
export const CONTENT_BOX: ReadonlyMap<string, number> = new Map([
  ['resizebox', 3],
  ['scalebox', 2],
  ['adjustbox', 2],
  ['rotatebox', 2],
  ['raisebox', 2],
  ['fbox', 1],
  ['mbox', 1],
  ['framebox', 1],
  ['makebox', 1],
  ['parbox', 2],
  ['colorbox', 2],
  ['fcolorbox', 3],
  ['textcolor', 2],
])
/** declarations that take no argument: a group after one is a group of its own */
export const NO_ARGS: ReadonlySet<string> = new Set(
  'centering raggedright raggedleft noindent indent normalfont rmfamily sffamily ttfamily bfseries mdseries itshape upshape slshape scshape em bf it rm sf tt sc sl normalsize small footnotesize scriptsize tiny large Large LARGE huge Huge selectfont smallskip medskip bigskip newblock BIBentryALTinterwordspacing BIBentrySTDinterwordspacing hfill vfill hfil vfil newline clearpage newpage cleardoublepage maketitle appendix toprule midrule bottomrule hline arraybackslash protect relax leavevmode strut null quad qquad enspace thinspace nobreak allowbreak sloppy fussy ignorespaces unskip'.split(
    ' ',
  ),
)
/** booktabs' rules take an optional width alone */
export const OPT_ONLY: ReadonlySet<string> = new Set(['toprule', 'midrule', 'bottomrule'])
/** amsmath's and the kernel's math environments: their body a formula */
export const MATH_ENVS =
  /^(equation|align|alignat|gather|multline|flalign|eqnarray|math|displaymath|dmath|IEEEeqnarray|subequations)\*?$/
/** a math environment set on lines of its own (all but `math`) */
export const displayEnv = (env: string): boolean => MATH_ENVS.test(env) && !/^math\*?$/.test(env)
/** environments whose body is no prose: code, a bibliography's own form, and the drawings a package parses itself */
export const SKIP_ENVS =
  /^(verbatim|Verbatim|lstlisting|minted|comment|tcblisting|tcboutputlisting|alltt|BVerbatim|LVerbatim|tikzpicture|pgfpicture|forest|array|algorithmic|algorithm2e|thebibliography|bibdiv|biblist|filecontents|picture|asy|pspicture|axis|circuitikz|xy|dot2tex|pythontex|sagesilent)\*?$/
export const TABLE_ENVS = /^(tabular|tabularx|tabular\*|longtable|tabu|tabulary|supertabular|xtabular)\*?$/
export const FLOAT_ENVS = /^(?:figure\*?|table\*?|wrapfigure|sidewaystable|algorithm|listing)$/
/** TeX's own conditionals */
export const TEX_IFS: ReadonlySet<string> = new Set(
  'if ifx ifnum ifdim ifodd ifcase ifcat iftrue iffalse ifvmode ifhmode ifmmode ifinner ifvoid ifhbox ifvbox ifeof ifdefined ifcsname iffontchar ifincsname ifpdfprimitive'.split(
    ' ',
  ),
)
/** commands whose next token (or next two) is an operand they do not run: printed, shown, compared or defined */
export const OPERAND_OF: ReadonlySet<string> = new Set(
  'string noexpand meaning show let futurelet def gdef edef xdef ifx newcommand renewcommand providecommand DeclareRobustCommand chardef mathchardef countdef dimendef skipdef toksdef'.split(
    ' ',
  ),
)
export const SECOND_OPERAND_OF: ReadonlySet<string> = new Set([
  'let',
  'ifx',
  'newcommand',
  'renewcommand',
  'providecommand',
  'DeclareRobustCommand',
])
/** the kernel's accents, and the combining marks of those that make a letter of one */
export const ACCENTS: ReadonlySet<string> = new Set([
  "'",
  '`',
  '"',
  '^',
  '~',
  '=',
  '.',
  'u',
  'v',
  'H',
  'c',
  'd',
  'b',
  't',
  'r',
  'k',
])
export const ACCENT_MARKS: Readonly<Record<string, string>> = {
  '`': '̀',
  "'": '́',
  '^': '̂',
  '~': '̃',
  '"': '̈',
  c: '̧',
  v: '̌',
  u: '̆',
  H: '̋',
  '.': '̇',
}
/** the accented letters every target font sets (measured on TeX Live 2026): an accent makes a letter of its word only
 *  where the letter is one of them */
export const SETTABLE: ReadonlySet<string> = new Set(
  'ÀÁÂÃÄÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäçèéêëìíîïñòóôõöùúûüýÿĂăĆćĈĉĊċČčĎďĔĕĖėĚěĜĝĞğĠġĤĥĨĩĬĭİĴĵĹĺĽľŃńŇňŎŏŐőŔŕŘřŚśŜŝŞşŠšŢţŤťŨũŬŭŰűŴŵŶŷŸŹźŻżŽžǍǎǏǐǑǒǓǔǦǧǰǴǵṅỲỳ',
)
/** the kernel's letter commands (\o, \ss, \L …) */
export const LETTER_COMMANDS: ReadonlySet<string> = new Set([
  'o',
  'O',
  'ss',
  'ae',
  'AE',
  'oe',
  'OE',
  'aa',
  'AA',
  'l',
  'L',
])
/** the running heads' commands: kept as they are, with their arguments */
export const RUNNING_HEADS: ReadonlySet<string> = new Set([
  'markboth',
  'markright',
  'titlerunning',
  'authorrunning',
  'toctitle',
  'tocauthor',
])
/** in a bibliography entry, commands that set their text argument as it stands (the n-th after `before` others), and the
 *  \bibinfo fields that are no prose */
export const BIB_TEXT: ReadonlyMap<string, number> = new Map([
  ['bibinfo', 1],
  ['bibfield', 1],
  ['bibnamefont', 0],
  ['bibfnamefont', 0],
  ['citenamefont', 0],
  ['enquote', 0],
  ['showarticletitle', 0],
  ['BIBforeignlanguage', 1],
])
export const BIB_KEPT_FIELD = /^(?:doi|url|eprint|isbn|issn|archive|archiveprefix|primaryclass|eid|lccn|mrnumber|zbl)$/i
/** a citation command: natbib's, biblatex's, apacite's (any name with "cite" in it, as today) */
export const CITATION = /^[A-Za-z]*cite[A-Za-z]*$/i

// ---------------------------------------------------------------- the kinds a piece is given where it is cut
/** an element's kind by the command that makes it, where its name says it: a citation, a reference, a web address, code;
 *  the rest by how the reader cut it (math, display, a note's mark) or `other` */
export function elementKind(name: string | null): string {
  if (name === null) return 'other'
  if (CITATION.test(name)) return 'cite'
  if (
    /^(?:ref|eqref|autoref|cref|Cref|pageref|nameref|vref|Vref|labelcref|cpageref|Autoref|subref|hyperref)$/.test(name)
  )
    return 'ref'
  if (URL_READERS.has(name) || name === 'email') return 'url'
  if (name === 'label') return 'label'
  if (name === 'footnotemark' || name === 'thanksmark') return 'note-mark'
  if (name === '\\' || name === 'newline' || name === 'linebreak') return 'break'
  return 'other'
}

/** babel's keys of the names a document's generated headings print (its ini files' [captions]: \abstractname, \refname, …;
 *  the keys of src/pdf-reader/engine/layout/names.mjs NAME_KEYS): each `\<key>name` is asked, the word in force at the
 *  document's start the paper's own (SourceDoc `names`) */
export const BABEL_KEYS: readonly string[] = [
  'abstract',
  'ref',
  'bib',
  'contents',
  'listfigure',
  'listtable',
  'appendix',
  'index',
  'proof',
  'preface',
  'glossary',
  'figure',
  'table',
]
/** what the reader asks TeX whatever the source uses: whether backref is loaded and sets its lists after an entry's first
 *  paragraph (its parscan, true unless the paper says \backrefparscanfalse); babel's names in force */
export const ASKED: readonly string[] = ['ver@backref.sty', 'ifbackrefparscan', ...BABEL_KEYS.map((k) => `${k}name`)]
/** the packages' code environments (a paper's own environment that opens one is code too) */
export const LISTINGS: ReadonlySet<string> = new Set([
  'verbatim',
  'Verbatim',
  'BVerbatim',
  'LVerbatim',
  'lstlisting',
  'minted',
  'alltt',
  'tcblisting',
])
