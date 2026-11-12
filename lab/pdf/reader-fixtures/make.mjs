// lab/pdf/reader-fixtures/make.mjs: the reader's committed fixtures (packages/reader/e2e/fixtures/<paper>/), papers of our own
// (CC0) made here. Not shipped.
//
// Each paper is written with pdf-lib in the standard fonts (PDF.js draws them from its own Liberation data, which the reader's
// build serves, so the translation's face is metric for metric the original's), one show a run, some lines holding two units in
// one TJ show (TeX's run-in heads: the wrap splits the show at the unit's edge, the split residue's case), with an element that
// travels (a formula in Times-Italic), labels, a footnote, a landscape page, a URI link and a link inside the paper. Its
// instrument is stated by the maker (B = A: each run's glyphs its unit's, in their role), so that the bundle is lane L1's own
// back half (`prepareBack`) over it: head, units, parts and the add-on, as the prepare makes them.
//
// Each link is stated as TeX's hyperref makes it, never as an annotation over a bare word (a shape TeX never gives, which the
// typesetter drops as no group or element of the unit's: packages/typeset lay/links.ts `unmatched`): a URI link over the word
// an `\href` group sets (the unit's span piece, its open and close the source's, and its SpanAt: the command and the target,
// as the instrument states a group's, SpanClass), the translation carrying the group round its word; a link inside the paper
// over the number a `\ref` element sets (a reference, class `num`, command `ref`), which the translation carries as it carries
// any element; a URI link round a figure's frame, ink no unit owns (`\href` round an `\includegraphics`), which stays at its
// box. The reader's browser check judges each one's fate as the typesetter lays it (packages/reader/e2e/run.mjs).
//
// The translation is the original's words, each written backwards (the same letters: the same width in the same face), with a
// word put before some units' text so that their elements move; its rows are the translate package's Result shape. The
// reader dump (readarxiv-lab-data/refactor-2026-11/baseline/FORMAT.md §4) is laid by a greedy breaker over Helvetica's widths on
// the member's own lines, then the room below, the size stepped down to fit: the stand-in of lane L3's typesetter, which the
// reader's converter turns into `Page`s exactly as it turns the baseline's own dumps.
//   node --import tsx lab/pdf/reader-fixtures/make.mjs [--check] [--only=<paper>]
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { ROLE, prepareBack, readPdf, unitId } from '@readarxiv/engine'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const OUT = join(ROOT, 'packages/reader/e2e/fixtures')
const NM = join(ROOT, 'node_modules/pdfjs-dist/')
const pdfjs = { getDocument, OPS }
const pdfOptions = { standardFontDataUrl: `${NM}standard_fonts/`, cMapUrl: `${NM}cmaps/`, cMapPacked: true, verbosity: 0 }
const deflate = b => new Uint8Array(deflateSync(b)), inflate = (b, l) => new Uint8Array(inflateSync(b, { maxOutputLength: l + 1 }))
const sha = b => createHash('sha256').update(b).digest('hex')
const r2 = v => Math.round(v * 100) / 100

// ---------------------------------------------------------------- the papers
const LOREM = 'reading a paper in two languages side by side keeps every figure formula and reference where its author set it while the words change into the language of the reader one paragraph at a time and the pages stay the pages of the original document'.split(' ')
/** n words of the text from word k on */
const words = (n, k = 0) => Array.from({ length: n }, (_, i) => LOREM[(k + i) % LOREM.length]).join(' ')

