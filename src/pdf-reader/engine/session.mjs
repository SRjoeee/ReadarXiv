// Reader prototype: arXiv's PDF on the left, the translated PDF on the right, each in PDF.js's own PDFViewer. Every
// translation unit is located on both sides (anchors.mjs): bounded by the marks of our compiles where they hold — the
// translation's own named destinations, and on the left the marks of our compile of the original, kept where arXiv's
// PDF has the same word there — and by text anchoring inside those bounds or, without them, on its own.
// Scrolling one side moves the other with it; once scrolling stops, the paragraph at the reading line is brought level
// on both sides. Hovering a paragraph lights its lines on both sides; a click on one side scrolls the other to it.
// ?progressive=1 plays #292's idea with precompiled stages; ?live=1 does it for real: the paper's source unpacked in
// the page, translated from the reader's place outwards, compiled on our site's TeX page (an iframe) again and again
// (live.mjs). Each newer compile is laid out and drawn out of sight, placed so that the paragraph at the reading line
// stays where it is, then shown in one step.
// The session module: the prototype's page script, moved into the extension (the reader's design, §11.2). It runs
// once, at load, after the page has handed it its host (host.mjs): the two panes, the address's parameters and the
// sink for its events. What the prototype's header controls did, it now exports as commands; what it wrote into the
// header, it reports as events (session.d.mts). The controller (../controller.ts) is its only caller.
import { createPdfStore } from '@/cache/pdf-store'
import { isCurrent } from '@/cache/pdf-record'
import { lookOf } from '@/config/appearance'
import { toBcp47 } from '@/config/languages'
import { isTranslatable, linesToBoxes } from '@/core/image/boxes'
import { appearanceRule } from '@/core/renderer/style-preset'
import { renderImage, setImageModes } from '@/core/renderer/image'
import { sendMessage } from '@/shared/messages'
import { createSurfaceConfig } from '@/shared/surface-config'
import { ocrCall } from '../ocr'
import { ASSETS, EventBus, LinkTarget, PDFLinkService, PDFViewer, pdfjsLib } from '../pdfjs'
import { anchorUnits, boundsFromMarks, markWords, tokenizeDocument } from './anchors.mjs'
import { decideWrite, digestOf, figureKeyOf, knownMarks, seedFrom, sourceHash, unitsOf } from './cache.mjs'
import { openEngine, paperContext } from './engine.mjs'
import { blockWire, figureLabels, figureRegions, splitBlock, vectorLines } from './figures.mjs'
import { hostReady } from './host.mjs'
import { openPaper, PIPELINE_VERSION, runLive } from './live.mjs'
import { isName, plainSource, WIRE } from './mt.mjs'
import { verified, VERIFIED } from './scripts.mjs'
import { flowChain, knots, lineTable, makeMap } from './sync.mjs'
import { unpackSource } from './tar.mjs'

const host = await hostReady
const { params } = host
const paper = params.get('paper') ?? ''
/** a precompiled demo paper (made locally by spikes/reader-papers.mjs, never in the repository; the probes stage it into
 *  a copy of the build at pdf-reader/papers/) when one is asked for by `paper` without `live` */
const DEMO = params.get('live') !== '1' && params.has('paper')
/** the developer's status line, for the probes (window.__reader.status) and the log; the interface does not show it */
const status = text => { window.__reader.status = text; host.emit({ type: 'status', text }) }
const timing = { start: performance.now() }
window.__reader = { timing, ready: false }

// ---------------------------------------------------------------- the extension's settings, and the display
// The target language and the highlight's band are the extension's settings, read and written as its settings page
// does and followed as they change, so that the PDF and the HTML page agree. The display is the reader's own, kept
// until the reader is part of the extension's settings: the original alone (nothing is translated or compiled until
// the reader asks for more), the translation alone, or both side by side.
const MODES = ['original', 'translation', 'bilingual']
const PREFS = 'axtPdfReader'
const prefs = await chrome.storage.local.get(PREFS).then(r => r[PREFS] ?? {}).catch(() => ({}))
/** the reader's own preferences, merged into what storage holds when they are written: another reader page may have
 *  saved since this one opened (Devin on #297). One write after another: two made at once read the same object, and
 *  the one landing last dropped the other's change (Codex on #297) */
let prefWrites = Promise.resolve()
const savePrefs = patch => (prefWrites = prefWrites.then(() => chrome.storage.local.get(PREFS)).then(r => chrome.storage.local.set({ [PREFS]: { ...(r[PREFS] ?? {}), ...patch } })).catch(() => undefined))
let mode = MODES.includes(params.get('mode')) ? params.get('mode') : MODES.includes(prefs.mode) ? prefs.mode : 'original'
function showMode() {
  document.documentElement.setAttribute('data-axt-pdf-mode', mode)
  host.emit({ type: 'display', mode })
}
showMode()
// The extension's settings as its popup and settings page have them (shared/surface-config.ts): each change a patch on
// what storage holds when its turn comes, one after another, and a configuration that could not be read said so (Codex
// on #297). The reader's bar is in English alone, so no interface language asks for a reload
const surface = createSurfaceConfig({ localeStale: () => false, reload: () => location.reload() })
await new Promise(resolve => { const off = surface.subscribe(() => { if (surface.state().config) { off(); resolve() } }); surface.start() })
let config = surface.state().config
function showSettings() {
  let sheet = document.getElementById('axt-look')
  if (!sheet) { sheet = document.createElement('style'); sheet.id = 'axt-look'; document.head.append(sheet) }
  sheet.textContent = appearanceRule(lookOf(config))
  // the defaults are in effect — the service and its key set on the settings page are not — until they are repaired there
  host.emit({ type: 'notice', why: surface.state().fallbackReason ?? null })
}
showSettings()
/** this page's own writes of the settings, which a new language's reload waits for; it makes none until the reader's
 *  controls write through the controller (the plan's Part 2) */
const writes = Promise.resolve()
/** true once the translation has started: a new language then means another document, and the page starts again */
let translating = false
surface.subscribe(() => {
  const next = surface.state().config
  if (!next) return
  const language = next.targetLanguage !== config.targetLanguage
  config = next
  showSettings()
  if (language && translating) void writes.then(() => location.reload())
})
let wantTranslation = null
const translationWanted = new Promise(resolve => { wantTranslation = resolve })
if (mode !== 'original') wantTranslation()
/** the display chosen: where the reader is read first, on the side still shown (Codex on #297) */
export function setDisplay(next) {
  if (!MODES.includes(next) || next === mode) return
  const from = mode
  const place = from === 'bilingual' ? null : readingPlace(from === 'original' ? left : right)
  window.__reader.place = place
  mode = next
  showMode()
  void savePrefs({ mode })
  relayout(from, place)
  if (mode !== 'original') wantTranslation()
}

// ---------------------------------------------------------------- the two viewers
function makeSide(container) {
  const eventBus = new EventBus()
  // a link out of the paper opens in a new tab: in this frame it would replace the reader, which on arXiv's PDF page is
  // laid over the page (Devin on #297)
  const linkService = new PDFLinkService({ eventBus, externalLinkTarget: LinkTarget.BLANK })
  const viewer = new PDFViewer({ container, eventBus, linkService, textLayerMode: 1, removePageBorders: false })
  linkService.setViewer(viewer)
  // figs: each page's figures being laid (paintFigures), and figGen the latest call's number, by page; frames: a draft
  // preview's frames (pdfFrames), a promise; anchored: the side's units located, a promise, where they come after its pages
  return { container, eventBus, linkService, viewer, doc: null, anchors: new Map(), byPage: new Map(), figs: new Map(), figGen: new Map(), frames: null, anchored: null }
}
const left = makeSide(host.left)
let right = makeSide(host.right)
const sides = [left, right]
const other = side => (side === left ? right : left)

async function open(side, url) {
  side.task = pdfjsLib.getDocument({ url, ...ASSETS })
  const doc = await side.task.promise
  side.doc = doc
  side.viewer.setDocument(doc)
  side.linkService.setDocument(doc)
  return doc
}

// ---------------------------------------------------------------- anchors
async function textPages(doc) {
  const pages = []
  for (let p = 1; p <= doc.numPages; p++) { const tc = await (await doc.getPage(p)).getTextContent(); pages.push({ page: p, items: tc.items, styles: tc.styles }) }
  return pages
}
/** the named destinations of our marks (axt-<unit>s / axt-<unit>e) in a PDF, as { page, x, y } */
async function pdfMarks(doc) {
  const out = new Map()
  for (const [name, d] of await doc.getDestinations()) if (/^axt-\d+[se]$/.test(name) && d) out.set(name.slice(4), { page: (await doc.getPageIndex(d[0])) + 1, x: d[2], y: d[3] })
  return out
}
/** the frames our previews set where images go (live.mjs DRAFT): page → [{ n, x0, y0, x1, y1 }] in PDF units, from each
 *  frame's three marks; marks that make no upright rectangle (a transformed include) are left out */
async function pdfFrames(doc) {
  const corners = new Map()
  for (const [name, d] of await doc.getDestinations()) {
    const m = /^axt-g(\d+)([abt])$/.exec(name)
    if (m && d) (corners.get(m[1]) ?? corners.set(m[1], {}).get(m[1]))[m[2]] = { page: (await doc.getPageIndex(d[0])) + 1, x: d[2], y: d[3] }
  }
  const out = new Map()
  for (const [n, { a, b, t }] of corners) {
    if (!a || !b || !t || a.page !== b.page || b.page !== t.page || Math.abs(a.y - b.y) > 0.5 || Math.abs(b.x - t.x) > 0.5 || b.x - a.x < 1 || t.y - b.y < 1) continue
    ;(out.get(a.page) ?? out.set(a.page, []).get(a.page)).push({ n: Number(n), x0: a.x, y0: a.y, x1: b.x, y1: t.y })
  }
  return out
}
function index(side, anchors) {
  side.anchors = anchors
  side.groups = null
  side.byPage = new Map()
  for (const [id, a] of anchors) if (a) a.rects.forEach((r, k) => (side.byPage.get(r.page) ?? side.byPage.set(r.page, []).get(r.page)).push({ id, r, k }))
}

// ---------------------------------------------------------------- geometry: PDF units ↔ positions in a container
const pageView = (side, page) => side.viewer.getPageView(page - 1)
/** a rectangle in PDF units → CSS pixels inside its page's div */
function toPageBox(side, r) {
  const vp = pageView(side, r.page).viewport
  const [ax, ay] = vp.convertToViewportPoint(r.x0, r.y1)
  const [bx, by] = vp.convertToViewportPoint(r.x1, r.y0)
  return { left: Math.min(ax, bx), top: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) }
}
/** the top of a unit's first line, in the container's scroll coordinates */
function unitTop(side, id) {
  const a = side.anchors.get(id)
  if (!a) return null
  const r = a.rects[0], pv = pageView(side, r.page)
  const pageRect = pv.div.getBoundingClientRect(), cRect = side.container.getBoundingClientRect()
  return pageRect.top - cRect.top + side.container.scrollTop + toPageBox(side, r).top
}

// ---------------------------------------------------------------- highlight
let lit = null
function paint(side) {
  for (const layer of side.container.querySelectorAll('.axt-hl-layer')) layer.replaceChildren()
  if (lit == null) return
  const a = side.anchors.get(lit)
  if (!a) return
  for (const r of blocksOf(a.rects)) {
    const pv = pageView(side, r.page)
    if (!pv?.div) continue
    let layer = pv.div.querySelector(':scope > .axt-hl-layer')
    if (!layer) { layer = document.createElement('div'); layer.className = 'axt-hl-layer'; pv.div.append(layer) }
    const box = toPageBox(side, r), el = document.createElement('div')
    el.className = 'axt-hl'
    Object.assign(el.style, { left: `${box.left - 4}px`, top: `${box.top - 3}px`, width: `${box.width + 8}px`, height: `${box.height + 6}px` })
    layer.append(el)
  }
}
/**
 * A unit's lines as blocks: one per run of them down one column of one page, from the run's first line to its last and
 * across its widest, so that a paragraph reads as one wash behind its text, as on the HTML page, not as a selection of
 * lines with gaps between them (the owner, 2026-09-23). A line starts a new block on another page, in another column
 * (its span across the page no longer overlapping the block's), or far below the block (a large display between)
 */
