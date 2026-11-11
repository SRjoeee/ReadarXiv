// The reader's state as the chrome's events (model.ts SessionEvent): what changed between two states of openReader, in the
// words the chrome's model folds, as it folds the extension's today session's. One fold for every host that mounts the chrome
// over openReader (the extension's v2 page and the website's had a copy each, L11's gap 1): a host's `open` tells the chrome
// `eventsOf(told, reader.state())` at each of the reader's changes.
import type { ProviderErrorKind } from '@readarxiv/ui'
import type { ReaderState } from '../reader.ts'
import type { LayerWhy } from '../session/machine.ts'
import type { SessionEvent, Unavailable } from './model.ts'

/** the reader's reason a layer was refused, as the chrome says it: a lasting refusal keeps the original and greys the translated
 *  displays, a passing one offers a retry. Which last is the session's one table (session/machine.ts LASTING), which the
 *  chrome's own is made from (model.ts LASTING): a layer the side refused or an object not its bytes is passing there, a retry
 *  asks again, so here it is our server's for now */
export const LAYER_WHY: Readonly<Record<LayerWhy, Unavailable>> = {
  'no-source': 'no-source',
  'not-found': 'no-source',
  'cannot-prepare': 'cannot-prepare',
  'too-large': 'too-large',
  outdated: 'unknown-versions',
  mismatch: 'unreachable',
  broken: 'unreachable',
  busy: 'busy',
  limit: 'refused',
  unreachable: 'unreachable',
}

/** a rows' failure as the chrome's error kind (the chain's, which the chrome words as the popup does): a key missing or refused
 *  (rows made here), the service or our server out of reach, a refusal for good */
export function kindOf(why: { kind: string; code?: string }): ProviderErrorKind {
  if (why.kind === 'unconfigured') return why.code === 'auth' ? 'auth' : 'no-key'
  if (why.kind === 'unavailable' || why.kind === 'server') return 'network'
  if (why.kind === 'refused') return 'bad-request'
  return 'unknown'
}