/** a paper: pages of blocks; a block is a unit set in lines over its width (`w`) from (x, y) down, each run a show */
const PAPERS = {
  's1-columns': {
    id: '2600.00002', version: 1,
    pages: [
      { size: [612, 792], blocks: [
        { u: 'title', kind: 'heading', font: 'HB', size: 16, x: 72, y: 720, w: 468, text: 'Synthetic Pages for a Bilingual Reader' },
        { u: 'abstract', kind: 'abstract', size: 10, x: 92, y: 690, w: 428, lead: 12, text: words(46, 3) },
        { u: 'h1', kind: 'heading', font: 'HB', size: 12, x: 72, y: 600, w: 228, label: '1', text: 'Introduction' },
        { u: 'p1', kind: 'para', size: 10, x: 72, y: 582, w: 228, lead: 12, text: words(70, 7), el: { at: 22, s: 'f(x)=x+1', src: '$f(x)=x+1$' }, link: { word: 31, url: 'https://example.invalid/reader' } },
        { u: 'p2', kind: 'para', size: 10, x: 72, y: 430, w: 228, lead: 12, text: words(60, 19) },
        { u: 'h2', kind: 'heading', font: 'HB', size: 12, x: 312, y: 600, w: 228, label: '2', text: 'Method' },
        { u: 'p3', kind: 'para', size: 10, x: 312, y: 582, w: 228, lead: 12, runIn: { u: 'r3', text: 'Pages.' }, text: words(64, 11), el: { at: 40, s: 'g(y)', src: '$g(y)$' }, ref: { at: 52, s: '3', src: '\\ref{sec:landscape}', page: 2 } },
        { u: 'p4', kind: 'para', size: 10, x: 312, y: 420, w: 228, lead: 12, text: words(52, 29) },
        { u: 'fn1', kind: 'footnote', size: 8, x: 72, y: 90, w: 468, lead: 9.6, label: '1', text: words(30, 5) },
      ] },
      { size: [792, 612], blocks: [
        { u: 'h3', kind: 'heading', font: 'HB', size: 12, x: 72, y: 540, w: 648, label: '3', text: 'A Landscape Page' },
        { u: 'p5', kind: 'para', size: 10, x: 72, y: 520, w: 648, lead: 12, runIn: { u: 'r5', text: 'Wide.' }, text: words(90, 2), el: { at: 50, s: 'h(z)=2z', src: '$h(z)=2z$' } },
        { u: 'p6', kind: 'para', size: 10, x: 72, y: 400, w: 648, lead: 12, text: words(70, 23) },
        // (a figure, a frame of no text, that links out: \href round an \includegraphics; no unit owns its ink)
        { figure: [120, 190, 672, 330], href: 'https://example.invalid/figure' },
        { u: 'cap1', kind: 'caption', size: 9, x: 120, y: 160, w: 552, lead: 10.8, label: 'Figure 1:', text: words(24, 9) },
      ] },
    ],
  },
  's2-splits': {
    id: '2600.00003', version: 1,
    pages: [
      { size: [612, 792], blocks: [
        { u: 'h1', kind: 'heading', font: 'HB', size: 14, x: 72, y: 720, w: 468, text: 'Shows Cut by Units' },
        ...Array.from({ length: 8 }, (_, i) => ({ u: `p${i}`, kind: 'para', size: 10, x: 72, y: 690 - i * 76, w: 468, lead: 12, runIn: { u: `r${i}`, text: `Case ${i + 1}.` }, kern: [-333.3333333, -250.123456789, -1.3563368056, -120][i % 4], text: words(48, i * 5) })),
      ] },
    ],
  },
  // pages turned a quarter by /Rotate, their content set upright in their own space (the viewer shows it turned): the
  // maintainer's B-408, a laid page drawn turned with its page
  's3-turned': {
    id: '2600.00004', version: 1,
    note: 'Its pages are turned a quarter by /Rotate (90, then 270), their content set upright in their own space. Lane L1\'s\nreading lays over no turned page, so the maker states its reading: A read with the turn not seen (`upright` in make.mjs),\nits bytes keeping their /Rotate; the bundle is `prepareBack` over that reading.\n',
    pages: [
      { size: [612, 792], rotate: 90, blocks: [
        { u: 'title', kind: 'heading', font: 'HB', size: 14, x: 72, y: 720, w: 468, text: 'A Page Turned a Quarter' },
        { u: 'h1', kind: 'heading', font: 'HB', size: 12, x: 72, y: 690, w: 468, label: '1', text: 'Turned' },
        { u: 'p1', kind: 'para', size: 10, x: 72, y: 672, w: 468, lead: 12, text: words(80, 4), el: { at: 30, s: 'k(t)=3t', src: '$k(t)=3t$' }, link: { word: 42, url: 'https://example.invalid/turned' } },
        { u: 'p2', kind: 'para', size: 10, x: 72, y: 560, w: 468, lead: 12, runIn: { u: 'r2', text: 'Quarter.' }, text: words(60, 17) },
        { u: 'cap1', kind: 'caption', size: 9, x: 120, y: 200, w: 372, lead: 10.8, label: 'Table 1:', text: words(22, 8) },
      ] },
      { size: [612, 792], rotate: 270, blocks: [
        { u: 'h2', kind: 'heading', font: 'HB', size: 12, x: 72, y: 720, w: 468, label: '2', text: 'Turned the Other Way' },
        { u: 'p3', kind: 'para', size: 10, x: 72, y: 700, w: 468, lead: 12, text: words(70, 13), el: { at: 21, s: 'm(u)=u+2', src: '$m(u)=u+2$' } },
      ] },
    ],
  },
}

