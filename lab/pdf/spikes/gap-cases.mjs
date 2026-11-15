// lab/pdf/spikes/gap-cases.mjs
// The separations the rebuilt prepare's marked compile states (packages/engine/src/marks/marks.ts STATEMENTS_TEX's GAPS_TEX:
// each heading's \@startsection skips, AXT-SECT; the paper's float, caption and footnote separations, AXT-GLUE; read by
// packages/engine/src/marks/channels.ts readHeads, readGlues, and \parskip's shrink by readSkips) under TeX: small documents of
// our own, their units marked by hand as layoutMarking marks them (a heading `\axthmark{h<i>s}…\axthmark{h<i>e}` in its
// argument, a paragraph `\axtlines{<i>}\leavevmode\axtmark{<i>s}…\axtend{<i>e}`), compiled in each pinned TeX Live year's image
// under pdfLaTeX, XeLaTeX, LuaLaTeX and latex (its DVI made a PDF by dvipdfmx, with the DVI marks), twice: with the marked
// original's head as today's reader writes it (MARK_DEF, LAYOUT_TEX, LINES_TEX: `base`) and with STATEMENTS_TEX after LAYOUT_TEX
// (`new`). Held: (1) the two PDFs byte for byte (LuaTeX's trailer /ID masked; and an XMP packet's time stamps and InstanceID,
// the clock's where a class writes its own packet, acmart's under XeLaTeX, with every glyph, box and point then equal one by one):
// the statements set nothing, no glyph, box or point moves; (2) no TeX error; (3) each statement equals TeX's own reading where the document reads it (`\the`, what
// \showthe shows): a heading's before-skip the glue \@startsection hands \addvspace (the document wraps \addvspace to write
// it), its after-skip the \lastskip TeX leaves after a heading on lines of its own, and after a run-in title the horizontal
// skip it leaves once the paragraph begins (the after-skip negated); \baselineskip, \parskip and each separation as the
// document's start writes them; the values in force at each float (the last of each name written at or before its serial) as
// the float's own reading inside it, its serial a float bracket `fs<n>` of the PDF; \parskip's shrink as readSkips reads it;
// (4) the headings each class makes through \@startsection stated, those it makes otherwise (KOMA-Script, titlesec, a
// chapter) not. Exit 1 on a failure.
//   pnpm exec tsx lab/pdf/spikes/gap-cases.mjs [--years=2023,2025] [--engines=pdflatex,xelatex,lualatex,latex] [--only=<case>,…]
//     [--out=<dir>]
// Docker with the years' pinned images (lab/pdf/compile-images.json); no network.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pageInk } from '@readarxiv/engine'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { LINES_TEX } from '../../../packages/engine/src/compile/tex.ts'
import { glueOf, readGlues, readHeads, readSkips } from '../../../packages/engine/src/marks/channels.ts'
import { DVI_LAYOUT_TEX, LAYOUT_TEX, STATEMENTS_TEX } from '../../../packages/engine/src/marks/marks.ts'
import { DVI_MARK_DEF, MARK_DEF } from '../../../packages/engine/src/source/latex-front.ts'
import { checkCompileImage, compileImageRef } from './compile-image.mjs'

const arg = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.slice(name.length + 3) : null
}
const YEARS = (arg('years') ?? '2023,2025').split(',')
const ENGINES = (arg('engines') ?? 'pdflatex,xelatex,lualatex,latex').split(',')
const OUT = resolve(arg('out') ?? join(tmpdir(), `gap-cases-${process.pid}`))

/** a heading of command `cmd` as layoutMarking marks it (unit `i`), then TeX's own readings after it: the vertical \lastskip (a
 *  title on lines of its own: its after-skip) and, once a paragraph begins, the horizontal one (a run-in title's skip) */
const H = (i, cmd, title) =>
  `\\${cmd}` +
  String.raw`{\axthmark{h${i}s}${title}\axthmark{h${i}e}}\message{^^JAXT-SHOW h${i} v \the\lastskip^^J}\leavevmode\message{^^JAXT-SHOW h${i} h \the\lastskip^^J}`
