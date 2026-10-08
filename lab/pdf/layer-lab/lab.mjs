// lab/pdf/layer-lab/lab.mjs
// The layer lab's page (serve.mjs serves it): a fixture picked by paper and language; two panes, each Original, the
// quick view (`v0`: the instant layer as the integrated engine draws it, the hybrid over the paper's add-on with D,
// proto.mjs) or Final, pages kept in step; page jump (← and →), zoom, one page or continuous scroll; the quick view's
// choices and the layout rule set (rules-panel.mjs: edited, compared, saved and loaded); notes kept per fixture in this
// browser (localStorage) and exported as JSON. The early engine (Task 11's from-scratch entry, layer.mjs; retired by the
// 10-06 change of direction) is off the menus, and an old link's `layer` still opens it, with no settings of its own. Its
// words are strings.mjs's, in Chinese (the default) or English. The state is in the address (#f=<fixture>&a=<view>&b=<view>&p=<page>&z=<zoom>&s=<scroll>, the quick view's:
// v0tex, v0rm, v0=roles|prototype, rules=<git ref> (the rule set read from that commit or branch); the page's: ui=en,
// panel=0) so that a view can be reopened or scripted. Unsaved edits to the rule set are not in the address.
import * as pdfjs from 'pdfjs-dist'
import { createDocLoads } from './doc-loads.mjs'
import { CAPS_SCALE, drawCopy, drawText, LayerRun, loadEngine, loadLayout, svgOf } from './layer.mjs'
import { createNoteSaver } from './notes.mjs'
import { loadProto, ProtoRun } from './proto.mjs'
import { createRulesPanel } from './rules-panel.mjs'
import { createRunSlot } from './run-slot.mjs'
import { ENDONYMS, missingKeys, STRINGS, UI_LANGS } from './strings.mjs'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs'
const ASSETS = { cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', iccUrl: '/pdfjs/iccs/' }
/** the views the menus offer, in their order; `layer`, the retired early engine, is offered only to a pane an old link
 *  opened on it */
const VIEWS = ['original', 'v0', 'final']
const KNOWN = [...VIEWS, 'layer']
const NOTES = 'layer-lab:notes:'
const PT = 96 / 72
/** the gap the scroller keeps above its first page, and above a page it is brought to (lab.css .scroller's padding) */
const PAD = 12

const $ = id => document.getElementById(id)
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v) } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
}
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v))
  e.append(...kids.filter(k => k != null))
  return e
}
const SVGNS = 'http://www.w3.org/2000/svg'
const icon = name => { const e = document.createElementNS(SVGNS, 'svg'); e.setAttribute('class', 'ic'); e.setAttribute('aria-hidden', 'true'); const u = document.createElementNS(SVGNS, 'use'); u.setAttribute('href', `#i-${name}`); e.append(u); return e }
const fmt = (n, d = 2) => (n == null || Number.isNaN(n) ? '-' : (+n).toFixed(d))
const counts = obj => Object.entries(obj).map(([k, v]) => `${k} ${v}`).join(', ') || '-'

// ---- the words: one table, both languages complete
{
  const missing = missingKeys()
  if (missing.length) console.error(`strings.mjs: the two languages differ in ${missing.join(', ')}`)
}
let L = STRINGS.zh
/** a string of the interface's language: a key (dotted for a nested one), with the values a templated one names */
function t(key, ...args) {
  const v = key.split('.').reduce((o, k) => o?.[k], L)
  return typeof v === 'function' ? v(...args) : (v ?? key)
}

// ---- state: the address first, then what this browser last had
const saved = store.get('layer-lab:ui', {})
const hash = Object.fromEntries(new URLSearchParams(location.hash.slice(1)))
const state = {
  fixture: hash.f ?? saved.fixture ?? null,
  views: [hash.a ?? saved.a ?? 'v0', hash.b ?? saved.b ?? 'original'].map(v => (KNOWN.includes(v) ? v : 'original')),
  page: Math.max(1, Number(hash.p ?? 1) || 1),
  zoom: hash.z ?? saved.zoom ?? 'fit',
  scroll: (hash.s ?? saved.scroll) === 'single' ? 'single' : 'continuous',
  sync: saved.sync ?? true,
  /** the faces the v0 view draws in: the role table's, or the prototype's own (#v0=prototype) */
  v0faces: (hash.v0 ?? saved.v0faces) === 'prototype' ? 'prototype' : 'roles',
  /** the v0 view drawn over the text-removed PDF (#v0rm=0: erased and put back, as before) */
  v0removal: (hash.v0rm ?? saved.v0removal ?? '1') !== '0',
  /** the v0 view as the hybrid, each unit the layout file locates whole by its geometry (#v0tex=0: v0 alone) */
  v0tex: (hash.v0tex ?? saved.v0tex ?? '1') !== '0',
  /** the interface's language (#ui=en; Chinese by default) and whether the settings are shown (#panel=0: hidden) */
  ui: (hash.ui ?? saved.ui) === 'en' ? 'en' : 'zh',
  panel: (hash.panel ?? saved.panel ?? '1') !== '0',
}
L = STRINGS[state.ui]
/** the layout rule set v0 is opened with: the panel's (the worktree's file, or what the panel loaded, and the edits made
 *  to it). Null while there is none, and v0 then takes the engine's built-in set */
