// experiments/pdf-bilingual/spikes/layer-gate/page.mjs
// The layer gate's page (Plan 8b, Task 12), in Chromium: a fixture's layer drawn as the reader will draw it, and measured.
// It imports the engine's entry (layer/layer.mjs) and the checker (layer/check.mjs) as they are, PDF.js's pinned modern
// build through the page's import map, and the role table's faces from the local font folder; nothing else. The engine
// is run as the layer lab runs it (experiments/pdf-bilingual/layer-lab/layer.mjs, exp/layer-lab, ported here): rules
// layerRulesFor(target); roles rolesFor(target, familyOfFonts(fonts, the lines each sets)); hyphen loadHyphenator(rules.
// hyphenate); measure a canvas width at 100 px in the face, only once it has loaded (a lay that asked for an unloaded face
// is laid again once it has); textIn the page's text items whose box centre lies inside, joined in order; page-even once a
// page. Drawn as Plan 8d draws it: the original's pixels as the copy's base, each drawn unit's erase in the paper's colour,
// its crops from the original's pixels (source-over, or darkened in with the gate's --composite=darken), then its text as
// SVG in PDF units. The driver (../layer-gate.mjs) takes the text's element screenshot, the T plane.
import * as pdfjs from 'pdfjs-dist'
import { checkPage, lostInk } from '/engine/layer/check.mjs'
import { MATH_FONT, modelPage, pixelPage } from '/gate/measure.mjs'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs'
const ASSETS = { cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', iccUrl: '/pdfjs/iccs/', useSystemFonts: false }
/** what the gate calls of the entry; the engine is not ready while any is missing */
const NEEDED = ['parseLayout', 'indexLayout', 'layerRulesFor', 'rolesFor', 'familyOfFonts', 'FACES', 'loadHyphenator', 'layUnit', 'bodyUnits', 'evenOf', 'drawUnit']
/** device pixels a PDF unit for the fidelity planes (CSS 1.25 × dpr 2, the prototype's own canvases: its floor's scale),
 *  and for the lost-ink check (the brief's 2×, its floor 4 pixels) */
const K = 2.5, INK_SCALE = 2, INK_MIN = 4
/** a measure's answer for an unloaded face, per character: the lay is void and done again */
const WANTED = 100
/** small capitals: lower-case letters as capitals at this share of the size (Plan 8d's CAPS_SCALE) */
const CAPS_SCALE = 0.8
// layout/file.mjs PH_FLAG's
const EMPTY = 16, LOST = 32

const S = {}
const bytes = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()) }

/** the faces the layer draws in: loaded the first time a lay asks for one (by its measure), from the local font folder */
class Faces {
  constructor(FACES) {
    this.FACES = FACES
    this.loaded = new Set()
    this.failed = new Set()
    this.wanted = new Set()
    this.widths = new Map()
    this.ctx = new OffscreenCanvas(8, 8).getContext('2d')
  }
  font(face, px) { const f = this.FACES[face]; return `${f.style} ${f.weight} ${px}px "${f.family}"` }
  measure = (text, face, caps) => {
    if (!this.loaded.has(face)) { this.wanted.add(face); return WANTED * [...text].length }
    const key = `${face}\u0000${caps ? 1 : 0}\u0000${text}`
    let w = this.widths.get(key)
    if (w !== undefined) return w
    const ctx = this.ctx
    if (!caps) { ctx.font = this.font(face, 100); w = ctx.measureText(text).width }
    else {
      w = 0
      for (const [, lower, other] of text.matchAll(/(\p{Ll}+)|([^\p{Ll}]+)/gu)) {
        ctx.font = this.font(face, lower ? 100 * CAPS_SCALE : 100)
        w += ctx.measureText(lower ? lower.toUpperCase() : other).width
      }
    }
    this.widths.set(key, w)
    return w
  }
  async load(ids) {
    await Promise.all(ids.filter(id => !this.loaded.has(id) && !this.failed.has(id)).map(async id => {
      const f = this.FACES[id]
      if (!f) { this.failed.add(id); return }
      try {
        const face = new FontFace(f.family, `url("/fonts/${encodeURIComponent(f.file)}")`, { weight: String(f.weight), style: f.style })
        await face.load()
        document.fonts.add(face)
        this.loaded.add(id)
      } catch { this.failed.add(id) }
    }))
  }
}

