// lab/pdf/layer-lab/layer.mjs
// The instant layer as the layer lab runs it in the browser: the engine's entry (src/pdf-reader/engine/layer/layer.mjs,
// Plan 8b Task 11) over a fixture, drawn as Plan 8d draws it — the original page's pixels as the copy's base, each drawn
// unit's erase (UnitDraw.erase and nothing else) in the paper's colour, its crops from the original's pixels, then its
// text as SVG in PDF units — and the data the diagnostics show: the units left as the original and why, each unit's fit
// state, the placeholders the layout lost, and (with Task 12's layer/check.mjs) the ink the copy lost.
// The engine's input as Plan 8d's reader makes it: rules layerRulesFor(target); roles rolesFor(target,
// familyOfFonts(fonts, the lines each sets)); hyphen loadHyphenator(rules.hyphenate); measure a canvas width at 100 px in
// the face, only once the face has loaded (a lay that wanted an unloaded face is laid again once it has: the faces are
// learned from the measure calls, never from a copy of the engine's choice); textIn the page's text items whose box
// centre lies inside the rectangle, joined in order. Page-even once a page: its body units laid, evenOf asked, those
// above its setting laid again with it. Nothing of the engine is copied here: what the entry does not export is not done.
const ENGINE = '/src/pdf-reader/engine/'
/** what the lab calls of the entry (Task 11's list); the entry is not ready while any is missing */
export const NEEDED = ['parseLayout', 'indexLayout', 'layerRulesFor', 'rolesFor', 'familyOfFonts', 'FACES', 'loadHyphenator', 'trText', 'layUnit', 'bodyUnits', 'evenOf', 'drawUnit']
/** a measure's answer for an unloaded face, per character: the lay is void and done again */
const WANTED = 100
/** small capitals: lower-case letters as capitals at this share of the size (Plan 8d's CAPS_SCALE) */
export const CAPS_SCALE = 0.8
/** the lost-ink check as Task 12's gate runs it: at 2× device pixels, regions of more than 4 pixels */
const INK_SCALE = 2, INK_MIN = 4
/** the closed colour table (layer/pieces.mjs LAYER_COLOURS), for runs drawn in a colour */
let COLOURS = []

/** the engine's entry, or why it is not ready; with the optional modules the diagnostics read where they exist */
export async function loadEngine() {
  let E
  try { E = await import(`${ENGINE}layer/layer.mjs`) } catch (e) { return { ready: false, why: `layer/layer.mjs is not there yet (${String(e?.message ?? e).slice(0, 160)})` } }
  const missing = NEEDED.filter(name => !(name in E))
  if (missing.length) return { ready: false, why: `layer/layer.mjs does not export ${missing.join(', ')} yet`, E }
  const optional = async path => { try { return await import(`${ENGINE}${path}`) } catch { return null } }
  const [check, pieces, coverage] = await Promise.all([optional('layer/check.mjs'), optional('layer/pieces.mjs'), optional('rules/font-coverage.mjs')])
  COLOURS = E.LAYER_COLOURS ?? pieces?.LAYER_COLOURS ?? []
  return { ready: true, E, check, metrics: coverage?.METRICS ?? null }
}
/** the layout file alone (the layout overlay needs no layer): parsed and indexed by the engine's own parser */
export async function loadLayout(bytes) {
  const file = await import(`${ENGINE}layout/file.mjs`)
  const parsed = file.parseLayout(bytes)
  return { file: parsed, index: file.indexLayout(parsed), PH_FLAG: file.PH_FLAG, PH_KINDS: file.PH_KINDS }
}

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
  /** the engine's Measure: a text's width at 100 px in a face, once it has loaded; small capitals as Plan 8d measures them */
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
  /** the faces asked for, each once: a face that fails stays failed */
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

/** a fixture's layer: laid page by page, as each is shown */
export class LayerRun {
  static async open({ engine, layout, units, target, doc }) {
    const { E } = engine
    const run = new LayerRun()
    run.E = engine.E
    run.check = engine.check
    run.layout = layout
    run.index = layout.index
    run.target = target
    run.doc = doc
    run.tr = new Map(units.map(u => [u.id, { pieces: u.pieces, sentences: u.sentences ?? null }]))
    run.state = new Map(units.map(u => [u.id, u.state]))
    const file = layout.file
    // the lines each font sets, which the paper's family is weighed by
    const weights = file.fonts.map(() => 0)
    for (const [, rows] of file.lines) for (let i = 7; i < rows.length; i += 8) weights[rows[i]] = (weights[rows[i]] ?? 0) + 1
    const rules = E.layerRulesFor(target)
    const family = E.familyOfFonts(file.fonts, weights)
    // (the role table's CJK family for the target: the layout rules' built-in set's, which v0 draws by)
    const { BUILTIN_RULES, resolveRules } = await import(`${ENGINE}rules/layout.mjs`)
    const roles = E.rolesFor(target, family, resolveRules(BUILTIN_RULES, target).cjkFaces)
    const hyphen = rules.hyphenate ? await E.loadHyphenator(rules.hyphenate) : null
    run.faces = new Faces(E.FACES)
    run.text = new Map()
    run.input = { file: layout.index, target, rules, roles, measure: run.faces.measure, hyphen, textIn: (page, x0, bottom, x1, top) => run.textIn(page, x0, bottom, x1, top) }
    run.info = { rules, family, roles, hyphen: hyphen ? hyphen.lang : null }
    run.laid = new Map()
    run.evened = new Set()
    run.pages = new Map()
    run.errors = []
    return run
  }