const v0Rules = () => rules?.set() ?? null
function remember() {
  store.set('layer-lab:ui', { fixture: state.fixture, a: state.views[0], b: state.views[1], zoom: state.zoom, scroll: state.scroll, sync: state.sync, v0faces: state.v0faces, v0removal: state.v0removal ? '1' : '0', v0tex: state.v0tex ? '1' : '0', ui: state.ui, panel: state.panel ? '1' : '0' })
  const q = new URLSearchParams({ f: state.fixture ?? '', a: state.views[0], b: state.views[1], p: String(state.page), z: state.zoom, s: state.scroll, v0: state.v0faces, v0rm: state.v0removal ? '1' : '0', v0tex: state.v0tex ? '1' : '0' })
  if (rules?.from()?.kind === 'ref') q.set('rules', rules.from().ref)
  if (state.ui === 'en') q.set('ui', 'en')
  if (!state.panel) q.set('panel', '0')
  history.replaceState(null, '', `#${q}`)
}
const status = text => { $('status').textContent = text }

// ---- the page's own words: every element naming a key (data-t: its text; -aria, -title, -placeholder: those
// attributes), the interface languages by their own names
function applyStrings() {
  document.documentElement.lang = t('htmlLang')
  document.title = t('title')
  for (const e of document.querySelectorAll('[data-t]')) e.textContent = t(e.dataset.t)
  for (const e of document.querySelectorAll('[data-t-aria]')) e.setAttribute('aria-label', t(e.dataset.tAria))
  for (const e of document.querySelectorAll('[data-t-title]')) e.title = t(e.dataset.tTitle)
  for (const e of document.querySelectorAll('[data-t-placeholder]')) e.placeholder = t(e.dataset.tPlaceholder)
  for (const e of document.querySelectorAll('[data-t-aria-pane]')) e.setAttribute('aria-label', t('paneRegion', t(e.dataset.tAriaPane)))
  for (const e of document.querySelectorAll('[data-endonym]')) e.textContent = UI_LANGS[e.dataset.endonym]
  $('prev').title = `${t('prev')} (←)`
  $('next').title = `${t('next')} (→)`
}
applyStrings()
document.documentElement.dataset.panel = state.panel ? 'open' : 'closed'
$('g-v0').hidden = !state.views.includes('v0')
$('g-rules').hidden = true

// ---- what is open: the fixture, its documents, its layout and its layer
let engine = null, proto = null, protoCommit = null, rules = null, fixtures = [], open = null
const fetchBytes = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()) }
/** a document closed: PDF.js 6 closes it through its loading task */
const closeDoc = doc => { doc?.loadingTask.destroy() }
const fetchJson = async url => { const r = await fetch(url); return r.ok ? r.json() : null }
/** the documents a fixture load opens, which a load that a newer one replaces, or that fails, closes (doc-loads.mjs) */
const docLoads = createDocLoads({ getDocument: bytes => pdfjs.getDocument({ data: bytes, ...ASSETS }), fetchBytes })
/** the v0 runs: one at a time, since they share the engine's font roles (run-slot.mjs); a run is let go through `letGoProto` */
const protoSlot = createRunSlot()
/** the open fixture's v0 run, if there is one, let go: closed once it has started, and a new run starts after that */
function letGoProto(at) {
  if (!at?.proto) return
  protoSlot.release(at.proto)
  at.proto = null
  at.protoRun = null
  at.v0ms = null
}
async function sizesOf(doc) {
  return Promise.all(Array.from({ length: doc.numPages }, async (_, i) => { const v = (await doc.getPage(i + 1)).view; return [v[2] - v[0], v[3] - v[1]] }))
}

async function openFixture(name) {
  const f = fixtures.find(x => x.name === name)
  if (!f) return
  const load = docLoads.begin()
  status(t('opening', `${f.paper}v${f.version} · ${ENDONYMS[f.target] ?? f.target}`))
  if (open) for (const d of Object.values(open.docs)) closeDoc(d)
  letGoProto(open)
  open = null
  const base = `/fixtures/${encodeURIComponent(name)}/`
  const has = file => f.files.includes(file)
  let arxiv, final, units, refusal, layout = null, layoutError = null, sizes, layer = null, layerWhy = null
  try {
    ;[arxiv, final, units, refusal] = await Promise.all([
      load.open(`${base}arxiv.pdf`), has('final.pdf') ? load.open(`${base}final.pdf`).catch(() => null) : null,
      has('units.json') ? fetchJson(`${base}units.json`) : null, has('refusal.json') ? fetchJson(`${base}refusal.json`) : null,
    ])
    if (has('layout.json')) { try { layout = await loadLayout(await fetchBytes(`${base}layout.json`)) } catch (e) { layoutError = String(e?.message ?? e) } }
    sizes = { arxiv: await sizesOf(arxiv), final: final ? await sizesOf(final) : null }
    // (the early engine is started only for a pane an old link opened on it)
    if (!state.views.includes('layer')) layerWhy = null
    else if (!engine.ready) layerWhy = ['layerNotReady', engine.why]
    else if (refusal) layerWhy = ['layerRefused', refusal.refused]
    else if (!layout) layerWhy = ['layerNoLayout', layoutError]
    else if (!units) layerWhy = ['layerNoUnits']
    else { try { layer = await LayerRun.open({ engine, layout, units: units.units, target: f.target, doc: arxiv }) } catch (e) { layerWhy = ['layerCouldNotStart', String(e?.message ?? e).slice(0, 300)] } }
    // (a newer load began meanwhile: this one's documents are closed, and it shows nothing)
    if (!load.keep()) return
  } catch (e) {
    // (a failure closes what the load opened; one that a newer load has replaced is that load's to report, not this one's)
    load.close()
    if (load.stale()) return
    throw e
  }
  open = { f, docs: { arxiv, final }, sizes, units, layout, refusal, layer, layerWhy, proto: null, inspected: null }
  state.fixture = name
  showInfo()
  fillViews()
  setV0Controls()
  rules?.setTarget(f.target)
  loadNotes()
  showInspect()
  await Promise.all(panes.map((p, i) => p.show(state.views[i])))
  // (a newer load replaced this one while its panes drew: it closed the documents, and shows its own)
  if (load.stale()) return
  showPageCount()
  goTo(Math.min(state.page, arxiv.numPages), 0)
  remember()
  status('')
}
const pageCount = () => Math.max(open?.docs.arxiv.numPages ?? 1, open?.docs.final?.numPages ?? 1)
function showPageCount() {
  if (!open) return
  $('pages').textContent = t('pageOf', open.docs.arxiv.numPages, open.docs.final?.numPages ?? null)
}