/** a fixture's layer, laid page by page */
class Run {
  constructor({ E, index, units, target, doc }) {
    this.E = E
    this.index = index
    this.doc = doc
    this.tr = new Map(units.map(u => [u.id, { pieces: u.pieces, sentences: u.sentences ?? null }]))
    const file = index.file
    const weights = file.fonts.map(() => 0)
    for (const [, rows] of file.lines) for (let i = 7; i < rows.length; i += 8) weights[rows[i]] = (weights[rows[i]] ?? 0) + 1
    this.rules = E.layerRulesFor(target)
    this.family = E.familyOfFonts(file.fonts, weights)
    this.roles = E.rolesFor(target, this.family)
    this.faces = new Faces(E.FACES)
    this.text = new Map()
    this.laid = new Map()
    this.ms = new Map()
    this.pages = new Map()
    this.errors = 0
    this.target = target
  }
  async init() {
    const hyphen = this.rules.hyphenate ? await this.E.loadHyphenator(this.rules.hyphenate) : null
    this.input = { file: this.index, target: this.target, rules: this.rules, roles: this.roles, measure: this.faces.measure, hyphen, textIn: (page, x0, bottom, x1, top) => this.textIn(page, x0, bottom, x1, top) }
    return this
  }
  textIn(page, x0, bottom, x1, top) {
    const items = this.text.get(page)
    if (!items) return null
    const s = items.filter(t => t.cx >= x0 && t.cx <= x1 && t.cy >= bottom && t.cy <= top).map(t => t.s).join('').replace(/\s+/g, ' ').trim()
    return s || null
  }
  async textOf(pages) {
    await Promise.all([...pages].filter(p => !this.text.has(p) && p >= 1 && p <= this.doc.numPages).map(async p => {
      const content = await (await this.doc.getPage(p)).getTextContent()
      this.text.set(p, content.items.filter(t => typeof t.str === 'string' && t.str).map(t => ({ s: t.str, cx: t.transform[4] + t.width / 2, cy: t.transform[5] + t.height / 2 })))
    }))
  }
  pagesOf(id) {
    const u = this.index.unit(id), pages = new Set()
    if (u) for (let i = 0; i < u.lines.length; i += 8) pages.add(u.lines[i])
    return pages
  }
  async layOne(id, o) {
    const tr = this.tr.get(id)
    let ms = 0
    try {
      for (let round = 0; round < 4; round++) {
        this.faces.wanted.clear()
        const t0 = performance.now()
        let laid
        try { laid = this.E.layUnit(this.input, id, tr, o) } catch { this.errors++; return { id, fit: false, why: 'error' } } finally { ms += performance.now() - t0 }
        if (!this.faces.wanted.size) return laid
        const want = [...this.faces.wanted]
        await this.faces.load(want)
        if (want.some(f => this.faces.failed.has(f))) return { id, fit: false, why: 'face' }
      }
      return { id, fit: false, why: 'face' }
    } finally { this.ms.set(id, Math.max(this.ms.get(id) ?? 0, ms)) }
  }
  /** a page laid (once): every translated unit with a frame on it, page-even once; its draws */
  async page(p) {
    if (this.pages.has(p)) return this.pages.get(p)
    const t0 = performance.now()
    const ids = this.index.onPage(p).filter(id => this.tr.has(id))
    const near = new Set([p])
    for (const id of ids) for (const q of this.pagesOf(id)) near.add(q)
    await this.textOf(near)
    for (const id of ids) if (!this.laid.has(id)) this.laid.set(id, await this.layOne(id))
    const body = this.E.bodyUnits(this.index, p).filter(id => this.tr.has(id))
    const bodyLaid = body.map(id => this.laid.get(id)).filter(l => l?.fit)
    const even = bodyLaid.length ? this.E.evenOf(bodyLaid, this.rules) : null
    if (even) {
      for (const l of bodyLaid) {
        if (l.state.scale > even.maxScale + 1e-9 || (even.lead != null && l.state.lead > even.lead + 1e-9)) this.laid.set(l.id, await this.layOne(l.id, { maxScale: even.maxScale, lead: even.lead }))
      }
    }
    const draws = []
    for (const id of ids) {
      const l = this.laid.get(id)
      if (!l?.fit) continue
      try { draws.push(this.E.drawUnit(this.input, l, p)) } catch { this.errors++; this.laid.set(id, { id, fit: false, why: 'error' }) }
    }
    const done = { page: p, ids, even, draws, ms: performance.now() - t0 }
    this.pages.set(p, done)
    return done
  }
}