/** PDF.js as the maker reads a paper whose pages are turned: each page in its own space, its /Rotate not seen. Lane L1's
 *  reading lays over no turned page (packages/engine ink.mjs `rotated`), so that such a page has no part; read upright, its
 *  content set upright in its own space is laid in that space, and the reader turns the laid page with its page. The paper's
 *  bytes keep their /Rotate: only the reading is told 0 (read.ts takes nothing else of the turn from PDF.js) */
const upright = {
  OPS,
  getDocument(src) {
    const bound = (o, k) => {
      const v = Reflect.get(o, k, o)
      return typeof v === 'function' ? v.bind(o) : v
    }
    const pageOf = page => new Proxy(page, { get: (p, k) => (k === 'rotate' ? 0 : bound(p, k)) })
    const docOf = doc => new Proxy(doc, { get: (d, k) => (k === 'getPage' ? async n => pageOf(await d.getPage(n)) : bound(d, k)) })
    const task = getDocument(src)
    return new Proxy(task, { get: (t, k) => (k === 'promise' ? t.promise.then(docOf) : bound(t, k)) })
  },
}
const readingOf = paper => (paper.pages.some(p => p.rotate) ? upright : pdfjs)

// ---------------------------------------------------------------- writing a paper: shows, ownership, lines
const FONTS = { H: PL.StandardFonts.Helvetica, HB: PL.StandardFonts.HelveticaBold, TI: PL.StandardFonts.TimesRomanItalic }

/** a PDF string literal */
const lit = s => `(${s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`

