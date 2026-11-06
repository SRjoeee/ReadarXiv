// lab/pdf/prepare-back/prove.mjs: the add-on's proofs over arXiv's file (I1, I2; spike S1c's wrapA.mjs and pixels.mjs), made of
// what prepareBack made (its tally): the composed document W = arXiv's bytes + the add-on.
//   (a) nothing moved: pageInk of W equals A's, glyph for glyph (font, code, Unicode; x0 x1 y top bottom ix0 ix1 within 0.001
//       pt), box for box (and its kind), turned glyph for turned glyph;
//   (c') each glyph, box and turned glyph of W is enclosed by exactly the group of ours it was planned in (where the add-on
//       wrote that group; on a page past its bounds, its text group), or by none: so any visibility a reader sets hides exactly
//       the ink of the groups it turns off (PDF.js's operator list walked as its canvas walks the marked-content stack);
//   (b) all ON = A: poppler's render of W and of A, pixel for pixel (pdftoppm -r 100);
//   (c) each kind OFF (`t` every text group, `e` every element group, `l` every label group): poppler's render of W with that
//       kind OFF (a second section whose catalog's default configuration lists them OFF) differs from A's only inside the ink
//       of the groups turned off (their glyphs' and boxes' boxes, grown to whole pixels and one more). `off: 'cairo'` renders
//       A and each OFF document by poppler's Cairo backend (pdftocairo) instead of its Splash one: Splash draws a Type 3 glyph
//       whose procedure begins with d1 from a cache keyed by font, matrix and code that does not know optional content, so with
//       a group OFF a hidden Type 3 glyph shows where the same glyph was drawn visible before it, and a visible one is lost
//       where its first drawing was hidden (type3-oc.mjs makes the three pages that show it; Cairo hides exactly on all three);
//       under Cairo the OFF renders are read against W's (Cairo, like Chromium's canvas, moves a split show's second chunk by
//       its own rounding: `onCairo`, W against A under Cairo, is recorded apart).
import { spawnSync } from 'node:child_process'
import { inflateSync } from 'node:zlib'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appendSection, ocgName, pageInk, startxrefOf, textGroupOf } from '@readarxiv/engine'

const td = new TextDecoder('latin1')
const SEP = '￿￾￿'

/** each glyph's, box's and turned glyph's planned group, as the add-on wrote it (null: none) */
function plannedOf(located, addOn) {
  const written = g => (g === null ? null : addOn.groups.has(g) ? g : addOn.groups.has(textGroupOf(g)) ? textGroupOf(g) : null)
  return located.groups.map((G, i) => {
    const ok = addOn.pages.get(i + 1)?.ok
    const of = l => l.map(g => (ok ? written(g) : null))
    return { glyphs: of(G.glyphs), boxes: of(G.boxes), turned: of(G.turned) }
  })
}