/** a paragraph unit `i` as layoutMarking marks it, with its line probe */
const P = (i, text) => String.raw`\axtlines{${i}}\leavevmode\axtmark{${i}s}${text}\axtend{${i}e}` + '\n\n'
const WORDS = 'we show that the considerably larger model of a results in an experimental setting is'.split(' ')
const prose = (n) => Array.from({ length: n }, (_, k) => WORDS[(k * 7) % WORDS.length]).join(' ')
/** the separations GAPS_TEX states, each with the register TeX holds it in */
const GLUES = [
  ['textfloatsep', '\\textfloatsep'],
  ['floatsep', '\\floatsep'],
  ['intextsep', '\\intextsep'],
  ['dbltextfloatsep', '\\dbltextfloatsep'],
  ['dblfloatsep', '\\dblfloatsep'],
  ['fpsep', '\\@fpsep'],
  ['dblfpsep', '\\@dblfpsep'],
  ['abovecaptionskip', '\\abovecaptionskip'],
  ['belowcaptionskip', '\\belowcaptionskip'],
  ['footins', '\\skip\\footins'],
  ['footnotesep', '\\footnotesep'],
]
/** TeX's reading of every separation, `AXT-SHOW <at> <name> <glue>`, `at` 0 the document's start, `f` inside a float */
const SHOW = (at) =>
  String.raw`\makeatletter` +
  GLUES.map(([n, r]) => String.raw`\ifdefined${r.split('\\').slice(0, 2).join('\\')}\message{^^JAXT-SHOW ${at} ${n} \the${r}^^J}\fi`).join('') +
  String.raw`\makeatother`
/** the document's own readings in its preamble: the glue \@startsection hands \addvspace (a heading's before-skip as TeX adds
 *  it), written each time */
const PRE = String.raw`\makeatletter\let\axt@chkav\addvspace\def\addvspace#1{\message{^^JAXT-SHOW - addv \the\glueexpr#1\relax^^J}\axt@chkav{#1}}\makeatother`
/** a float of environment `env` with its caption unit `i`, `inside` set first in it, and the float's own reading of the
 *  separations at its end */
const F = (env, place, i, inside = '') =>
  String.raw`\begin{${env}}[${place}]${inside}\centering\rule{2cm}{1cm}\caption{\leavevmode\axtmark{${i}s}A caption of ours.\axtend{${i}e}}${SHOW('f')}\end{${env}}` + '\n'
/** the body every case sets: headings of each kind after text, a starred one, floats (one after the paper changed a separation,
 *  one that changes a caption's skip inside itself, one after it), a footnote */
const BODY = [
  `${SHOW(0)}\\message{^^JAXT-SHOW 0 baselineskip \\the\\baselineskip^^J}\\message{^^JAXT-SHOW 0 parskip \\the\\parskip^^J}`,
  P(1, prose(40)),
  H(2, 'section', 'Introduction'),
  P(3, prose(30)),
  H(4, 'subsection', 'A method'),
  P(5, `${prose(30)}\\footnote{\\leavevmode\\axtmark{6s}A note of ours.\\axtend{6e}}`),
  H(7, 'subsubsection', 'Its parts'),
  P(8, prose(30)),
  H(9, 'paragraph', 'A run-in title.'),
  P(10, prose(30)),
  H(11, 'section*', 'Acknowledgments'),
  P(12, prose(30)),
  '\\setlength{\\textfloatsep}{5pt plus 1pt minus 2pt}\n',
  F('figure', 't', 13),
  P(14, prose(40)),
  F('figure', 'h', 15, '\\setlength{\\abovecaptionskip}{3pt}'),
  P(16, prose(40)),
  F('table', 'b', 17),
  P(18, prose(60)),
].join('\n')
/** the headings of BODY, by unit */
const HEADS = [2, 4, 7, 9, 11]
const doc = (cls, pre, body = BODY) => `${cls}\n${pre}\n${PRE}\n\\begin{document}\n${body}\n\\end{document}\n`
/** each case: its document, and the headings TeX makes through \@startsection there (stated), the others not */
const CASES = {
  article: [doc('\\documentclass{article}', ''), HEADS],
  twocolumn: [
    doc(
      '\\documentclass[twocolumn]{article}',
      '',
      `${BODY.replace('\\end{document}', '')}\n${String.raw`\begin{figure*}[t]\centering\rule{8cm}{1cm}\caption{\leavevmode\axtmark{19s}A wide caption.\axtend{19e}}${SHOW('f')}\end{figure*}`}\n${P(20, prose(80))}`,
    ),
    HEADS,
  ],
  hyperref: [doc('\\documentclass{article}', '\\usepackage[colorlinks]{hyperref}'), HEADS],
  report: [doc('\\documentclass{report}', '', `${String.raw`\chapter{\axthmark{h0s}A chapter\axthmark{h0e}}`}\n${BODY}`), HEADS],
  revtex: [doc('\\documentclass[aps,pra]{revtex4-2}', ''), HEADS],
  acmart: [doc('\\documentclass[sigconf]{acmart}', '\\settopmatter{printacmref=false}\\setcopyright{none}'), HEADS],
  ieeetran: [doc('\\documentclass[conference]{IEEEtran}', ''), HEADS],
  amsart: [doc('\\documentclass{amsart}', ''), HEADS],
  llncs: [doc('\\documentclass{llncs}', ''), HEADS],
  koma: [doc('\\documentclass{scrartcl}', ''), []],
  titlesec: [doc('\\documentclass{article}', '\\usepackage{titlesec}'), []],
}
if (arg('only')) for (const k of Object.keys(CASES)) if (!arg('only').split(',').includes(k)) delete CASES[k]