function blocksOf(rects) {
  const out = []
  for (const r of rects) {
    const b = out.at(-1), h = r.y1 - r.y0
    const across = b && Math.min(b.x1, r.x1) - Math.max(b.x0, r.x0)
    if (b && b.page === r.page && across > 0.3 * Math.min(b.x1 - b.x0, r.x1 - r.x0) && r.y1 <= b.y1 + h && b.y0 - r.y1 < 6 * h) {
      b.x0 = Math.min(b.x0, r.x0); b.x1 = Math.max(b.x1, r.x1); b.y0 = Math.min(b.y0, r.y0)
    } else out.push({ page: r.page, x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 })
  }
  return out
}
function light(id) { if (id === lit) return; lit = id; for (const s of sides) paint(s) }

// ---------------------------------------------------------------- figure text
// The HTML mode's image translation, run on the translation's pages: the extension's own modules — lines merged into
// boxes (core/image/boxes.ts), the overlay and its material (core/renderer/image.ts, styles/image.css), the bitmap
// recogniser (core/ocr, through the background: ../ocr.ts). What is the PDF's own is the
// input: where each figure sits and which lines are in it (figures.mjs — the text layer for a vector figure, the
// recogniser for a bitmap), as normalised lines in the recogniser's shape. Each figure's overlay hangs on an empty
// <img> laid over it, the anchor the style sheet positions an overlay by.
/** the paper's title and abstract, with every batch (engine.mjs); in live mode known once the source is read, and the
 *  figures' text waits for it rather than go out without it and be cached so (Codex on #296) */
let prose = '', paperCtx = Promise.resolve({})
/** the extension's chain for this page's paper (engine.mjs), opened once: the units' translation and the figures' text */
let engineP = null
// its scope is withdrawn when the page goes, whichever mode opened it (engine.mjs)
const theEngine = () => (engineP ??= openEngine({ paper }))
/** each unit's kind (para, caption, heading, …), by id: a caption anchors its float's contents (placeAt) */
let unitKind = new Map()
/** this machine's copies of compiled translations (src/cache/pdf-store.ts), and the record shown if one was */
const pdfCache = createPdfStore()
let cached = null
/**
 * The figures' boxes translated, figureKeyOf(their texts) → { key, texts, by }: seeded from a copy and kept in
 * its record. A copy's own are shown whatever identity made them, and replaced when the current engine's come
 */
let figureEntries = new Map()
let cacheKey = null // { digest, lang } of the paper open, once its PDF is read
let saveTimer = 0, repaintTimer = 0
const saveFiguresSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (cacheKey) void pdfCache.patchFigures(cacheKey.digest, cacheKey.lang, [...figureEntries.values()]) }, 2000) }
const repaintFiguresSoon = () => { clearTimeout(repaintTimer); repaintTimer = setTimeout(() => { for (const [n] of right.figs) right.figs.set(n, paintFigures(right, n).catch(e => console.warn('[figures]', e))) }, 300) }
let figuresOn = true // figure text, the reader's switch (setFigures)
document.documentElement.setAttribute('data-axt-on', '')
document.documentElement.setAttribute('data-axt-mode', 'only')
setImageModes(document, ['only'])
/** the figures placed on a page (figures.mjs figureRegions); from the operator list the viewer draws the page by (its
 *  annotation mode), which PDF.js then builds once for both */
const regionsOf = perDoc((side, n) => side.doc.getPage(n).then(page => page.getOperatorList({ annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS })).then(ops => figureRegions(ops, pdfjsLib.OPS)))
/** `make(side, ...args)` once a document and arguments, kept as long as the document is */
function perDoc(make) {
  const byDoc = new WeakMap()
  return (side, ...args) => {
    let m = byDoc.get(side.doc)
    if (!m) byDoc.set(side.doc, (m = new Map()))
    const key = args.join(':')
    if (!m.has(key)) m.set(key, make(side, ...args))
    return m.get(key)
  }
}
/** the labels in a page's figures (figures.mjs figureLabels), from its text layer */
const labelsOn = perDoc(async (side, n) => figureLabels((await (await side.doc.getPage(n)).getTextContent()).items, await regionsOf(side, n)))
/** one figure's lines — a bitmap read by the recogniser, a vector figure's labels: { region, kind, lines } */
const figureOf = perDoc(async (side, n, k) => {
  const region = (await regionsOf(side, n))[k]
  if (region.kind !== 'raster') return { region, kind: region.kind, lines: vectorLines((await labelsOn(side, n)).filter(l => l.figure === k), region) }
  return { region, kind: 'raster', lines: region.image ? await recognise(await side.doc.getPage(n), region.image) : [] }
})
/** a bitmap of the page, by its object id: a copy (PDF.js keeps drawing its own), or null when it is too small to hold text */
async function bitmapOf(page, id) {
  const obj = await new Promise(resolve => page.objs.get(id, resolve))
  let bitmap
  if (obj?.bitmap) bitmap = await createImageBitmap(obj.bitmap)
  else if (obj?.data) {
    const { width, height, data, kind } = obj, rgba = new Uint8ClampedArray(width * height * 4)
    // PDF.js's kinds: 1 one bit per pixel, 2 RGB, 3 RGBA
    if (kind === 3) rgba.set(data)
    else if (kind === 2) for (let i = 0, j = 0; i < width * height; i++, j += 3) rgba.set([data[j], data[j + 1], data[j + 2], 255], i * 4)
    else return null
    bitmap = await createImageBitmap(new ImageData(rgba, width, height))
  } else return null
  if (bitmap.width < 32 || bitmap.height < 32) { bitmap.close(); return null }
  return bitmap
}
/** a bitmap's lines, read by the extension's recogniser through the background, as the HTML page's are (ocr.ts) */
async function recognise(page, id) {
  const bitmap = await bitmapOf(page, id)
  if (!bitmap) return []
  const reply = await sendMessage({ type: 'axt:ocr', ...(await ocrCall(bitmap, paper)) }).catch(e => ({ ok: false, error: { message: String(e?.message ?? e) } }))
  if (!reply.ok) { console.warn('[ocr]', reply.error.message); return [] }
  return reply.result.lines
}
const translated = new Map() // figureKeyOf(boxes' texts) → their translations, a Promise while they are out
/**
 * A figure's boxes → their translations, null for a box left as it is. A figure's boxes go as one text with a
 * placeholder between them, in the chain's wire format, so that each is translated in the figure's context (alone, a
 * box's "Score" came back as 配乐); a text whose placeholders do not come back one for one goes again box by box.
 * Proposed for the shared module, with the name rule below.
 */
async function translateBoxes(boxes) {
  const todo = boxes.map((b, i) => i).filter(i => isTranslatable(boxes[i].text))
  const out = boxes.map(() => null)
  // the engine when one answers; while none does, a copy's own entries are all there is
  const engine = await theEngine().catch(() => null)
  const context = engine ? await paperCtx : null
  /**
   * Boxes' texts → their translations, one per box, null where one did not come back. From the entry kept for these
   * texts, whatever engine or wire format made it, shown until the current engine's replaces it and kept if that
   * fails (REPORT, eighteenth addendum); else from the engine, by `make` → { texts, by } or null
   */
  const ask = (texts, make) => {
    const key = figureKeyOf(texts), known = figureEntries.get(key)
    if (known && (!engine || known.by === engine.identity)) return Promise.resolve(known.texts)
    if (!engine) return Promise.resolve(known?.texts ?? null)
    if (!translated.has(key)) translated.set(key, make().then(got => {
      if (!got) return known?.texts ?? null
      figureEntries.set(key, { key, texts: got.texts, by: got.by })
      saveFiguresSoon()
      if (known && JSON.stringify(known.texts) !== JSON.stringify(got.texts)) repaintFiguresSoon()
      return got.texts
    }).catch(() => known?.texts ?? null))
    return known ? Promise.resolve(known.texts) : translated.get(key)
  }
  const one = wire => engine.translate([wire], context).then(r => r[0])
  const single = []
  for (let k = 0; k < todo.length; k += 40) {
    const chunk = todo.slice(k, k + 40), texts = chunk.map(i => boxes[i].text)
    if (chunk.length < 2) { single.push(...chunk); continue }
    const parts = await ask(texts, async () => {
      const wire = blockWire(texts, engine.format)
      const got = wire && (await one(wire))
      const split = got && splitBlock(got.text, chunk.length, engine.format)
      return split ? { texts: split, by: got.by } : null
    })
    if (parts) chunk.forEach((i, j) => { out[i] = parts[j] }); else single.push(...chunk)
  }
  await Promise.all(single.map(async i => {
    const got = await ask([boxes[i].text], async () => {
      const { run, unrun } = WIRE[engine.format]
      const r = await one(run(boxes[i].text))
      return r ? { texts: [unrun(r.text)], by: r.by } : null
    })
    out[i] = got?.[0] ?? null
  }))
  return out
}
// A figure on a translation page — in arXiv's PDF shown there until the first preview, in a preview, in the final — is
// one of arXiv's (the left's): its text is read and translated once, there, and every translation shows the same
// overlay. A draft preview sets a frame where an image goes (live.mjs DRAFT), and the left's figure is drawn over it.
const overlaps = (a, b) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0)
/** the caption next to a figure's rectangle on a side's page (PDF units): a caption located there whose first line lies
 *  just below the rectangle, else whose last line lies just above it, across its column; the nearest, or null */
function captionNear(side, page, r) {
  const col = columnOf(side, page, r)
  let below = null, above = null
  for (const [id, a] of side.anchors) {
    if (!a || unitKind.get(id) !== 'caption') continue
    const first = a.rects[0], last = a.rects.at(-1), near = 3 * (first.y1 - first.y0) + 24
    const down = first.page === page && overlaps(first, col) ? r.y0 - first.y1 : NaN, up = last.page === page && overlaps(last, col) ? last.y0 - r.y1 : NaN
    if (down > -2 && down < near && !(below?.gap <= down)) below = { id, gap: down }
    if (up > -2 && up < near && !(above?.gap <= up)) above = { id, gap: up }
  }
  return (below ?? above)?.id ?? null
}
/** rectangles' indices in reading order: rows from the top, each from the left; a rectangle is in a row when it shares
 *  half its height with the row's first */
function readingOrder(rs) {
  const rest = rs.map((r, i) => i).sort((a, b) => rs[b].y1 - rs[a].y1), out = []
  while (rest.length) {
    const top = rs[rest[0]], row = rest.filter(i => Math.min(rs[i].y1, top.y1) - Math.max(rs[i].y0, top.y0) > 0.5 * Math.min(rs[i].y1 - rs[i].y0, top.y1 - top.y0))
    out.push(...row.sort((a, b) => rs[a].x0 - rs[b].x0))
    for (const i of row) rest.splice(rest.indexOf(i), 1)
  }
  return out
}
/**
 * The figures of the left that rectangles on a translation page stand for (its figures, or a draft preview's frames):
 * those next to one caption on both sides and of one size, paired in reading order. A float keeps its contents and
 * their order whatever the language, so two figures can only be confused if they share both; one with no caption, or
 * found with none on either side, stands for none. Map index in `rects` → { page, k, region } on the left
 */
async function leftFor(side, n, rects) {
  const out = new Map(), groups = new Map()
  rects.forEach((r, i) => { const c = captionNear(side, n, r); if (c != null) (groups.get(c) ?? groups.set(c, []).get(c)).push(i) })
  for (const [c, mine] of groups) {
    const theirs = await leftGroup(c), order = readingOrder(theirs.map(t => t.region)), used = new Set()
    for (const i of readingOrder(mine.map(i => rects[i])).map(j => mine[j])) {
      const r = rects[i]
      const j = order.find(j => !used.has(j) && Math.abs(theirs[j].region.x1 - theirs[j].region.x0 - (r.x1 - r.x0)) < 1.5 && Math.abs(theirs[j].region.y1 - theirs[j].region.y0 - (r.y1 - r.y0)) < 1.5)
      if (j !== undefined) { used.add(j); out.set(i, theirs[j]) }
    }
  }
  return out
}
/** the figures next to a caption on the left, [{ page, k, region }]: kept until the left is located again (index) */
function leftGroup(c) {
  left.groups ??= new Map()
  if (!left.groups.has(c)) left.groups.set(c, (async () => {
    const out = []
    for (const p of new Set(left.anchors.get(c)?.rects.map(r => r.page))) (await regionsOf(left, p)).forEach((region, k) => { if (captionNear(left, p, region) === c) out.push({ page: p, k, region }) })
    return out
  })())
  return left.groups.get(c)
}
/** a figure of the left drawn at a size in device pixels, for a frame: its page drawn once per figure and size (the
 *  latest size kept), a copy for each frame; in the viewer's annotation mode, so that PDF.js reads the page once. Kept
 *  while previews come in (replaceRight empties it for the final: a figure's drawing is megabytes) */
