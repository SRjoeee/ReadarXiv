import { describe, expect, it } from 'vitest'
import { FACES } from '@/pdf-reader/engine/font-roles.mjs'
import { FONT_PROBE, lastTexLog, latinFontsFor, MARK_DEF, readFontProbe } from '@/pdf-reader/engine/latex-front.mjs'
import { openPaper, originalFiles, probeFiles, translationFiles } from '@/pdf-reader/engine/live.mjs'
import { readSizeProbe, readWidthProbe } from '@/pdf-reader/engine/typeset/density.mjs'
import { strategiesFor, VERIFIED } from '@/pdf-reader/engine/scripts.mjs'
import { FLOAT_TEX, LINES_TEX, readForced, readLines, SIZE_TEX, typesetting } from '@/pdf-reader/engine/typeset/tex.mjs'
import { DESIGN, designFor } from '@/pdf-reader/engine/typeset/type.mjs'

// What the typesetting rule writes into a compile and reads back from its log. The macros' behaviour under TeX is checked
// natively by experiments/pdf-bilingual/spikes/typeset-check.mjs; here, what goes where

type Piece = { t: string; s?: string; tr?: boolean }
type Unit = { kind: string; pieces: Piece[]; front?: boolean }
const SOURCE = '\\documentclass{article}\\begin{document}\n\\section{Method}\nThe first paragraph of prose.\n\nThe second paragraph of prose.\n\\begin{figure}\\caption{A caption.}\\end{figure}\n\\end{document}\n'
const paper = () => openPaper(new Map([['main.tex', new TextEncoder().encode(SOURCE)]]))
const text = (files: Map<string, Uint8Array>) => new TextDecoder().decode(files.get('main.tex'))
/** every unit but the ones `skip` names translated, its words a mark of its own */
const translate = (units: Unit[], skip = new Set<number>()) => new Map(units.flatMap((u, i) => (skip.has(i) ? [] : [[u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))]])))
/** the first strategy strategiesFor offers, the one tried first */
function first(lang: string) {
  const [strategy] = strategiesFor({ compiler: 'pdflatex' }, lang)
  if (!strategy) throw new Error(`no strategy for ${lang}`)
  return strategy
}
const kindsOf = (units: Unit[]) => units.map((u, i) => [u.kind, i] as const)

describe('the log the rule reads', () => {
  it('reads each unit\'s lines, leading and size', () => {
    const lines = readLines('x\nAXT-LINES 3 5 13.6pt 10.95\nAXT-LINES 7 1 12.0pt\n')
    expect(lines.get(3)).toEqual({ lines: 5, bs: 13.6, size: 10.95 })
    expect(lines.get(7)).toEqual({ lines: 1, bs: 12 })
    expect(readLines(null).size).toBe(0)
  })
  it('takes the unit after each forced break, the next one whose lines the log gives', () => {
    expect([...readForced('AXT-LINES 1 2 12pt\nAXT-FORCED\nAXT-FORCED\nAXT-LINES 4 2 12pt\nAXT-LINES 5 2 12pt\nAXT-FORCED\n')]).toEqual([4])
    expect(readForced('').size).toBe(0)
  })
  it('reports a column made at a forced break, and lines through \\message (\\typeout reads \\prevgraf as 0)', () => {
    expect(LINES_TEX).toContain('\\ifnum\\outputpenalty=-\\@M\\message{^^JAXT-FORCED^^J}')
    expect(LINES_TEX).toContain('\\message{^^JAXT-LINES #1')
  })
  it('reads the last TeX pass of the browser compiler\'s joined log, not its earlier passes or the terminal\'s echo', () => {
    // one step as BusyTeX's pipeline writes it (poc-site/tex.js): the step's log, then the terminal's output, which
    // repeats every \message — a forced break at one pass's end read before the next pass's first unit invents a break
    const step = (cmd: string, log: string, echo = log) => [`$ ${cmd}`, 'EXITCODE: 0', '', 'TEXMFLOG:', '', '==', 'MISSFONTLOG:', '', '==', 'LOG:', log, '==', 'STDOUT:', echo, '==', 'STDERR:', '', '======'].join('\n')
    const pass = (bs: string) => `AXT-WIDTH 1071.0pt 12 241.0pt\nAXT-SIZE 0.9 900.0pt 1000.0pt\nAXT-LINES 1 2 ${bs}pt 10\nAXT-LINES 2 3 ${bs}pt 10\nAXT-FORCED\n`
    const joined = [step('pdflatex x.tex', pass('11.0')), step('bibtex x', ''), step('pdflatex x.tex', pass('12.0'), `noise\n${pass('12.0')}`), step('xdvipdfmx x.xdv', 'AXT-LINES 9 9 99pt')].join('\n\n')
    expect([...readLines(joined)]).toEqual([...readLines(pass('12.0'))])
    expect([...readForced(joined)]).toEqual([])
    expect(readWidthProbe(joined)).toEqual(readWidthProbe(pass('12.0')))
    expect(readSizeProbe(joined)).toEqual(readSizeProbe(pass('12.0')))
    expect(lastTexLog(joined)).toBe(pass('12.0'))
    expect(lastTexLog(pass('12.0'))).toBe(pass('12.0'))
  })
  it('restores a unit\'s size from a snapshot, the leading before it noted for the unit\'s own', () => {
    expect(SIZE_TEX).toContain('\\let\\axt@szset\\@empty')
    expect(SIZE_TEX).toContain('\\edef\\axt@leadbefore{\\the\\baselineskip}')
  })
})

