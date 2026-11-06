// The reader package whole behind the one chrome (AXT_READER 'v2'): `openReader` with the extension's Host (interfaces/host
// DECISION, design-a §2 caller 2). The host gives the network (our server and arXiv, nothing else; no credentials, no
// referrer), where arXiv's bytes are read (the tab's own PDF), the preferences over the extension's configuration, and the
// rows made here through the background; the reader's state is told to the chrome as the chrome's events, and the chrome's
// commands are the reader's.
import type { Prefs, PrefStore, Reader, ReaderState, SessionEvent, Session as ChromeSession, SessionHost as ChromeHost, Host, PrefsPatch } from '@readarxiv/reader'
import type { ProviderErrorKind } from '@readarxiv/ui'
import type { SurfaceConfig } from '@/shared/surface-config'
import type { TranslationTransport } from '@/providers/transport'
import { prefsOf, withPrefs } from './prefs'
import { hostTranslate } from './translate'

/** the network as the reader may use it: our server (a path, resolved against it) and arXiv, by https; a server on this
 *  machine where the build allows one (a probe's stand-in); anything else refused before a request goes out. Never the
 *  visitor's credentials, never a referrer: only the paper's id and version leave the machine (reader-hosts-data §16) */
export function hostFetch(o: { api: string; loopback: boolean; fetch?: typeof fetch }): Host['fetch'] {
  const go = o.fetch ?? globalThis.fetch.bind(globalThis)
  const ours = new URL(o.api).origin
  return (url, init) => {
    let u: URL
    try {
      u = new URL(url, o.api)
    } catch {
      return Promise.reject(new TypeError(`not a URL: ${url}`))
    }
    const local = o.loopback && u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
    if (u.username || u.password || !(u.origin === ours || u.origin === 'https://arxiv.org' || local)) return Promise.reject(new TypeError(`not a host the reader reads: ${u.origin}`))
    return go(u.href, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' })
  }
}

/** the preferences over the extension's configuration surface (shared/surface-config.ts): a read is its first landing, a write
 *  its patch on the latest stored (host/prefs.ts withPrefs), a landing from elsewhere told */
export function hostPrefs(surface: Pick<SurfaceConfig, 'state' | 'subscribe' | 'start' | 'patch'>): PrefStore {
  const now = () => {
    const s = surface.state()
    return s.config ? prefsOf(s.config, { revision: s.revision }) : null
  }
  return {
    read: () =>
      new Promise<Prefs>(resolve => {
        const p = now()
        if (p) return resolve(p)
        const off = surface.subscribe(() => {
          const q = now()
          if (q) {
            off()
            resolve(q)
          }
        })
        surface.start()
      }),
    write: patch => surface.patch(c => withPrefs(c, patch as PrefsPatch)).then(() => undefined),
    watch(listener) {
      return surface.subscribe(() => {
        const p = now()
        if (p) listener(p)
      })
    },
  }
}

export function extensionHost(o: { api: string; loopback: boolean; pdf: (ref: string) => string; prefs: PrefStore; transport: TranslationTransport; paper: string }): Host {
  return { fetch: hostFetch(o), original: o.pdf, prefs: o.prefs, translate: hostTranslate({ transport: o.transport, paper: o.paper }) }
}

/** the chain's error kind a rows' failure is told as (the chrome words it as the popup does) */
function kindOf(why: { kind: string; code?: string }): ProviderErrorKind {
  if (why.kind === 'unconfigured') return why.code === 'auth' ? 'auth' : 'no-key'
  if (why.kind === 'unavailable') return 'network'
  return 'unknown'
}
const LAYER_WHY: Record<string, 'no-source' | 'cannot-prepare' | 'unknown-versions' | 'refused' | 'unreachable'> = {
  'no-source': 'no-source',
  'not-found': 'no-source',
  'cannot-prepare': 'cannot-prepare',
  'too-large': 'cannot-prepare',
  outdated: 'unknown-versions',
  mismatch: 'cannot-prepare',
  broken: 'cannot-prepare',
  busy: 'refused',
  limit: 'refused',
  unreachable: 'unreachable',
}

/** what changed between two states of the reader, as the chrome's events (the chrome folds them as it folds today's session's) */
export function eventsOf(prev: ReaderState | null, next: ReaderState): SessionEvent[] {
  const out: SessionEvent[] = []
  const p = prev
  if (!p || p.prefs !== next.prefs) out.push({ type: 'prefs', prefs: next.prefs })
  if (!p || p.paper.title !== next.paper.title || p.paper.id !== next.paper.id) out.push({ type: 'paper', id: next.paper.id + (next.paper.version ? `v${next.paper.version}` : ''), title: next.paper.title })
  if (next.paper.html !== (p?.paper.html ?? null)) out.push({ type: 'html', url: next.paper.html })
  if (!p || p.settings.s !== next.settings.s) out.push({ type: 'notice', why: next.settings.s === 'unreadable' ? 'unreadable' : null })
  for (let n = p?.settings.refused ?? 0; n < next.settings.refused; n++) out.push({ type: 'refused' })
  const o = next.original
  if (o.s === 'opening' && (!p || p.original.s !== 'opening' || p.original.loaded !== o.loaded)) out.push({ type: 'loading', loaded: o.loaded, total: 1 })
  if (o.s === 'open' && p?.original.s !== 'open') out.push({ type: 'opened' })
  if (o.s === 'failed' && p?.original.s !== 'failed') out.push({ type: 'fail', event: 'fetch failed', text: `the original could not be read (${o.why})`, kind: 'network' })
  const v = next.view
  if (!p || p.view.display !== v.display) out.push({ type: 'display', mode: v.display })
  if (!p || p.view.sync.on !== v.sync.on) out.push({ type: 'sync', on: v.sync.on })
  if (!p || p.view.scale !== v.scale || p.view.zoom !== v.zoom) out.push({ type: 'scale', scale: v.scale, zoom: v.zoom })
  for (const side of ['left', 'right'] as const) {
    const a = p?.view.sides[side], b = v.sides[side]
    if (!a || a.page !== b.page || a.pages !== b.pages) out.push({ type: 'page', side, page: b.page, pages: b.pages })
  }
  if (!p || p.view.outline !== v.outline) out.push({ type: 'outline', entries: [...v.outline] as never })
  if (!p || p.view.heading !== v.heading) out.push({ type: 'heading', id: v.heading })
  const l = next.layer, pl = p?.layer
  if (l.s === 'preparing' && (pl?.s !== 'preparing' || pl.position !== l.position || pl.progress !== l.progress)) out.push({ type: 'preparing', position: l.position, progress: l.progress })
  if (l.s === 'ready') {
    if (pl?.s !== 'ready') out.push({ type: 'prepared' }, { type: 'coming' })
    if (pl?.s !== 'ready' || pl.laid !== l.laid || pl.total !== l.total || pl.asOriginal !== l.asOriginal) out.push({ type: 'layer', state: 'open', laid: l.laid, total: l.total, ...(l.asOriginal ? { original: l.asOriginal } : {}) })
  }
  if (l.s === 'refused' && (pl?.s !== 'refused' || pl.why !== l.why)) out.push({ type: 'unavailable', why: LAYER_WHY[l.why] ?? 'unreachable', retryAt: l.retryAt })
  const r = next.rows, pr = p?.rows
  if (r.s === 'arriving' && (pr?.s !== 'arriving' || pr.got !== r.got || pr.total !== r.total || pr.lost !== r.lost)) out.push({ type: 'translating', got: r.got, total: r.total, lost: r.lost })
  if (r.s === 'complete' && pr?.s !== 'complete') out.push({ type: 'translated', got: r.got, total: r.total, lost: r.lost, stopped: null })
  if (r.s === 'failed' && pr?.s !== 'failed') {
    if (r.why.kind === 'target') out.push({ type: 'unavailable', why: 'target', retryAt: null })
    else out.push({ type: 'translated', got: r.got, total: r.total, lost: r.lost, stopped: kindOf(r.why) })
  }
  return out
}

/** the chrome's `open`: the reader package in the chrome's panes */
export function v2Open(o: { host: Host; paper: string; visit: Parameters<typeof import('@readarxiv/reader').openReader>[1]['visit']; original: string }): (chrome: ChromeHost) => Promise<ChromeSession> {
  return async chrome => {
    const { openReader } = await import('@readarxiv/reader')
    const root = (chrome.left.closest('main') as HTMLElement | null) ?? document.body
    const reader: Reader = openReader(root, { host: o.host, paper: o.paper, ...(o.visit ? { visit: o.visit } : {}), panes: { left: chrome.left, right: chrome.right } } as Parameters<typeof openReader>[1])
    let told: ReaderState | null = null
    const tell = () => {
      const s = reader.state()
      for (const e of eventsOf(told, s)) chrome.emit(e)
      told = s
    }
    reader.subscribe(tell)
    tell()
    addEventListener('pagehide', () => reader.close(), { once: true })
    Object.assign(globalThis as object, { __reader: { probe: () => reader.probe(), reader } })
    const set = (prefs: PrefsPatch) => {
      const now = reader.state().prefs
      reader.do({ do: 'set', prefs: { ...prefs, ...(prefs.classes ? { classes: { ...now.classes, ...prefs.classes } } : {}), ...(prefs.highlight ? { highlight: { ...now.highlight, ...prefs.highlight } } : {}) } as Partial<Prefs> })
    }
    return {
      setDisplay: display => set({ display }),
      setSyncMode: m => set({ sync: m === 'same' }),
      zoomBy: factor => reader.do({ do: 'zoomBy', factor }),
      zoomTo: to => reader.do({ do: 'zoom', to }),
      goToPage: (side, page) => reader.do({ do: 'page', side, page }),
      setPrefs: set,
      pdfBytes: async () => null,
      // arXiv's own PDF, opened by the browser in a tab of its own: never read through the reader
      openOriginal: () => void open(o.original, '_blank', 'noopener,noreferrer'),
      goToUnit: id => reader.do({ do: 'unit', id }),
      lead: side => reader.do({ do: 'lead', side }),
      retry: () => reader.do({ do: 'retry' }),
      setNarrow: on => reader.do({ do: 'narrow', on }),
      pinch: (side, factor, at) => reader.do({ do: 'pinch', side, factor, at }),
    }
  }
}

/** the v2 reader's pieces for the extension's page: the configuration surface (one store for the preferences and the slots),
 *  the Host, the chrome's `open` */
export async function startV2(o: { params: URLSearchParams; paper: string }) {
  const [{ createSurfaceConfig }, { localeStale }, { createMessageTransport }, { READER_API, LOOPBACK_ALLOWED, readerAddresses }] = await Promise.all([
    import('@/shared/surface-config'),
    import('@/ui/locale-stale'),
    import('@/shared/transport'),
    import('../addresses'),
  ])
  const surface = createSurfaceConfig({ localeStale, reload: () => location.reload() })
  const pdf = (ref: string) => readerAddresses(o.params, ref, READER_API).pdf
  const host = extensionHost({ api: READER_API, loopback: LOOPBACK_ALLOWED, pdf, prefs: hostPrefs(surface), transport: createMessageTransport(), paper: o.paper })
  const mode = o.params.get('mode')
  const visit = mode === 'original' || mode === 'bilingual' || mode === 'translation' ? { display: mode as Prefs['display'] } : undefined
  const store = {
    state: () => ({ config: surface.state().config, pack: surface.state().pack ?? null }),
    subscribe: (l: () => void) => surface.subscribe(l),
    patch: (change: Parameters<SurfaceConfig['patch']>[0]) => void surface.patch(change),
  }
  return { store, open: v2Open({ host, paper: o.paper, visit, original: pdf(o.paper) }) }
}