/** proofs (a) and (c') by PDF.js over W */
export async function proveGlyphs({ W, pagesA, located, addOn, pdfjs, options }) {
  const planned = plannedOf(located, addOn)
  const { getDocument, OPS } = pdfjs
  const task = getDocument({ ...options, data: W.slice() })
  const doc = await task.promise
  const config = await doc.getOptionalContentConfig({ intent: 'display' })
  const idName = new Map()
  for (const [gid, g] of config) idName.set(gid, g?.name)
  const failA = [], failC = []
  let glyphs = 0, grouped = 0, boxes = 0, boxesGrouped = 0, turned = 0, foreign = 0, maxd = 0
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const a = pagesA[p - 1]?.raw
      const page = await doc.getPage(p)
      const ops = await page.getOperatorList()
      // (each show's, path's and image's enclosing groups of ours, innermost last, outside annotations and soft masks)
      const encl = [], enclPath = [], enclImage = []
      const stack = [], groupsOpen = []
      let inAnnot = 0, inMask = 0
      for (let j = 0; j < ops.fnArray.length; j++) {
        const fn = ops.fnArray[j], args = ops.argsArray[j]
        if (fn === OPS.beginMarkedContent) stack.push(null)
        else if (fn === OPS.beginMarkedContentProps) {
          const nm = args?.[0] === 'OC' ? idName.get(args[1]?.id) : null
          if (nm && !nm.startsWith('axt:')) foreign++
          stack.push(nm?.startsWith('axt:') ? nm : null)
        } else if (fn === OPS.endMarkedContent) stack.pop()
        else if (fn === OPS.beginAnnotation) inAnnot++
        else if (fn === OPS.endAnnotation) inAnnot = Math.max(0, inAnnot - 1)
        else if (fn === OPS.beginGroup) { const m = !!args?.[0]?.smask; groupsOpen.push(m); if (m) inMask++ }
        else if (fn === OPS.endGroup) { if (groupsOpen.pop()) inMask-- }
        else if (inAnnot || inMask) continue
        else if (fn === OPS.showText || fn === OPS.showSpacedText) encl.push(stack.filter(Boolean).join(','))
        else if (fn === OPS.constructPath) enclPath.push(stack.filter(Boolean).join(','))
        else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject || fn === OPS.paintSolidColorImageMask) enclImage.push(stack.filter(Boolean).join(','))
      }
      // (the code and font through the Unicode, as A was read)
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i]
        if (fn !== OPS.showText && fn !== OPS.showSpacedText) continue
        const arr = ops.argsArray[i]?.[0]
        if (!Array.isArray(arr)) continue
        for (let j = 0; j < arr.length; j++) { const g = arr[j]; if (g && typeof g === 'object' && typeof g.unicode === 'string') arr[j] = { ...g, unicode: `${g.unicode}${SEP}${g.originalCharCode ?? ''}${SEP}` } }
      }
      const w = pageInk(OPS, ops, page.commonObjs, { rotate: page.rotate ?? 0, indices: true, turned: true, glyphsMax: 100_000, boxesMax: 500_000 })
      page.cleanup()
      if (!a) continue
      const why = []
      // (a)
      const ga = a.glyphs, gw = w.glyphs
      if (ga.length !== gw.length) why.push(`glyphs ${ga.length} vs ${gw.length}`)
      else for (let j = 0; j < ga.length; j++) {
        const x = ga[j], y = gw[j], yu = y.u.split(SEP)
        if (x.u !== yu[0] || x.font !== y.font) { why.push(`glyph ${j} ${x.u} vs ${yu[0]}`); break }
        let bad = null
        for (const k of ['x0', 'x1', 'y', 'top', 'bottom', 'ix0', 'ix1']) { const d = Math.abs(x[k] - y[k]); if (d > maxd) maxd = d; if (d > 0.001) bad = k }
        if (bad) { why.push(`glyph ${j} ${bad}`); break }
      }
      if (a.boxes.length !== w.boxes.length || a.boxes.some((v, j) => Math.abs(v - w.boxes[j]) > 0.001)) why.push('boxes')
      if ((a.paths ?? []).some((v, j) => v !== w.paths?.[j])) why.push('box kinds')
      if ((a.turned?.length ?? 0) !== (w.turned?.length ?? 0)) why.push('turned')
      if (why.length) { failA.push([p, why.slice(0, 3)]); continue }
      // (c')
      const P = planned[p - 1]
      const whyC = []
      for (let j = 0; j < gw.length; j++) {
        glyphs++
        const want = P.glyphs[j] ? ocgName(P.glyphs[j]) : '', got = gw[j].n >= 0 ? (encl[gw[j].n] ?? '') : ''
        if (want) grouped++
        if (want !== got) { whyC.push(`glyph ${j} ${JSON.stringify(want)} in ${JSON.stringify(got)}`); break }
      }
      let img = 0
      for (let b = 0; b < (w.paths ?? []).length; b++) {
        const kind = w.paths[b], g = P.boxes[b] ? ocgName(P.boxes[b]) : ''
        let got = null
        if (kind >= 0) got = enclPath[kind] ?? ''
        else if (kind === -3) got = enclImage[img++] ?? ''
        if (got === null) continue
        boxes++
        if (g) boxesGrouped++
        if (g !== got) { whyC.push(`box ${b} ${JSON.stringify(g)} in ${JSON.stringify(got)}`); break }
      }
      for (let j = 0; j < (w.turned ?? []).length; j++) {
        turned++
        const t = w.turned[j], want = P.turned[j] ? ocgName(P.turned[j]) : '', got = t.n >= 0 ? (encl[t.n] ?? '') : ''
        if (want !== got) { whyC.push(`turned ${j} ${JSON.stringify(want)} in ${JSON.stringify(got)}`); break }
      }
      if (whyC.length) failC.push([p, whyC])
    }
  } finally { await task.destroy().catch(() => {}) }
  return { pages: doc.numPages, a: { failed: failA.length, first: failA.slice(0, 5), maxd }, c: { failed: failC.length, first: failC.slice(0, 5), glyphs, grouped, boxes, boxesGrouped, turned }, foreignShows: foreign }
}

/** W with the groups of `off` OFF in its default configuration: a second section, the catalog again with them in /D's /OFF
 *  (the catalog wrapOf writes: a fresh /OCProperties whose /D lists every group ON) */