describe('a typeset plan in the compile', () => {
  const p = paper(), units = p.units as Unit[]
  const para = units.findIndex(u => u.kind === 'para'), caption = units.findIndex(u => u.kind === 'caption'), heading = units.findIndex(u => u.kind === 'heading')
  /** a plan solved for the first strategy of a CJK target (xeCJK) or of an alphabet's (the paper's own engine) */
  const plan = (cjk: boolean, extra: Partial<Parameters<typeof typesetting>[1]> = {}) => typesetting(p.units, {
    design: cjk ? DESIGN.Hans : DESIGN.Latn, strategy: first(cjk ? 'zh' : 'de').name, type: cjk ? { lead: 1.35, track: 0.02, scale: 0.97 } : { lead: 1.02, size: 0.95 },
    leads: new Map([[para, 1.1]]), sizes: new Map(), floatsAt: new Map(), tableMin: 0.85, ...extra,
  })

  it('has the units found that the cases rely on', () => {
    expect(kindsOf(units).map(([k]) => k)).toEqual(expect.arrayContaining(['heading', 'para', 'caption']))
  })
  it('defines each unit\'s leading, size and float page, the line probes always, sizes and floats only when used', () => {
    const bare = plan(false).head
    expect(bare).toContain(LINES_TEX)
    expect(bare).not.toContain(SIZE_TEX)
    expect(bare).not.toContain(FLOAT_TEX)
    expect(bare).toContain(`\\expandafter\\def\\csname axtlead@${para}\\endcsname{1.1000}`)
    expect(bare).toContain('\\axtfitheighttrue')
    const full = plan(true, { sizes: new Map([[para, 0.95]]), floatsAt: new Map([[caption, { page: 2, col: 1 }]]) }).head
    expect(full).toContain(SIZE_TEX)
    expect(full).toContain(FLOAT_TEX)
    expect(full).toContain(`axtsize@${para}\\endcsname{0.9500}`)
    expect(full).toContain(`axt@fp@${caption}\\endcsname{2 1}`)
  })
  it('sets a CJK type on the face and the glue, and an alphabet\'s leading alone (its size on the units)', () => {
    const base = first('zh')
    const zh = plan(true).strategy(base)
    expect(zh.leading).toBe(1.35)
    expect(zh.pre(null)).toContain('Scale=0.9700,')
    expect(zh.pre(null)).toContain('CJKglue={\\hskip 0.0200em')
    const de = plan(false).strategy(first('de'))
    expect(de.leading).toBe(1.02)
    expect(de.pre(null)).toBe(first('de').pre(null))
  })
  it('sets a CJK type under the pdfLaTeX fallback, CJKutf8, as its design has it: the leading, and a size on the units', () => {
    const [, cjkutf8] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
    const design = cjkutf8 && designFor('Hans', cjkutf8)
    if (!cjkutf8 || !design) throw new Error('no fallback strategy')
    const typeset = typesetting(p.units, { design, strategy: cjkutf8.name, type: { lead: 1.35, size: 0.96, h: 0.96 }, leads: new Map([[para, 1.1]]), sizes: new Map([[para, 0.96]]), floatsAt: new Map(), tableMin: 0.85 })
    const fallback = typeset.strategy(cjkutf8)
    expect(fallback.leading).toBe(1.35)
    expect(fallback.pre(null)).toBe(cjkutf8.pre(null))
    expect(text(translationFiles(p, translate(units) as never, { strategy: cjkutf8, fonts: null, draft: false, aux: null, bbl: null, typeset }))).toContain(`\\axtsize{${para}}`)
  })
  it('sets only the strategy it was solved for; another is set as today, and the refusal noted', () => {
    const [xe, cjkutf8] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
    if (!xe || !cjkutf8) throw new Error('no strategies')
    expect(plan(true).strategy(xe).leading).toBe(1.35)
    expect(plan(true).strategy(cjkutf8)).toBe(cjkutf8)
    const notes: unknown[][] = [], translated = translate(units)
    const refused = text(translationFiles(p, translated as never, { strategy: cjkutf8, fonts: null, draft: false, aux: null, bbl: null, typeset: plan(true), note: (...a: unknown[]) => notes.push(a) }))
    expect(refused).toBe(text(translationFiles(p, translated as never, { strategy: cjkutf8, fonts: null, draft: false, aux: null, bbl: null })))
    expect(notes).toEqual([['typeset refused', { plan: xe.name, strategy: cjkutf8.name }]])
  })
  it('marks only translated units: their float, line probe, size and leading, in that order', () => {
    const typeset = plan(false, { sizes: new Map([[para, 0.95], [heading, 0.95]]), floatsAt: new Map([[caption, { page: 1, col: 0 }]]) })
    const translated = translate(units)
    const tex = text(translationFiles(p, translated as never, { strategy: first('de'), fonts: null, draft: false, aux: null, bbl: null, typeset }))
    expect(tex).toContain(`\\axtlines{${para}}\\axtsize{${para}}\\axtlead{${para}}`)
    expect(tex).toContain(`\\axtfloatat{${caption}}\\axtlines{${caption}}`)
    expect(tex).toContain(`\\axtsizein{${heading}}`)
    expect(tex.indexOf('\\axtfitheighttrue')).toBeLessThan(tex.indexOf('\\documentclass'))
    const untranslated = text(translationFiles(p, translate(units, new Set([para])) as never, { strategy: first('de'), fonts: null, draft: false, aux: null, bbl: null, typeset }))
    expect(untranslated).not.toContain(`\\axtlines{${para}}`)
    // the reader's final: the same but the line probes, which nothing reads there (the F2 review's M7)
    const final = text(translationFiles(p, translated as never, { strategy: first('de'), fonts: null, draft: false, aux: null, bbl: null, typeset: typeset.final }))
    expect(final).toContain(`\\axtfloatat{${caption}}`)
    expect([final.includes(`\\axtsize{${para}}\\axtlead{${para}}`), final.includes('\\axtlines{'), final.includes('AXT-LINES')]).toEqual([true, false, false])
  })
})