  /** the original page's text inside a rectangle: its items whose box centre lies inside, joined in order */
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
  /** the pages a unit's lines are on */
  pagesOf(id) {
    const u = this.index.unit(id), pages = new Set()
    if (u) for (let i = 0; i < u.lines.length; i += 8) pages.add(u.lines[i])
    return pages
  }

  /** one unit laid, its faces loaded first where a lay asked for one not loaded yet */
  async layOne(id, o) {
    const tr = this.tr.get(id)
    for (let round = 0; round < 4; round++) {
      this.faces.wanted.clear()
      let laid
      try { laid = this.E.layUnit(this.input, id, tr, o) } catch (e) {
        this.errors.push({ id, error: String(e?.message ?? e).slice(0, 300) })
        return { id, fit: false, why: 'error', error: String(e?.message ?? e).slice(0, 300) }
      }
      if (!this.faces.wanted.size) return laid
      const want = [...this.faces.wanted]
      await this.faces.load(want)
      const failed = want.filter(f => this.faces.failed.has(f))
      if (failed.length) return { id, fit: false, why: 'face', faces: failed }
    }
    return { id, fit: false, why: 'face', faces: [...this.faces.wanted] }
  }

  /** a page laid (once): every translated unit with a frame on it, page-even once; its drawing and its timing */
  async page(p) {
    if (this.pages.has(p)) return this.pages.get(p)
    const t0 = performance.now()
    const ids = this.index.onPage(p).filter(id => this.tr.has(id))
    const near = new Set([p])
    for (const id of ids) for (const q of this.pagesOf(id)) near.add(q)
    await this.textOf(near)
    const tText = performance.now()
    for (const id of ids) if (!this.laid.has(id)) this.laid.set(id, await this.layOne(id))
    // page-even, once: its body units' smallest setting, and those above it laid again with it
    const body = this.E.bodyUnits(this.index, p).filter(id => this.tr.has(id))
    const bodyLaid = body.map(id => this.laid.get(id)).filter(l => l?.fit)
    const even = bodyLaid.length ? this.E.evenOf(bodyLaid, this.input.rules) : null
    if (even) {
      for (const l of bodyLaid) {
        if (l.state.scale > even.maxScale + 1e-9) {
          this.laid.set(l.id, await this.layOne(l.id, { maxScale: even.maxScale }))
          this.evened.add(l.id)
        }
      }
    }
    const tLay = performance.now()
    const draws = []
    for (const id of ids) {
      const l = this.laid.get(id)
      if (!l?.fit) continue
      try { draws.push(this.E.drawUnit(this.input, l, p)) } catch (e) { this.errors.push({ id, page: p, error: String(e?.message ?? e).slice(0, 300) }); this.laid.set(id, { id, fit: false, why: 'error', error: String(e?.message ?? e).slice(0, 300) }) }
    }
    const done = { page: p, ids, body, even, draws, ms: { text: tText - t0, lay: tLay - tText, draw: performance.now() - tLay, total: performance.now() - t0 } }
    this.pages.set(p, done)
    return done
  }

  /** every page laid (the whole paper's numbers), the pages in order */
  async all(progress) {
    for (let p = 1; p <= this.doc.numPages; p++) { await this.page(p); progress?.(p) }
  }
  /** what was laid so far, counted: units laid and left, why, the fit's knobs, the size, the time */
  summary() {
    const why = {}, knob = {}, scales = []
    let fit = 0, unfit = 0
    for (const l of this.laid.values()) {
      if (l.fit) { fit++; knob[l.state.knob] = (knob[l.state.knob] ?? 0) + 1; scales.push(l.state.scale) } else { unfit++; why[l.why] = (why[l.why] ?? 0) + 1 }
    }
    scales.sort((a, b) => a - b)
    const ms = [...this.pages.values()].map(p => p.ms.total)
    return {
      pages: this.pages.size, laid: this.laid.size, fit, unfit, why, knob,
      fullSize: scales.length ? scales.filter(s => s >= 1 - 1e-9).length / scales.length : null,
      medianScale: scales.length ? scales[Math.floor(scales.length / 2)] : null,
      untranslated: this.index.file.units.filter(([id]) => !this.tr.has(id)).length,
      page1Ms: this.pages.get(1)?.ms.total ?? null, slowestPageMs: ms.length ? Math.max(...ms) : null,
      faces: [...this.faces.loaded], failedFaces: [...this.faces.failed], errors: this.errors.length,
    }
  }
}