async function write(paper) {
  const doc = await PL.PDFDocument.create()
  // (no date of today in the file: the same paper gives the same bytes)
  doc.setCreationDate(new Date(0))
  doc.setModificationDate(new Date(0))
  doc.setProducer('readarxiv reader fixtures')
  doc.setCreator('lab/pdf/reader-fixtures/make.mjs')
  const fonts = {}
  for (const [k, f] of Object.entries(FONTS)) fonts[k] = await doc.embedFont(f)
  const units = new Map() // name → { kind, pieces: [], index }
  const shows = [] // per page: [{ segs: [{ unit, role, piece, n }] }]
  const pageRefs = []
  const annots = [] // [page, rect, action]
  for (const pg of paper.pages) {
    const page = doc.addPage(pg.size)
    if (pg.rotate) page.setRotation(PL.degrees(pg.rotate))
    pageRefs.push(page.ref)
    for (const [k, f] of Object.entries(fonts)) page.node.setFontDictionary(PL.PDFName.of(k), f.ref)
    shows.push([])
  }
  // (`flat`: the next piece's id, its place in the unit as the front end counts it: a text piece, an element, a group's open and
  // its close one place each, a group's content between; `spans` and `classes` what the instrument states of its groups and
  // elements, by piece id)
  const unitOf = (name, kind) => {
    if (!units.has(name)) units.set(name, { name, kind, pieces: [], labels: '', flat: 0, spans: [], classes: [] })
    return units.get(name)
  }
  const streams = paper.pages.map(() => [])
  paper.pages.forEach((pg, p) => {
    const out = streams[p], S = shows[p]
    for (const b of pg.blocks) {
      if (b.figure) {
        // (its frame stroked, no glyph: hyperref's annotation over the graphic's box)
        const [x0, y0, x1, y1] = b.figure
        out.push(`q 0.5 w ${x0} ${y0} ${x1 - x0} ${y1 - y0} re S Q`)
        annots.push([p, b.figure, { url: b.href }])
        continue
      }
      const font = b.font ?? 'H', size = b.size
      const unit = unitOf(b.u, b.kind)
      const runIn = b.runIn ? unitOf(b.runIn.u, 'heading') : null
      // the tokens: a label, a run-in head, the words, an element among them
      const toks = []
      if (b.label) toks.push({ s: b.label, unit, role: 'label', font: 'HB' })
      if (runIn) toks.push({ s: b.runIn.text, unit: runIn, role: 'text', font: 'HB', runIn: true })
      b.text.split(' ').forEach((w, i) => {
        if (b.el && i === b.el.at) toks.push({ s: b.el.s, unit, role: 'element', font: 'TI', el: b.el })
        // (a \ref: the number it sets, in the text's face, an element of its own)
        if (b.ref && i === b.ref.at) toks.push({ s: b.ref.s, unit, role: 'element', font, el: { ...b.ref, kind: 'ref' }, ref: b.ref })
        toks.push({ s: w, unit, role: 'text', font, word: i, ...(b.link && i === b.link.word ? { link: b.link.url } : {}) })
      })
      // the lines: greedy over the width, each line's tokens left to right
      let line = [], width = 0
      const ls = []
      for (const t of toks) {
        const tw = fonts[t.font].widthOfTextAtSize(t.s, size), sp = fonts.H.widthOfTextAtSize(' ', size)
        if (line.length && width + sp + tw > b.w) { ls.push(line); line = []; width = 0 }
        t.dx = line.length ? width + sp : 0
        width = t.dx + tw
        line.push(t)
      }
      if (line.length) ls.push(line)
      ls.forEach((l, i) => {
        const y = b.y - i * (b.lead ?? size * 1.2)
        // one show a run of tokens of one font and unit; a run-in head and the text after it on one line: one TJ (a split)
        let run = null
        const flush = () => { if (run) { emit(run); run = null } }
        const emit = r => {
          const segs = r.parts.map(q => ({ unit: q.unit, role: q.role, piece: q.piece ?? null, n: q.text.length }))
          S.push({ segs })
          const tj = r.parts.length > 1 ? `[${r.parts.map((q, j) => (j ? `${b.kern ?? -250} ` : '') + lit(q.text)).join(' ')}] TJ` : `${lit(r.parts[0].text)} Tj`
          out.push(`BT /${r.font} ${size} Tf ${r2(r.x)} ${r2(y)} Td ${tj} ET`)
        }
        for (const t of l) {
          const x = b.x + t.dx
          const piece = t.el ? addEl(t.unit, t.el) : null
          if (t.role === 'text') addText(t.unit, t.s, t.link)
          if (t.role === 'label') t.unit.labels += t.s
          const sameRun = run && run.font === t.font && run.unit === t.unit && run.role === t.role && t.role === 'text'
          // (the run-in head and its text: two units in one show, the TJ's kern between them)
          const splitRun = run && b.runIn && run.parts.at(-1).runIn && t.font === run.font && !t.runIn
          if (sameRun) { const last = run.parts.at(-1); last.text += ` ${t.s}` }
          else if (splitRun) run.parts.push({ unit: t.unit, role: t.role, text: ` ${t.s}`, runIn: false })
          else { flush(); run = { font: t.font, unit: t.unit, role: t.role, x, parts: [{ unit: t.unit, role: t.role, piece, text: t.s, runIn: !!t.runIn }] } }
          // (hyperref's annotations: over the \href group's word, over the number the \ref sets)
          if (t.link) annots.push([p, [x, y - 2, x + fonts[t.font].widthOfTextAtSize(t.s, size), y + size * 0.8], { url: t.link }])
          if (t.ref) annots.push([p, [x, y - 2, x + fonts[t.font].widthOfTextAtSize(t.s, size), y + size * 0.8], { page: t.ref.page }])
          // (an element is its own run, then the text after it a new one)
          if (t.el) flush()
        }
        flush()
      })
    }
  })
  // (the units' content: a unit's text pieces between its elements and groups; its id by its content)
  function addText(u, s, url) {
    const last = u.pieces.at(-1)
    if (url) {
      // (an \href group round the word: the space before it the text's, the group's content the word; its open and close the
      // source's, its command and target what the instrument states of it)
      if (last?.t === 'text') last.s += ' '
      else if (u.pieces.length) {
        u.pieces.push({ t: 'text', s: ' ' })
        u.flat++
      }
      const id = String(u.flat)
      u.pieces.push({ t: 'span', id, style: 'link', open: `\\href{${url}}{`, close: '}', content: [{ t: 'text', s }] })
      u.flat += 3
      u.spans.push([id, { cmd: 'href', to: { url } }])
      return
    }
    if (last?.t === 'text') last.s += ` ${s}`
    else {
      u.pieces.push({ t: 'text', s: u.pieces.length ? ` ${s}` : s })
      u.flat++
    }
  }
  function addEl(u, el) {
    const id = String(u.flat++)
    u.pieces.push({ t: 'el', id, kind: el.kind ?? 'math', src: el.src })
    // (a reference: a number, its command the source's)
    if (el.kind === 'ref') u.classes.push([id, { cls: 'num', cmd: 'ref' }])
    // (the text after it starts with its space)
    return Number(id)
  }
  paper.pages.forEach((_, p) => {
    const page = doc.getPage(p)
    page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.flateStream(streams[p].join('\n'))))
  })
  for (const [p, rect, to] of annots) {
    const A = to.url ? { Type: 'Action', S: 'URI', URI: PL.PDFString.of(to.url) } : null
    const dict = { Type: 'Annot', Subtype: 'Link', Rect: rect.map(r2), Border: [0, 0, 0] }
    if (A) dict.A = A
    else dict.Dest = [pageRefs[to.page - 1], PL.PDFName.of('XYZ'), 72, paper.pages[to.page - 1].size[1] - 40, null]
    const ref = doc.context.register(doc.context.obj(dict))
    const page = doc.getPage(p)
    const arr = page.node.lookup(PL.PDFName.of('Annots'))
    if (arr) arr.push(ref)
    else page.node.set(PL.PDFName.of('Annots'), doc.context.obj([ref]))
  }
  const bytes = await doc.save({ useObjectStreams: false })
  return { bytes, units: [...units.values()], shows }
}