describe('the probes the rule needs', () => {
  it('marks every page with the columns its units were set in, whichever way the class sets them', () => {
    // the most columns at any mark since the last page went out, or as this one goes out
    expect(MARK_DEF).toContain('\\protected\\def\\axtmark#1{\\axt@colseen\\axt@dest{#1}}')
    expect(MARK_DEF).toContain('\\AddToHook{shipout/background}{\\axt@colseen\\put(0,0){\\axt@dest{c\\axt@colmax-')
    for (const flag of ['\\pagegrid@col', '\\col@number', '\\if@twocolumn']) expect(MARK_DEF).toContain(flag)
    expect(text(originalFiles(paper()))).toContain(MARK_DEF)
  })
  it('adds the width and size probes to the font probe when asked', () => {
    expect(text(probeFiles(paper()))).not.toContain('AXT-WIDTH')
    expect(text(probeFiles(paper(), { width: true }))).toContain('AXT-WIDTH')
    expect(text(probeFiles(paper(), { width: true }))).toContain('AXT-SIZE')
  })
  it('gives the original a line probe before every unit mark when asked', () => {
    const p = paper(), para = (p.units as Unit[]).findIndex(u => u.kind === 'para')
    expect(text(originalFiles(p))).not.toContain('\\axtlines')
    const lined = text(originalFiles(p, { lines: true }))
    expect(lined).toContain(LINES_TEX)
    expect(lined).toContain(`\\axtlines{${para}}`)
  })
})

