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
import * as pdfjsLib from './lib/pdf.min.mjs'
import { anchorUnits, boundsFromMarks, markWords, tokenizeDocument } from './anchors.mjs'
import { isTranslatable, linesToBoxes, renderImage, setImageModes } from './lib/axt/figures.mjs'
import { blockWire, figureLabels, figureRegions, splitBlock, vectorLines } from './figures.mjs'
import { openPaper, runLive } from './live.mjs'
import { verified, VERIFIED } from './scripts.mjs'
import { openEngine, paperContext } from './engine.mjs'
import { appearanceRule, createSurfaceConfig, LANG_CODE_TO_LOCALE_NAME, lookOf, toBcp47 } from './lib/axt/extension.mjs'
import { isName, plainSource, WIRE } from './mt.mjs'
import { unpackSource } from './tar.mjs'

// the viewer components read the core library from this global
globalThis.pdfjsLib = pdfjsLib
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./lib/pdf.worker.min.mjs', import.meta.url).href
const { EventBus, PDFLinkService, PDFViewer } = await import('./lib/pdf_viewer.mjs')

const PAPERS = ['2608.04322', '2608.00055']
const params = new URLSearchParams(location.search)
const paper = params.get('paper') ?? PAPERS[0]
/** a precompiled demo paper (poc-reader/papers/, made locally, never in the repository) only when one is asked for by
 *  `paper` without `live`; the page opens on its form otherwise */
const DEMO = params.get('live') !== '1' && params.has('paper')
const $ = id => document.getElementById(id)
const status = text => { $('status').textContent = text }
const timing = { start: performance.now() }
window.__reader = { timing, ready: false }

for (const p of PAPERS.includes(paper) ? PAPERS : [...PAPERS, paper]) $('paper').append(new Option(p, p, false, p === paper))
/** an arXiv id from whatever a reader pastes: an id with or without its version, arXiv:…, or an abs, pdf, html or src
 *  link; new ids (2608.04322v2) and old ones (hep-th/9901001, math.GT/0309136) */