const copies = new Map() // `${page}:${k}` → { w, h, canvas: Promise<HTMLCanvasElement> }
async function copyOf({ page, k, region }, w, h) {
  let c = copies.get(`${page}:${k}`)
  if (!c || c.w !== w || c.h !== h) copies.set(`${page}:${k}`, (c = { w, h, canvas: (async () => {
    const pdfPage = await left.doc.getPage(page), viewport = pdfPage.getViewport({ scale: w / (region.x1 - region.x0) })
    const [x, y] = viewport.convertToViewportPoint(region.x0, region.y1)
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h })
    await pdfPage.render({ canvas, viewport, transform: [1, 0, 0, 1, -x, -y], annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS }).promise
    return canvas
  })() }))
  const out = Object.assign(document.createElement('canvas'), { width: w, height: h })
  out.getContext('2d').drawImage(await c.canvas, 0, 0)
  return out
}
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
/**
 * A translation page's figures (any side but the left), each with the overlay of its text: the text of the left's
 * figure it stands for (leftFor), else its own; on a draft preview, the left's figure drawn over each frame too, and a
 * frame that stands for none left as it is. The page's overlays are replaced in one step once the new ones are ready,
 * so that a page drawn again never shows its figures bare in between; a newer call for the page wins.
 */
async function paintFigures(side, n) {
  const pv = pageView(side, n)
  if (!pv?.div || side === left) return
  const gen = (side.figGen.get(n) ?? 0) + 1
  side.figGen.set(n, gen)
  let laid = []
  if (figuresOn) {
    const frames = side.frames && ((await side.frames).get(n) ?? [])
    const rects = frames ?? (await regionsOf(side, n))
    // arXiv's PDF itself, shown on the right until the first preview: its figures are the left's, page for page
    const same = !frames && left.doc && side.doc.fingerprints[0] === left.doc.fingerprints[0]
    const theirs = same ? new Map(rects.map((region, k) => [k, { page: n, k, region }])) : (await side.anchored, await leftFor(side, n, rects))
    const vp = pv.viewport, dpr = devicePixelRatio || 1
    laid = await Promise.all(rects.map(async (r, i) => {
      const from = theirs.get(i)
      if (frames && !from) return null
      const fig = await (from ? figureOf(left, from.page, from.k) : figureOf(side, n, i))
      // a line that is only a name joins no box and keeps its text (mt.mjs isName): merged, a legend's
      // Average / DirectHarm4 / HarmBench / HEx-PHI went as one text and DirectHarm4 came back as 直接伤害 4; alone, the
      // HTML mode's tick names came back as 地狱之战 (HellaSwag) and 魔法师 (Magicoder). Proposed for the shared module
      const boxes = linesToBoxes(fig.lines.filter(l => !isName(l.text, prose)))
      const done = boxes.length ? await translateBoxes(boxes) : []
      const labels = boxes.flatMap((b, j) => (done[j] && done[j] !== b.text ? [{ ...b, source: b.text, text: done[j] }] : []))
      if (!labels.length && !frames) return null
      // the figure's place on the page, in CSS pixels; the overlay is laid by the style sheet over the <img> there
      const [ax, ay] = vp.convertToViewportPoint(r.x0, r.y1), [bx, by] = vp.convertToViewportPoint(r.x1, r.y0)
      const width = Math.abs(bx - ax), height = Math.abs(by - ay)
      const holder = Object.assign(document.createElement('div'), { className: 'axt-fig' })
      Object.assign(holder.style, { left: `${Math.min(ax, bx)}px`, top: `${Math.min(ay, by)}px`, width: `${width}px`, height: `${height}px` })
      if (frames) {
        const copy = await copyOf(from, Math.max(1, Math.round(width * dpr)), Math.max(1, Math.round(height * dpr))).catch(e => { console.warn('[figure copy]', e); return null })
        if (!copy) return null
        holder.append(copy)
      }
      const inner = document.createElement('div'), img = Object.assign(document.createElement('img'), { alt: '', src: BLANK })
      inner.append(img); holder.append(inner)
      return { holder, img, labels, id: `p${n}-f${i}`, kind: fig.kind === 'raster' ? 'raster' : 'svg', ratio: width / Math.max(1, height) }
    }))
  }
  if (side.figGen.get(n) !== gen) return
  pv.div.querySelectorAll(':scope > .axt-fig').forEach(el => el.remove())
  for (const f of laid) if (f) { pv.div.append(f.holder); if (f.labels.length) renderImage({ id: f.id, el: f.img, kind: f.kind }, f.labels, { ratio: f.ratio }) }
}
function repaintFigures() { for (const pv of right.viewer._pages ?? []) if (pv.renderingState === 3) right.figs.set(pv.id, paintFigures(right, pv.id).catch(e => console.warn('[figures]', e))) }

/** a pointer event's place on its page: the page and the point in PDF units, or null off the pages */
function pointOf(side, event) {
  const pageDiv = event.target.closest?.('.page')
  if (!pageDiv) return null
  const page = Number(pageDiv.dataset.pageNumber), pv = pageView(side, page)
  // the page's content box: the viewport starts inside its border
  const box = pageDiv.getBoundingClientRect()
  const [x, y] = pv.viewport.convertToPdfPoint(event.clientX - box.left - pageDiv.clientLeft, event.clientY - box.top - pageDiv.clientTop)
  return { page, x, y }
}
/** the unit under a pointer event, the line of it (its rect's index) and how far down that line */
function hitAt(side, event) {
  const at = pointOf(side, event)
  if (!at) return null
  const m = 2
  let hit = null
  for (const { id, r, k } of side.byPage.get(at.page) ?? []) {
    if (at.x < r.x0 - m || at.x > r.x1 + m || at.y < r.y0 - m || at.y > r.y1 + m) continue
    const area = (r.x1 - r.x0) * (r.y1 - r.y0)
    if (!hit || area < hit.area) hit = { id, line: k, f: Math.min(1, Math.max(0, (r.y1 - at.y) / Math.max(1, r.y1 - r.y0))), area }
  }
  return hit
}
const unitAt = (side, event) => hitAt(side, event)?.id ?? null

// ---------------------------------------------------------------- scroll sync
// Only the side the reader is scrolling drives the other: the one last touched by wheel, touch, keys or a press on
// its scrollbar. The other side's scroll events never drive back — that echo is what made the panes fight.
// While scrolling, the other side follows a table of the linked units' tops, measured once per layout (load, zoom,
// resize) and kept only where it rises on both sides, interpolated between neighbours so that it moves continuously.
// In two columns no such table holds every paragraph level, so once scrolling stops, the paragraph at the reading
// line — in the column under the pointer — is brought level on the other side, line for line.
// The reading line is where on the view the reader is taken to be reading, as a share of its height. It starts a
// quarter down; a click moves it to the height of what was clicked (alignClick), so that scrolling on keeps the pair
// the reader chose level instead of pulling it back to a quarter down.
let readingLine = 0.25
let driver = null
let table = null // [[leftTop, rightTop], ...] rising on both sides
let lines = null // per side, every highlighted line in scroll coordinates
const pageTop = (side, page) => { const pv = pageView(side, page); return pv.div.offsetTop + pv.div.clientTop }
function unitDocTop(side, id) {
  const a = side.anchors.get(id)
  if (!a) return null
  const r = a.rects[0]
  return pageTop(side, r.page) + toPageBox(side, r).top
}
function buildTable() {
  const pairs = []
  for (const [id, a] of left.anchors) { if (!a || !right.anchors.get(id)) continue; const l = unitDocTop(left, id), r = unitDocTop(right, id); if (l != null && r != null) pairs.push([l, r]) }
  pairs.sort((a, b) => a[0] - b[0])
  // the longest run rising on the right too: a unit found out of order on one side would fold the map back
  const len = pairs.map(() => 1), prev = pairs.map(() => -1)
  let tail = 0
  for (let a = 0; a < pairs.length; a++) {
    for (let b = Math.max(0, a - 60); b < a; b++) if (pairs[b][1] < pairs[a][1] && len[b] + 1 > len[a]) { len[a] = len[b] + 1; prev[a] = b }
    if (len[a] > len[tail]) tail = a
  }
  const rising = []
  for (let a = tail; a !== -1; a = prev[a]) rising.unshift(pairs[a])
  table = [[0, 0], ...rising, [left.container.scrollHeight, right.container.scrollHeight]]
}
/** a position on one side → the corresponding position on the other, by the table */
function map(fromLeft, y) {
  if (!table) buildTable()
  const [a, b] = fromLeft ? [0, 1] : [1, 0]
  let lo = 0, hi = table.length - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (table[mid][a] <= y) lo = mid; else hi = mid }
  const [p, q] = [table[lo], table[hi]]
  const t = q[a] === p[a] ? 0 : (y - p[a]) / (q[a] - p[a])
  return p[b] + t * (q[b] - p[b])
}
function lineBoxes(side) {
  const out = []
  for (const [id, a] of side.anchors) if (a) a.rects.forEach((r, li) => { const box = toPageBox(side, r), top = pageTop(side, r.page) + box.top; out.push({ id, li, n: a.rects.length, page: r.page, top, bottom: top + box.height, x0: r.x0, x1: r.x1 }) })
  return out
}
/** the line at a scroll position in a page's column (x in PDF units): the one there, else the next one below */
function lineAt(side, y, x) {
  lines ??= new Map()
  if (!lines.has(side)) lines.set(side, lineBoxes(side))
  let hit = null, below = null
  for (const l of lines.get(side)) {
    if (x < l.x0 - 6 || x > l.x1 + 6) continue
    if (y >= l.top - 1 && y <= l.bottom + 1) { if (!hit || l.bottom - l.top < hit.bottom - hit.top) hit = l }
    else if (l.top > y && l.top - y < side.container.clientHeight * 0.3 && (!below || l.top < below.top)) below = l
  }
  return hit ?? below
}
let frame = 0, settleTimer = 0, pointerX = null

// How the other side follows, the reader's choice (REPORT, sixteenth and seventeenth addenda): off; the design as it was
// (a table of unit tops, and a settle 160 ms after the last scroll); or together — while the reader scrolls, the other
// side moves with it as one sheet, at the same speed or at the speed the two layouts' local ratio asks, and once the
// scroll has ended (a trackpad's glide included) it glides so that the content the reader's side is levelled by — the
// top of its view, or the paragraph under the pointer — stands at the same height on both.
const SYNC_MODES = ['off', 'current', 'same', 'pointer', 'matched']
let syncMode = SYNC_MODES.includes(prefs.syncMode) ? prefs.syncMode : 'same'
const together = () => syncMode === 'same' || syncMode === 'pointer' || syncMode === 'matched'
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
/** a critically damped spring's way from 0 to 1 over its time, k from 0 to 1: no overshoot, no bounce */
const springAt = k => { const y = t => 1 - (1 + 6.6 * t) * Math.exp(-6.6 * t); return y(Math.min(1, Math.max(0, k))) / y(1) }
/** the same curve as a CSS easing, for the glide the compositor runs */
const SPRING = `linear(${Array.from({ length: 41 }, (_, i) => +springAt(i / 40).toFixed(4)).join(', ')})`
/** how long a glide takes for a distance: 250–450 ms, longer the further; none with reduced motion */
const glideMs = d => (reduced.matches ? 0 : Math.min(450, 250 + 0.25 * Math.abs(d)))
/**
 * The follower as the together modes move it. `pos`: its position, fractional — scrollTop rounds to device pixels, and
 * steps of the same size must not drift by it; `lastD`: the driver's position last seen, null when it is to be read
 * afresh (a layout changed); `rest`: the wait after the scroll's end; `spring`: the glide under way; `moving`: the
 * driver scrolling, from its first step to its scroll's end
 */