async function offDocument(W, addOn, off, PL) {
  const tail = td.decode(W.subarray(W.length - Math.min(W.length, addOn.bytes.length)))
  const all = [...addOn.ocgs].sort((a, b) => a[1] - b[1])
  const want = `/D << /BaseState /ON /ON [${all.map(([, n]) => `${n} 0 R`).join(' ')}] /Order [] >>`
  const at = tail.lastIndexOf(want)
  if (at < 0) return null
  const objStart = tail.lastIndexOf(' obj\n', at), lineStart = tail.lastIndexOf('\n', objStart - 1) + 1
  const objEnd = tail.indexOf('endobj\n', at) + 7
  const onRefs = all.filter(([g]) => !off(g)).map(([, n]) => `${n} 0 R`).join(' '), offRefs = all.filter(([g]) => off(g)).map(([, n]) => `${n} 0 R`).join(' ')
  const text = tail.slice(lineStart, objEnd).replace(want, `/D << /BaseState /ON /ON [${onRefs}] /OFF [${offRefs}] /Order [] >>`)
  const [n, g] = text.split(' ').map(Number)
  const T = await PL.PDFDocument.load(W, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false, parseSpeed: PL.ParseSpeeds.Fastest })
  const ti = T.context.trailerInfo
  const xref = startxrefOf(W)
  const kind = /^\s*xref/.test(td.decode(W.subarray(xref, xref + 16))) ? 'table' : 'stream'
  const enc = x => { const b = new Uint8Array(x.length); for (let q = 0; q < x.length; q++) b[q] = x.charCodeAt(q) & 255; return b }
  const size = Number([...tail.matchAll(/\/Size (\d+)/g)].at(-1)?.[1])
  const sec = appendSection({ end: W.length, objects: [[n, g, enc(text)]], kind, prev: xref, size, trailer: { root: ti.Root.toString(), info: ti.Info?.toString(), id: ti.ID?.toString() } })
  const out = new Uint8Array(W.length + sec.bytes.length)
  out.set(W)
  out.set(sec.bytes, W.length)
  return { bytes: out, off: all.filter(([gr]) => off(gr)).length }
}

/** an 8-bit PNG (gray, RGB, gray+alpha or RGBA; pdftocairo's) as RGB rows, as ppm() gives them */
function png(file) {
  const b = readFileSync(file)
  let i = 8, w = 0, h = 0, type = 0
  const idat = []
  while (i < b.length) {
    const n = b.readUInt32BE(i), t = b.toString('latin1', i + 4, i + 8)
    if (t === 'IHDR') { w = b.readUInt32BE(i + 8); h = b.readUInt32BE(i + 12); type = b[i + 17]; if (b[i + 16] !== 8 || b[i + 20]) throw new Error(`png: depth ${b[i + 16]}, interlace ${b[i + 20]}`) }
    if (t === 'IDAT') idat.push(b.subarray(i + 8, i + 8 + n))
    i += 12 + n
  }
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[type], stride = w * bpp, raw = inflateSync(Buffer.concat(idat))
  const data = new Uint8Array(w * h * 3)
  let prev = new Uint8Array(stride)
  for (let y = 0, p = 0; y < h; y++) {
    const f = raw[p++], line = Uint8Array.from(raw.subarray(p, p + stride))
    p += stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, up = prev[x], c = x >= bpp ? prev[x - bpp] : 0
      if (f === 1) line[x] += a
      else if (f === 2) line[x] += up
      else if (f === 3) line[x] += (a + up) >> 1
      else if (f === 4) { const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c); line[x] += pa <= pb && pa <= pc ? a : pb <= pc ? up : c }
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) data[(y * w + x) * 3 + k] = line[x * bpp + (bpp < 3 ? 0 : k)]
    prev = line
  }
  return { w, h, data }
}

function ppm(file) {
  const b = readFileSync(file)
  let i = 0
  const fields = []
  while (fields.length < 4) {
    while (b[i] === 0x20 || b[i] === 0x0a || b[i] === 0x0d || b[i] === 0x09) i++
    let t = ''
    while (!(b[i] === 0x20 || b[i] === 0x0a || b[i] === 0x0d || b[i] === 0x09)) t += String.fromCharCode(b[i++])
    fields.push(t)
  }
  i++
  return { w: Number(fields[1]), h: Number(fields[2]), data: b.subarray(i) }
}