// The faces every final embeds, from the font role table (font-roles.mjs; spec §4.10 rows 18-20, the maintainer's font
// rulings of 2026-10-06): the TeX path sets the files the instant layer draws in, by file name. Checked natively by
// experiments/pdf-bilingual/spikes/fonts-cases.mjs (the PDF's fonts by name)
const probeOf = (rm: string, sf = 'cmss', tt = 'cmtt', enc?: string) => ({ rm, sf, tt, body: rm, ...(enc ? { enc } : {}) })
/** fontspec's line for a role in the four files the table gives its styles: regular, bold, italic, bold italic */
const faces = (cmd: string, [up, bold, italic, boldItalic]: string[], more = '') => `\\${cmd}[BoldFont=${bold},ItalicFont=${italic},BoldItalicFont=${boldItalic}${more}]{${up}}\n`
const NIMBUS_ROMAN = ['NimbusRoman-Regular.otf', 'NimbusRoman-Bold.otf', 'NimbusRoman-Italic.otf', 'NimbusRoman-BoldItalic.otf']
const NIMBUS_SANS = ['NimbusSans-Regular.otf', 'NimbusSans-Bold.otf', 'NimbusSans-Italic.otf', 'NimbusSans-BoldItalic.otf']
const FREEMONO = ['FreeMono.otf', 'FreeMonoBold.otf', 'FreeMonoOblique.otf', 'FreeMonoBoldOblique.otf']
const DOMITIAN = ['Domitian-Roman.otf', 'Domitian-Bold.otf', 'Domitian-Italic.otf', 'Domitian-BoldItalic.otf']
const EREWHON = ['Erewhon-Regular.otf', 'Erewhon-Bold.otf', 'Erewhon-Italic.otf', 'Erewhon-BoldItalic.otf']
const DEJAVU_MONO = ['DejaVuSansMono.ttf', 'DejaVuSansMono-Bold.ttf', 'DejaVuSansMono-Oblique.ttf', 'DejaVuSansMono-BoldOblique.ttf']