const follow = { pos: null, lastD: null, rest: 0, spring: 0, moving: false }
/** the positions to go on from: the driver's as it is, the follower's as it is — after a click, a glide or a new driver */
function rebase() {
  if (!driver) return
  follow.lastD = driver.container.scrollTop
  follow.pos = other(driver).container.scrollTop
}
/** the map between the two layouts that `matched` takes its speed from, measured once per layout (sync.mjs) */
let flow = null
function buildFlow() {
  // a page is set in two columns where some line starts past its middle; there a line not across the middle is in one
  const twoColumn = side => {
    const out = new Set()
    for (const [, a] of side.anchors) if (a) for (const r of a.rects) { const [x0, , x1] = pageView(side, r.page).pdfPage.view; if (r.x0 > (x0 + x1) / 2 + 1) out.add(r.page) }
    return out
  }
  const geom = (side, a, two) => ({
    stream: a.tokens[0],
    lines: a.rects.map(r => {
      const box = toPageBox(side, r), top = pageTop(side, r.page) + box.top, [x0, , x1] = pageView(side, r.page).pdfPage.view, mid = (x0 + x1) / 2
      return { top, bot: top + box.height, page: r.page, band: !two.has(r.page) || (r.x0 < mid - 1 && r.x1 > mid + 1) ? 'full' : r.x1 <= mid + 1 ? 'left' : 'right' }
    }),
  })
  const twoL = twoColumn(left), twoR = twoColumn(right), units = []
  // what is read in order: not a caption, a footnote, a cell or a picture's text, which TeX sets elsewhere
  for (const [id, a] of left.anchors) { const b = right.anchors.get(id); if (a && b && !FLOATING.has(unitKind.get(id))) units.push({ id, L: geom(left, a, twoL), R: geom(right, b, twoR) }) }
  units.sort((x, y) => x.id - y.id)
  const chain = flowChain(units)
  flow = makeMap(knots(chain, lineTable(chain, 'L'), lineTable(chain, 'R'), { endL: left.container.scrollHeight, endR: right.container.scrollHeight }))
}
/**
 * One frame of the together modes while the driver scrolls: the follower moved by the driver's step — the same step,
 * or scaled by how much taller one layout is than the other over the driver's view, between 0.6 and 1.6, a ratio that
 * changes as slowly as the view slides. A glide under way stops, and the follower goes on from where it stands
 */
function togetherFrame(side) {
  if (onCompositor()) {
    // the compositor moves the follower; PDF.js is asked to draw the pages it now shows (showAt)
    if (!glass.anim) arm()
    other(side).viewer.update()
    return
  }
  const tc = other(side).container, D = side.container.scrollTop
  if (follow.spring) { stopSpring(); follow.pos = tc.scrollTop }
  if (follow.lastD == null || follow.pos == null) { follow.lastD = D; follow.pos = tc.scrollTop; return }
  const step = D - follow.lastD
  follow.lastD = D
  let ratio = 1
  if (syncMode === 'matched') {
    if (!flow) buildFlow()
    const H = side.container.clientHeight, f = side === left ? flow.ltr : flow.rtl
    ratio = Math.min(1.6, Math.max(0.6, (f(D + H) - f(D)) / H))
  }
  follow.pos = Math.min(tc.scrollHeight - tc.clientHeight, Math.max(0, follow.pos + step * ratio))
  put(tc, follow.pos)
}
/**
 * The content at the top of a side's view that the other side is levelled by: the first paragraph or heading whose
 * start shows in the upper half of the view — in the column under the pointer where the page has two — else the first
 * line whole in view, at its place in its paragraph. { id, at, y }: the unit, the share of it before that point (lines
 * counted), and the point's height in scroll coordinates
 */
function topAnchor(side) {
  const c = side.container, D = c.scrollTop, H = c.clientHeight
  let column = null
  if (pointerX?.side === side) {
    let page = 1
    for (let p = 1; p <= side.doc.numPages; p++) if (pageTop(side, p) <= D + H * 0.25) page = p
    const pv = pageView(side, page), pr = pv.div.getBoundingClientRect(), [x0, , x1] = pv.pdfPage.view
    const [x] = pv.viewport.convertToPdfPoint(pointerX.x - pr.left - pv.div.clientLeft, 0)
    const twoCols = linkedLines(side).some(l => l.page === page && l.x0 > (x0 + x1) / 2 + 1)
    if (twoCols) column = { page, mid: (x0 + x1) / 2, left: x < (x0 + x1) / 2 }
  }
  const inColumn = l => !column || l.page !== column.page || (l.x0 < column.mid - 1 && l.x1 > column.mid + 1) || (column.left ? l.x1 <= column.mid + 1 : l.x0 >= column.mid - 1)
  const shown = linkedLines(side).filter(l => l.top >= D - 0.5 && l.top < D + H && inColumn(l))
  const start = shown.filter(l => l.li === 0 && l.top < D + H / 2).sort((a, b) => a.top - b.top)[0]
  if (start) return { id: start.id, at: 0, y: start.top }
  const first = shown.sort((a, b) => a.top - b.top)[0]
  return first ? { id: first.id, at: first.li / first.n, y: first.top } : null
}
/**
 * The paragraph or heading under the pointer where it last stood on a side: its first line when that shows in the view,
 * else the point under the pointer, at its place in the paragraph (lines counted). Off the text — between two
 * paragraphs, in the margin beside them — the one with the nearest line, within 64 px. Null with the pointer on the
 * other side or away from the text: the top is taken
 */
function pointerAnchor(side) {
  if (pointerX?.side !== side || pointerX.y == null) return null
  const c = side.container, D = c.scrollTop, H = c.clientHeight, y = D + pointerX.y - c.getBoundingClientRect().top
  if (y < D || y > D + H) return null
  let page = 1
  for (let p = 1; p <= side.doc.numPages; p++) if (pageTop(side, p) <= y) page = p
  const pv = pageView(side, page), pr = pv.div.getBoundingClientRect()
  const [x] = pv.viewport.convertToPdfPoint(pointerX.x - pr.left - pv.div.clientLeft, 0)
  // how far a line is from the pointer: across (PDF units at the page's scale) and down, in CSS pixels
  const gap = l => Math.max(0, l.x0 - x, x - l.x1) * pv.viewport.scale + Math.max(0, l.top - y, y - l.bottom)
  let hit = null
  for (const l of linkedLines(side)) if (l.page === page && gap(l) < 64 && (!hit || gap(l) < gap(hit))) hit = l
  if (!hit) return null
  const first = linkedLines(side).find(l => l.id === hit.id && l.li === 0)
  if (first && first.top >= D - 0.5) return { id: hit.id, at: 0, y: first.top }
  const f = Math.min(1, Math.max(0, (y - hit.top) / Math.max(1, hit.bottom - hit.top)))
  return { id: hit.id, at: (hit.li + f) / hit.n, y: hit.top + f * (hit.bottom - hit.top) }
}
/** the scroll ended on the driver: the other side glides so that the content the driver is levelled by stands at the
 *  same height on both; at either end of the driver's document, the other side goes to the same end */
function alignTop(side) {
  if (!together() || mode !== 'bilingual' || side !== driver || !left.anchors.size || !right.anchors.size) return
  bake()
  const to = other(side), dc = side.container, tc = to.container, D = dc.scrollTop
  const most = tc.scrollHeight - tc.clientHeight
  let target
  if (D <= 1) target = 0
  else if (D >= dc.scrollHeight - dc.clientHeight - 1) target = most
  else {
    const a = (syncMode === 'pointer' && pointerAnchor(side)) || topAnchor(side), there = a && spot(to, a.id, a.at)
    if (there == null) { rebase(); arm(); return }
    target = there - (a.y - D) + (tc.getBoundingClientRect().top - dc.getBoundingClientRect().top)
  }
  target = Math.min(most, Math.max(0, target))
  if (Math.abs(target - tc.scrollTop) < 1) { rebase(); arm(); return }
  if (onCompositor()) glideOn(to, target)
  else springTo(tc, target)
}
/** a critically damped spring to a position: no overshoot, no bounce, 250–450 ms as the distance asks; one step with
 *  reduced motion */
function springTo(tc, target) {
  stopSpring()
  const x0 = tc.scrollTop, d = target - x0, T = glideMs(d), t0 = performance.now()
  const step = now => {
    const k = T ? (now - t0) / T : 1
    if (k >= 1) { put(tc, target); follow.spring = 0; rebase(); return }
    put(tc, x0 + d * springAt(k))
    follow.spring = requestAnimationFrame(step)
  }
  follow.spring = requestAnimationFrame(step)
}
function stopSpring() { if (follow.spring) cancelAnimationFrame(follow.spring); follow.spring = 0 }

// ---------------------------------------------------------------- the follower on the compositor
// The driver scrolls on the compositor's thread, and stays smooth however busy the page is; a follower set by script
// each frame moves on the main thread a frame later, and misses frames whenever PDF.js draws the pages coming into view
// (the scroll-sync research measured up to 97 px behind). So the together modes move the follower's page stack on the
// compositor too: while the reader scrolls, by a transform a ScrollTimeline on the driver runs, its keyframes the
// follower's position for every position of the driver; at rest, by a glide the compositor runs on the spring's curve.
// Its scrollTop stays where it was meanwhile, and takes the position shown — in one task, so no frame shows a jump —
// whenever something is to read it (bake): the rest's levelling, a new driver, a click, a layout's change. The follower
// is bound ahead, at rest and when the pointer comes over a side, so that it keeps up from a scroll's first frame: the
// input events that tell a scroll has begun reach the page after the compositor has taken its first steps.
const CAN_COMPOSIT = typeof ScrollTimeline === 'function'
let compositing = CAN_COMPOSIT && prefs.compositor !== false
const onCompositor = () => compositing && together() && mode === 'bilingual'
/** the follower's motion under way: `anim` the transform, `kind` 'scroll' (bound to `from`, the driver) or 'glide',
 *  `side` the follower, `shift()` how far the transform shows it from its scrollTop, down positive */
const glass = { anim: null, kind: null, side: null, from: null, shift: null }
/** PDF.js told a side's position as it shows, not as its scrollTop says: it finds the pages to draw from a scroll
 *  container's four sizes, and is lent one that adds the transform's shift; null gives it back its own */
function showAt(side, shift) {
  if (!shift) { delete side.viewer._getVisiblePages; return }
  side.viewer._getVisiblePages = function () {
    const real = this.container
    this.container = { scrollTop: real.scrollTop + shift(), scrollLeft: real.scrollLeft, clientHeight: real.clientHeight, clientWidth: real.clientWidth }
    try { return Object.getPrototypeOf(this)._getVisiblePages.call(this) } finally { this.container = real }
  }
}
/**
 * The motion under way ended where it stands: the transform's shift into the follower's scrollTop, on top of whatever
 * the reader scrolled it by meanwhile, and the transform gone. The together modes go on from there: the follower's
 * position, against the driver's as it is (bound) or as it was when the glide began, the driver still since
 */
function bake() {
  if (!glass.anim) return
  const c = glass.side.container, pos = c.scrollTop + glass.shift(), g = unbind()
  put(c, pos)
  if (g.kind === 'scroll') follow.lastD = g.from.container.scrollTop
  follow.pos = pos
  g.side.viewer.update()
}
/** the motion under way given up, the follower left at its scrollTop */
function drop() { if (glass.anim) unbind().side.viewer.update() }
/** the motion under way taken off — its animation, and the container lent to PDF.js — and what it was */
function unbind() {
  const g = { ...glass }
  g.anim.cancel()
  showAt(g.side, null)
  Object.assign(glass, { anim: null, kind: null, side: null, from: null, shift: null })
  return g
}
/**
 * The follower bound to the driver's scroll: for every position of the driver, the follower's — where it stands, plus
 * the driver's steps since the positions the together modes go on from, the same steps or scaled by the layouts' local
 * ratio (togetherFrame's), within the follower's ends — as keyframes of a ScrollTimeline on the driver, linear between
 */