// ---- the panes
let renders = 0
const queue = []
/** at most two pages render at once */
async function slot(fn) {
  if (renders >= 2) await new Promise(r => queue.push(r))
  renders++
  try { return await fn() } finally { renders--; queue.shift()?.() }
}
const cssScale = () => {
  if (state.zoom !== 'fit') return Number(state.zoom) * PT
  const widths = panes.map(p => p.scroller.clientWidth - 56).filter(w => w > 0)
  if (!widths.length) return PT
  const pageW = Math.max(...panes.map(p => (p.sizes ? Math.max(...p.sizes.map(([w]) => w)) : 0)), 1)
  return Math.max(0.2, Math.min(...widths) / pageW)
}

class Pane {
  constructor(section, n) {
    this.n = n
    this.section = section
    this.select = section.querySelector('select.view')
    this.note = section.querySelector('.head-note')
    this.scroller = section.querySelector('.scroller')
    this.divs = []
    this.expected = null
    this.observer = new IntersectionObserver(entries => {
      for (const e of entries) e.isIntersecting ? this.render(e.target) : this.unrender(e.target)
    }, { root: this.scroller, rootMargin: '100% 0px' })
    this.scroller.addEventListener('scroll', () => this.scrolled(), { passive: true })
    this.scroller.addEventListener('click', e => inspectAt(this, e))
  }
  get other() { return panes[1 - this.n] }
  get doc() { return this.kind === 'final' ? open?.docs.final : open?.docs.arxiv }
  get sizes() { return this.kind === 'final' ? open?.sizes.final : open?.sizes.arxiv }
  async show(kind) {
    this.kind = kind
    this.section.dataset.kind = kind
    this.select.value = kind
    this.head()
    showGroups()
    this.build()
  }
  head() { this.note.replaceChildren(...headOf(this.kind)); this.note.title = this.note.textContent }
  build() {
    for (const d of this.divs) if (d) { this.observer.unobserve(d); this.unrender(d) }
    this.divs = []
    this.scroller.replaceChildren()
    this.scroller.classList.toggle('single', state.scroll === 'single')
    if (!this.doc) { this.scroller.append(h('p', { class: 'empty' }, this.kind !== 'final' ? t('nothingToShow') : open?.f.final ? t('finalCannot', open.f.final.strategy, open.f.final.error) : t('finalNotYet'))); return }
    const scale = cssScale(), n = this.doc.numPages
    const pages = state.scroll === 'single' ? [Math.min(state.page, n)] : Array.from({ length: n }, (_, i) => i + 1)
    for (const p of pages) {
      const [w, hh] = this.sizes[p - 1]
      // (the page box is whole CSS pixels, its canvas the box's device pixels exactly: the page drawn at the zoom's own
      // scale, cut at the box's edge, never resampled to fit it; lab.css centres it on a whole pixel)
      const k = scale * devicePixelRatio, cw = Math.floor((w * k) / devicePixelRatio), ch = Math.floor((hh * k) / devicePixelRatio)
      const div = h('div', { class: 'page', 'data-page': p, style: `width:${cw}px;height:${ch}px;--w:${cw}px` }, h('span', { class: 'num', 'aria-hidden': 'true' }, String(p)))
      div._k = k
      div._px = [Math.round(cw * devicePixelRatio), Math.round(ch * devicePixelRatio)]
      this.divs[p - 1] = div
      this.scroller.append(div)
      this.observer.observe(div)
    }
  }
  unrender(div) {
    div._token = (div._token ?? 0) + 1
    div._task?.cancel()
    for (const c of [...div.children]) if (!c.classList.contains('num')) c.remove()
    delete div.dataset.rendered
  }
  async render(div) {
    if (div.dataset.rendered || div._busy) return
    const token = (div._token = (div._token ?? 0) + 1)
    div._busy = true
    try {
      await slot(async () => {
        if (token !== div._token || !this.doc) return
        const p = Number(div.dataset.page), page = await this.doc.getPage(p)
        const vp = page.getViewport({ scale: div._k ?? (div.offsetWidth / (page.view[2] - page.view[0])) * devicePixelRatio })
        const source = document.createElement('canvas')
        source.width = div._px?.[0] ?? Math.floor(vp.width)
        source.height = div._px?.[1] ?? Math.floor(vp.height)
        const sctx = source.getContext('2d')
        sctx.fillStyle = '#ffffff'
        sctx.fillRect(0, 0, source.width, source.height)
        const tRender = performance.now()
        div._task = page.render({ canvasContext: sctx, viewport: vp })
        try { await div._task.promise } catch { return }
        const renderMs = performance.now() - tRender
        if (token !== div._token) return
        const parts = this.kind === 'layer' ? await layerPage(p, page, vp, source, token, div) : this.kind === 'v0' ? await protoPage(p, source, vp, token, div, renderMs) : [source]
        if (token !== div._token || !parts) return
        for (const c of [...div.children]) if (!c.classList.contains('num')) c.remove()
        div.append(...parts)
        div.dataset.rendered = '1'
      })
    } catch (e) {
      // a document closed under a render (another fixture opened) is no error of the page's
      if (token === div._token && this.doc) console.warn(`page ${div.dataset.page}:`, e)
    } finally { div._busy = false }
  }
  /** the page at the top of the view, and how far into it: read at the line PAD under the scroller's top edge, where
   *  scrollTo brings a page's top (offsets are the scroller's own: lab.css makes it the pages' offset parent) */
  position() {
    const line = this.scroller.scrollTop + PAD
    let best = this.divs.find(Boolean)
    for (const d of this.divs) { if (!d) continue; if (d.offsetTop <= line + 1) best = d; else break }
    if (!best) return { page: 1, frac: 0 }
    return { page: Number(best.dataset.page), frac: Math.max(0, Math.min(1, (line - best.offsetTop) / best.offsetHeight)) }
  }
  /** the view brought to a page, `frac` of the way into it: its top PAD under the scroller's top edge, the gap above it
   *  shown, as the first page's is */
  scrollTo(page, frac) {
    if (state.scroll === 'single') { this.build(); return }
    const d = this.divs[Math.min(page, this.divs.length) - 1]
    if (!d) return
    const top = Math.max(0, Math.round(d.offsetTop - PAD + frac * d.offsetHeight))
    this.expected = top
    this.scroller.scrollTop = top
  }
  scrolled() {
    if (state.scroll === 'single') return
    if (this.expected !== null && Math.abs(this.scroller.scrollTop - this.expected) <= 2) { this.expected = null; return }
    this.expected = null
    const { page, frac } = this.position()
    if (page !== state.page) { state.page = page; showPage(); remember(); if (this.kind === 'v0') v0Summary(page) }
    if (state.sync) this.other.scrollTo(page, frac)
  }
}
const panes = [new Pane($('pane-a'), 0), new Pane($('pane-b'), 1)]