/** what changed from `prev` (null: the first state) to `next`, as the chrome's events, in the order the chrome folds them */
export function eventsOf(prev: ReaderState | null, next: ReaderState): SessionEvent[] {
  const out: SessionEvent[] = []
  const p = prev
  // (the chrome's preferences with the target shown: the visit's (an address's), which the reader shows and never writes, as a
  // shared link's language is shown in the menu; with no visit of its own, the stored one)
  if (!p || p.prefs !== next.prefs || p.rows.target !== next.rows.target)
    out.push({
      type: 'prefs',
      prefs:
        next.rows.target && next.rows.target !== next.prefs.target
          ? { ...next.prefs, target: next.rows.target }
          : next.prefs,
    })
  if (!p || p.paper.title !== next.paper.title || p.paper.id !== next.paper.id)
    out.push({
      type: 'paper',
      id: next.paper.id + (next.paper.version ? `v${next.paper.version}` : ''),
      title: next.paper.title,
    })
  if (next.paper.html !== (p?.paper.html ?? null)) out.push({ type: 'html', url: next.paper.html })
  if (!p || p.settings.s !== next.settings.s)
    out.push({ type: 'notice', why: next.settings.s === 'unreadable' ? 'unreadable' : null })
  for (let n = p?.settings.refused ?? 0; n < next.settings.refused; n++) out.push({ type: 'refused' })
  const o = next.original
  if (o.s === 'opening' && (p?.original.s !== 'opening' || p.original.loaded !== o.loaded))
    out.push({ type: 'loading', loaded: o.loaded, total: o.total })
  if (o.s === 'open' && p?.original.s !== 'open') out.push({ type: 'opened' })
  if (o.s === 'failed' && p?.original.s !== 'failed')
    out.push({
      type: 'fail',
      event: 'fetch failed',
      text: `the original could not be read (${o.why})`,
      kind: 'network',
    })
  const v = next.view
  if (!p || p.view.display !== v.display) out.push({ type: 'display', mode: v.display })
  if (!p || p.view.sync.on !== v.sync.on || p.view.sync.available !== v.sync.available)
    out.push({ type: 'sync', on: v.sync.on, available: v.sync.available })
  if (!p || p.view.scale !== v.scale || p.view.zoom !== v.zoom)
    out.push({ type: 'scale', scale: v.scale, zoom: v.zoom })
  for (const side of ['left', 'right'] as const) {
    const a = p?.view.sides[side],
      b = v.sides[side]
    if (!a || a.page !== b.page || a.pages !== b.pages) out.push({ type: 'page', side, page: b.page, pages: b.pages })
  }
  if (!p || p.view.outline !== v.outline) out.push({ type: 'outline', entries: v.outline.map((e) => ({ ...e })) })
  if (!p || p.view.heading !== v.heading) out.push({ type: 'heading', id: v.heading })
  const l = next.layer,
    pl = p?.layer
  if (l.s === 'preparing' && (pl?.s !== 'preparing' || pl.position !== l.position || pl.progress !== l.progress))
    out.push({ type: 'preparing', position: l.position, progress: l.progress })
  if (l.s === 'ready') {
    if (pl?.s !== 'ready') out.push({ type: 'prepared' }, { type: 'coming' })
    if (pl?.s !== 'ready' || pl.laid !== l.laid || pl.total !== l.total || pl.asOriginal !== l.asOriginal)
      out.push({
        type: 'layer',
        state: 'open',
        laid: l.laid,
        total: l.total,
        ...(l.asOriginal ? { original: l.asOriginal } : {}),
      })
  }
  // (a refusal told again with another time is told again: the time said is the last our server named)
  if (l.s === 'refused' && (pl?.s !== 'refused' || pl.why !== l.why || pl.retryAt !== l.retryAt))
    out.push({ type: 'unavailable', why: LAYER_WHY[l.why] ?? 'unreachable', retryAt: l.retryAt })
  if (!!p?.reconnecting !== !!next.reconnecting) out.push({ type: 'link', reconnecting: !!next.reconnecting })
  // the translation under way is what the view shown waits for (reader.ts `waits`, session/rows.ts viewOf), counted over the layer
  // it shows: rows read of a run done, a run that restates rows held, one on units of a layer not shown, are told by their end
  // alone. The view's wait over while the rows still come (every unit shown holds its translation) is its end
  const r = next.rows,
    pr = p?.rows
  const waited = pr?.s === 'arriving' && pr.waits
  if (r.s === 'arriving' && r.waits && (!waited || pr.got !== r.got || pr.total !== r.total || pr.lost !== r.lost))
    out.push({ type: 'translating', got: r.got, total: r.total, lost: r.lost })
  if (r.s === 'arriving' && !r.waits && waited)
    out.push({ type: 'translated', got: r.got, total: r.total, lost: r.lost, stopped: null })
  // (the rows' end and its counts, told again whenever the view's counts change after it: the layer's units read after the end,
  // a toggle, the passages a run our server started again brings. One statement, the view's, told whenever it changes)
  const counts = (x: ReaderState['rows']) => (x.s === 'none' ? '' : `${x.got} ${x.total} ${x.lost}`)
  const recount = !!pr && pr.s === r.s && counts(pr) !== counts(r)
  if (r.s === 'complete' && (pr?.s !== 'complete' || recount))
    out.push({
      type: 'translated',
      got: r.got,
      total: r.total,
      lost: r.lost,
      stopped: r.stopped ? kindOf(r.stopped) : null,
    })
  if (r.s === 'failed' && (pr?.s !== 'failed' || pr.why.kind !== r.why.kind || recount)) {
    if (r.why.kind === 'target') {
      if (pr?.s !== 'failed' || pr.why.kind !== 'target')
        out.push({ type: 'unavailable', why: 'target', retryAt: null })
    } else
      out.push({
        type: 'translated',
        got: r.got,
        total: r.total,
        lost: r.lost,
        stopped: kindOf(r.why),
        retryAt: r.retryAt ?? null,
      })
  }
  return out
}