function arm() {
  if (!onCompositor() || !driver || glass.anim || !left.anchors.size || !right.anchors.size) return
  const d = driver, f = other(d), dc = d.container, tc = f.container
  const Dmax = dc.scrollHeight - dc.clientHeight, Fmax = tc.scrollHeight - tc.clientHeight, F0 = tc.scrollTop
  if (Dmax < 1 || !dc.clientHeight || !tc.clientHeight) return
  if (follow.lastD == null || follow.pos == null) rebase()
  const Db = follow.lastD, Fb = follow.pos, clamp = v => Math.min(Fmax, Math.max(0, v))
  let pts
  if (syncMode === 'matched') {
    if (!flow) buildFlow()
    const H = dc.clientHeight, m = d === left ? flow.ltr : flow.rtl, ratio = D => Math.min(1.6, Math.max(0.6, (m(D + H) - m(D)) / H)), step = 32
    const up = [], down = []
    for (let D = Db, F = Fb; D < Dmax; ) { const n = Math.min(Dmax, D + step); F += (n - D) * ratio(D); D = n; up.push([D, clamp(F)]) }
    for (let D = Db, F = Fb; D > 0; ) { const n = Math.max(0, D - step); F -= (D - n) * ratio(n); D = n; down.unshift([D, clamp(F)]) }
    pts = [...down, [Db, clamp(Fb)], ...up]
  } else {
    // the same steps: straight, but for where the follower meets one of its ends
    pts = [0, Db - Fb, Db + Fmax - Fb, Dmax].filter(D => D >= 0 && D <= Dmax).sort((a, b) => a - b).map(D => [D, clamp(Fb + D - Db)])
  }
  pts = pts.filter((p, i) => i === 0 || p[0] > pts[i - 1][0])
  if (pts[0][0] > 0) pts.unshift([0, pts[0][1]])
  if (pts.at(-1)[0] < Dmax) pts.push([Dmax, pts.at(-1)[1]])
  const shift = () => {
    const D = Math.min(Dmax, Math.max(0, dc.scrollTop))
    let lo = 0, hi = pts.length - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] <= D) lo = mid; else hi = mid }
    const [a, b] = [pts[lo], pts[hi]], t = b[0] === a[0] ? 0 : (D - a[0]) / (b[0] - a[0])
    return a[1] + Math.min(1, Math.max(0, t)) * (b[1] - a[1]) - F0
  }
  const anim = f.viewer.viewer.animate(pts.map(([D, F]) => ({ offset: D / Dmax, transform: `translateY(${F0 - F}px)` })), { timeline: new ScrollTimeline({ source: dc, axis: 'block' }), fill: 'both' })
  Object.assign(glass, { anim, kind: 'scroll', side: f, from: d, shift })
  showAt(f, shift)
}
/** the glide at rest on the compositor: the follower's stack moved to `target` on the spring's curve, then baked, and
 *  bound to the driver again */
function glideOn(side, target) {
  const tc = side.container, d = target - tc.scrollTop, T = glideMs(d)
  if (!T) { put(tc, target); rebase(); arm(); return }
  const anim = side.viewer.viewer.animate([{ transform: 'translateY(0px)' }, { transform: `translateY(${-d}px)` }], { duration: T, easing: SPRING, fill: 'both' })
  Object.assign(glass, { anim, kind: 'glide', side, from: null, shift: () => d * springAt((anim.currentTime ?? 0) / T) })
  showAt(side, glass.shift)
  const tick = () => { if (glass.anim !== anim) return; side.viewer.update(); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  anim.onfinish = () => { if (glass.anim !== anim) return; bake(); rebase(); arm() }
}
/** a side's position as the screen shows it: its scrollTop, and the transform's shift while it follows on the compositor */
const shownAt = side => side.container.scrollTop + (glass.side === side ? glass.shift() : 0)
/** for the harness: what the driver is levelled by at rest, and how far its counterpart stands from level (px) */
function levelOf(side) {
  const a = (syncMode === 'pointer' && pointerAnchor(side)) || topAnchor(side), to = other(side)
  const there = a && spot(to, a.id, a.at)
  if (there == null) return null
  const y = a.y - side.container.scrollTop + side.container.getBoundingClientRect().top, ty = there - shownAt(to) + to.container.getBoundingClientRect().top
  return { id: a.id, at: a.at, error: ty - y }
}
/** a side becomes the driver: what moves ends where it stands, and the other side goes on from where it stands */
function take(side) {
  if (driver === side) return
  bake(); driver = side; stopSpring(); clearTimeout(follow.rest); follow.rest = 0; rebase()
}
/** the follower on the compositor or by script (REPORT, seventeenth addendum) */
export function setCompositor(on) {
  bake(); stopSpring(); clearTimeout(follow.rest)
  compositing = CAN_COMPOSIT && on
  void savePrefs({ compositor: compositing })
  rebase(); arm()
}
/** how the other side follows (REPORT, sixteenth and seventeenth addenda); the interface's switch is same or off */
export function setSyncMode(next) {
  if (!SYNC_MODES.includes(next)) return
  bake()
  syncMode = next
  void savePrefs({ syncMode })
  stopGlide(); stopSpring(); clearTimeout(settleTimer); clearTimeout(follow.rest)
  rebase(); arm()
}
function syncFrom(side) {
  const mine = placed.get(side.container)
  if (mine != null) { placed.delete(side.container); if (Math.abs(mine - side.container.scrollTop) < 1) return }
  // the follower scrolled by something else — a link, PDF.js, the find bar: it stands where that put it, and the
  // together modes go on from there; on the compositor its transform is given up, and it is bound again
  if (driver && side !== driver) {
    if (glass.side === side) { drop(); rebase(); arm() } else if (together()) rebase()
    return
  }
  if (syncMode === 'off' || mode !== 'bilingual' || side !== driver || !left.anchors.size || !right.anchors.size) return
  // a scroll under way, its rest's wait begun again: here, with the event, since the scroll's end comes in the same
  // frame as its last step, before a frame's callback would run
  if (together()) { clearTimeout(follow.rest); follow.rest = 0; follow.moving = true }
  if (syncMode === 'current') { clearTimeout(settleTimer); settleTimer = setTimeout(() => settle(side), 160) }
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    if (syncMode !== 'current') return togetherFrame(side)
    const target = other(side), c = side.container
    const there = map(side === left, c.scrollTop + c.clientHeight * readingLine)
    target.container.scrollTop = there - target.container.clientHeight * readingLine
  })
}
/** whether a side's pane is in the display: a hidden one has no width, and a page-width scale there comes out negative */
const shown = side => side.container.clientWidth > 0
/**
 * The display changed: the viewers now shown are laid out again at their pane's width, and a side coming into view
 * opens where the other one was being read, by the table the sync scrolls with
 */
/**
 * Where the reader is on a side, in terms that outlast its layout: the unit at the reading line and the place within it
 * (its lines counted from 0 to 1), and the place in the whole document for when no unit is located there. Read while
 * the side is shown: once the display hides it, its scrollTop and its pages' offsets are all 0, and a switch straight
 * between Original and Translation opened the other side at the paper's top (Codex on #297, measured by
 * spikes/viewer-faults.mjs)
 */
function readingPlace(side) {
  const c = side.container
  const doc = c.scrollTop / Math.max(1, c.scrollHeight - c.clientHeight)
  if (!side.doc || !side.anchors.size || !shown(side)) return { doc }
  invalidate()
  const y = c.scrollTop + c.clientHeight * readingLine
  let page = 1
  for (let p = 1; p <= side.doc.numPages; p++) if (pageTop(side, p) <= y) page = p
  // the first column, as the settle takes it with no pointer
  const pv = pageView(side, page), [x] = pv.viewport.convertToPdfPoint(pv.div.clientWidth * 0.25, 0)
  const l = lineAt(side, y, x)
  if (!l) return { doc }
  const f = Math.min(1, Math.max(0, (y - l.top) / Math.max(1, l.bottom - l.top)))
  return { doc, id: l.id, at: (l.li + f) / l.n }
}
/** the display changed from `from`: the sides shown laid out to its width, and the side it brought in put at `place` */
function relayout(from, place = null) {
  bake()
  requestAnimationFrame(() => {
    for (const s of sides) if (s.doc && shown(s)) { s.viewer.currentScaleValue = 'page-width'; s.viewer.update() }
    const came = from === 'original' ? right : from === 'translation' ? left : null
    requestAnimationFrame(() => {
      if (!came?.doc || !place) return
      invalidate()
      const c = came.container, y = place.id != null ? spot(came, place.id, place.at) : null
      put(c, y != null ? y - c.clientHeight * readingLine : place.doc * (c.scrollHeight - c.clientHeight))
    })
  })
}
/** the current design's settle: the paragraph at the reading line brought level on the other side, at the same place
 *  within it, 160 ms after the last scroll */
function settle(side) {
  if (syncMode !== 'current' || mode !== 'bilingual' || side !== driver) return
  const c = side.container, y = c.scrollTop + c.clientHeight * readingLine
  // the page at the reading line, and the pointer's place across it (the first column when the pointer is away)
  let page = 1
  for (let p = 1; p <= side.doc.numPages; p++) if (pageTop(side, p) <= y) page = p
  const pv = pageView(side, page), pr = pv.div.getBoundingClientRect()
  const cx = pointerX?.side === side ? pointerX.x : pr.left + pr.width * 0.25
  const [x] = pv.viewport.convertToPdfPoint(cx - pr.left - pv.div.clientLeft, 0)
  const l = lineAt(side, y, x)
  const b = l && other(side).anchors.get(l.id)
  if (!b) return
  const f = Math.min(1, Math.max(0, (y - l.top) / Math.max(1, l.bottom - l.top)))
  const pos = ((l.li + f) / l.n) * b.rects.length, lj = Math.min(b.rects.length - 1, Math.floor(pos))
  const t = other(side), r = b.rects[lj], box = toPageBox(t, r)
  const top = pageTop(t, r.page) + box.top + (pos - lj) * box.height - t.container.clientHeight * readingLine
  if (Math.abs(top - t.container.scrollTop) > 2) glide(t.container, top)
}
/** a unit's lines in the container's scroll coordinates, with their place across the page (PDF units) */
const linesIn = (side, id) => (side.anchors.get(id)?.rects ?? []).map(r => { const box = toPageBox(side, r), top = pageTop(side, r.page) + box.top; return { top, bottom: top + box.height } })
/** a place in a unit — its lines counted from 0 to their number, a fraction within a line — in scroll coordinates */
function spot(side, id, at) {
  const ls = linesIn(side, id)
  if (!ls.length) return null
  const pos = Math.min(1, Math.max(0, at)) * ls.length, j = Math.min(ls.length - 1, Math.floor(pos))
  return ls[j].top + (pos - j) * (ls[j].bottom - ls[j].top)
}
/** every line of the units located on both sides, in scroll coordinates (cached with the layout, as lineAt's) */
function linkedLines(side) {
  lines ??= new Map()
  if (!lines.has(side)) lines.set(side, lineBoxes(side))
  return lines.get(side).filter(l => other(side).anchors.get(l.id))
}
/** a figure region (PDF units, on `page`) in scroll coordinates */
function regionBox(side, page, r) { const box = toPageBox(side, { page, ...r }); return { top: pageTop(side, page) + box.top, bottom: pageTop(side, page) + box.top + box.height } }

/**
 * The other side scrolled so that its scroll position `there` shows at height `y` of this side's view, and the reading
 * line moved to that height. Where the other side cannot scroll that far — near either end of its document — this
 * side takes up the rest, so that the two still end on one horizontal line
 */
function level(from, y, there) {
  const to = other(from), fc = from.container, tc = to.container
  const dy = tc.getBoundingClientRect().top - fc.getBoundingClientRect().top
  const want = there + dy - y
  // a settle still to come or still gliding would carry the other side off again
  clearTimeout(settleTimer)
  stopGlide()
  put(tc, want)
  const short = tc.scrollTop - want
  if (Math.abs(short) > 0.5) put(fc, fc.scrollTop + short)
  readingLine = Math.min(0.95, Math.max(0.05, (there - tc.scrollTop + dy) / fc.clientHeight))
  rebase(); arm()
}
/** a side's scroll position set by the reader itself, its scroll event not taken for the reader's own scrolling */
const placed = new WeakMap()
function put(container, top) {
  container.scrollTop = top
  placed.set(container, container.scrollTop)
}
/**
 * The settle's glide to a position, our own frames rather than the browser's smooth scroll: that one runs on the
 * compositor and a later instant scroll does not stop it — a click levelled a pair while it was still gliding, and the
 * glide carried the other side on to where it had been going (10 to 50 px off, measured)
 */