/** the instrument of A itself: each show's glyphs owned by its segments, in order (A read as `reading` reads it) */
async function instrumentOf(bytes, written, reading = pdfjs) {
  const r = await readPdf(reading, bytes, { options: pdfOptions, turned: true })
  const index = new Map(written.units.map((u, i) => [u, i]))
  const units = written.units.map(u => {
    const content = u.pieces.length ? u.pieces : [{ t: 'text', s: u.labels }]
    return { id: unitId(u.kind, content), kind: u.kind, content, ...(u.spans.length ? { spans: u.spans } : {}), ...(u.classes.length ? { classes: u.classes } : {}) }
  })
  const glyphs = r.doc.pages.map((pg, p) => {
    const O = { unit: new Int32Array(pg.glyphs.length).fill(-1), role: new Uint8Array(pg.glyphs.length), piece: new Int32Array(pg.glyphs.length).fill(-1) }
    const byShow = new Map()
    pg.glyphs.forEach((g, j) => (byShow.get(g.n) ?? byShow.set(g.n, []).get(g.n)).push(j))
    const S = written.shows[p]
    if (byShow.size !== S.length) throw new Error(`page ${p + 1}: ${byShow.size} shows read, ${S.length} written`)
    ;[...byShow.keys()].sort((a, b) => a - b).forEach((n, i) => {
      const js = byShow.get(n).sort((a, b) => pg.glyphs[a].k - pg.glyphs[b].k)
      const segs = S[i].segs
      if (segs.reduce((a, s) => a + s.n, 0) !== js.length) throw new Error(`page ${p + 1} show ${i}: ${js.length} glyphs, ${segs.reduce((a, s) => a + s.n, 0)} characters`)
      let at = 0
      for (const s of segs) {
        for (let q = 0; q < s.n; q++, at++) {
          const j = js[at]
          O.unit[j] = index.get(s.unit)
          O.role[j] = s.role === 'element' ? ROLE.element : s.role === 'label' ? ROLE.label : ROLE.text
          if (s.piece !== null) O.piece[j] = s.piece
        }
      }
    })
    return O
  })
  const none = n => ({ unit: new Int32Array(n).fill(-1), role: new Uint8Array(n), piece: new Int32Array(n).fill(-1) })
  return { ink: r.doc, units, glyphs, boxes: r.doc.pages.map(pg => none(pg.kinds.length)), turned: r.doc.pages.map(pg => none(pg.turned?.length ?? 0)), tex: {}, made: { compiler: 'pdf-lib', tree: '', front: 'reader-fixtures' } }
}