/** the head of the marked original under engine `e`, with the statements or without (`base`): MARK_DEF and LAYOUT_TEX each
 *  followed by its DVI marks under latex, the statements after LAYOUT_TEX, LINES_TEX last, as originalFiles orders them */
const headOf = (e, statements) =>
  `${MARK_DEF}${e === 'latex' ? DVI_MARK_DEF : ''}${LAYOUT_TEX}${e === 'latex' ? DVI_LAYOUT_TEX : ''}${statements ? STATEMENTS_TEX : ''}${LINES_TEX}`

/** the float brackets' serials of a PDF (its points `fs<n>`, pageInk's), in serial order */
async function floatSerials(file) {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 })
  const pdf = await task.promise
  const out = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const pg = await pdf.getPage(n)
    for (const q of pageInk(OPS, await pg.getOperatorList(), pg.commonObjs, { rotate: pg.rotate }).points) {
      const m = /^fs(\d+)$/.exec(q.name)
      if (m) out.push(Number(m[1]))
    }
  }
  await task.destroy()
  return [...new Set(out)].sort((a, b) => a - b)
}
/** the two PDFs' pages as pageInk reads them: every glyph (its character, advance, baseline, size), box and point the same */
async function sameInk(a, b) {
  const pagesOf = async (file) => {
    const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 })
    const pdf = await task.promise
    const out = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const pg = await pdf.getPage(n)
      const ink = pageInk(OPS, await pg.getOperatorList(), pg.commonObjs, { rotate: pg.rotate })
      out.push(JSON.stringify([ink.glyphs.map((g) => [g.u, g.x0, g.x1, g.y, g.size]), [...ink.boxes], ink.points]))
    }
    await task.destroy()
    return out
  }
  const [x, y] = [await pagesOf(a), await pagesOf(b)]
  return x.length === y.length && x.every((p, k) => p === y[k])
}
const near = (a, b) => !!a && !!b && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6
const show = (g) => (g ? `${g[0].toFixed(5)}/${g[1].toFixed(5)}` : 'none')