// ---- drawing, in device pixels on the copy and in PDF units in the SVG (the lab's, as Plan 8d draws)
const corners = (vp, x0, y0, x1, y1) => {
  const [ax, ay] = vp.convertToViewportPoint(x0, y0), [bx, by] = vp.convertToViewportPoint(x1, y1)
  return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)]
}
function drawCopy(ctx, source, vp, draws, composite) {
  ctx.drawImage(source, 0, 0)
  ctx.fillStyle = '#ffffff'
  for (const d of draws) for (let i = 0; i + 3 < d.erase.length; i += 4) { const [x, y, w, h] = corners(vp, d.erase[i], d.erase[i + 1], d.erase[i + 2], d.erase[i + 3]); ctx.fillRect(x, y, w, h) }
  if (composite === 'darken') ctx.globalCompositeOperation = 'darken'
  for (const d of draws) {
    for (let i = 0; i + 8 < d.crops.length; i += 9) {
      const [, sx0, sBottom, sx1, sTop, dx, dBase, sBase, scale] = d.crops.slice(i, i + 9)
      const [x, y, w, h] = corners(vp, sx0, sBottom, sx1, sTop)
      const [tx, ty, tw, th] = corners(vp, dx, dBase - (sBase - sBottom) * scale, dx + (sx1 - sx0) * scale, dBase + (sTop - sBase) * scale)
      if (w > 0 && h > 0) ctx.drawImage(source, x, y, w, h, tx, ty, tw, th)
    }
  }
  ctx.globalCompositeOperation = 'source-over'
}
const SVG = 'http://www.w3.org/2000/svg'
const el = (name, attrs = {}) => { const e = document.createElementNS(SVG, name); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e }
function drawText(svg, draws, FACES, COLOURS, target) {
  svg.setAttribute('lang', target)
  for (const d of draws) {
    const g = el('g')
    for (const line of d.lines) {
      for (const r of line.runs) {
        const f = FACES[r.face]
        const t = el('text', {
          x: r.x.map(v => +v.toFixed(3)).join(' '), y: -(line.baseline + (r.shift ?? 0)),
          'font-family': f ? `"${f.family}"` : 'axt-missing', 'font-weight': f?.weight ?? 400, 'font-style': f?.style ?? 'normal', 'font-size': r.size,
          'letter-spacing': r.letterSpacing ?? 0, 'word-spacing': r.wordSpacing ?? 0, fill: r.colour > 0 ? (COLOURS[r.colour - 1] ?? '#000') : '#000',
        })
        if (r.caps) {
          for (const [, lower, other] of r.text.matchAll(/(\p{Ll}+)|([^\p{Ll}]+)/gu)) {
            const s = el('tspan', lower ? { 'font-size': r.size * CAPS_SCALE } : {})
            s.textContent = lower ? lower.toUpperCase() : other
            t.append(s)
          }
        } else t.textContent = r.text
        g.append(t)
      }
    }
    svg.append(g)
  }
}