// ---------------------------------------------------------------- the translation and its dump
const backwards = s => s.split(/(\s+)/).map(w => (/\s/.test(w) ? w : [...w].reverse().join(''))).join('')
/** the translation of a unit: its text pieces written backwards, its elements where they are, its groups round their text's
 *  translation; a word put first in some units */
function translationOf(unit, k) {
  const of = (ps, top) =>
    ps.flatMap((p, i) =>
      p.t === 'text'
        ? [{ t: 'text', s: (top && i === 0 && k % 3 === 1 ? 'Zur ' : '') + backwards(p.s) }]
        : p.t === 'el'
          ? [{ t: 'el', id: p.id }]
          : p.t === 'span'
            ? [{ t: 'span', id: p.id, content: of(p.content, false) }]
            : [],
    )
  return of(unit.content, true)
}

/** the dump's lines of one member laid: its tokens (words, its elements' widths) broken greedily over its own lines' measures
 *  (then lines below them at its lead, within its room), at its size or the first of 95 % steps that fits */
function layMember(m, row, els, widthOf) {
  const toks = []
  const walk = ps => {
    for (const p of ps) {
      if (p.t === 'text') for (const w of p.s.split(' ').filter(Boolean)) toks.push({ w })
      else if (p.t === 'el') { const e = els.get(p.id); const ink = e?.ink?.[0]; if (ink) toks.push({ el: p.id, ink }) }
      else if (p.t === 'span') walk(p.content)
    }
  }
  walk(row.content)
  const lines = m.lines.filter(l => l[0] === m.lines[0][0])
  const page = lines[0][0]
  for (let k = 1; k >= 0.7; k -= 0.05) {
    const size = r2(m.style.size * k), lead = r2(m.lead * k), sp = widthOf(' ', size)
    const out = []
    let li = 0, line = [], x = null
    const slot = i => (i < lines.length ? { base: lines[i][4], m0: lines[i][7], m1: lines[i][8] } : { base: r2(lines.at(-1)[4] - (i - lines.length + 1) * lead), m0: lines.at(-1)[7], m1: lines.at(-1)[8] })
    let ok = true
    for (const t of toks) {
      const tw = t.el ? r2(t.ink[3] - t.ink[1]) : widthOf(t.w, size)
      let s = slot(li)
      if (x === null) x = s.m0 + (li === 0 && m.label ? r2(m.label.ink[3] - m.label.ink[1] + sp) : 0)
      if (line.length && x + sp + tw > s.m1 + 0.01) {
        out.push({ ...s, items: line })
        li++
        s = slot(li)
        line = []
        x = s.m0
      }
      const at = line.length ? x + sp : x
      line.push(t.el ? { el: t.el, x: r2(at), ink: t.ink } : { w: t.w, x: r2(at) })
      x = at + tw
    }
    if (line.length) out.push({ ...slot(li), items: line })
    const last = out.at(-1)
    if (last && last.base < lines.at(-1)[4] - (m.room.below ?? 0) + 0.01 - 0.0001 && out.length > lines.length) ok = false
    if (!ok) continue
    return { page, size, lead: r2(lead / m.lead), lines: out }
  }
  return null
}