let bad = 0
const counts = {}
for (const year of YEARS) {
  const image = compileImageRef(process.env, year)
  await checkCompileImage(image, [])
  const dir = join(OUT, year)
  rmSync(dir, { recursive: true, force: true })
  for (const h of ['base', 'new'])
    for (const e of ENGINES)
      for (const [name, [src]] of Object.entries(CASES)) {
        mkdirSync(join(dir, `${h}-${e}-${name}`), { recursive: true })
        writeFileSync(join(dir, `${h}-${e}-${name}`, 'main.tex'), `${headOf(e, h === 'new')}${src}`)
      }
  // (two passes each, the date fixed, so that the two heads' PDFs can be compared byte for byte; each pass at most 120 s)
  const pass = (e) =>
    `timeout 120 ${e} -interaction=nonstopmode main.tex >/dev/null 2>&1${e === 'latex' ? '; dvipdfmx -q main.dvi >/dev/null 2>&1' : ''}`
  writeFileSync(join(dir, 'run.sh'), `${ENGINES.map((e) => `for d in *-${e}-*/; do (cd "$d" && ${pass(e)}; ${pass(e)}); done`).join('\n')}\ntrue\n`)
  execFileSync(
    'docker',
    ['run', '--rm', '--network', 'none', '-e', 'SOURCE_DATE_EPOCH=1700000000', '-e', 'FORCE_SOURCE_DATE=1', '-v', `${dir}:/work`, '-w', '/work', image, 'sh', 'run.sh'],
    { stdio: 'ignore', timeout: 3_600_000 },
  )
  for (const e of ENGINES)
    for (const [name, [src, stated]] of Object.entries(CASES)) {
      const at = join(dir, `new-${e}-${name}`)
      const base = join(dir, `base-${e}-${name}`)
      const faults = []
      const notes = []
      if (!existsSync(join(at, 'main.log'))) {
        console.log(`FAIL ${year} ${e} ${name}: no log`)
        bad++
        continue
      }
      const log = readFileSync(join(at, 'main.log'), 'latin1')
      const baseLog = existsSync(join(base, 'main.log')) ? readFileSync(join(base, 'main.log'), 'latin1') : ''
      const errors = (log.match(/^! .*$/gm) ?? []).slice(0, 3)
      const baseErrors = (baseLog.match(/^! .*$/gm) ?? []).slice(0, 3)
      // (the class's own error under this engine, the base's alike: reported, not ours)
      if (errors.length && errors.join('|') !== baseErrors.join('|')) faults.push(`TeX: ${errors.join(' | ')}`)
      else if (errors.length) notes.push(`the base's own errors too: ${errors[0]}`)
      // (1) the PDFs byte for byte
      const a = join(base, 'main.pdf')
      const b = join(at, 'main.pdf')
      // (LuaTeX's trailer /ID is made of the output's path, which the two directories differ by; an XMP packet's time stamps and
      // the InstanceID made of them, the clock's where a class writes its own packet (acmart's under XeLaTeX: SOURCE_DATE_EPOCH
      // does not reach it): masked, and the pages' glyphs, boxes and points then held equal one by one)
      const raw = (f) => readFileSync(f, 'latin1').replace(/\/ID \[ ?<[0-9A-Fa-f]+> ?<[0-9A-Fa-f]+> ?\]/g, '/ID []')
      const xmp = (t) =>
        t.replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)?/g, 'T').replace(/uuid:[0-9a-f-]{36}/g, 'uuid:')
      let same
      if (!existsSync(a) || !existsSync(b)) {
        same = 'no PDF'
        if (!errors.length) faults.push('no PDF')
      } else if (raw(a) === raw(b)) same = 'PDF the same'
      else if (xmp(raw(a)) === xmp(raw(b)) && (await sameInk(a, b))) same = 'PDF the same but its XMP time stamps; every glyph, box and point the same'
      else {
        same = 'PDF DIFFERS'
        faults.push('the PDF with the statements differs from the one without')
      }
      // (3) each heading's statement against TeX's own readings
      const heads = readHeads(log)
      const shows = [...log.matchAll(/^AXT-SHOW (\S+) (\S+) (.*)$/gm)].map((m) => ({ at: m[1], name: m[2], glue: m[3], index: m.index }))
      const start = Object.fromEntries(shows.filter((s) => s.at === '0').map((s) => [s.name, glueOf(s.glue)]))
      let checked = 0
      // (every heading the document marks: those of BODY and a chapter's)
      const ids = [...new Set([...src.matchAll(/\\axthmark\{h(\d+)s\}/g)].map((m) => Number(m[1])))]
      for (const i of ids) {
        const hs = heads.get(i)
        if (!stated.includes(i)) {
          if (hs) faults.push(`h${i}: stated where TeX made it through no \\@startsection`)
          continue
        }
        if (!hs) {
          faults.push(`h${i}: not stated`)
          continue
        }
        // (its before-skip as TeX adds it: the last glue \@startsection handed \addvspace before the heading's statement)
        const first = log.search(new RegExp(`^AXT-SECT h${i}s `, 'm'))
        const addv = shows.filter((s) => s.name === 'addv' && s.index < first).at(-1)
        const added = hs.before[0] < 0 ? [-hs.before[0], -hs.before[1]] : hs.before
        if (addv && !near(added, glueOf(addv.glue))) faults.push(`h${i} before: ${show(added)}, TeX's ${show(glueOf(addv.glue))}`)
        if (!addv) notes.push(`h${i}: no \\addvspace read`)
        // (its after-skip: a title on lines of its own, TeX's \lastskip after it; run in, the skip after its title)
        const v = shows.find((s) => s.at === `h${i}` && s.name === 'v')
        const hz = shows.find((s) => s.at === `h${i}` && s.name === 'h')
        if (hs.after[0] > 0) {
          if (!near(hs.after, glueOf(v?.glue ?? ''))) faults.push(`h${i} after: ${show(hs.after)}, TeX's ${show(glueOf(v?.glue ?? ''))}`)
        } else if (!near([-hs.after[0], -hs.after[1]].map((x) => x || 0), glueOf(hz?.glue ?? '')))
          faults.push(`h${i} run-in: ${show([-hs.after[0], -hs.after[1]])}, TeX's ${show(glueOf(hz?.glue ?? ''))}`)
        if (!near([hs.baselineskip, 0], [start.baselineskip?.[0] ?? Number.NaN, 0])) faults.push(`h${i} \\baselineskip`)
        if (!near(hs.parskip, start.parskip)) faults.push(`h${i} \\parskip: ${show(hs.parskip)}, TeX's ${show(start.parskip)}`)
        checked++
      }
      // (the separations: at the document's start, and in force at each float as the float reads them)
      const glues = readGlues(log)
      for (const [n] of GLUES) {
        const s0 = glues.find((g) => g.at === 0 && g.name === n)
        if (start[n] === undefined) {
          if (s0) faults.push(`${n}: stated, the class defines none`)
          continue
        }
        if (start[n] && !near([s0?.natural, s0?.shrink], start[n])) faults.push(`${n} at the start: ${show(s0 && [s0.natural, s0.shrink])}, TeX's ${show(start[n])}`)
      }
      const inFloats = []
      for (const s of shows.filter((x) => x.at === 'f')) {
        const k = inFloats.findIndex((f) => !f.has(s.name))
        if (k < 0) inFloats.push(new Map([[s.name, glueOf(s.glue)]]))
        else inFloats[k].set(s.name, glueOf(s.glue))
      }
      const serials = existsSync(b) ? await floatSerials(b) : []
      for (const g of glues) if (g.at > 0 && !serials.includes(g.at)) faults.push(`AXT-GLUE at ${g.at}: no float bracket fs${g.at}`)
      inFloats.forEach((f, k) => {
        const serial = serials[k]
        if (serial === undefined) return void faults.push(`float ${k + 1}: no bracket`)
        for (const [n, v] of f) {
          const last = glues.filter((g) => g.name === n && g.at <= serial).at(-1)
          if (v && !near(last && [last.natural, last.shrink], v)) faults.push(`float ${k + 1} (fs${serial}) ${n}: ${show(last && [last.natural, last.shrink])}, TeX's ${show(v)}`)
        }
      })
      // (\parskip's shrink as readSkips reads it, at the first paragraph)
      const sk = readSkips(log).get(1)
      if (start.parskip && (!sk || Math.abs((sk[2] ?? Number.NaN) - start.parskip[1]) > 1e-6)) faults.push(`\\parskip's shrink: ${sk?.[2]}, TeX's ${start.parskip[1]}`)
      const restated = glues.filter((g) => g.at > 0).map((g) => `${g.name}@fs${g.at}`)
      counts[`${year} ${e}`] ??= { ok: 0, fail: 0 }
      counts[`${year} ${e}`][faults.length ? 'fail' : 'ok']++
      if (faults.length) bad++
      console.log(
        `${faults.length ? 'FAIL' : 'ok  '} ${year} ${e} ${name}: ${same}; headings stated ${heads.size} (checked ${checked}); restated ${restated.join(',') || 'none'}${notes.length ? `; ${notes.join('; ')}` : ''}${faults.length ? `; ${faults.slice(0, 8).join('; ')}${faults.length > 8 ? ` (+${faults.length - 8})` : ''}` : ''}`,
      )
    }
}
for (const [k, v] of Object.entries(counts)) console.log(`${k}: ${v.ok} ok, ${v.fail} FAIL`)
console.log(`the documents and their logs: ${OUT}`)
process.exit(bad ? 1 : 0)