describe('the Cyrillic target in the role table\'s faces', () => {
  const [xe, t2a] = strategiesFor({ compiler: 'pdflatex' }, 'ru')
  if (!xe || !t2a) throw new Error('no strategies for ru')
  it('a pdfLaTeX paper is set by XeLaTeX first, the paper\'s math kept, and today\'s pdfLaTeX in T2A second', () => {
    expect([xe.name, xe.engine, xe.xe, t2a.name, t2a.engine, t2a.xe]).toEqual(['XeLaTeX', 'xelatex', true, 'own engine', 'pdflatex', false])
    expect(xe.pre(null)).toMatch(/^\\PassOptionsToPackage\{no-math\}\{fontspec\}\n\\usepackage\{fontspec\}\n\\defaultfontfeatures\{\}\n/)
    // each face in an encoding it has, should the paper load T1 (TU_AGAIN), and babel\'s Russian
    expect(xe.pre(null)).toContain('\\renewcommand\\encodingdefault{TU}')
    expect(xe.pre(null)).toContain('\\babelprovide[import=ru,main]{axttarget}')
    // the fallback\'s faces as today: the paper\'s families in T2A where they have it, else one of the same design
    expect(t2a.pre(probeOf('ptm', 'phv', 'pcr'))).toContain('\\__axt_substitute:nnnn {T2A} {ptm} {Tempora-TLF} {t2aptm.fd}')
    expect(t2a.pre(probeOf('ptm', 'phv', 'pcr'))).toContain('\\__axt_substitute:nnnn {T2A} {pcr} {PTMono-TLF} {t2apcr.fd}')
    // a XeLaTeX paper keeps its engine, in the table\'s faces
    const [own] = strategiesFor({ compiler: 'xelatex' }, 'ru')
    expect([own?.name, own?.engine, own?.pre(probeOf('ptm', 'phv', 'pcr')).includes(faces('setmainfont', NIMBUS_ROMAN))]).toEqual(['own engine', 'xelatex', true])
  })
  it('ru maps Times to Nimbus Roman, Helvetica to Nimbus Sans, Courier to FreeMono, CM to CMU, Palatino to Domitian, Bera Mono to DejaVu Sans Mono, Utopia to Erewhon (the table\'s files)', () => {
    const times = xe.pre(probeOf('ptm', 'phv', 'pcr'))
    expect(times).toContain(faces('setmainfont', NIMBUS_ROMAN))
    expect(times).toContain(faces('setsansfont', NIMBUS_SANS))
    expect(times).toContain(faces('setmonofont', FREEMONO))
    const cm = xe.pre(probeOf('cmr'))
    expect(cm).toContain(faces('setmainfont', ['cmunrm.otf', 'cmunbx.otf', 'cmunti.otf', 'cmunbi.otf']))
    expect(cm).toContain(faces('setsansfont', ['cmunss.otf', 'cmunsx.otf', 'cmunsi.otf', 'cmunso.otf']))
    expect(cm).toContain(faces('setmonofont', ['cmuntt.otf', 'cmuntb.otf', 'cmunit.otf', 'cmuntx.otf']))
    expect(xe.pre(probeOf('pplx', 'phv', 'fvm'))).toContain(faces('setmainfont', DOMITIAN))
    expect(xe.pre(probeOf('pplx', 'phv', 'fvm'))).toContain(faces('setmonofont', DEJAVU_MONO))
    expect(xe.pre(probeOf('erewhon-TLF'))).toContain(faces('setmainfont', EREWHON))
    expect(xe.pre(probeOf('put'))).toContain(faces('setmainfont', EREWHON))
    // newtx\'s and txfonts\' names for Times and Helvetica; Libertine\'s bold italic has no Cyrillic: its bold; Inconsolata: PT Mono
    expect(xe.pre(probeOf('ntxtlf', 'txss', 'txtt'))).toContain(faces('setsansfont', NIMBUS_SANS))
    expect(xe.pre(probeOf('LinuxLibertineT-TLF', 'LinuxBiolinumT-TLF', 'zi4'))).toContain(faces('setmainfont', ['LinLibertine_R.otf', 'LinLibertine_RB.otf', 'LinLibertine_RI.otf', 'LinLibertine_RB.otf']))
    expect(xe.pre(probeOf('LinuxLibertineT-TLF', 'LinuxBiolinumT-TLF', 'zi4'))).toContain(faces('setmonofont', ['PTM55F.ttf', 'PTM75F.ttf', 'PTM55F.ttf', 'PTM75F.ttf']))
    // a family of no table, and no probe: CMU, the table\'s face for it
    expect(xe.pre(probeOf('pbk', 'pag', 'pcr'))).toContain(faces('setmainfont', ['cmunrm.otf', 'cmunbx.otf', 'cmunti.otf', 'cmunbi.otf']))
    expect(xe.pre(null)).toContain(faces('setsansfont', ['cmunss.otf', 'cmunsx.otf', 'cmunsi.otf', 'cmunso.otf']))
  })
})