let gliding = 0
function glide(container, top) {
  stopGlide()
  const start = container.scrollTop, t0 = performance.now(), ms = reduced.matches ? 0 : 220
  const step = now => {
    const k = ms ? Math.min(1, (now - t0) / ms) : 1
    put(container, start + (top - start) * (1 - (1 - k) ** 3))
    gliding = k < 1 ? requestAnimationFrame(step) : 0
  }
  gliding = requestAnimationFrame(step)
}
function stopGlide() { if (gliding) cancelAnimationFrame(gliding); gliding = 0 }
/**
 * A click brings what was clicked level on both sides, at the height where it stands on the screen: a paragraph's
 * first line on one horizontal line with its counterpart's (the owner, 2026-09-22 — brought to the reading line, the
 * counterpart stood at a quarter down whatever the height of the paragraph clicked). With the first line above the
 * view — a long paragraph clicked far down — the clicked line is levelled, at its place within the other paragraph.
 * A click on no paragraph linked on both sides — a heading, a figure, a formula, a table — goes by what is around it (placeAt).
 */
let lastAlign = null // how the last click was levelled, for the test harness
async function alignClick(from, event) {
  // with one document shown there is no other side to level: the hidden one has no scroll range, and the correction
  // meant for it would move the one being read (Codex on #297)
  if (mode !== 'bilingual') return
  bake()
  const to = other(from), c = from.container, y = event.clientY - c.getBoundingClientRect().top
  const hit = hitAt(from, event)
  if (hit && to.anchors.get(hit.id)) {
    const start = unitDocTop(from, hit.id) - c.scrollTop
    lastAlign = { way: start >= 0 ? 'first line' : 'clicked line', id: hit.id }
    if (start >= 0) return level(from, start, unitDocTop(to, hit.id))
    return level(from, y, spot(to, hit.id, (hit.line + hit.f) / from.anchors.get(hit.id).rects.length))
  }
  lastAlign = { way: 'around' }
  const there = await placeAt(from, event, y + c.scrollTop)
  if (there != null) level(from, y, there)
}
/**
 * Where a click on no linked paragraph lands on the other side (scroll coordinates), for the point Y it was made at.
 * In a figure, by the caption of its float (figureThere). Elsewhere, by the linked lines above and below it in its
 * column: in the gap between them at the same share of it — a heading or a formula between two paragraphs — except
 * next to a caption, whose float may stand elsewhere on the other side: a table under its caption, or a drawing that
 * is no image above it, keeps its distance from the caption. Distances are scaled by the two sides' zoom.
 */
async function placeAt(from, event, Y) {
  const at = pointOf(from, event)
  if (!at) return null
  const to = other(from), k = to.viewer.currentScale / from.viewer.currentScale
  const region = (await regionsOf(from, at.page)).find(r => at.x >= r.x0 && at.x <= r.x1 && at.y >= r.y0 && at.y <= r.y1)
  if (region) {
    const there = await figureThere(from, at.page, region, Y)
    if (there != null) return there
    lastAlign = { way: 'figure without a caption' }
  }
  let above = null, below = null
  for (const l of linkedLines(from)) {
    if (at.x < l.x0 - 6 || at.x > l.x1 + 6) continue
    if (l.bottom <= Y + 1 && (!above || l.bottom > above.bottom)) above = l
    if (l.top >= Y - 1 && (!below || l.top < below.top)) below = l
  }
  const endOf = l => spot(to, l.id, (l.li + 1) / l.n), startOf = l => spot(to, l.id, l.li / l.n)
  const caption = l => unitKind.get(l.id) === 'caption'
  if (above && caption(above) && !(below && caption(below) && below.top - Y < Y - above.bottom)) return endOf(above) + (Y - above.bottom) * k
  if (below && caption(below)) return startOf(below) - (below.top - Y) * k
  if (above && below) return endOf(above) + ((Y - above.bottom) / Math.max(1, below.top - above.bottom)) * (startOf(below) - endOf(above))
  if (above) return endOf(above) + (Y - above.bottom) * k
  if (below) return startOf(below) - (below.top - Y) * k
  return null
}
/**
 * A figure on the other side, and the place there of the point Y in it. A float moves with its caption, and the two
 * sides may place it differently — another page, another column — so the figure is found through its caption: on
 * this side a linked caption in its column, below it or above it with no other linked line between; on the other side,
 * on that caption's page and in its column, the figure of the same size at the same distance from it — the same image
 * laid out by the same float. The caption below is tried first, as captions of figures mostly are, and a caption counts
 * only if its float's figure is found there: two floats stacked in a column put the upper one's caption between them.
 * With no figure found, the point keeps its distance from the caption below, else from the one above.
 */
async function figureThere(from, page, region, Y) {
  const to = other(from), k = to.viewer.currentScale / from.viewer.currentScale
  const box = regionBox(from, page, region)
  const caption = l => unitKind.get(l.id) === 'caption'
  const meets = (a, b) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0)
  const mine = columnOf(from, page, region)
  const col = linkedLines(from).filter(l => l.page === page && meets(l, mine))
  const clear = (lo, hi) => !col.some(l => !caption(l) && meets(l, region) && l.bottom > lo + 1 && l.top < hi - 1)
  let below = null, above = null
  for (const l of col) {
    if (!caption(l)) continue
    if (l.li === 0 && l.top >= box.bottom - 2 && clear(box.bottom, l.top) && (!below || l.top < below.top)) below = l
    if (l.li === l.n - 1 && l.bottom <= box.top + 2 && clear(l.bottom, box.top) && (!above || l.bottom > above.bottom)) above = l
  }
  const w = region.x1 - region.x0, h = region.y1 - region.y0
  for (const [l, isBelow] of [[below, true], [above, false]]) {
    if (!l) continue
    // the caption's line next to the figure, on this side and on the other (PDF units), and the gap between
    const here = from.anchors.get(l.id).rects[isBelow ? 0 : l.n - 1], rects = to.anchors.get(l.id).rects, theirs = rects[isBelow ? 0 : rects.length - 1]
    const gap = isBelow ? region.y0 - here.y1 : here.y0 - region.y1
    const column = columnOf(to, theirs.page, theirs)
    let twin = null
    for (const q of await regionsOf(to, theirs.page)) {
      if (Math.abs(q.x1 - q.x0 - w) > 2 || Math.abs(q.y1 - q.y0 - h) > 2 || !meets(q, column)) continue
      const g = isBelow ? q.y0 - theirs.y1 : theirs.y0 - q.y1
      if (g < -2 || Math.abs(g - gap) > 12) continue
      // two of the same size at the same distance (a row of panels): the one at the same place across the column
      const score = Math.abs(g - gap) + Math.abs(q.x0 - column.x0 - (region.x0 - mine.x0))
      if (!twin || score < twin.score) twin = { q, score }
    }
    if (!twin) continue
    lastAlign = { way: 'figure, its twin', caption: l.id }
    const tb = regionBox(to, theirs.page, twin.q)
    return tb.top + (Y - box.top) * ((tb.bottom - tb.top) / Math.max(1, box.bottom - box.top))
  }
  const l = below ?? above
  if (!l) return null
  lastAlign = { way: 'figure by its caption', caption: l.id }
  return l === below ? spot(to, l.id, 0) - (l.top - Y) * k : spot(to, l.id, 1) + (Y - l.bottom) * k
}
/**
 * The column a box stands in, across its page (PDF units): the whole width when it crosses the page's middle — one
 * column of text, or a float over both — else the half it is in. What a caption and its figure share, however narrow a
 * short caption set centred under a row of panels is
 */
function columnOf(side, page, r) {
  const [x0, , x1] = pageView(side, page).pdfPage.view, mid = (x0 + x1) / 2
  return r.x0 < mid - 1 && r.x1 > mid + 1 ? { x0, x1 } : r.x1 <= mid + 1 ? { x0, x1: mid } : { x0: mid, x1 }
}
const invalidate = () => { bake(); table = null; lines = null; flow = null; follow.lastD = null }
addEventListener('resize', invalidate)

function attach(side) {
  side.container.addEventListener('scroll', () => syncFrom(side), { passive: true })
  // a new driver: the other side goes on from where it stands, before the new driver's first step is taken; on the
  // compositor, a glide under way ends where it stands, and the follower is bound to the driver
  for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) side.container.addEventListener(type, () => {
    take(side)
    if (glass.kind === 'glide') bake()
    arm()
  }, { passive: true })
  // the pointer tells which side the next scroll will move, so on the compositor the follower is bound ahead — but not
  // while a scroll, its rest's wait or its glide is under way on the other side, which the pointer passing over would cut off
  side.container.addEventListener('pointermove', e => {
    pointerX = { side, x: e.clientX, y: e.clientY }
    if (onCompositor() && driver !== side && !follow.moving && !follow.rest && glass.kind !== 'glide') { take(side); arm() }
  }, { passive: true })
  // the scroll's end — a trackpad's glide included — and 150 ms more without a scroll: the together modes level the two
  side.container.addEventListener('scrollend', () => {
    if (side !== driver || !together()) return
    follow.moving = false
    clearTimeout(follow.rest)
    follow.rest = setTimeout(() => { follow.rest = 0; alignTop(side) }, 150)
  }, { passive: true })
  side.container.addEventListener('mousemove', e => light(unitAt(side, e)))
  side.container.addEventListener('mouseleave', () => light(null))
  // A click, told apart from a drag that selects text, by the pointer's press and release: PDF.js moves its selection
  // helper (the text layer's endOfContent) under the pointer on the press, and a press whose target moves gets no
  // click event — a second click on a figure did nothing at all
  let press = null
  side.container.addEventListener('pointerdown', e => { press = e.button === 0 ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null }, { passive: true })
  side.container.addEventListener('pointerup', e => {
    const p = press
    press = null
    if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4 || e.timeStamp - p.t > 600 || !(getSelection()?.isCollapsed ?? true)) return
    void alignClick(side, e)
  })
  // PDF.js re-renders a page's div on zoom and as pages come into view: the highlight and the figures are laid again there
  side.eventBus.on('pagerendered', ({ pageNumber }) => { if (pageNumber === 1 && !timing[side === left ? 'leftFirstPage' : 'rightFirstPage']) timing[side === left ? 'leftFirstPage' : 'rightFirstPage'] = performance.now() - timing.start; paint(side); if (side !== left) side.figs.set(pageNumber, paintFigures(side, pageNumber).catch(e => console.warn('[figures]', e))) })
  // a side opened out of the display (the original, while the translation alone is shown) waits at 1 for its width (relayout)
  side.eventBus.on('pagesinit', () => { const value = side.scale ?? 'page-width'; side.viewer.currentScaleValue = shown(side) || typeof value === 'number' ? value : 1 })
  side.eventBus.on('scalechanging', ({ scale }) => { invalidate(); if (shown(side) && (side === left || !shown(left))) host.emit({ type: 'scale', scale }) })
  side.eventBus.on('pagesinit', invalidate)
  // each side's page, for its pill; a viewer being laid out out of sight (replaceRight's) reports once it is the right
  const reportPage = () => { if (side === left || side === right) host.emit({ type: 'page', side: side === left ? 'left' : 'right', page: side.viewer.currentPageNumber, pages: side.viewer.pagesCount }) }
  side.eventBus.on('pagechanging', reportPage)
  side.eventBus.on('pagesinit', reportPage)
}
for (const side of sides) attach(side)
/** where the original is being read, in PDF.js's terms (its page, and the point at the top left of the view in PDF
 *  units), as long as it is in view: the same file opens on the right at the same place */
let readAt = null
left.eventBus.on('updateviewarea', ({ location }) => { if (shown(left)) readAt = location })
/** figure text on or off */
export function setFigures(on) { figuresOn = on; repaintFigures() }
/** the sides shown scaled by a factor, within PDF.js's range */
export function zoomBy(factor) { for (const s of sides) if (shown(s)) s.viewer.currentScale = Math.min(4, Math.max(0.25, s.viewer.currentScale * factor)) }
/** the sides shown at a scale or a fit (page-width, page-fit, page-actual) */
export function zoomTo(value) { for (const s of sides) if (shown(s)) s.viewer.currentScaleValue = String(value) }
/** a side at a page */
export function goToPage(which, page) { const s = which === 'left' ? left : right; if (s.doc) s.viewer.currentPageNumber = page }

// ---------------------------------------------------------------- anchoring one side
/** the units TeX sets away from where the source has them: a caption with its float, a footnote at the foot of its
 *  page, a table's cells, a picture's text (anchors.mjs anchorUnits) */