/** a pane's head beside its menu: what the view is drawn with, or why it is not drawn */
function headOf(kind) {
  if (!open) return []
  const f = open.f
  const warn = text => h('span', { class: 'not-ready' }, icon('alert'), text)
  if (kind === 'original') return [t('headOriginal')]
  if (kind === 'final') return [!f.final ? t('headFinalNone') : f.final.ok ? `${t('headFinalOk', f.final.strategy, f.final.typeset)}${finalOlder() ? ` · ${t('finalOlder')}` : ''}` : warn(t('headFinalFailed'))]
  if (kind === 'v0') return proto?.ready ? [t('headV0', { fill: rules?.resolved()?.params.adaptiveFill === null ? 'B' : 'D', tex: state.v0tex, removal: state.v0removal, faces: state.v0faces })] : [warn(t('headNotLoaded'))]
  if (!open.layer) return [warn(engine.ready ? t('headNotDrawn') : t('headNotReady'))]
  return []
}
/** the quick view's settings, while a pane shows it */
function showGroups() { const v0 = panes.some(p => p.kind === 'v0'); $('g-v0').hidden = !v0; $('g-rules').hidden = !v0 || !rules }
/** the open fixture's final was compiled from the lab's own fixture, whose translation predates the gate's cut */
const finalOlder = () => open?.f.final?.from === 'finals'
/** each pane's menu: the views offered, the retired one too where the pane shows it; the final's entry says when its
 *  translation is older than the one the quick view lays */
function fillViews() {
  for (const [i, id] of ['view-a', 'view-b'].entries()) {
    const sel = $(id), offered = state.views[i] === 'layer' ? [...VIEWS, 'layer'] : VIEWS
    sel.replaceChildren(sel.querySelector('button'), ...offered.map(k => option(k, h('span', {}, t('views')[k]), ...(k === 'final' && finalOlder() ? [h('span', { class: 'hint' }, t('finalOlder'))] : []))))
    sel.value = state.views[i]
  }
}

function showPage() {
  $('page').value = String(state.page)
  $('prev').disabled = state.page <= 1
  $('next').disabled = state.page >= pageCount()
}
function goTo(page, frac = 0) {
  state.page = Math.max(1, Math.min(pageCount(), page))
  showPage()
  for (const p of panes) p.scrollTo(state.page, frac)
  remember()
  if (open?.protoRun) v0Summary(state.page)
}