function arxivId(text) {
  const t = text.trim().replace(/^arxiv:/i, '')
  const m = /(\d{4}\.\d{4,5}(?:v\d+)?)/.exec(t) ?? /([a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)/.exec(t)
  return m ? m[1] : null
}
$('open').onsubmit = e => {
  e.preventDefault()
  const id = arxivId($('arxiv').value)
  if (!id) { status('Not an arXiv link or id'); return }
  // the language and the engine are the extension's settings
  const next = new URLSearchParams({ live: '1', paper: id })
  for (const k of ['site', 'endpoint']) if (params.has(k)) next.set(k, params.get(k))
  location.search = `?${next}`
}
if (params.get('live') === '1') $('arxiv').value = paper
const reload = () => { location.search = `?paper=${$('paper').value}${$('progressive').checked ? '&progressive=1' : ''}` }
$('paper').onchange = reload
$('progressive').checked = params.get('progressive') === '1'
$('progressive').onchange = reload
$('paper').hidden = $('progressive').parentElement.hidden = !DEMO

// ---------------------------------------------------------------- the extension's settings, and the display
// The target language and the highlight's band are the extension's settings, read and written as its settings page
// does and followed as they change, so that the PDF and the HTML page agree. The display is the reader's own, kept
// until the reader is part of the extension's settings: the original alone (nothing is translated or compiled until
// the reader asks for more), the translation alone, or both side by side.
/** the languages whose typesetting the gate verifies (scripts.mjs VERIFIED), as the extension's table names them; the
 *  others wait for #295 */
const LANGUAGES = Object.keys(LANG_CODE_TO_LOCALE_NAME).filter(code => verified(toBcp47(code)))
const MODES = ['original', 'translation', 'bilingual']
const PREFS = 'axtPdfReader'
const prefs = await chrome.storage.local.get(PREFS).then(r => r[PREFS] ?? {}).catch(() => ({}))
/** the reader's own preferences, merged into what storage holds when they are written: another reader page may have
 *  saved since this one opened (Devin on #297) */
const savePrefs = patch => chrome.storage.local.get(PREFS).then(r => chrome.storage.local.set({ [PREFS]: { ...(r[PREFS] ?? {}), ...patch } })).catch(() => undefined)
let mode = MODES.includes(params.get('mode')) ? params.get('mode') : MODES.includes(prefs.mode) ? prefs.mode : 'original'
function showMode() {
  document.documentElement.setAttribute('data-axt-pdf-mode', mode)
  for (const b of $('modes').children) b.setAttribute('aria-checked', String(b.dataset.mode === mode))
}
showMode()
// The extension's settings as its popup and settings page have them (shared/surface-config.ts): each change a patch on
// what storage holds when its turn comes, one after another, and a configuration that could not be read said so (Codex
// on #297). The reader's bar is in English alone, so no interface language asks for a reload
const surface = createSurfaceConfig({ localeStale: () => false, reload: () => location.reload() })
await new Promise(resolve => { const off = surface.subscribe(() => { if (surface.state().config) { off(); resolve() } }); surface.start() })
let config = surface.state().config
/** why the stored settings could not be read, for the bar (config/storage.ts FallbackReason) */
const unreadable = why => ({ tooNew: `saved by a newer version of the extension (${why.stored}; this one reads ${why.supported})`, upgradeFailed: `version ${why.stored} could not be brought to ${why.supported}`, invalid: `${why.where}: ${why.message}` })[why.kind] ?? 'for a reason not known'
function showSettings() {
  let sheet = document.getElementById('axt-look')
  if (!sheet) { sheet = document.createElement('style'); sheet.id = 'axt-look'; document.head.append(sheet) }
  sheet.textContent = appearanceRule(lookOf(config))
  const target = config.targetLanguage, look = config.appearance
  $('lang').replaceChildren(...[...new Set([...LANGUAGES, target])].map(code => new Option(LANG_CODE_TO_LOCALE_NAME[code] ?? code, code, false, code === target)))
  $('band').replaceChildren(...look.highlights.map(h => new Option(h.name, h.id, false, h.id === look.activeHighlight)))
  // the defaults are in effect — the service and its key set on the settings page are not — until they are repaired there
  const why = surface.state().fallbackReason
  $('notice').hidden = !why
  $('notice').textContent = $('notice').title = why ? `The extension's settings could not be read (${unreadable(why)}): its defaults are in use until they are repaired on its settings page` : ''
}
showSettings()
/** this page's own writes, in the order they were made: a new language reloads the page only once they have landed */
let writes = Promise.resolve()
const save = patch => (writes = writes.then(() => surface.patch(c => ({ ...c, ...patch(c) }))).catch(e => status(`Could not save the setting: ${e.message ?? e}`)))
// the value chosen, taken when it is chosen: a write lands after the menus are drawn again from the one before it
$('lang').onchange = () => { const code = $('lang').value; save(() => ({ targetLanguage: code })) }
$('band').onchange = () => { const id = $('band').value; save(c => ({ appearance: { ...c.appearance, activeHighlight: id } })) }
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
$('modes').onclick = e => {
  const next = e.target.closest('button')?.dataset.mode
  if (!next || next === mode) return
  const from = mode
  mode = next
  showMode()
  void savePrefs({ mode })
  relayout(from)
  if (mode !== 'original') wantTranslation()
}
// Opened over arXiv's PDF page (the extension's content script there): the page's own paper, and a way back to the
// browser's viewer, which the content script keeps underneath
const EMBEDDED = params.get('embedded') === '1'
if (EMBEDDED) {
  for (const el of [$('open'), $('paper'), $('progressive').parentElement]) el.hidden = true
  $('close').hidden = false
  $('close').onclick = () => parent.postMessage({ type: 'axt-pdf-reader-close' }, 'https://arxiv.org')
}

// ---------------------------------------------------------------- the two viewers
function makeSide(container) {
  const eventBus = new EventBus()
  const linkService = new PDFLinkService({ eventBus })
  const viewer = new PDFViewer({ container, eventBus, linkService, textLayerMode: 1, removePageBorders: false })
  linkService.setViewer(viewer)
  // figs: each page's figures being laid (paintFigures), and figGen the latest call's number, by page; frames: a draft
  // preview's frames (pdfFrames), a promise; anchored: the side's units located, a promise, where they come after its pages
  return { container, eventBus, linkService, viewer, doc: null, anchors: new Map(), byPage: new Map(), figs: new Map(), figGen: new Map(), frames: null, anchored: null }
}
const left = makeSide($('left'))
let right = makeSide($('right'))
const sides = [left, right]
const other = side => (side === left ? right : left)

const LIB = new URL('./lib/', import.meta.url).href
async function open(side, url) {
  side.task = pdfjsLib.getDocument({ url, cMapUrl: `${LIB}cmaps/`, cMapPacked: true, standardFontDataUrl: `${LIB}standard_fonts/`, wasmUrl: `${LIB}wasm/` })
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
// The HTML mode's image translation, run on the translation's pages: the extension's own modules, compiled from its
// source into lib/axt (spikes/build-shared.mjs) — lines merged into boxes (core/image/boxes.ts), the overlay and its
// material (core/renderer/image.ts, styles/image.css), the bitmap recogniser (core/ocr). What is the PDF's own is the
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
let ocrWorker = null, ocrSeq = 0
const ocrWaiting = new Map()
/** a bitmap of the page, by its object id → its lines, read in the worker (a copy: PDF.js keeps drawing its own) */
async function recognise(page, id) {
  const obj = await new Promise(resolve => page.objs.get(id, resolve))
  let bitmap
  if (obj?.bitmap) bitmap = await createImageBitmap(obj.bitmap)
  else if (obj?.data) {
    const { width, height, data, kind } = obj, rgba = new Uint8ClampedArray(width * height * 4)
    // PDF.js's kinds: 1 one bit per pixel, 2 RGB, 3 RGBA
    if (kind === 3) rgba.set(data)
    else if (kind === 2) for (let i = 0, j = 0; i < width * height; i++, j += 3) rgba.set([data[j], data[j + 1], data[j + 2], 255], i * 4)
    else return []
    bitmap = await createImageBitmap(new ImageData(rgba, width, height))
  } else return []
  if (bitmap.width < 32 || bitmap.height < 32) { bitmap.close(); return [] }
  ocrWorker ??= Object.assign(new Worker(new URL('./ocr-worker.mjs', import.meta.url), { type: 'module' }), { onmessage: ({ data }) => { ocrWaiting.get(data.id)?.(data); ocrWaiting.delete(data.id) } })
  const seq = ++ocrSeq
  const reply = await new Promise(resolve => { ocrWaiting.set(seq, resolve); ocrWorker.postMessage({ id: seq, bitmap }, [bitmap]) })
  if (reply.error) console.warn('[ocr]', reply.error)
  return reply.lines ?? []
}
const translated = new Map() // a figure's wire text → its translation (a Promise while it is out)
/**
 * A figure's boxes → their translations, null for a box left as it is. A figure's boxes go as one text with a
 * placeholder between them, in the chain's wire format, so that each is translated in the figure's context (alone, a
 * box's "Score" came back as 配乐); a text whose placeholders do not come back one for one goes again box by box.
 * Proposed for the shared module, with the name rule below.
 */
async function translateBoxes(boxes) {
  const todo = boxes.map((b, i) => i).filter(i => isTranslatable(boxes[i].text))
  const out = boxes.map(() => null)
  const engine = await theEngine().catch(() => null)
  if (!engine) return out
  const context = await paperCtx
  const send = wire => { if (!translated.has(wire)) translated.set(wire, engine.translate([wire], context).then(r => r[0]).catch(() => null)); return translated.get(wire) }
  const single = []
  for (let k = 0; k < todo.length; k += 40) {
    const chunk = todo.slice(k, k + 40)
    const wire = chunk.length > 1 && blockWire(chunk.map(i => boxes[i].text), engine.format)
    if (!wire) { single.push(...chunk); continue }
    const got = await send(wire)
    const parts = got && splitBlock(got, chunk.length, engine.format)
    if (parts) chunk.forEach((i, j) => { out[i] = parts[j] }); else single.push(...chunk)
  }
  const { run, unrun } = WIRE[engine.format]
  await Promise.all(single.map(async i => { const got = await send(run(boxes[i].text)); out[i] = got == null ? null : unrun(got) }))
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
  if ($('figures').checked) {
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
function syncFrom(side) {
  const mine = placed.get(side.container)
  if (mine != null) { placed.delete(side.container); if (Math.abs(mine - side.container.scrollTop) < 1) return }
  if (!$('sync').checked || mode !== 'bilingual' || side !== driver || !left.anchors.size) return
  clearTimeout(settleTimer)
  settleTimer = setTimeout(() => settle(side), 160)
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
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
function relayout(from) {
  requestAnimationFrame(() => {
    for (const s of sides) if (s.doc && shown(s)) { s.viewer.currentScaleValue = 'page-width'; s.viewer.update() }
    const came = from === 'original' ? right : from === 'translation' ? left : null
    requestAnimationFrame(() => {
      if (!came || !left.anchors.size || !right.anchors.size || !came.doc) return
      const went = other(came), c = went.container
      invalidate()
      put(came.container, map(went === left, c.scrollTop + c.clientHeight * readingLine) - came.container.clientHeight * readingLine)
    })
  })
}
/** the paragraph at the reading line brought level on the other side, at the same place within it */
function settle(side) {
  if (!$('sync').checked || mode !== 'bilingual' || side !== driver) return
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
  const start = container.scrollTop, t0 = performance.now(), ms = 220
  const step = now => {
    const k = Math.min(1, (now - t0) / ms)
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
const invalidate = () => { table = null; lines = null }
addEventListener('resize', invalidate)

function attach(side) {
  side.container.addEventListener('scroll', () => syncFrom(side), { passive: true })
  for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) side.container.addEventListener(type, () => { driver = side }, { passive: true })
  side.container.addEventListener('pointermove', e => { pointerX = { side, x: e.clientX } }, { passive: true })
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
  side.eventBus.on('scalechanging', ({ scale }) => { invalidate(); if (shown(side) && (side === left || !shown(left))) $('zoom').textContent = `${Math.round(scale * 100)}%` })
  side.eventBus.on('pagesinit', invalidate)
}
for (const side of sides) attach(side)
/** where the original is being read, in PDF.js's terms (its page, and the point at the top left of the view in PDF
 *  units), as long as it is in view: the same file opens on the right at the same place */
let readAt = null
left.eventBus.on('updateviewarea', ({ location }) => { if (shown(left)) readAt = location })
$('figures').onchange = repaintFigures
$('zoomIn').onclick = () => { for (const s of sides) if (shown(s)) s.viewer.currentScale = Math.min(4, s.viewer.currentScale * 1.15) }
$('zoomOut').onclick = () => { for (const s of sides) if (shown(s)) s.viewer.currentScale = Math.max(0.25, s.viewer.currentScale / 1.15) }

// ---------------------------------------------------------------- anchoring one side
/** the units TeX sets away from where the source has them: a caption with its float, a footnote at the foot of its
 *  page, a table's cells, a picture's text (anchors.mjs anchorUnits) */
const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure'])
/** every unit located on a side: `texts` is the unit's text as that PDF has it; `marks` null = read them from the PDF */
async function anchorSide(side, texts, marks) {
  const pages = await textPages(side.doc)
  const doc = tokenizeDocument(pages)
  const bounds = boundsFromMarks(doc, marks ?? (await pdfMarks(side.doc)))
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
  const old = right
  right = next; sides[1] = next
  if (driver === old) driver = next
  container.classList.remove('axt-incoming')
  old.container.remove()
  old.task.destroy() // the document and its worker-side state; PDF.js 6 destroys through the loading task
  invalidate(); paint(right)
  const drift = place ? Math.round(scrollFor(right, place) - right.container.scrollTop - (offset ?? 0)) : null
  return { ms: Math.round(performance.now() - t0), drift }
}

// ---------------------------------------------------------------- live (#292)
const waitFor = (origin, type) => new Promise(r => addEventListener('message', function h(e) { if (e.origin === origin && e.data?.type === type) { removeEventListener('message', h); r(e.data) } }))
/** our compile of the original, with unit marks → each mark with the word it stands by, to carry over to arXiv's PDF */
async function marksOfPdf(bytes) {
  const task = pdfjsLib.getDocument({ data: bytes, cMapUrl: `${LIB}cmaps/`, cMapPacked: true, standardFontDataUrl: `${LIB}standard_fonts/`, wasmUrl: `${LIB}wasm/` })
  const doc = await task.promise
  try { return markWords(tokenizeDocument(await textPages(doc)), await pdfMarks(doc)) } finally { task.destroy() }
}
async function live() {
  // our TeX page and the TeX Live file server, as spikes/serve-live.mjs starts them on this machine
  const site = params.get('site') ?? 'http://127.0.0.1:8071', endpoint = params.get('endpoint') ?? 'http://localhost:8070'
  const srcUrl = params.get('src') ?? `https://arxiv.org/src/${paper}`, pdfUrl = params.get('pdf') ?? `https://arxiv.org/pdf/${paper}`
  const L = (window.__reader.live = { events: [], t0: performance.now() })
  let got = 0, total = 0, engine = null, setContext = null
  let compiledOnce = false
  paperCtx = new Promise(resolve => { setContext = resolve })
  const note = (event, data = {}) => {
    L.events.push({ t: Math.round(performance.now() - L.t0), event, ...data })
    if (event === 'translated') got = data.total
    if ((event === 'preview' || event === 'final') && data.ok) compiledOnce = true
    const said = { preview: data.ok ? 'preview compiled' : `compile failed (${data.strategy}): ${data.error ?? ''}`, final: data.ok ? 'final compiled' : `final compile failed (${data.strategy}): ${data.error ?? ''}`, 'next strategy': `trying ${data.strategy}`, done: compiledOnce ? 'done' : 'done — the translation did not compile; the right side still shows the original' }[event] ?? event
    const by = engine ? ` into ${engine.lang} by ${engine.engine}` : ''
    status(`${total ? `${got} of ${total} translated${by}` : 'opening…'} · ${said}${data.ms != null && data.ok !== false ? ` (${(data.ms / 1000).toFixed(1)} s)` : ''}`)
  }
  const fail = (event, text) => { setContext({}); note(event); status(text); L.done = true; L.failed = text }
  // the engine and the language are the extension's settings; asked first, so that a reader with no service set up is
  // told at once
  // the original first, in every display; nothing is translated or compiled until a display that shows a translation is chosen
  status(`Fetching ${paper} from arXiv…`)
  try { await open(left, pdfUrl) } catch (e) { return fail('fetch failed', `Could not fetch ${paper}'s PDF from arXiv (${e.message ?? e})`) }
  note('opened')
  if (mode === 'original') status(`${paper}, the original. Choose Translation or Side by side to translate it`)
  await translationWanted
  translating = true
  status('Asking the extension which service translates…')
  try { engine = await theEngine() } catch (e) { return fail('no engine', `Cannot translate: ${e.message ?? e}`) }
  const lang = engine.lang
  note('engine', { lang, format: engine.format, engine: engine.engine })
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
      open(right, pdfUrl).then(() => rightLaid).then(() => { if (readAt) right.viewer.scrollPageIntoView({ pageNumber: readAt.pageNumber, destArray: [null, { name: 'XYZ' }, readAt.left, readAt.top, null], allowNegativeOffset: true }) }),
    ])
  } catch (e) { return fail('fetch failed', `Could not fetch ${paper} from arXiv (${e.message ?? e})`) }
  note('source fetched')
  const { files, pdf: noSource } = await unpackSource(srcBytes)
  if (noSource) return fail('no source', `arXiv has no LaTeX source for ${paper} (a PDF-only submission): nothing to translate this way`)
  const paperData = openPaper(files), units = paperData.units
  total = units.length - paperData.kept.size
  const src = units.map((u, i) => ({ id: i, text: plainSource(u) }))
  prose = src.map(x => x.text).join('\n')
  const context = paperContext(units)
  setContext(context)
  unitKind = new Map(units.map((u, i) => [i, u.kind]))
  note('source', { units: units.length, files: files.size })
  await Promise.all([anchorSide(left, src, new Map()), anchorSide(right, src, new Map())])
  note('anchored')
  window.__reader.debug = { left, get right() { return right }, unitTop, unitDocTop, toPageBox, pageView, light, syncFrom, settle, map, placeOf, scrollFor, setDriver: s => { driver = s }, table: () => table, get readingLine() { return readingLine }, get lastAlign() { return lastAlign }, alignClick, regionsOf, regionBox, pageTop, get unitKind() { return unitKind }, units: units.map((u, i) => ({ i, kind: u.kind, text: src[i].text })), get rightTexts() { return rightTexts }, captionNear, leftFor, figureOf }
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
  const result = await runLive(paperData, {
    lang, compile, note,
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
    onUpdate: ({ pdf, texts, translated, final }) => { swaps = swaps.then(async () => { const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' })); const r = await replaceRight(url, texts, { draft: !final }); URL.revokeObjectURL(url); note(final ? 'shown final' : 'shown preview', { translated, swapMs: r.ms, drift: r.drift }) }).catch(e => note('swap failed', { error: String(e).slice(0, 200) })) },
    onOriginal: ({ pdf }) => { swaps = swaps.then(async () => { const n = await anchorSide(left, src, await marksOfPdf(pdf)); invalidate(); paint(left); note('left marks', { marks: n }) }).catch(e => note('left marks failed', { error: String(e).slice(0, 200) })) },
  }).catch(e => ({ error: e.message ?? String(e) }))
  if (result.error) return fail('failed', `Could not translate ${paper}: ${result.error}`)
  await swaps
  note('done', result)
  L.done = true
}

// ---------------------------------------------------------------- the precompiled demo
async function demo() {
  status('loading…')
  const base = new URL(`./papers/${paper}/`, import.meta.url).href
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
  window.__reader.debug = { left, get right() { return right }, unitTop, unitDocTop, toPageBox, pageView, light, syncFrom, settle, map, placeOf, scrollFor, setDriver: s => { driver = s }, table: () => table, get readingLine() { return readingLine }, get lastAlign() { return lastAlign }, alignClick, regionsOf, regionBox, pageTop, get unitKind() { return unitKind } }

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

if (params.get('live') === '1') await live()
else if (DEMO) await demo()
else { status('Paste an arXiv link or id, then Translate'); window.__reader.ready = true }