const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure'])
/** every unit located on a side: `texts` is the unit's text as that PDF has it; `marks` null = read them from the PDF */
async function anchorSide(side, texts, marks) {
  const pages = await textPages(side.doc)
  const doc = tokenizeDocument(pages)
  // the marks it went by, kept on the side: a cached copy keeps the right side's, which cost a second to read from its PDF
  side.marks = marks ?? (await pdfMarks(side.doc))
  const bounds = boundsFromMarks(doc, side.marks)
  index(side, anchorUnits(doc, texts, { bounds, floating: id => FLOATING.has(unitKind.get(id)) }))
  return bounds.size
}

// ---------------------------------------------------------------- replacing the right side (#292)
/** where the reader is on a side: the line at the reading line (in the column of the pointer, else the first) and how
 *  far into it, as a place any other layout of the same paragraphs can find again */
function placeOf(side) {
  const c = side.container, y = c.scrollTop + c.clientHeight * readingLine
  let page = 1
  for (let p = 1; p <= side.doc.numPages; p++) if (pageTop(side, p) <= y) page = p
  const pv = pageView(side, page), pr = pv.div.getBoundingClientRect()
  const cx = pointerX?.side === side ? pointerX.x : pr.left + pr.width * 0.25
  const [x] = pv.viewport.convertToPdfPoint(cx - pr.left - pv.div.clientLeft, 0)
  const l = lineAt(side, y, x)
  return l ? { id: l.id, at: (l.li + Math.min(1, Math.max(0, (y - l.top) / Math.max(1, l.bottom - l.top)))) / l.n } : null
}
/** the scroll position on a side that puts a place (placeOf) at its reading line */
function scrollFor(side, place) {
  const b = place && side.anchors.get(place.id)
  if (!b) return null
  const pos = place.at * b.rects.length, lj = Math.min(b.rects.length - 1, Math.floor(pos)), r = b.rects[lj], box = toPageBox(side, r)
  return pageTop(side, r.page) + box.top + (pos - lj) * box.height - side.container.clientHeight * readingLine
}
/** a newer compile on the right: loaded into a second viewer out of sight, anchored, scrolled so that the paragraph at
 *  the reading line stays put, its visible pages drawn with their figures, then shown in place of the old one. `draft`:
 *  a preview whose images are frames (live.mjs DRAFT), the left's figures drawn over them (paintFigures) */
let rightTexts = null // the units' texts on the right as it was last anchored, for the test harness
async function replaceRight(url, texts, { draft = false } = {}) {
  const t0 = performance.now()
  bake()
  rightTexts = texts
  const place = placeOf(right)
  const offset = place && scrollFor(right, place) - right.container.scrollTop // 0 unless the reader is between lines
  const container = document.createElement('div')
  container.className = 'viewerContainer axt-incoming'
  container.append(Object.assign(document.createElement('div'), { className: 'pdfViewer' }))
  right.container.after(container)
  const next = makeSide(container)
  next.scale = right.viewer.currentScale
  attach(next)
  const inited = new Promise(r => next.eventBus.on('pagesinit', r, { once: true }))
  const opened = open(next, url)
  if (draft) next.frames = opened.then(pdfFrames).catch(() => new Map())
  next.anchored = opened.then(() => inited).then(() => anchorSide(next, texts))
  await next.anchored
  const top = scrollFor(next, place)
  if (top != null) next.container.scrollTop = top - (offset ?? 0)
  else next.container.scrollTop = right.container.scrollTop
  // wait for the pages in view to be drawn, then for their figures, a while at most: a figure whose text is still being
  // read comes in after the swap rather than hold the whole page back
  await new Promise(resolve => {
    const want = () => next.viewer._getVisiblePages().views.map(v => v.view).filter(v => v.renderingState !== 3)
    const check = () => (want().length ? setTimeout(check, 30) : resolve())
    next.viewer.update(); check()
  })
  await Promise.race([Promise.all(next.viewer._getVisiblePages().views.map(v => next.figs.get(v.id))), new Promise(r => setTimeout(r, 1500))])
  if (!draft) copies.clear()
  bake()
  const old = right
  right = next; sides[1] = next
  if (driver === old) driver = next
  container.classList.remove('axt-incoming')
  old.container.remove()
  old.task.destroy() // the document and its worker-side state; PDF.js 6 destroys through the loading task
  invalidate(); paint(right)
  // the right is a new viewer: its page and page count, not the old one's
  host.emit({ type: 'page', side: 'right', page: right.viewer.currentPageNumber, pages: right.viewer.pagesCount })
  const drift = place ? Math.round(scrollFor(right, place) - right.container.scrollTop - (offset ?? 0)) : null
  return { ms: Math.round(performance.now() - t0), drift }
}

// ---------------------------------------------------------------- live (#292)
const waitFor = (origin, type) => new Promise(r => addEventListener('message', function h(e) { if (e.origin === origin && e.data?.type === type) { removeEventListener('message', h); r(e.data) } }))
/** our compile of the original, with unit marks → each mark with the word it stands by, to carry over to arXiv's PDF */
async function marksOfPdf(bytes) {
  const task = pdfjsLib.getDocument({ data: bytes, ...ASSETS })
  const doc = await task.promise
  try { return markWords(tokenizeDocument(await textPages(doc)), await pdfMarks(doc)) } finally { task.destroy() }
}
/** the test harness's hooks (spikes/*): the sides, the anchoring's and the sync's helpers, the cache's; getters stay live */
const harness = () => ({ left, get right() { return right }, unitTop, unitDocTop, toPageBox, pageView, light, syncFrom, settle, map, placeOf, scrollFor, setDriver: s => { driver = s }, table: () => table, get readingLine() { return readingLine }, get lastAlign() { return lastAlign }, alignClick, regionsOf, regionBox, pageTop, get unitKind() { return unitKind }, shownAt, levelOf, get rightTexts() { return rightTexts }, captionNear, leftFor, figureOf, pdfCache, cached: () => cached, cacheKey: () => cacheKey, figureEntries: () => figureEntries, identityNow: () => theEngine().then(e => e.now()) })
/**
 * A copy from this machine shown (REPORT, eighteenth addendum): the paper's state from the record rather than the
 * source — the figures' context, the prose names are told by, the units' kinds, the figures' entries — then the
 * translation opened and both sides anchored, as the demo does
 */