// ---- the v0 view: v0's copy of the page drawn at the pane's resolution from its own rendering, its text as SVG scaled
// over it (layer-lab/proto.mjs)
const banner = (text, kind = null) => h('div', { class: 'banner', 'data-kind': kind }, text)
async function protoPage(p, source, vp, token, div, renderMs) {
  if (!proto?.ready) return [source, banner(t('bannerNoV0', proto?.why ?? '-'), 'not-ready')]
  if (!open.f.files.includes('record.json')) return [source, banner(t('bannerNoRecord'))]
  if (!open.f.geometry) return [source, banner(t('bannerNoGeometry'))]
  status(t('drawing', p))
  let done, run
  const at = open
  if (!open.proto) {
    // (the run's choices are taken now, as the reader has them; it starts when the run before it is gone)
    const options = { V: proto.V, rules: v0Rules(), name: open.f.name, target: open.f.target, faces: state.v0faces, removal: state.v0removal && open.f.files.includes('layout.json'), tex: state.v0tex && open.f.files.includes('layout.json'), status: k => status(t(k)) }
    open.proto = protoSlot.start(() => ProtoRun.open(options))
  }
  const runP = open.proto
  try {
    run = await runP
    // (let go before it began or while it started: another choice or fixture is open, which draws)
    if (!run || at.proto !== runP) { status(''); return null }
    at.protoRun = run
    done = await run.page(p)
  } catch (e) {
    status('')
    // (a run let go under its drawing, another fixture or another choice opened, is no failure of the page)
    if (token !== div._token || open !== at || at.proto !== runP) return null
    console.warn(`v0 page ${p}:`, e)
    return [source, banner(t('bannerV0Failed', p, String(e?.message ?? e).slice(0, 300)))]
  }
  status('')
  if (token !== div._token) return null
  if (!done) return [source, banner(t('bannerV0NoPage', p))]
  // the copy: the page as this pane rendered it (its device pixels at the zoom), v0's drawing scaled onto it
  let copy
  const t0 = performance.now()
  try { copy = await run.copy(p, source, vp.scale) } catch (e) { return [source, banner(t('bannerV0CouldNotDraw', p, String(e?.message ?? e).slice(0, 300)))] }
  if (token !== div._token) return null
  const holder = document.createElement('div')
  holder.innerHTML = done.svg
  // (the SVG at its own size, v0's CSS px, scaled to the pane's by a transform: not stretched to the page box, whose size
  // is the canvas's whole device pixels, and with no viewBox, which rasterizes the text otherwise than the gate's)
  const svg = holder.firstElementChild, css = vp.scale / devicePixelRatio / 1.25
  svg.style.width = `${done.w}px`
  svg.style.height = `${done.h}px`
  svg.style.transformOrigin = '0 0'
  if (Math.abs(css - 1) > 1e-9) svg.style.transform = `scale(${css})`
  // what the page cost here: the pane's rendering of arXiv's page, v0's step (once a page), its drawing at this pane's
  // resolution (every time the page is drawn)
  const drawn = { render: renderMs, copy: performance.now() - t0, k: vp.scale }
  ;(open.v0ms ??= new Map()).set(p, drawn)
  if (p === state.page || !open.v0ms.has(state.page)) v0Summary(p)
  return [copy, svg]
}

// ---- the settings panel: what a page shows, a few facts and its technical details (kept open or closed as the reader
// left them, page to page)
const techOpen = { v0: false, paper: false, inspect: false }
const facts = rows => h('dl', { class: 'facts' }, ...rows.filter(Boolean).flatMap(([k, v, cls]) => [h('dt', {}, k), h('dd', cls ? { class: cls } : {}, v)]))
function tech(name, rows) {
  const d = h('details', { class: 'tech' }, h('summary', {}, icon('right'), h('span', {}, t('tech'))), facts(rows))
  d.open = techOpen[name]
  d.addEventListener('toggle', () => { techOpen[name] = d.open })
  return d
}
const engineRows = () => [
  [t('techEngine'), info.proto ? t('techEngine1', info.proto.root === 'this worktree' ? (info.branch ?? info.proto.root) : info.proto.root, protoCommit ?? '-', info.proto.remover ?? '-') : '-', 'mono'],
  [t('techInputs'), t('techInputs1', info.inputs ?? {}), 'mono'],
  rules?.from() ? [t('rules.current'), `${t('rules.setFrom', rules.from().label, rules.from().version)}${rules.dirty() ? ` · ${t('rules.src.edit')}` : ''}`, 'mono'] : null,
]

/** the v0 view's page in the panel: its units by geometry, the text removal and what it cost; D's fills, the steps and
 *  the engine under the technical details */
function v0Summary(p) {
  const el = $('v0-summary')
  const done = open?.protoRun?.done.get(p)
  if (!done) { el.replaceChildren(...(open?.protoRun ? [h('h3', {}, t('thisPage', p)), h('p', { class: 'hint' }, t('notDrawnYet'))] : []), ...(proto?.ready ? [tech('v0', engineRows())] : [])); return }
  const run = open.protoRun, texIds = new Set(run.run.sources?.tex ?? []), knob = {}
  for (const r of done.recs) knob[r.knob] = (knob[r.knob] ?? 0) + 1
  const byTex = done.recs.filter(r => texIds.has(r.id)).length
  const skipped = run.run.skipped.filter(x => open.layout?.index.onPage(p)?.includes(x.id))
  const tm = done.times, drawn = open.v0ms?.get(p)
  const units = t('v0Units', done.recs.length, byTex, done.recs.length - byTex, skipped.length)
  const removal = !done.removal ? t('removalOff') : done.removal.removed ? t('removalDone', done.removal.tex ?? 0, done.removal.v0 ?? 0) : t('removalNone')
  const time = drawn && done.ms != null ? t('v0Time', done.ms + drawn.copy, done.ms, drawn.copy) : t('v0TimeAhead')
  el.replaceChildren(
    h('h3', {}, t('thisPage', p)),
    facts([[t('rowUnits'), units], [t('rowRemoval'), removal], [t('rowTime'), time]]),
    tech('v0', [
      [t('techFit'), counts(knob), 'mono'],
      skipped.length ? [t('rowWhy'), counts(Object.fromEntries([...new Set(skipped.map(x => x.why))].map(w => [w, skipped.filter(x => x.why === w).length]))), 'mono'] : null,
      tm ? [t('techSteps'), t('techSteps1', tm)] : null,
      done.wait != null ? [t('techWaited'), t('techWaited1', done.wait, p === 1)] : null,
      drawn ? [t('techPaneRender'), t('techPaneRender1', drawn.render, drawn.k)] : null,
      ...engineRows(),
    ]),
  )
}