async function make(name, paper) {
  const written = await write(paper)
  const reading = readingOf(paper)
  const ins = await instrumentOf(written.bytes, written, reading)
  const dir = join(OUT, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'bundle'), { recursive: true })
  writeFileSync(join(dir, 'arxiv.pdf'), written.bytes)
  let head = null, tally = null
  for await (const x of prepareBack(ins, written.bytes, { pdfjs: reading, pdfOptions, PL, deflate, inflate, paper: { id: paper.id, version: paper.version }, made: `reader-fixtures ${name}` })) {
    if (x.kind === 'tally') { tally = x; continue }
    writeFileSync(join(dir, 'bundle', `${x.digest}.${x.kind}`), x.bytes)
    if (x.kind === 'head') { head = x.head; writeFileSync(join(dir, 'bundle', 'head.json'), `${JSON.stringify(head)}\n`) }
  }
  if (!head) throw new Error(`${name}: no head (${JSON.stringify(tally?.wrap)})`)
  // the rows: every unit's translation; the dump: each laid member of each part
  const rows = ins.units.map((u, k) => ({ id: u.id, ok: true, content: translationOf(u, k), by: 'reader-fixtures' }))
  writeFileSync(join(dir, 'de.rows.json'), `${JSON.stringify({ format: 1, rows })}\n`)
  const rowOf = new Map(rows.map(r => [r.id, r]))
  const font = await (await PL.PDFDocument.create()).embedFont(PL.StandardFonts.Helvetica)
  const widthOf = (s, size) => r2(font.widthOfTextAtSize(s, size))
  const dumpUnits = [], notLaid = []
  head.parts.forEach((ref, i) => {
    if (!ref) return
    const part = JSON.parse(readFileSync(join(dir, 'bundle', `${ref}.part`), 'utf8'))
    for (const flow of part.flows) for (const m of flow) {
      if (typeof m.text !== 'string' || m.lines[0]?.[0] !== part.page || m.why) continue
      const row = rowOf.get(m.text)
      const laid = row && layMember(m, row, new Map(m.els ?? []), widthOf)
      if (!laid) { notLaid.push({ id: m.text, ord: m.ord, kind: m.kind, why: row ? 'unfit' : 'none' }); continue }
      const text = l => l.items.map(it => (it.el ? '￼' : it.w)).join(' ')
      dumpUnits.push({
        id: m.text, ord: m.ord, kind: m.kind, size: laid.size, leading: laid.lead,
        lines: laid.lines.map(l => ({ page: laid.page, x0: l.items[0].x, x1: r2(l.items.at(-1).x + (l.items.at(-1).el ? l.items.at(-1).ink[3] - l.items.at(-1).ink[1] : widthOf(l.items.at(-1).w, laid.size))), baseline: l.base, text: text(l) })),
        elements: laid.lines.flatMap(l => l.items.filter(it => it.el).map(it => ({ k: Number(it.el), page: laid.page, x0: it.x, x1: r2(it.x + it.ink[3] - it.ink[1]), top: r2(l.base + it.ink[4] - it.ink[5]), bottom: r2(l.base - (it.ink[5] - it.ink[2])) }))),
      })
    }
  })
  const dump = { format: 'readarxiv-baseline/reader 1', paper: { id: paper.id, version: paper.version, pages: paper.pages.length }, target: 'de', translation: { from: 'reader-fixtures', count: rows.length }, config: { lay: 'reader-fixtures greedy breaker over Helvetica' }, units: dumpUnits, left: [], notLaid, figures: [], names: [] }
  writeFileSync(join(dir, 'de.reader.json'), `${JSON.stringify(dump)}\n`)
  writeFileSync(join(dir, 'README.md'), `# ${name}\n\nA paper of our own (CC0 1.0), made by \`lab/pdf/reader-fixtures/make.mjs\`: \`arxiv.pdf\` the stand-in of arXiv's PDF,\n\`bundle/\` lane L1's back half over it (head, units, parts, add-on), \`de.rows.json\` its translation (its words written\nbackwards), \`de.reader.json\` that translation laid, in the baseline's reader-dump format. Remake: \`node --import tsx\nlab/pdf/reader-fixtures/make.mjs\`.\n${paper.note ? `\n${paper.note}` : ''}`)
  return { name, pages: paper.pages.length, units: ins.units.length, located: tally.located, wrap: tally.wrap, laid: dumpUnits.length, notLaid: notLaid.length, bytes: written.bytes.length, sha: sha(written.bytes).slice(0, 12) }
}

const check = process.argv.includes('--check')
const before = check ? new Map(readdirSync(OUT).flatMap(d => (existsSync(join(OUT, d, 'arxiv.pdf')) ? [[d, sha(readFileSync(join(OUT, d, 'arxiv.pdf')))]] : []))) : null
mkdirSync(OUT, { recursive: true })
// (`--only=<paper>`: that paper alone made, the others left as they are)
const only = process.argv.find(a => a.startsWith('--only='))?.slice('--only='.length) ?? null
for (const [name, paper] of Object.entries(PAPERS)) {
  if (only && name !== only) continue
  const r = await make(name, paper)
  console.log(JSON.stringify(r))
  if (before?.get(name) && before.get(name).slice(0, 12) !== r.sha) { console.log(`${name}: other bytes than the committed ones`); process.exitCode = 1 }
}