async function showCached(record, setContext, note = () => {}) {
  prose = record.units.map(u => u.src).join('\n')
  unitKind = new Map(record.units.map((u, i) => [i, u.kind]))
  setContext(record.context)
  figureEntries = new Map(record.figures.map(f => [f.key, f]))
  const url = URL.createObjectURL(new Blob([record.pdf], { type: 'application/pdf' }))
  try {
    const laid = new Promise(resolve => right.eventBus.on('pagesinit', resolve, { once: true }))
    await open(right, url)
    note('cached opened')
    await laid
    // shown: its pages laid out and drawing; the anchors, which the highlight and the sync need, follow
    note('shown cached')
    if (readAt) right.viewer.scrollPageIntoView({ pageNumber: readAt.pageNumber, destArray: [null, { name: 'XYZ' }, readAt.left, readAt.top, null], allowNegativeOffset: true })
    await Promise.all([
      anchorSide(left, record.units.map((u, i) => ({ id: i, text: u.src })), new Map(record.marks)).then(() => note('cached left anchored')),
      anchorSide(right, record.units.map((u, i) => ({ id: i, text: u.tr ?? u.src })), record.rightMarks?.length ? new Map(record.rightMarks) : undefined).then(() => note('cached right anchored')),
    ])
  } finally { URL.revokeObjectURL(url) }
  invalidate(); paint(left); paint(right)
}
async function live() {
  // our TeX page and the TeX Live file server, as spikes/serve-live.mjs starts them on this machine
  const site = params.get('site') ?? 'http://127.0.0.1:8071', endpoint = params.get('endpoint') ?? 'http://localhost:8070'
  const srcUrl = params.get('src') ?? `https://arxiv.org/src/${paper}`, pdfUrl = params.get('pdf') ?? `https://arxiv.org/pdf/${paper}`
  const L = (window.__reader.live = { events: [], t0: performance.now() })
  let got = 0, total = 0, engine = null, setContext = null, lost = 0, lostWhy = null
  // this machine's copy on screen, being translated again with the current settings (REPORT, eighteenth addendum)
  let again = false
  let compiledOnce = false
  paperCtx = new Promise(resolve => { setContext = resolve })
  const note = (event, data = {}) => {
    if (event === 'translated') { got = data.total; if (data.how?.lost) { lost += data.how.lost; lostWhy = data.how.error } }
    host.emit({ type: 'note', event, data, got, total, lost, again })
    L.events.push({ t: Math.round(performance.now() - L.t0), event, ...data })
    if ((event === 'preview' || event === 'final') && data.ok) compiledOnce = true
    const said = { preview: data.ok ? 'preview compiled' : `compile failed (${data.strategy}): ${data.error ?? ''}`, final: data.ok ? 'final compiled' : `final compile failed (${data.strategy}): ${data.error ?? ''}`, 'next strategy': `trying ${data.strategy}`, done: compiledOnce ? 'done' : cached ? 'done — this machine\'s copy is shown' : 'done — the translation did not compile; the right side still shows the original' }[event] ?? event
    const by = engine ? ` into ${engine.lang} by ${engine.engine}` : ''
    // paragraphs the service failed on (a network down, a rate limit) stay in English, and the reader is told
    const missed = lost ? ` (${lost} not: ${lostWhy})` : ''
    status(`${again ? 'translating again · ' : ''}${total ? `${got} of ${total} translated${by}${missed}` : 'opening…'} · ${said}${data.ms != null && data.ok !== false ? ` (${(data.ms / 1000).toFixed(1)} s)` : ''}`)
  }
  const fail = (event, text, kind) => {
    host.emit({ type: 'fail', event, text, kind })
    setContext({}); note(event); status(text); L.done = true; L.failed = text
    // the Translation display with nothing on its side would be blank: the original, for this visit (Codex on #297)
    if (mode === 'translation' && !right.doc) { mode = 'original'; showMode(); relayout('translation') }
  }
  // the engine and the language are the extension's settings; asked first, so that a reader with no service set up is
  // told at once
  // the original first, in every display; nothing is translated or compiled until a display that shows a translation is chosen
  status(`Fetching ${paper} from arXiv…`)
  try { await open(left, pdfUrl) } catch (e) { return fail('fetch failed', `Could not fetch ${paper}'s PDF from arXiv (${e.message ?? e})`, 'network') }
  note('opened')
  // the left side's first page drawn (any page: a reading place restored may open elsewhere), two seconds at most
  const drawnP = Promise.race([new Promise(resolve => left.eventBus.on('pagerendered', resolve, { once: true })), new Promise(resolve => setTimeout(resolve, 2000))])
  if (mode === 'original') status(`${paper}, the original. Choose Translation or Side by side to translate it`)
  await translationWanted
  translating = true
  // this machine's copy first: it needs no service (REPORT, eighteenth addendum, "Opening a paper"). Its key is arXiv's
  // whole PDF's digest, read once a translation is wanted and the left side's first page is drawn: getData copies the
  // whole file (46 MB at most) out of the worker, and the digest reads all of it (final review)
  await drawnP
  const digestAt = performance.now()
  const digest = await left.doc.getData().then(digestOf).then(d => { note('digest', { startedAt: Math.round(digestAt - timing.start), ms: Math.round(performance.now() - digestAt) }); return d }).catch(() => null)
  const lang0 = config?.targetLanguage ? toBcp47(config.targetLanguage) : null
  cacheKey = digest && lang0 ? { digest, lang: lang0 } : null
  cached = cacheKey ? await pdfCache.get(digest, lang0) : undefined
  if (cached) {
    note('cache hit', { engine: cached.engine, pipeline: cached.pipeline })
    // opened, whatever follows: the least recently opened go first (a run that writes nothing would not say so)
    void pdfCache.touch(digest, lang0)
    try { await showCached(cached, setContext, note) } catch (e) {
      // a copy that cannot be shown is no copy: deleted, and the visit goes on as a miss (final review)
      note('cache unusable', { error: String(e?.message ?? e).slice(0, 200) })
      void pdfCache.delete(digest, lang0)
      cached = undefined
      figureEntries = new Map()
    }
  }
  if (cached) {
    total = cached.units.filter(u => u.state !== 'kept').length; got = total
    window.__reader.debug = Object.assign(harness(), { units: cached.units.map((u, i) => ({ i, kind: u.kind, text: u.src })) })
    window.__reader.ready = true
  }
  status('Asking the extension which service translates…')
  try { engine = await theEngine() } catch (e) {
    if (cached) { status(`${paper}, this machine's copy (${cached.engine}, ${new Date(cached.createdAt).toLocaleDateString()}) · not checked against the settings: ${e.message ?? e}`); L.done = true; return }
    return fail('no engine', `Cannot translate: ${e.message ?? e}`, e?.kind ?? 'unknown')
  }
  const lang = engine.lang
  note('engine', { lang, format: engine.format, engine: engine.engine })
  if (cached && isCurrent(cached, { identity: engine.identity, pipeline: PIPELINE_VERSION })) {
    status(`${paper}, this machine's copy · translated into ${lang} by ${cached.engine}`)
    note('cache current')
    L.done = true
    return
  }
  // single language first: a language whose typesetting the gate has not verified is not set (scripts.mjs VERIFIED)
  if (!verified(lang)) return fail('not verified', `Typesetting ${lang} is not verified yet (issue #295): the reader sets ${VERIFIED.join(', ')} for now; choose one in the extension's settings`)
  // the original on the right too, replaced as the translation comes in; opened where the original was being read, as a
  // side coming into view does (relayout, which has no document there yet to go by: Codex on #297)
  status(`Fetching ${paper}'s source from arXiv…`)
  const rightLaid = new Promise(resolve => right.eventBus.on('pagesinit', resolve, { once: true }))
  let srcBytes
  try {
    ;[srcBytes] = await Promise.all([
      fetch(srcUrl).then(r => { if (!r.ok) throw new Error(`the source: HTTP ${r.status}`); return r.arrayBuffer() }).then(b => new Uint8Array(b)),
      // the original on the right until a translation comes, unless this machine's copy is there already
      cached ? Promise.resolve() : open(right, pdfUrl).then(() => rightLaid).then(() => { if (readAt) right.viewer.scrollPageIntoView({ pageNumber: readAt.pageNumber, destArray: [null, { name: 'XYZ' }, readAt.left, readAt.top, null], allowNegativeOffset: true }) }),
    ])
  } catch (e) { return fail('fetch failed', `Could not fetch ${paper} from arXiv (${e.message ?? e})`, 'network') }
  note('source fetched')
  const { files, pdf: noSource } = await unpackSource(srcBytes)
  if (noSource) return fail('no source', `arXiv has no LaTeX source for ${paper} (a PDF-only submission): nothing to translate this way`)
  const paperData = openPaper(files), units = paperData.units
  total = units.length - paperData.kept.size
  const src = units.map((u, i) => ({ id: i, text: plainSource(u) }))
  const context = paperContext(units)
  setContext(context)
  note('source', { units: units.length, files: files.size })
  // a copy on screen: the old translation is the run's base, matched by source; its units' indices are this run's
  // only with the same pipeline, so until the first preview the copy keeps its own anchors and state
  const sameUnits = cached?.pipeline === PIPELINE_VERSION
  const { seed, hashes } = cached ? await seedFrom(cached, units) : { seed: null, hashes: await Promise.all(units.map(sourceHash)) }
  const adoptUnits = () => { prose = src.map(x => x.text).join('\n'); unitKind = new Map(units.map((u, i) => [i, u.kind])) }
  let leftCurrent = !cached || sameUnits
  if (leftCurrent) adoptUnits()
  if (!cached) await Promise.all([anchorSide(left, src, new Map()), anchorSide(right, src, new Map())])
  note('anchored')
  window.__reader.debug = Object.assign(harness(), { units: units.map((u, i) => ({ i, kind: u.kind, text: src[i].text })) })
  window.__reader.ready = true
  // the compiler: our site's TeX page
  const frame = Object.assign(document.createElement('iframe'), { src: `${site}/tex.html`, hidden: true })
  const ready = waitFor(site, 'ready')
  document.body.append(frame)
  if (!(await Promise.race([ready.then(() => true), new Promise(r => setTimeout(r, 10000, false))]))) return fail('no compiler', `The TeX page is not running at ${site}: start it with node spikes/serve-live.mjs`)
  const initDone = waitFor(site, 'init-done')
  frame.contentWindow.postMessage({ type: 'init', endpoint }, site)
  note('compiler', { ms: (await initDone).ms })
  frame.contentWindow.postMessage({ type: 'project', key: paper, files: [...files].map(([path, content]) => ({ path, content })) }, site)
  let seq = 0
  const compile = req => new Promise(resolve => {
    const id = ++seq
    addEventListener('message', function h(e) {
      if (e.origin !== site || e.data?.type !== 'compiled' || e.data.id !== id) return
      removeEventListener('message', h)
      resolve({ ...e.data, pdf: e.data.pdf ? new Uint8Array(e.data.pdf) : null })
    })
    frame.contentWindow.postMessage({ type: 'compile', id, key: paper, main: req.main, engine: req.engine, rerun: req.rerun, bibtex: req.bibtex, overrides: [...req.overrides].map(([path, content]) => ({ path, content })) }, site)
  })
  // one replacement at a time, in the order the compiles came in
  let swaps = Promise.resolve()
  // a language with no typesetting yet (scripts.mjs) fails at once, before anything is sent
  // the final's bytes once compiled, and whether it is on screen: the right side's marks are read from what is shown
  let finalPdf = null, finalShown = false, leftMarks = null
  again = !!cached
  const result = await runLive(paperData, {
    lang, compile, note,
    seed, identity: engine.identity, pipelineCurrent: sameUnits,
    marks: knownMarks(cached, sameUnits),
    format: engine.format,
    translate: texts => engine.translate(texts, context),
    // nearest the reading line on the page first, what lies ahead before what lies behind; on the side in view, since
    // the other one, out of the display, does not move with the reader (Codex on #297)
    rank: i => {
      const side = shown(left) ? left : right, top = unitDocTop(side, i), c = side.container
      if (top == null) return 1e9 + i
      const d = top - (c.scrollTop + c.clientHeight * readingLine)
      return d >= -c.clientHeight * 0.3 ? Math.abs(d) : 2 * Math.abs(d)
    },
    onUpdate: ({ pdf, texts, translated, final }) => { if (final) finalPdf = pdf; (window.__reader.shownTexts ??= []).push({ final, texts }); swaps = swaps.then(async () => { if (!leftCurrent) { adoptUnits(); await anchorSide(left, src, leftMarks ? new Map(leftMarks) : new Map()); leftCurrent = true } const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' })); const r = await replaceRight(url, texts, { draft: !final }); URL.revokeObjectURL(url); if (final) finalShown = true; note(final ? 'shown final' : 'shown preview', { translated, swapMs: r.ms, drift: r.drift }) }).catch(e => note('swap failed', { error: String(e).slice(0, 200) })) },
    onOriginal: ({ pdf }) => { swaps = swaps.then(async () => { const marks = await marksOfPdf(pdf); leftMarks = [...marks]; const n = await anchorSide(left, src, marks); invalidate(); paint(left); note('left marks', { marks: n }) }).catch(e => note('left marks failed', { error: String(e).slice(0, 200) })) },
  }).catch(e => ({ error: e.message ?? String(e) }))
  if (result.error) return fail('failed', `Could not translate ${paper}: ${result.error}`)
  await swaps
  // this machine's copy: the whole record for a final that settled; the units' provenance alone when nothing typeset
  // changed but what was tried did (cache.mjs decideWrite); nothing else (REPORT, eighteenth addendum, "Writing")
  if (cacheKey) {
    const record = { digest: cacheKey.digest, lang: cacheKey.lang, paper, engine: engine.engine, format: engine.format, pipeline: PIPELINE_VERSION, context, units: unitsOf(units, paperData.kept, hashes, result.results), marks: leftMarks ?? (sameUnits ? cached.marks : []), rightMarks: [], figures: [...figureEntries.values()] }
    const how = decideWrite({ result, cached, units: record.units, marks: record.marks, shown: finalShown })
    const pdf = how === 'full' ? finalPdf : how === 'provenance' ? cached.pdf : null
    // the right side's marks, as its PDF names them: the final's once it is on screen, else the copy's own
    record.rightMarks = how === 'full' ? [...(right.marks ?? [])] : (cached?.rightMarks ?? [])
    if (pdf) {
      const now = { identity: await engine.now().catch(() => engine.identity), pipeline: PIPELINE_VERSION }
      note('cache write', { how, written: await pdfCache.put({ ...record, pdf }, now) })
    }
  }
  note('done', result)
  L.done = true
}

// ---------------------------------------------------------------- the precompiled demo
async function demo() {
  status('loading…')
  const base = new URL(`/pdf-reader/papers/${paper}/`, location.href).href
  // ?only=left|none: for measuring what one document costs
  const only = params.get('only')
  if (only === 'none') { window.__reader.ready = true; status('no documents'); return }
  const progressive = params.get('progressive') === '1'
  // progressive: the stages of the translation as they would come from the compiler, with how many units each has
  const stages = progressive ? await fetch(`${base}stages.json`).then(r => r.json()) : null
  const [units] = await Promise.all([fetch(`${base}units.json`).then(r => r.json()), open(left, `${base}original.pdf`), only === 'left' ? null : open(right, `${base}${stages ? stages[0].file : 'translation.pdf'}`)])
  if (only === 'left') { window.__reader.ready = true; window.__reader.units = units.length; status('left only'); return }
  timing.opened = performance.now() - timing.start
  const t1 = performance.now()
  // the text each unit has on the right: translated in the stages that have it, the original before
  const textsAt = translated => units.map(u => ({ id: u.i, text: u.i < translated ? u.tr : u.src }))
  // the marks: the translation's own destinations; for arXiv's PDF, those of our compile of the original with the word
  // each follows, so that only the ones that land on the same word are used
  prose = units.map(u => u.src).join('\n')
  unitKind = new Map(units.map(u => [u.i, u.kind]))
  const lMarks = await fetch(`${base}original-marks.json`).then(r => (r.ok ? r.json() : {})).then(o => new Map(Object.entries(o))).catch(() => new Map())
  const [marksLeft, marksRight] = await Promise.all([anchorSide(left, units.map(u => ({ id: u.i, text: u.src })), lMarks), anchorSide(right, textsAt(stages ? stages[0].translated : Infinity))])
  Object.assign(timing, { marksLeft, marksRight })
  timing.anchors = performance.now() - t1
  const linked = () => units.filter(u => left.anchors.get(u.i) && right.anchors.get(u.i)).length
  Object.assign(window.__reader, { ready: true, units: units.length, linked: linked(), leftPages: left.doc.numPages, rightPages: right.doc.numPages })
  status(`${linked()} of ${units.length} paragraphs linked · text and anchors ${Math.round(timing.anchors)} ms`)
  // for the test harness
  window.__reader.debug = harness()
  // a demo is a translation already made: final, on screen
  for (const event of ['shown final', 'done']) host.emit({ type: 'note', event, data: { demo: true }, got: units.length, total: units.length, lost: 0, again: false })

  if (stages) {
    window.__reader.swaps = []
    for (const stage of stages.slice(1)) {
      await new Promise(r => setTimeout(r, Number(params.get('every') ?? 3000)))
      const r = await replaceRight(`${base}${stage.file}`, textsAt(stage.translated)).catch(e => { console.error('[swap] failed', e?.stack ?? e); return { error: String(e) } })
      window.__reader.swaps.push({ file: stage.file, ...r })
      status(`${stage.translated >= units.length ? 'translated' : `${stage.translated} of ${units.length} translated`} · ${linked()} linked · last update ${r.ms} ms, moved ${r.drift ?? '–'} px`)
    }
    window.__reader.progressDone = true
  }
}

/** the run: live, a demo, or nothing without a paper; a crash is a failure the controller hears of */
export const run = (params.get('live') === '1' ? live() : DEMO ? demo() : Promise.resolve().then(() => { status('no paper'); window.__reader.ready = true }))
  .catch(e => { console.error('[reader]', e); host.emit({ type: 'fail', event: 'crashed', text: String(e?.message ?? e) }) })