// ---- the early engine's page (an old link's `layer`): the copy and its text
async function layerPage(p, page, vp, source, token, div) {
  const view = page.view
  if (!open.layer) return [source, banner(open.layerWhy ? t(...open.layerWhy) : t('headNotDrawn'), engine.ready ? null : 'not-ready')]
  status(t('laying', p))
  let laid
  try { laid = await open.layer.page(p) } catch (e) {
    status('')
    return [source, banner(t('bannerLayerFailed', p, String(e?.message ?? e).slice(0, 300)))]
  }
  status('')
  if (token !== div._token) return null
  const copy = document.createElement('canvas')
  copy.width = source.width
  copy.height = source.height
  drawCopy(copy.getContext('2d'), source, vp, laid.draws)
  const text = svgOf(view, 'layer-text')
  drawText(text, laid.draws, engine.E.FACES, open.f.target)
  return [copy, text]
}

/** the unit's line boxes on a page, from the layout file (stride 8: page, x0, x1, baseline, top, bottom, size, font) */
function linesOn(u, p) {
  const out = []
  for (let i = 0; i < u.lines.length; i += 8) if (u.lines[i] === p) out.push([u.lines[i + 1], u.lines[i + 5], u.lines[i + 2], u.lines[i + 4], u.lines[i + 6]])
  return out
}
// ---- the paper: its translation, layout file and final; the fixture, the versions and the inputs under the details
function showInfo() {
  if (!open) return
  const f = open.f, tr = f.translation, fin = f.final
  $('info').replaceChildren(...facts([
    [t('rowTr'), tr ? t('tr1', tr) : t('trNone')],
    [t('rowLayoutFile'), open.refusal ? t('layoutRefused', open.refusal.refused) : open.layout ? t('layoutFile1', open.layout.file.units.length, open.layout.file.paper.pages) : t('layoutNone')],
    [t('rowFinal'), fin ? (fin.ok ? t('final1', fin) : t('finalFailed', fin)) : t('finalNone')],
  ]).childNodes)
  const techEl = $('info-tech')
  techEl.replaceChildren(...facts([
    [t('rowFixture'), f.name, 'mono'],
    tr?.from?.made ? [t('rowStaging'), tr.from.made.slice(0, 10)] : tr?.made ? [t('rowStaging'), tr.made.slice(0, 10)] : null,
    open.layout ? [t('rowLayoutVersion'), `LAYOUT ${open.layout.file.layout}`, 'mono'] : null,
    fin ? [t('rowFinalMade'), t('finalMade1', fin)] : null,
    fin && !fin.ok && fin.error ? [t('rowFinal'), fin.error, 'mono'] : null,
    [t('rowFacesNote'), t('facesNote')],
    [t('rowLab'), t('lab1', info.commit?.slice(0, 8), info.subject), 'mono'],
  ]).childNodes)
}
/** the unit under a click: the smallest of its line boxes holding the point */
function inspectAt(pane, e) {
  const div = e.target.closest?.('.page')
  if (!div || !open?.layout || pane.kind === 'final') return
  const p = Number(div.dataset.page), r = div.getBoundingClientRect()
  const page = open.sizes.arxiv[p - 1], scale = r.width / page[0]
  const view = open.layout.index.view(p)
  const x = view[0] + (e.clientX - r.left) / scale, y = view[3] - (e.clientY - r.top) / scale
  let best = null
  for (const id of open.layout.index.onPage(p)) {
    const u = open.layout.index.unit(id)
    for (const [x0, y0, x1, y1] of linesOn(u, p)) if (x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1) { const a = (x1 - x0) * (y1 - y0); if (!best || a < best.a) best = { id, u, a } }
  }
  open.inspected = best ? best.id : null
  showInspect()
}
function showInspect() {
  const el = $('inspect')
  if (!open?.layout) { el.replaceChildren(); $('g-inspect').hidden = true; return }
  $('g-inspect').hidden = false
  const id = open.inspected
  if (id == null) { el.replaceChildren(h('p', { class: 'hint' }, t('inspectHint'))); return }
  const u = open.layout.index.unit(id), unit = open.units?.units.find(x => x.id === id)
  const text = unit ? trTextOf(unit.pieces) : null
  const lost = [...u.ph.values()].filter(ph => ph.flags & open.layout.PH_FLAG.LOST).length, empty = [...u.ph.values()].filter(ph => ph.flags & open.layout.PH_FLAG.EMPTY).length
  el.replaceChildren(
    facts([
      [t('rowUnits'), `#${id} ${u.kind}${u.heading ? `: ${u.heading.slice(0, 80)}` : ''}`],
      [t('rowTranslation'), unit ? t('translation1', unit.state, unit.by ?? '-', unit.pieces.length, unit.sentences?.length ?? 0) : t('translationNone')],
      open.protoRun ? [t('rowV0'), v0Of(id)] : null,
    ]),
    ...(text ? [h('p', { class: 'excerpt', lang: open.f.target }, text.length > 600 ? `${text.slice(0, 600)}…` : text)] : []),
    tech('inspect', [[t('rowLayout'), t('layout1', u.lines.length / 8, u.frames.length / 6, u.ph.size, lost, empty)]]),
  )
}
/** what the v0 view did with a unit: its record (drawn, by which geometry, its fit and D's fill), or why it was left */
function v0Of(id) {
  const run = open.protoRun.run, r = run.stats.find(x => x.id === id)
  if (!r) { const sk = run.skipped.find(x => x.id === id); return sk ? t('v0Left', sk.why) : t('v0NotLaid') }
  const by = (run.sources?.tex ?? []).includes(id) ? 'tex' : 'v0'
  return t('v0Drawn', by, `${r.knob}, size ${fmt(r.fitScale, 3)} (${fmt(r.sizeRatio, 3)} of the original's), lead ${fmt(r.lead, 2)}${r.track ? `, track ${fmt(r.track, 3)}` : ''}${r.fill ? `; D's fill: page target ${fmt(r.fill.target, 3)}, its own ${fmt(r.fill.lead, 3)}` : ''}`)
}
let trTextOf = pieces => pieces.map(p => (p[0] === 0 ? p[1] : ' ')).join('').replace(/\s+/g, ' ').trim()

// ---- notes: one per fixture, in this browser; exported as JSON
const clock = iso => new Date(iso).toLocaleString(t('htmlLang'), { hour: '2-digit', minute: '2-digit', ...(iso.slice(0, 10) === new Date().toISOString().slice(0, 10) ? {} : { month: 'numeric', day: 'numeric' }) })
/** a note is kept for the fixture and with the text it was typed with, not those of the moment it is kept (notes.mjs) */
const noteSaver = createNoteSaver({
  save(fixture, text) {
    store.set(`${NOTES}${fixture}`, { text, updated: new Date().toISOString() })
    if (fixture === state.fixture) showSaved()
  },
})
function loadNotes() {
  // (a note typed for the fixture just left is kept before the box shows the next one's)
  noteSaver.flush()
  $('notes').value = store.get(`${NOTES}${state.fixture}`, null)?.text ?? ''
  showSaved()
}
function showSaved() {
  const n = store.get(`${NOTES}${state.fixture}`, null)
  $('saved').textContent = n?.updated ? t('saved', clock(n.updated)) : ''
}
$('notes').addEventListener('input', () => { if (state.fixture) noteSaver.type(state.fixture, $('notes').value) })
addEventListener('pagehide', () => noteSaver.flush())
$('export').addEventListener('click', () => {
  noteSaver.flush()
  const notes = {}
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(NOTES)) notes[k.slice(NOTES.length)] = JSON.parse(localStorage.getItem(k)) } } catch {}
  const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), commit: info.commit, notes }, null, 1)], { type: 'application/json' })
  const a = h('a', { href: URL.createObjectURL(blob), download: `layer-lab-notes-${new Date().toISOString().slice(0, 10)}.json` })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
})