/** a canvas of the page at a scale, its paper white, the original rendered */
async function rendered(page, scale) {
  const vp = page.getViewport({ scale })
  const W = Math.ceil(vp.width), H = Math.ceil(vp.height)
  const c = new OffscreenCanvas(W, H), ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  await page.render({ canvasContext: ctx, viewport: vp }).promise
  return { c, ctx, vp, W, H }
}

/** the page's text items, with whether each is set in a math font (the fonts loaded: rendered, or the operator list read) */
async function itemsOf(page) {
  const tc = await page.getTextContent()
  const items = []
  for (const it of tc.items) {
    if (!it.str || !/\S/.test(it.str) || !it.transform) continue
    const [a, b, , d, e, f] = it.transform
    if (Math.abs(b) > 0.01 || d < 0) continue
    const size = Math.hypot(a, b) || it.height
    let font = ''
    try { font = page.commonObjs.get(it.fontName)?.name ?? '' } catch {}
    items.push({ x0: e, y0: f - 0.22 * size, x1: e + it.width, y1: f + 0.78 * size, str: it.str, math: MATH_FONT.test(font) })
  }
  return items
}

const rowsOf = (u, p) => {
  const out = []
  for (let i = 0; i < u.lines.length; i += 8) if (u.lines[i] === p) out.push({ x0: u.lines[i + 1], x1: u.lines[i + 2], baseline: u.lines[i + 3], top: u.lines[i + 4], bottom: u.lines[i + 5], size: u.lines[i + 6] })
  return out
}
/** a PostScript name's weight and slant, its subset prefix (ABCDEF+) off: case matters (QIMBDZ+ is no bold) */
const BOLD = /Bold|Semibold|SemiBold|Demi|Black|Heavy|Medi|^CMBX|^CMB\d|-Bd\b|^[A-Za-z]+BX\d/, ITALIC = /Italic|Oblique|Ital|Slant|^CMTI|^CMSL|^CMMI|-It\b|^[A-Za-z]+TI\d/
const styleName = ps => ps.replace(/^[A-Z]{6}\+/, '')