describe('a Latin script\'s faces: the role table\'s Latin column, T1 under the paper\'s pdfLaTeX', () => {
  it('latinFontsFor maps XCharter, Erewhon, EB Garamond, Libertine and Inconsolata', () => {
    expect(latinFontsFor(probeOf('XCharter-TLF'))).toContain(faces('setmainfont', ['XCharter-Roman.otf', 'XCharter-Bold.otf', 'XCharter-Italic.otf', 'XCharter-BoldItalic.otf']))
    expect(latinFontsFor(probeOf('bch'))).toContain('{XCharter-Roman.otf}')
    expect(latinFontsFor(probeOf('erewhon-TLF'))).toContain(faces('setmainfont', EREWHON))
    expect(latinFontsFor(probeOf('EBGaramond-TLF'))).toContain(faces('setmainfont', ['EBGaramond-Regular.otf', 'EBGaramond-Bold.otf', 'EBGaramond-Italic.otf', 'EBGaramond-BoldItalic.otf']))
    const libertine = latinFontsFor(probeOf('LinuxLibertineT-TLF', 'LinuxBiolinumT-TLF', 'zi4'))
    expect(libertine).toContain(faces('setmainfont', ['LinLibertine_R.otf', 'LinLibertine_RB.otf', 'LinLibertine_RI.otf', 'LinLibertine_RBI.otf']))
    expect(libertine).toContain(faces('setsansfont', ['LinBiolinum_R.otf', 'LinBiolinum_RB.otf', 'LinBiolinum_RI.otf', 'LinBiolinum_RBO.otf']))
    // Inconsolata has no italic: its upright, as the layer draws it
    expect(libertine).toContain(faces('setmonofont', ['Inconsolatazi4-Regular.otf', 'Inconsolatazi4-Bold.otf', 'Inconsolatazi4-Regular.otf', 'Inconsolatazi4-Bold.otf']))
  })
  it('and URW\'s base 35 families in the table\'s files, CM in CMU with Latin Modern\'s bold italic and small capitals; no TeX Gyre', () => {
    const times = latinFontsFor(probeOf('ptm', 'phv', 'pcr'))
    expect(times).toBe(faces('setmainfont', NIMBUS_ROMAN) + faces('setsansfont', NIMBUS_SANS) + faces('setmonofont', FREEMONO))
    expect(latinFontsFor(probeOf('zplTLF', 'phv', 'fvm'))).toContain(faces('setmainfont', DOMITIAN))
    const cm = latinFontsFor(probeOf('cmr'))
    expect(cm).toContain(faces('setmainfont', ['cmunrm.otf', 'cmunbx.otf', 'cmunti.otf', 'lmroman10-bolditalic.otf'], ',SmallCapsFont=lmromancaps10-regular.otf,ItalicFeatures={SmallCapsFont=lmromancaps10-oblique.otf}'))
    // CM\'s sans and typewriter: Latin Modern\'s, which has no bold typewriter (its upright, as the layer draws it)
    expect(cm).toContain(faces('setsansfont', ['lmsans10-regular.otf', 'lmsans10-bold.otf', 'lmsans10-oblique.otf', 'lmsans10-boldoblique.otf']))
    expect(cm).toContain(faces('setmonofont', ['lmmono10-regular.otf', 'lmmono10-regular.otf', 'lmmono10-italic.otf', 'lmmono10-italic.otf']))
    for (const rm of ['ptm', 'ppl', 'pcr', 'phv']) expect(latinFontsFor(probeOf(rm, 'phv', 'pcr'))).not.toMatch(/texgyre|Extension=/i)
    // a family of no table (Bookman, Schoolbook, Avant Garde: none in the corpus) keeps fontspec\'s default, Latin Modern
    expect(latinFontsFor(probeOf('pbk', 'pag', 'pnc'))).toBe('')
    expect(latinFontsFor(null)).toBe('')
  })
  it('a Latin target sets T1, and lmodern for an OT1 CM paper', () => {
    const [de] = strategiesFor({ compiler: 'pdflatex' }, 'de')
    if (!de) throw new Error('no strategy for de')
    // the accented letters of the translation are glyphs of their own, which TeX hyphenates around: T1, before babel
    const cm = de.pre(probeOf('cmr', 'cmss', 'cmtt', 'OT1'))
    expect(cm).toMatch(/^\\renewcommand\\rmdefault\{lmr\}\\renewcommand\\sfdefault\{lmss\}\\renewcommand\\ttdefault\{lmtt\}\n\\usepackage\[T1\]\{fontenc\}\n/)
    expect(cm.indexOf('\\usepackage[T1]{fontenc}')).toBeLessThan(cm.indexOf('\\babelprovide'))
    // Computer Modern\'s roles alone: a Times paper\'s Times stays, its CM typewriter goes to Latin Modern
    const times = de.pre(probeOf('ptm', 'phv', 'cmtt', 'OT1'))
    expect(times).toMatch(/^\\renewcommand\\ttdefault\{lmtt\}\n\\usepackage\[T1\]\{fontenc\}\n/)
    // a paper already in T1 keeps its families; no probe, T1 alone
    expect(de.pre(probeOf('cmr', 'cmss', 'cmtt', 'T1'))).toMatch(/^\\usepackage\[T1\]\{fontenc\}\n/)
    expect(de.pre(null)).toMatch(/^\\usepackage\[T1\]\{fontenc\}\n/)
    for (const lang of ['es', 'fr', 'pt']) expect(strategiesFor({ compiler: 'pdflatex' }, lang)[0]?.pre(null), lang).toContain('\\usepackage[T1]{fontenc}\n')
    // a paper set by a Unicode engine keeps its encoding
    expect(strategiesFor({ compiler: 'xelatex' }, 'de')[0]?.pre(null)).not.toContain('fontenc')
  })
  it('readFontProbe reads enc', () => {
    expect(FONT_PROBE).toContain('body=\\familydefault;enc=\\encodingdefault;}}')
    expect(readFontProbe('x\nAXT-FONTS rm=cmr;sf=cmss;tt=cmtt;body=cmr;enc=OT1;\ny')).toEqual({ rm: 'cmr', sf: 'cmss', tt: 'cmtt', body: 'cmr', enc: 'OT1' })
    // a log line TeX wrapped, and a probe of before
    expect(readFontProbe('AXT-FONTS rm=ptm;sf=phv;tt=pcr;body=ptm;en\nc=T1;')?.enc).toBe('T1')
    expect(readFontProbe('AXT-FONTS rm=ptm;sf=phv;tt=pcr;body=ptm;')).toEqual({ rm: 'ptm', sf: 'phv', tt: 'pcr', body: 'ptm' })
  })
})