// ---- the toolbar
const option = (value, ...kids) => h('option', { value }, ...kids)
function fillPickers() {
  const papers = [...new Map(fixtures.map(f => [`${f.paper}v${f.version}`, f])).entries()]
  const cur = fixtures.find(f => f.name === state.fixture) ?? fixtures[0]
  const sel = $('paper')
  // (a paper whose record names no title is called by its id alone, in the title's ink)
  sel.replaceChildren(sel.querySelector('button'), ...papers.map(([id, f]) => option(id, ...(f.title ? [h('span', { class: 't', lang: 'en' }, f.title), h('span', { class: 'id' }, id)] : [h('span', { class: 'id solo' }, id)]))))
  sel.value = `${cur.paper}v${cur.version}`
  for (const o of sel.options) { const f = papers.find(([id]) => id === o.value)?.[1]; o.title = f?.title ? `${f.title} · ${o.value}` : o.value }
  sel.title = sel.selectedOptions[0]?.title ?? ''
  fillTargets(cur.target)
  fillViews()
  $('zoom').value = state.zoom
  for (const r of document.querySelectorAll('input[name="scroll"]')) r.checked = r.value === state.scroll
  $('sync').setAttribute('aria-checked', String(state.sync))
}
function fillTargets(want) {
  const paper = $('paper').value, sel = $('target')
  const ts = fixtures.filter(f => `${f.paper}v${f.version}` === paper).map(f => f.target)
  sel.replaceChildren(sel.querySelector('button'), ...ts.map(tg => { const o = option(tg, ENDONYMS[tg] ?? tg); o.lang = tg; return o }))
  sel.value = ts.includes(want) ? want : ts[0]
}
const pickedName = () => `${$('paper').value}-${$('target').value}`
$('paper').addEventListener('change', () => { $('paper').title = $('paper').selectedOptions[0]?.title ?? ''; fillTargets($('target').value); openFixture(pickedName()) })
$('target').addEventListener('change', () => openFixture(pickedName()))
for (const [i, id] of ['view-a', 'view-b'].entries()) $(id).addEventListener('change', async () => { state.views[i] = $(id).value; fillViews(); const at = panes[i].other.position(); await panes[i].show(state.views[i]); panes[i].scrollTo(at.page, at.frac); remember(); v0Summary(state.page) })
$('page').addEventListener('change', () => { const n = Number.parseInt($('page').value, 10); if (Number.isFinite(n)) goTo(n); else showPage() })
$('page').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('page').dispatchEvent(new Event('change')); $('page').select() } })
$('page').addEventListener('focus', () => $('page').select())
$('prev').addEventListener('click', () => goTo(state.page - 1))
$('next').addEventListener('click', () => goTo(state.page + 1))
const rebuild = () => { const at = state.scroll === 'single' ? { page: state.page, frac: 0 } : panes[0].position(); for (const p of panes) p.build(); goTo(at.page, at.frac) }
$('zoom').addEventListener('change', () => { state.zoom = $('zoom').value; rebuild() })
for (const r of document.querySelectorAll('input[name="scroll"]')) r.addEventListener('change', () => { if (r.checked) { state.scroll = r.value; rebuild() } })
const switchOf = (b, on) => b.setAttribute('aria-checked', String(on))
$('sync').addEventListener('click', () => { state.sync = !state.sync; switchOf($('sync'), state.sync); remember() })
$('panel-toggle').addEventListener('click', () => {
  state.panel = !state.panel
  document.documentElement.dataset.panel = state.panel ? 'open' : 'closed'
  $('panel-toggle').setAttribute('aria-expanded', String(state.panel))
  remember()
})
$('panel-toggle').setAttribute('aria-expanded', String(state.panel))
const menuOpen = () => { try { return !!document.querySelector('select:open') } catch { return false } }
// ← and → turn the page (PageUp and PageDown too, one page at a time), wherever the keys do not move something else: a
// field's caret, a slider, a radio group, an open menu
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  if (e.target.closest?.('input, textarea, select, [contenteditable]') || menuOpen()) return
  const back = e.key === 'ArrowLeft' || (e.key === 'PageUp' && state.scroll === 'single')
  const on = e.key === 'ArrowRight' || (e.key === 'PageDown' && state.scroll === 'single')
  if (!back && !on) return
  e.preventDefault()
  goTo(state.page + (on ? 1 : -1))
})
// the focus ring is the keyboard's: a text field after a press shows its caret and edge alone
document.addEventListener('pointerdown', () => { document.documentElement.dataset.pointer = '' }, true)
document.addEventListener('keydown', () => { delete document.documentElement.dataset.pointer }, true)
let resizeTimer = null
new ResizeObserver(() => { if (state.zoom !== 'fit' || !open) return; clearTimeout(resizeTimer); resizeTimer = setTimeout(rebuild, 200) }).observe(document.querySelector('main'))