window.gate = {
  /** a fixture opened: the engine's entry, its layout, its translation and arXiv's PDF */
  async open({ name, target, ref, composite }) {
    let E
    try { E = await import('/engine/layer/layer.mjs') } catch (e) { return { ready: false, why: `layer/layer.mjs: ${String(e?.message ?? e).slice(0, 200)}` } }
    const missing = NEEDED.filter(n => !(n in E))
    if (missing.length) return { ready: false, why: `layer/layer.mjs exports no ${missing.join(', ')}` }
    const base = `/fixtures/${name}/`
    let index
    try { index = E.indexLayout(E.parseLayout(await bytes(`${base}layout.json`))) } catch (e) { return { ready: false, why: `layout refused: ${String(e?.message ?? e).slice(0, 200)}` } }
    const units = (await (await fetch(`${base}units.json`)).json()).units
    const doc = await pdfjs.getDocument({ data: await bytes(`${base}arxiv.pdf`), ...ASSETS }).promise
    const run = await new Run({ E, index, units, target, doc }).init()
    Object.assign(S, { E, index, units, doc, run, target, name, ref, composite, translated: new Set(units.map(u => u.id)), COLOURS: E.LAYER_COLOURS ?? [] })
    return { ready: true, pages: doc.numPages, units: units.length, located: index.file.units.length, even: run.rules.even, family: run.family }
  },

  /** a page laid and its model measured; with `pixel`, its planes drawn and the text set for the driver's screenshot */
  async page(p, { pixel }) {
    const { run, doc, index } = S
    const done = await run.page(p)
    const page = await doc.getPage(p)
    let planes = null
    if (pixel) planes = await rendered(page, K)
    else await page.getOperatorList()
    const items = await itemsOf(page)
    const drawsBy = new Map(done.draws.map(d => [d.id, d]))
    // kept renderings: every display's segments and every label of the units on the page
    const kept = []
    for (const id of index.onPage(p)) {
      const u = index.unit(id)
      for (const row of u.ph.values()) if (row.kind === 'display') for (let s = 0; s + 5 < row.segs.length; s += 6) if (row.segs[s] === p) kept.push([row.segs[s + 1], row.segs[s + 5], row.segs[s + 3], row.segs[s + 4]])
      for (let o = 0; o + 6 < u.labels.length; o += 7) if (u.labels[o + 1] === p) kept.push([u.labels[o + 2], u.labels[o + 6], u.labels[o + 4], u.labels[o + 5]])
    }
    const refHere = S.ref[p] ?? []
    const refOf = new Map(refHere.map(r => [r.id, r]))
    const units = []
    for (const id of done.ids) {
      const u = index.unit(id), laid = run.laid.get(id), d = drawsBy.get(id)
      const lines = laid?.fit ? laid.lines.filter(l => l.page === p).map(l => {
        let x0 = Infinity, x1 = -Infinity
        for (const it of l.items) { x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x + it.w) }
        return { baseline: l.baseline, size: l.size, x0, x1 }
      }).filter(l => Number.isFinite(l.x0)) : []
      const erase = [], crops = []
      if (d) {
        for (let i = 0; i + 3 < d.erase.length; i += 4) erase.push([d.erase[i], d.erase[i + 1], d.erase[i + 2], d.erase[i + 3]])
        for (let i = 0; i + 8 < d.crops.length; i += 9) {
          const [k, sx0, sB, sx1, sT, dx, dBase, sBase, sc] = d.crops.slice(i, i + 9)
          crops.push({ k, src: [sx0, sB, sx1, sT], dst: [dx, dBase - (sBase - sB) * sc, dx + (sx1 - sx0) * sc, dBase + (sT - sBase) * sc] })
        }
      }
      const tr = run.tr.get(id)
      const phs = (tr?.pieces ?? []).filter(q => q[0] === 1).map(q => {
        const row = u.ph.get(q[1])
        return { kind: row?.kind ?? null, status: !row ? 'norow' : row.flags & LOST ? 'lost' : row.flags & EMPTY ? 'empty' : 'visible' }
      })
      const pageText = []
      if (laid?.fit) for (const l of laid.lines) {
        if (l.page !== p) continue
        for (const it of l.items) {
          if (it.kind !== 'page-text') continue
          const segs = u.ph.get(it.ph)?.segs ?? []
          let segW = 0
          for (let s = 0; s + 5 < segs.length; s += 6) segW += segs[s + 3] - segs[s + 1]
          pageText.push({ w: it.w, segW: segW * laid.state.scale })
        }
      }
      units.push({ id, kind: u.kind, drawn: !!d, why: laid?.fit ? (d ? null : 'nodraw') : laid?.why ?? 'unlaid', orig: refOf.get(id)?.orig ?? rowsOf(u, p), lines, erase, crops, phs, pageText })
    }
    const model = modelPage({ units, ref: refHere, items, translated: S.translated })
    // the checker over the page's laid units, and the ids of the units each failure is in
    const laidHere = done.ids.map(id => run.laid.get(id)).filter(Boolean)
    const check = checkPage(index, p, laidHere, run.tr)
    const where = {}
    for (const key of ['missing', 'twice', 'brackets', 'duplicated']) {
      if (!check[key].length) continue
      where[key] = laidHere.filter(l => l.fit && checkPage(index, p, [l], run.tr)[key].length).map(l => l.id)
    }
    if (check.clipped) where.clipped = laidHere.filter(l => l.fit && checkPage(index, p, [l], run.tr).clipped).map(l => l.id)
    // the drawn units' style against the original's: each base face's weight and slant against its lines' font's
    let styleMatch = 0, styleUnits = 0
    for (const l of laidHere) {
      if (!l.fit || l.lines[0]?.page !== p) continue
      const u = index.unit(l.id), fonts = new Map(), faces = new Map()
      for (let i = 7; i < u.lines.length; i += 8) fonts.set(u.lines[i], (fonts.get(u.lines[i]) ?? 0) + 1)
      for (const line of l.lines) for (const it of line.items) if (it.kind === 'text' && it.face) faces.set(it.face, (faces.get(it.face) ?? 0) + (it.text?.length ?? 0))
      const font = [...fonts].sort((a, b) => b[1] - a[1])[0]?.[0], face = [...faces].sort((a, b) => b[1] - a[1])[0]?.[0]
      const F = face && S.E.FACES[face]
      if (font === undefined || !F) continue
      const ps = styleName(index.font(font))
      styleUnits++
      if (BOLD.test(ps) === Number(F.weight) >= 600 && ITALIC.test(ps) === (F.style !== 'normal')) styleMatch++
    }
    const out = { page: p, ms: done.ms, model, check, where, style: [styleMatch, styleUnits], drawn: done.draws.length, evened: !!done.even }
    if (!pixel) return out
    // the planes: O, C, and the text alone in the box the driver screenshots (CSS 1.25 px a unit, at dpr 2)
    const { c: O, ctx: oc, vp, W, H } = planes
    const C = new OffscreenCanvas(W, H), cc = C.getContext('2d', { willReadFrequently: true })
    drawCopy(cc, O, vp, done.draws, S.composite)
    const box = document.getElementById('text')
    box.replaceChildren()
    box.style.width = `${W / 2}px`
    box.style.height = `${H / 2}px`
    const [x0, y0, x1, y1] = page.view
    const svg = el('svg', { viewBox: `${x0} ${-y1} ${x1 - x0} ${y1 - y0}`, preserveAspectRatio: 'none', width: W / 2, height: H / 2 })
    drawText(svg, done.draws, S.E.FACES, S.COLOURS, S.target)
    box.append(svg)
    await document.fonts.ready
    const drawnText = done.draws.flatMap(d => d.lines.flatMap(l => l.runs.map(r => r.text))).join('').replace(/\s+/g, '')
    S.cur = { p, page, W, H, view: page.view, O: oc.getImageData(0, 0, W, H).data, C: cc.getImageData(0, 0, W, H).data, units, kept, items, drawnText, done }
    return out
  },

  /** the pixel tier's measures of the page prepared last, its T plane the driver's screenshot (PNG, base64) */
  async analyse(b64) {
    const { p, page, W, H, view, O, C, units, kept, items, drawnText, done } = S.cur
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const tc = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true })
    tc.fillStyle = '#ffffff'
    tc.fillRect(0, 0, W, H)
    tc.drawImage(bmp, 0, 0, W, H)
    const T = tc.getImageData(0, 0, W, H).data
    S.cur.T = T
    const ref = S.ref[p] ?? []
    const m = pixelPage({ k: K, view, W, H, O, C, T, units, kept, items, ref, drawnText })
    // lost ink at 2x: the copy erased and cropped before the text, against what the drawn units account for: their own
    // source glyphs, which their translation replaces. Those are the layout's glyph boxes (its erase for their lines on
    // the page), grown over the ink connected to them within the unit's own line bands (0.35 em below each baseline to
    // 0.95 em above it): a font's declared box is not its ink (a descender the box misses is the glyph's own, the parity
    // report's §3.3), and erasing it loses nothing of the original. The grown ink never takes a kept rendering (a
    // display's segment, a label) nor another unit's undrawn line
    const two = await rendered(page, INK_SCALE)
    const copy = new OffscreenCanvas(two.W, two.H), cctx = copy.getContext('2d', { willReadFrequently: true })
    drawCopy(cctx, two.c, two.vp, done.draws, S.composite)
    const N = two.W * two.H
    const fill = (mask, x0, y0, x1, y1, v = 1) => {
      const [x, y, rw, rh] = corners(two.vp, x0, y0, x1, y1)
      for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(two.H, Math.ceil(y + rh)); yy++) mask.fill(v, yy * two.W + Math.max(0, Math.floor(x)), yy * two.W + Math.min(two.W, Math.ceil(x + rw)))
    }
    const accounted = new Uint8Array(N), band = new Uint8Array(N), barred = new Uint8Array(N)
    const drawnIds = new Set(done.draws.map(d => d.id))
    for (const d of done.draws) {
      const u = S.index.unit(d.id)
      for (let i = 0; i < u.erase.length; i++) {
        if (u.lines[8 * i] !== p) continue
        const r = u.erase[i]
        for (let e = 0; e + 3 < r.length; e += 4) fill(accounted, r[e], r[e + 1], r[e + 2], r[e + 3])
        const o = 8 * i, size = u.lines[o + 6], base = u.lines[o + 3]
        fill(band, u.lines[o + 1] - 0.5, base - 0.35 * size, u.lines[o + 2] + 0.5, base + 0.95 * size)
      }
    }
    for (const k of kept) fill(barred, k[0] - 0.3, k[1] - 0.3, k[2] + 0.3, k[3] + 0.3)
    for (const id of S.index.onPage(p)) {
      if (drawnIds.has(id)) continue
      const u = S.index.unit(id)
      for (let i = 0; i < u.erase.length; i++) if (u.lines[8 * i] === p) { const r = u.erase[i]; for (let e = 0; e + 3 < r.length; e += 4) fill(barred, r[e], r[e + 1], r[e + 2], r[e + 3]) }
    }
    const origData = two.ctx.getImageData(0, 0, two.W, two.H).data, copyData = cctx.getImageData(0, 0, two.W, two.H).data
    // the grown glyphs: every trace of ink (luminance below 232) reached from one inside a glyph box, 8-connected, within
    // the bands and off what is barred
    const trace = i => 0.299 * origData[4 * i] + 0.587 * origData[4 * i + 1] + 0.114 * origData[4 * i + 2] < 232
    const stack = []
    for (let i = 0; i < N; i++) if (accounted[i] === 1 && !barred[i] && trace(i)) { accounted[i] = 2; stack.push(i) }
    while (stack.length) {
      const i = stack.pop(), x = i % two.W, y = (i - x) / two.W
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= two.W || yy >= two.H) continue
        const j = yy * two.W + xx
        if (accounted[j] === 2 || !band[j] || barred[j] || !trace(j)) continue
        accounted[j] = 2
        stack.push(j)
      }
    }
    const lost = lostInk({ w: two.W, h: two.H, orig: origData, copy: copyData, accounted, min: INK_MIN, page: p })
    S.lost = { lost, W: two.W, H: two.H, orig: origData, copy: copyData, accounted }
    const [vx0, , , vy1] = view
    m.lostInk = { regions: lost.length, px: lost.reduce((a, l) => a + l.px, 0), boxes: lost.slice(0, 8).map(l => [vx0 + l.box[0] / INK_SCALE, vy1 - l.box[3] / INK_SCALE, vx0 + l.box[2] / INK_SCALE, vy1 - l.box[1] / INK_SCALE].map(v => Math.round(v * 10) / 10)) }
    return m
  },

  /**
   * The progress image of the page prepared last: four panels at one scale, each `pw` wide under its caption, in a 2 x 2
   * grid: the original and the prototype (an image, or a blank with its caption) above, the engine of this run and the
   * engine of the previous run (an image, or a blank) below. Returns the image's RGBA and this run's engine panel alone
   * (for the next run)
   */
  async panel({ pw, gap, labels, proto, previous }) {
    const { W, H, O, C, T } = S.cur
    const ph = Math.round((pw * H) / W), top = 30, cell = top + ph, w = 2 * pw + gap, h = 2 * cell + gap
    const full = new OffscreenCanvas(W, H), fctx = full.getContext('2d')
    const scaled = data => {
      fctx.putImageData(new ImageData(data, W, H), 0, 0)
      const c = new OffscreenCanvas(pw, ph), x = c.getContext('2d')
      x.imageSmoothingQuality = 'high'
      x.drawImage(full, 0, 0, pw, ph)
      return c
    }
    const engine = new Uint8ClampedArray(C.length)
    for (let i = 0; i < C.length; i++) engine[i] = Math.min(C[i], T[i])
    const image = async url => { if (!url) return null; try { return await createImageBitmap(await (await fetch(url)).blob()) } catch { return null } }
    const panels = [scaled(new Uint8ClampedArray(O)), await image(proto), scaled(engine), await image(previous)]
    const out = new OffscreenCanvas(w, h), ctx = out.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.font = '18px -apple-system, "Helvetica Neue", Arial, sans-serif'
    ctx.textBaseline = 'middle'
    panels.forEach((pnl, i) => {
      const x = (i % 2) * (pw + gap), y = Math.floor(i / 2) * (cell + gap)
      ctx.fillStyle = '#333333'
      ctx.fillText(labels[i], x + 2, y + top / 2, pw - 4)
      if (pnl) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(pnl, x, y + top, pw, ph) }
      else { ctx.fillStyle = '#f2f2f2'; ctx.fillRect(x, y + top, pw, ph) }
      ctx.strokeStyle = '#d0d0d0'
      ctx.strokeRect(x + 0.5, y + top + 0.5, pw - 1, ph - 1)
    })
    const b64 = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = ''; for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000)); return btoa(s) }
    return { w, h, rgba: b64(out), engine: { w: pw, h: ph, rgba: b64(panels[2]) } }
  },

  /** the lost-ink regions of the page analysed last, for a look (--debug-lost): each region's neighbourhood at 2x, the
   *  original above the copy, the accounted area tinted, as RGBA */
  lostLook(max = 6, pad = 24) {
    const { lost, W, H, orig, copy, accounted } = S.lost
    return lost.slice(0, max).map(l => {
      const x0 = Math.max(0, l.box[0] - pad), y0 = Math.max(0, l.box[1] - pad), x1 = Math.min(W, l.box[2] + pad), y1 = Math.min(H, l.box[3] + pad)
      const w = x1 - x0, h = y1 - y0, out = new Uint8ClampedArray(w * (2 * h + 2) * 4).fill(255)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = 4 * ((y0 + y) * W + x0 + x), a = accounted[(y0 + y) * W + x0 + x], inBox = x0 + x >= l.box[0] && x0 + x < l.box[2] && y0 + y >= l.box[1] && y0 + y < l.box[3]
        for (let c = 0; c < 3; c++) {
          out[4 * (y * w + x) + c] = orig[i + c]
          out[4 * ((y + h + 2) * w + x) + c] = Math.min(copy[i + c], a && c !== 2 ? 200 : 255, inBox && c !== 0 ? 120 : 255)
        }
      }
      return { w, h: 2 * h + 2, rgba: btoa(String.fromCharCode.apply(null, out)), box: l.box, px: l.px }
    })
  },

  /** the fixture's laid units, counted: fit and unfit and why, sizes, the time */
  summary() {
    const { run, index } = S
    const why = {}, knob = {}, scales = []
    let fit = 0, unfit = 0
    for (const l of run.laid.values()) {
      if (l.fit) { fit++; knob[l.state.knob] = (knob[l.state.knob] ?? 0) + 1; scales.push(l.state.scale) } else { unfit++; why[l.why] = (why[l.why] ?? 0) + 1 }
    }
    scales.sort((a, b) => a - b)
    const ms = [...run.ms.values()]
    return {
      laid: run.laid.size, fit, unfit, why, knob, located: index.file.units.length,
      fullSize: scales.length ? scales.filter(s => s >= 1 - 1e-9).length / scales.length : null,
      medianScale: scales.length ? scales[Math.floor(scales.length / 2)] : null,
      page1Ms: run.pages.get(1)?.ms ?? null, slowestUnitMs: ms.length ? Math.max(...ms) : null,
      faces: [...run.faces.loaded].sort(), failedFaces: [...run.faces.failed].sort(), errors: run.errors,
    }
  },
}
window.gateReady = true