describe('one table: the TeX path and the layer set a paper in the same files', () => {
  it('every face a strategy names is in FACES', () => {
    const files = new Set(Object.values(FACES).map(f => f.file))
    const probes = [null, probeOf('cmr', 'cmss', 'cmtt', 'OT1'), probeOf('ptm', 'phv', 'pcr'), probeOf('ntxtlf', 'txss', 'txtt'), probeOf('pplx', 'phv', 'fvm'), probeOf('erewhon-TLF'), probeOf('XCharter-TLF'), probeOf('EBGaramond-TLF'), probeOf('LinuxLibertineT-TLF', 'LinuxBiolinumT-TLF', 'zi4'), probeOf('pbk', 'pag', 'pnc')]
    const named = new Set<string>()
    for (const lang of VERIFIED) for (const compiler of ['pdflatex', 'xelatex']) for (const s of strategiesFor({ compiler }, lang)) for (const fonts of probes) {
      for (const m of s.pre(fonts).matchAll(/[\w-]+\.(?:otf|ttf)/g)) named.add(m[0])
    }
    expect([...named].filter(f => !files.has(f))).toEqual([])
    // the CJK faces, the Cyrillic and Latin columns all reached
    for (const f of ['SourceHanSerifSC-Light.otf', 'SourceHanSerifTC-Bold.otf', 'SourceHanSerifK-SemiBold.otf', 'HaranoAjiMincho-Regular.otf', 'NimbusSans-BoldItalic.otf', 'FreeMono.otf', 'cmunbi.otf', 'lmroman10-bolditalic.otf']) expect(named, f).toContain(f)
  })
  it('a CJK type\'s scale multiplies the face\'s own: Korean\'s Hangul at its size, then at the plan\'s', () => {
    const p = paper(), units = p.units as Unit[], para = units.findIndex(u => u.kind === 'para')
    const [ko] = strategiesFor({ compiler: 'pdflatex' }, 'ko')
    if (!ko) throw new Error('no strategy for ko')
    const typeset = typesetting(p.units, { design: DESIGN.Kore, strategy: ko.name, type: { lead: 1, track: 0, scale: 0.97 }, leads: new Map([[para, 1]]), sizes: new Map(), floatsAt: new Map(), tableMin: 0.85 })
    expect(typeset.strategy(ko).pre(probeOf('ptm', 'phv', 'pcr'))).toContain('\\setCJKmainfont[Scale=0.9302,BoldFont=SourceHanSerifK-Bold.otf,BoldFeatures={Scale=0.9448}]{SourceHanSerifK-Regular.otf}')
    const [zh] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
    if (!zh) throw new Error('no strategy for zh')
    const zhTypeset = typesetting(p.units, { design: DESIGN.Hans, strategy: zh.name, type: { lead: 1.3, track: 0, scale: 0.97 }, leads: new Map([[para, 1]]), sizes: new Map(), floatsAt: new Map(), tableMin: 0.85 })
    expect(zhTypeset.strategy(zh).pre(probeOf('ptm', 'phv', 'pcr'))).toContain('\\setCJKmainfont[Scale=0.9700,BoldFont=SourceHanSerifSC-Bold.otf,ItalicFont=FandolKai-Regular.otf]{SourceHanSerifSC-Regular.otf}')
  })
})