// ---- the interface's language: every word again, the panes' heads and the panel's facts with it
for (const r of document.querySelectorAll('input[name="ui"]')) {
  r.checked = r.value === state.ui
  r.addEventListener('change', () => {
    if (!r.checked) return
    state.ui = r.value
    L = STRINGS[state.ui]
    applyStrings()
    fillViews()
    remember()
    setV0Controls()
    if (!open) return
    showInfo(); showPageCount(); showInspect(); showSaved(); rules?.render()
    for (const p of panes) { p.head(); if (!p.doc) p.build() }
    v0Summary(state.page)
  })
}

// ---- start
const info = (await fetchJson('/api/info')) ?? {}
engine = await loadEngine()
proto = await loadProto()
protoCommit = info.proto?.commit ? `${info.proto.commit.slice(0, 8)}${info.proto.dirty ? '+' : ''}` : null
/** the rules panel: the layout rule set the quick view draws with (rules-panel.mjs). Its names for the faces come from the
 *  engine's face catalog: the CJK groups (those with all four weights) and the faces to suggest */
if (proto.ready) {
  let catalog = { groups: [], faces: [], families: [] }
  try {
    const { FACES, ENGLISH_FAMILIES } = await import('/proto-engine/font-roles.mjs')
    const ids = Object.keys(FACES)
    catalog = { groups: ids.filter(id => id.endsWith('-light')).map(id => id.slice(0, -6)).filter(g => ['light', 'regular', 'semibold', 'bold'].every(w => ids.includes(`${g}-${w}`))), faces: ids, families: [...ENGLISH_FAMILIES] }
  } catch {}
  rules = createRulesPanel({ root: $('rules-root'), h, icon, t, R: proto.R, names: ENDONYMS, catalog, onChange: () => { if (open) again() } })
  await rules.start(hash.rules)
}
// the v0 view's choices (the panel's first group): the hybrid, the add-on and the faces; each change opens v0 again and
// draws its panes again
function setV0Controls() {
  const layoutHere = !open || open.f.files.includes('layout.json')
  for (const [id, on, needsLayout, desc] of [['v0-tex', state.v0tex, true, 'texDesc'], ['v0-removal', state.v0removal, true, 'removalDesc'], ['v0-faces', state.v0faces === 'prototype', false, 'facesDesc']]) {
    const off = needsLayout && !layoutHere
    $(id).disabled = off
    switchOf($(id), on && !off)
    $(id).closest('.toggle').toggleAttribute('data-off', off)
    $(`${id}-desc`).textContent = off ? t('needsLayout') : t(desc)
  }
  $('v0-engine').hidden = !!proto?.ready
  $('v0-engine').textContent = proto?.ready ? '' : t('v0NotLoaded', proto?.why ?? '-')
}
async function again() {
  setV0Controls()
  remember()
  letGoProto(open)
  $('v0-summary').replaceChildren()
  for (const p of panes) if (p.kind === 'v0') { const at = p.position(); await p.show('v0'); p.scrollTo(at.page, at.frac) }
}
setV0Controls()
$('v0-faces').addEventListener('click', () => { state.v0faces = state.v0faces === 'prototype' ? 'roles' : 'prototype'; again() })
$('v0-removal').addEventListener('click', () => { if (!$('v0-removal').disabled) { state.v0removal = !state.v0removal; again() } })
$('v0-tex').addEventListener('click', () => { if (!$('v0-tex').disabled) { state.v0tex = !state.v0tex; again() } })
try { const P = await import('/src/pdf-reader/engine/layer/pieces.mjs'); if (P.trText) trTextOf = P.trText } catch {}
fixtures = (await fetchJson('/api/fixtures')) ?? []
window.__lab = { state, panes, engine: () => engine, open: () => open, CAPS_SCALE }
if (!fixtures.length) {
  status('')
  document.querySelector('main').replaceChildren(h('p', { class: 'empty' }, t('noFixtures')))
} else {
  if (!fixtures.some(f => f.name === state.fixture)) state.fixture = fixtures[0].name
  fillPickers()
  await openFixture(state.fixture)
}
document.documentElement.dataset.ready = '1'