// ---- drawing, in device pixels on the copy and in PDF units in the SVG
const corners = (vp, x0, y0, x1, y1) => {
  const [ax, ay] = vp.convertToViewportPoint(x0, y0), [bx, by] = vp.convertToViewportPoint(x1, y1)
  return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)]
}
/** the copy: the original's pixels, then each drawn unit's erase in the paper's colour, then its crops from the source,
 *  laid on as the drawing says (UnitDraw.blend: darkened in, so that a crop's paper covers nothing under its box) */
export function drawCopy(ctx, source, vp, draws, paper = '#ffffff') {
  ctx.drawImage(source, 0, 0)
  ctx.fillStyle = paper
  for (const d of draws) for (let i = 0; i + 3 < d.erase.length; i += 4) { const [x, y, w, h] = corners(vp, d.erase[i], d.erase[i + 1], d.erase[i + 2], d.erase[i + 3]); ctx.fillRect(x, y, w, h) }
  for (const d of draws) {
    ctx.globalCompositeOperation = d.blend ?? 'source-over'
    for (let i = 0; i + 8 < d.crops.length; i += 9) {
      const [, sx0, sBottom, sx1, sTop, dx, dBase, sBase, scale] = d.crops.slice(i, i + 9)
      const [x, y, w, h] = corners(vp, sx0, sBottom, sx1, sTop)
      const [tx, ty, tw, th] = corners(vp, dx, dBase - (sBase - sBottom) * scale, dx + (sx1 - sx0) * scale, dBase + (sTop - sBase) * scale)
      if (w > 0 && h > 0) ctx.drawImage(source, x, y, w, h, tx, ty, tw, th)
    }
    ctx.globalCompositeOperation = 'source-over'
  }
}
const SVG = 'http://www.w3.org/2000/svg'
const el = (name, attrs = {}) => { const e = document.createElementNS(SVG, name); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e }
/** the page's SVG, its viewBox the page's view in PDF units with y negated */
export function svgOf(view, cls) {
  const [x0, y0, x1, y1] = view
  return el('svg', { class: cls, viewBox: `${x0} ${-y1} ${x1 - x0} ${y1 - y0}`, preserveAspectRatio: 'none' })
}
/** the units' text: a text element a run, at −(baseline + shift), its x list as the drawing gives it */
export function drawText(svg, draws, FACES, target) {
  svg.setAttribute('lang', target)
  for (const d of draws) {
    const g = el('g', { 'data-unit': d.id })
    for (const line of d.lines) {
      for (const r of line.runs) {
        const f = FACES[r.face]
        const t = el('text', {
          x: r.x.map(v => +v.toFixed(3)).join(' '), y: -(line.baseline + (r.shift ?? 0)),
          'font-family': f ? `"${f.family}"` : 'axt-missing', 'font-weight': f?.weight ?? 400, 'font-style': f?.style ?? 'normal', 'font-size': r.size,
          'letter-spacing': r.letterSpacing ?? 0, 'word-spacing': r.wordSpacing ?? 0, fill: r.colour > 0 ? (COLOURS[r.colour - 1] ?? '#000') : '#000',
        })
        if (r.caps) {
          // small capitals: its lower-case letters in capitals at CAPS_SCALE of the size
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

/** lost ink with Task 12's checker: the page at 2×, its copy erased and cropped before the text, the drawn units' own
 *  erase as what they account for; regions in PDF units */
export async function lostInkOf(check, page, view, draws) {
  const vp = page.getViewport({ scale: INK_SCALE })
  const w = Math.ceil(vp.width), h = Math.ceil(vp.height)
  const orig = new OffscreenCanvas(w, h), copy = new OffscreenCanvas(w, h)
  const octx = orig.getContext('2d', { willReadFrequently: true })
  octx.fillStyle = '#ffffff'
  octx.fillRect(0, 0, w, h)
  await page.render({ canvasContext: octx, viewport: vp }).promise
  const cctx = copy.getContext('2d', { willReadFrequently: true })
  drawCopy(cctx, orig, vp, draws)
  const accounted = new Uint8Array(w * h)
  for (const d of draws) for (let i = 0; i + 3 < d.erase.length; i += 4) {
    const [x, y, rw, rh] = corners(vp, d.erase[i], d.erase[i + 1], d.erase[i + 2], d.erase[i + 3])
    for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(h, Math.ceil(y + rh)); yy++) accounted.fill(1, yy * w + Math.max(0, Math.floor(x)), yy * w + Math.min(w, Math.ceil(x + rw)))
  }
  const lost = check.lostInk({ w, h, orig: octx.getImageData(0, 0, w, h).data, copy: cctx.getImageData(0, 0, w, h).data, accounted, min: INK_MIN })
  const [vx0, , , vy1] = view
  return lost.map(l => ({ px: l.px, box: [vx0 + l.box[0] / INK_SCALE, vy1 - l.box[3] / INK_SCALE, vx0 + l.box[2] / INK_SCALE, vy1 - l.box[1] / INK_SCALE] }))
}
