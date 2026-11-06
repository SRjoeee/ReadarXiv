// TeX's own statements that the marks write beside the head of today (tex.ts), and their readers (contract stage 1b,
// deliverables 1 and 2). Written by hand: what B is now (an instrument, never shown) lets the marks say more than today's.
//
// FRAMES: graphicx's draft, each \includegraphics frame bracketed by points g<n>a and g<n>b, and its top g<n>t. B is the
// marked draft (no final pass), so a frame prints its file name where A has the figure: the frame's points are what keep
// those glyphs out of B's sequence. They are points alone, written whatever the marks' state: today's frame marks were
// \axtmark, which is silent while TeX builds a page's head and foot (\@outputpage) or a contents list, so a logo in a
// running head printed its name unbracketed (2610.21085v1: every page; 2610.19159v1, 2610.20484v1: the title's logos).
//
// STATE: at every mark of ours TeX sets (\axt@mark: a unit's, a cell's, a heading's start and end, a placeholder's), a log
// line of the state there: NFSS's font (encoding, family, series, shape, size), the font TeX selected (\fontname), the
// \baselineskip, and the paragraph's measure (\hsize, \leftskip, \rightskip, \hangindent, \hangafter, \parshape's lines and
// its first line's indent and length). A \message adds no node to any list, so it cannot move a line or a glyph; it is
// silent where the marks are (\ifaxt@off) and where TeX is not setting text (a moving argument: \axt@mark is reached only
// through \axtmark when typesetting).
//   AXT-STATE <name> <enc>/<family>/<series>/<shape>/<size>/<baselineskip>/<hsize>/<leftskip>/<rightskip>/<hangindent>/
//             <hangafter>/<parshape>/<indent>/<length>/<font>;   (indent and length: \parshape's first line, empty without one;
//             the font's name last, which may hold a slash)

/** graphicx's draft with each frame's corners marked by points (replaces today's DRAFT, tex.ts) */
export const FRAMES_TEX =
  '\\PassOptionsToPackage{draft}{graphicx}\n' +
  '\\makeatletter\\AddToHook{package/graphics/after}{\\newcount\\axt@g\\let\\axt@setfile\\Gin@setfile%\n' +
  '\\def\\Gin@setfile#1#2#3{\\leavevmode\\global\\advance\\axt@g\\@ne\\axt@point{g\\the\\axt@g a}\\axt@setfile{#1}{#2}{#3}%\n' +
  '\\axt@point{g\\the\\axt@g b}\\rlap{\\raise\\Gin@req@height\\hbox{\\axt@point{g\\the\\axt@g t}}}}}\\makeatother\n'

/** the state at each mark TeX sets, after the head's definitions (it wraps LAYOUT_TEX's \axt@mark). The primitives and
 *  registers it reads are taken at the head, before any package: wrapfig makes \parshape a macro around a wrapped figure
 *  ("You can't use \relax after \the", 2602.23285v2, 2608.27728v1, 2010.11929v2) */
export const STATE_TEX =
  '\\makeatletter\\let\\axt@ps\\parshape\\let\\axt@hi\\hangindent\\let\\axt@ha\\hangafter\\let\\axt@ls\\leftskip' +
  '\\let\\axt@rs\\rightskip\\let\\axt@hs\\hsize\\let\\axt@bs\\baselineskip\\let\\axt@fn\\fontname\\let\\axt@ft\\font' +
  '\\let\\axt@markonly\\axt@mark\\def\\axt@mark#1{\\axt@markonly{#1}\\ifaxt@off\\else\\axt@state{#1}\\fi}%\n' +
  '\\def\\axt@state#1{\\message{^^JAXT-STATE #1 \\ifdefined\\f@size\\f@encoding/\\f@family/\\f@series/\\f@shape/\\f@size' +
  '\\else////\\fi/\\the\\axt@bs/\\the\\axt@hs/\\the\\axt@ls/\\the\\axt@rs/\\the\\axt@hi/\\the\\axt@ha/' +
  '\\the\\axt@ps/\\ifdefined\\parshapeindent\\ifnum\\axt@ps>0 \\the\\parshapeindent1/\\the\\parshapelength1\\else/\\fi' +
  '\\else/\\fi/\\axt@fn\\axt@ft;^^J}}\\makeatother\n'