/** proofs (b) and (c) by poppler: `scratch` a directory of the process's own */
export async function provePixels({ W, original, pagesA, located, addOn, scratch, PL, dpi = 100, chunk = 12, off = 'splash' }) {
  const planned = plannedOf(located, addOn)
  const s = dpi / 72
  // (the kinds turned OFF: `t` the text groups of the units, `f` those of the figure texts (written inside their forms), `e` the
  // elements', `l` the labels')
  const kinds = ['t', 'f', 'e', 'l']
  const isKind = (g, k) => g !== null && (k === 'f' ? located.figureGroups.has(g) : g.endsWith(`.${k}`) && !(k === 't' && located.figureGroups.has(g)))
  mkdirSync(scratch, { recursive: true })
  const files = { a: join(scratch, 'A.pdf'), w: join(scratch, 'W.pdf') }
  writeFileSync(files.a, original)
  writeFileSync(files.w, W)
  const offs = {}
  for (const k of kinds) {
    const d = await offDocument(W, addOn, g => isKind(g, k), PL)
    if (!d) return { refused: 'the catalog written is not of the fresh /OCProperties form' }
    files[k] = join(scratch, `off-${k}.pdf`)
    writeFileSync(files[k], d.bytes)
    offs[k] = d.off
  }
  const cairo = off === 'cairo'
  const render = (pdf, f, l, prefix, by = 'splash') => {
    const r = by === 'cairo' ? spawnSync('pdftocairo', ['-png', '-r', String(dpi), '-f', String(f), '-l', String(l), pdf, prefix], { encoding: 'latin1' }) : spawnSync('pdftoppm', ['-r', String(dpi), '-f', String(f), '-l', String(l), pdf, prefix], { encoding: 'latin1' })
    if (r.status !== 0) throw new Error(`${by === 'cairo' ? 'pdftocairo' : 'pdftoppm'}: ${r.stderr?.slice(0, 200)}`)
  }
  const filesOf = (dir, tag, ext = 'ppm') => { const m = new Map(); for (const f of readdirSync(dir)) { const x = new RegExp(`^${tag}-0*(\\d+)\\.${ext}$`).exec(f); if (x) m.set(Number(x[1]), join(dir, f)) } return m }
  const N = pagesA.length
  const out = { pages: N, dpi, off, onFailed: [], onCairo: [], offOutside: Object.fromEntries(kinds.map(k => [k, []])), changed: Object.fromEntries(kinds.map(k => [k, 0])), inklessType3: {}, groupsOff: offs }
  const r = join(scratch, 'r')
  for (let f = 1; f <= N; f += chunk) {
    const l = Math.min(N, f + chunk - 1)
    rmSync(r, { recursive: true, force: true })
    mkdirSync(r, { recursive: true })
    render(files.a, f, l, join(r, 'a'))
    render(files.w, f, l, join(r, 'w'))
    if (cairo) { render(files.a, f, l, join(r, 'ac'), 'cairo'); render(files.w, f, l, join(r, 'wc'), 'cairo') }
    for (const k of kinds) render(files[k], f, l, join(r, k), off)
    const fa = filesOf(r, 'a'), fw = filesOf(r, 'w'), fk = Object.fromEntries(kinds.map(k => [k, filesOf(r, k, cairo ? 'png' : 'ppm')]))
    const fac = cairo ? filesOf(r, 'ac', 'png') : null, fwc = cairo ? filesOf(r, 'wc', 'png') : null
    for (let p = f; p <= l; p++) {
      const a = ppm(fa.get(p)), w = ppm(fw.get(p))
      let on = 0
      for (let i = 0; i < a.data.length; i++) if (a.data[i] !== w.data[i]) { on++; i += 2 - (i % 3) }
      if (on || a.w !== w.w || a.h !== w.h) out.onFailed.push([p, on])
      const raw = pagesA[p - 1]?.raw
      if (!raw) continue
      const view = pagesA[p - 1].page.view
      // (the OFF documents against W all ON as the same backend renders it: Cairo draws a split show's second chunk where its
      // own rounding puts it, as Chromium's canvas does (W against A under Cairo, `onCairo`: pixels at split shows only; under
      // Splash, b, none), so what a kind OFF changes is read against W)
      const a0 = cairo ? png(fwc.get(p)) : a
      if (cairo) {
        const ac = png(fac.get(p))
        let n = 0
        for (let i = 0; i < ac.data.length; i += 3) if (ac.data[i] !== a0.data[i] || ac.data[i + 1] !== a0.data[i + 1] || ac.data[i + 2] !== a0.data[i + 2]) n++
        if (n) out.onCairo.push([p, n])
      }
      for (const k of kinds) {
        const o = cairo ? png(fk[k].get(p)) : ppm(fk[k].get(p))
        if (o.w !== a0.w || o.h !== a0.h) throw new Error(`page ${p}: the ${k} OFF render is ${o.w}x${o.h}, A's ${a0.w}x${a0.h}`)
        const mask = new Uint8Array(a.w * a.h)
        // (each hidden ink's box grown to whole pixels and one more, as the spike's proof; and, to tell how far a pixel outside
        // stands, the same grown by two more: a reading, not the proof)
        const wide = new Uint8Array(a.w * a.h)
        const box = (x0, y0, x1, y1) => {
          const X0 = Math.max(0, Math.floor((x0 - view[0]) * s) - 1), X1 = Math.min(a.w, Math.ceil((x1 - view[0]) * s) + 1)
          const Y0 = Math.max(0, Math.floor((view[3] - y1) * s) - 1), Y1 = Math.min(a.h, Math.ceil((view[3] - y0) * s) + 1)
          for (let y = Y0; y < Y1; y++) mask.fill(1, y * a.w + X0, y * a.w + X1)
          for (let y = Math.max(0, Y0 - 2); y < Math.min(a.h, Y1 + 2); y++) wide.fill(1, y * a.w + Math.max(0, X0 - 2), y * a.w + Math.min(a.w, X1 + 2))
        }
        const P = planned[p - 1], kind = g => isKind(g, k)
        raw.glyphs.forEach((g, j) => { if (kind(P.glyphs[j]) && g.top > g.bottom) box(Math.min(g.x0, g.ix0), g.bottom, Math.max(g.x1, g.ix1), g.top) })
        // (and apart, a hidden glyph pageInk calls inkless (its outline of nothing drawn: top = bottom) that paints all the same,
        // a Type 3 glyph whose procedure the outline reading does not see: its em box over its advance, counted on its own)
        const mask2 = new Uint8Array(a.w * a.h)
        raw.glyphs.forEach((g, j) => {
          if (!kind(P.glyphs[j]) || g.top > g.bottom) return
          const X0 = Math.max(0, Math.floor((Math.min(g.x0, g.ix0) - view[0]) * s) - 1), X1 = Math.min(a.w, Math.ceil((Math.max(g.x1, g.ix1) - view[0]) * s) + 1)
          const Y0 = Math.max(0, Math.floor((view[3] - (g.y + g.size)) * s) - 1), Y1 = Math.min(a.h, Math.ceil((view[3] - (g.y - 0.3 * g.size)) * s) + 1)
          for (let y = Y0; y < Y1; y++) mask2.fill(1, y * a.w + X0, y * a.w + X1)
        })
        ;(raw.paths ?? []).forEach((_, b) => { if (kind(P.boxes[b])) box(raw.boxes[4 * b], raw.boxes[4 * b + 1], raw.boxes[4 * b + 2], raw.boxes[4 * b + 3]) })
        // (a turned glyph's ink: its band from its origin to its advance's end, its own ink up and down across it (its outline's,
        // else its font's: pageInk's `up`, `down`), the box of those corners on the page)
        ;(raw.turned ?? []).forEach((t, j) => {
          if (!kind(P.turned[j])) return
          const nx = -t.uy, ny = t.ux, c = []
          for (const [x, y] of [[t.ox, t.oy], [t.ex, t.ey]]) for (const e of [t.up, t.down]) c.push([x + nx * e * t.size, y + ny * e * t.size])
          box(Math.min(...c.map(q => q[0])), Math.min(...c.map(q => q[1])), Math.max(...c.map(q => q[0])), Math.max(...c.map(q => q[1])))
        })
        let inside = 0, outside = 0, inkless = 0, far = 0
        const at = []
        for (let q = 0, i = 0; q < mask.length; q++, i += 3) {
          if (a0.data[i] === o.data[i] && a0.data[i + 1] === o.data[i + 1] && a0.data[i + 2] === o.data[i + 2]) continue
          if (mask[q]) inside++
          else if (mask2[q]) inkless++
          else { outside++; if (!wide[q]) far++; if (at.length < 6 && outside % 37 === 1) at.push([+((q % a.w) / s + view[0]).toFixed(1), +(view[3] - Math.floor(q / a.w) / s).toFixed(1)]) }
        }
        out.changed[k] += inside
        if (inkless) (out.inklessType3[k] ??= []).push([p, inkless])
        if (outside) out.offOutside[k].push([p, outside, at, far])
      }
    }
  }
  if (!process.env.KEEP_SCRATCH) rmSync(scratch, { recursive: true, force: true })
  return out
}