/** TeX's sentence ends: \axtsf sets its point where the space factor is a sentence's (\sfcode of a stop 3000 but under
 *  \frenchspacing; a capital's 999 before it keeps it under 2000: "A. Turing"), in horizontal mode, while the marks are on;
 *  never in a moving argument (\protect not \@typeset@protect) nor in a PDF string */
export const SENTENCE_TEX =
  '\\makeatletter\\protected\\def\\axtsf#1{\\ifx\\protect\\@typeset@protect\\ifhmode\\ifaxt@off\\else' +
  '\\ifnum\\spacefactor>1999 \\axt@point{#1}\\fi\\fi\\fi\\fi}\\AtBeginDocument{\\ifdefined\\pdfstringdefDisableCommands' +
  '\\pdfstringdefDisableCommands{\\let\\axtsf\\@gobble}\\fi}\\makeatother\n'
/** a paragraph's end point (LAYOUT_TEX's qe<n>) also where the list ends in a whatsit: today's \\axt@peat withholds it there,
 *  and a unit's own end mark is one, so the paragraphs our units end read as no end (spike S7 §0.2: 92 of 279 on
 *  1512.03385v1); the table of \\lastnodetype is today's but for the whatsit (9) */
export const PARA_ENDS_TEX =
  '\\makeatletter\\def\\axt@peat{\\ifcase\\numexpr\\lastnodetype+1\\relax 0\\or1\\or0\\or0\\or1\\or1\\or1\\or0\\or1\\or0' +
  '\\or1\\or1\\else0\\fi}\\makeatother\n'
/** a sentence end's point (SENTENCE_TEX) */
export const SENTENCE_POINT = /^s\d+\.\d+$/

/** a dimension TeX printed (\the of a dimen or a skip: its natural size), in TeX points */
const pt = (s: string | undefined): number | null => {
  const m = /^(-?[\d.]+)pt\b/.exec(s?.trim() ?? '')
  return m ? Number(m[1]) : null
}
export interface TexState {
  /** NFSS's font: encoding, family, series, shape; its size in points */
  font: { encoding: string; family: string; series: string; shape: string; size: number | null } | null
  /** the font TeX selected (\fontname\font) */
  name: string
  baselineskip: number | null
  /** the paragraph's measure: \hsize, \leftskip, \rightskip, \hangindent, \hangafter; \parshape's lines and its first
   *  line's indent and length (points) */
  measure: {
    hsize: number | null
    leftskip: number | null
    rightskip: number | null
    hangindent: number | null
    hangafter: number
    parshape: number
    indent?: number | null
    length?: number | null
  }
}
/**
 * Each mark's state as TeX stated it (AXT-STATE, the log's 79-column wraps joined), by the mark's name: its first statement
 * (a box TeX measures before it sets it states its marks more than once, the same)
 */
export function readStates(log: string): Map<string, TexState> {
  const out = new Map<string, TexState>()
  const lines = log.split('\n')
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k] as string
    if (!l.startsWith('AXT-STATE ')) continue
    let s = l
    for (let j = k + 1; !s.includes(';') && j < Math.min(lines.length, k + 12); j++) s += lines[j]
    const m = /^AXT-STATE (\S+) ([^;]*);/.exec(s)
    if (!m || out.has(m[1] as string)) continue
    const f = (m[2] as string).split('/')
    if (f.length < 15) continue
    const n = (x: string | undefined) => (x !== undefined && /^-?\d+$/.test(x) ? Number(x) : 0)
    out.set(m[1] as string, {
      font: f[4]
        ? {
            encoding: f[0] as string,
            family: f[1] as string,
            series: f[2] as string,
            shape: f[3] as string,
            size: Number.isFinite(Number(f[4])) ? Number(f[4]) : null,
          }
        : null,
      name: f.slice(14).join('/'),
      baselineskip: pt(f[5]),
      measure: {
        hsize: pt(f[6]),
        leftskip: pt(f[7]),
        rightskip: pt(f[8]),
        hangindent: pt(f[9]),
        hangafter: n(f[10]),
        parshape: n(f[11]),
        ...(n(f[11]) > 0 ? { indent: pt(f[12]), length: pt(f[13]) } : {}),
      },
    })
  }
  return out
}
