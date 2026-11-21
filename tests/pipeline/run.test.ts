import { asOut, type UnitIn, type Why } from '@readarxiv/translate'
import { describe, expect, it, vi } from 'vitest'
import { extract, type Block } from '@/core/extractor'
import { startTranslation, type Progress, type Transport } from '@/core/pipeline/run'
import { T_CLASS } from '@/core/marks'
import { unitOfWire, wireOfContent } from '@/core/protector/units'
import { ERROR_CLASS, FOR_ATTR, INLINE_ATTR, ON_ATTR, PARTIAL_ATTR, PENDING_CLASS, STATE_ATTR } from '@/core/renderer/attrs'
import { TABLE_RULES } from '@/core/rules/latexml'
import { DEFAULT_PRELOAD } from '@/core/scheduler/lazy'
import type { TranslateCall, UnitResult } from '@/providers/transport'
import type { ProviderErrorKind } from '@/providers/types'
import { reasonText } from '@/ui/strings'
import { declarations, rules, sheet } from '../styles/css-rules'

const PAGE =
  '<h2 class="ltx_title ltx_title_section" id="s1">Introduction</h2>'
  + '<p class="ltx_p" id="p1">One <math class="ltx_Math"><mi>x</mi></math>.</p>'
  + '<p class="ltx_p" id="p2">Two <math class="ltx_Math"><mi>y</mi></math> here.</p>'
  + '<h2 class="ltx_title ltx_title_section" id="s2">Method</h2>'
  + '<p class="ltx_p" id="p3">Three.</p>'
  + '<table class="ltx_tabular" id="T1"><tbody><tr><td class="ltx_td">Model</td><td class="ltx_td">1</td></tr></tbody></table>'

const docOf = (page = PAGE) => new DOMParser().parseFromString(`<!doctype html><html><head></head><body><article class="ltx_document">${page}</article></body></html>`, 'text/html')

/** a unit as the tags wire it was read from (its edges aside): what a test of the page reads a request by */
const wireOf = (u: UnitIn) => wireOfContent(asOut(u.content), { unit: u, wireAt: [], lead: '', trail: '', format: 'tags' }).wire
const segmentsOf = (req: TranslateCall) => req.units.map(u => ({ id: u.id, text: wireOf(u) }))
/** the chain's result for a unit: a reply's tags wire read back as content, by `engine` */
const resultOf = (id: string, wire: string, engine = 'mock', kind: 'mt' | 'llm' = 'mt'): UnitResult => ({ id, ok: true, content: asOut(unitOfWire(id, wire, 'tags').unit.content), by: `${engine}:0`, engine, kind })
const WHY: Partial<Record<ProviderErrorKind, Why>> = { 'invalid-response': { kind: 'refused' }, 'no-key': { kind: 'unconfigured', code: 'no-key' }, auth: { kind: 'unconfigured', code: 'key-refused' }, aborted: { kind: 'aborted' } }
const failureOf = (id: string, kind: ProviderErrorKind, message: string = kind, status?: number): UnitResult => ({ id, ok: false, why: WHY[kind] ?? { kind: 'unavailable' }, error: { kind, message, ...(status !== undefined ? { status } : {}) } })

/** An identity transport, as the background's chain answers each unit: as it was sent; mutate can give some a reply or a failure */
function makeTransport(mutate?: (req: TranslateCall, seg: { id: string; text: string }, calls: number) => string | { error: string }) {
  const requests: TranslateCall[] = []
  const transport: Transport = async req => {
    requests.push(req)
    const results = segmentsOf(req).map(seg => {
      const out = mutate?.(req, seg, requests.length)
      if (out && typeof out === 'object') return failureOf(seg.id, out.error as ProviderErrorKind)
      return resultOf(seg.id, typeof out === 'string' ? out : seg.text)
    })
    return { ok: true, results, cached: 1 }
  }
  return { transport, requests }
}
const echoing = (req: TranslateCall, engine = 'mock', kind: 'mt' | 'llm' = 'mt') => ({ ok: true as const, results: segmentsOf(req).map(s => resultOf(s.id, s.text, engine, kind)), cached: 0 })

/** Start a session; happy-dom has no IntersectionObserver, so blocks are handed over by translate by hand */
async function start(doc: Document, blocks: Block[], transport: Transport, extra: Partial<Parameters<typeof startTranslation>[0]> = {}) {
  const run = startTranslation({
    doc, blocks, target: 'zh-CN', mode: 'stack', paper: 'test', transport, preload: DEFAULT_PRELOAD,
    capabilities: { maxBatchChars: 100_000, maxBatchItems: 100, renderPath: 'tags' }, ...extra,
  })
  return run
}
const byId = (blocks: Block[], id: string) => blocks.find(b => b.id === id)!

describe('startTranslation', () => {
  it('reports the serving service on the first batch and on every hand-over, never twice in a row', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    let calls = 0
    const transport: Transport = async req => {
      calls++
      return echoing(req, calls <= 1 ? 'llm' : 'free', calls <= 1 ? 'llm' : 'mt')
    }
    const seen: string[] = []
    const run = await start(doc, blocks, transport, { onProvider: id => seen.push(id) })
    await run.translate(blocks.slice(0, 1))
    await run.translate(blocks.slice(1, 2))
    await run.translate(blocks.slice(2, 3))
    expect(seen).toEqual(['llm', 'free'])
  })

  it('starting only marks and sends no request; blocks handed over are batched and translated, the progress and cache counts right', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    const { transport, requests } = makeTransport()
    const run = await start(doc, blocks, transport)
    expect(requests).toHaveLength(0)
    expect(doc.querySelectorAll(`[${STATE_ATTR}="pending"]`)).toHaveLength(blocks.length)
    expect(run.progress()).toEqual({ state: 'on', total: 6, requested: 0, done: 0, failed: 0, cached: 0, inFlight: 0 })
    await run.translate(blocks)
    expect(run.progress()).toEqual({ state: 'on', total: 6, requested: 6, done: 6, failed: 0, cached: 3, inFlight: 0 })
    expect(doc.querySelectorAll(`.${T_CLASS}`)).toHaveLength(6)
    expect(doc.querySelectorAll(`.${PENDING_CLASS}`)).toHaveLength(0)
    // One text batch per section + one table batch
    expect(requests).toHaveLength(3)
    expect(doc.querySelector(`.${T_CLASS}[${FOR_ATTR}="p1"]`)?.querySelector('math')).not.toBeNull()
    expect(doc.querySelector(`.${T_CLASS}[${FOR_ATTR}="T1"]`)?.querySelector(TABLE_RULES.cell)?.textContent).toBe('Model')
    expect(doc.documentElement.hasAttribute('data-axt-on')).toBe(true)
  })

  it('only blocks handed over are translated; section headings come from the table computed for the whole paper at the start, headings outside this batch count too (§10)', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    const { transport, requests } = makeTransport()
    const run = await start(doc, blocks, transport)
    await run.translate([byId(blocks, 'p3')])
    expect(requests).toHaveLength(1)
    expect(segmentsOf(requests[0]!).map(s => s.id)).toEqual(['p3'])
    expect(requests[0]!.context?.sectionTitle).toBe('Method')
    expect(doc.getElementById('s2')?.getAttribute(STATE_ATTR)).toBe('pending')
    expect(run.progress()).toMatchObject({ requested: 1, done: 1 })
    // The same block handed over again: skipped while in flight, translated again as a retry once done
    await run.translate([byId(blocks, 'p3')])
    expect(requests).toHaveLength(2)
  })

  it('during the request the original block is followed by a pending node with a skeleton, counted inFlight in the progress; replaced when the translation arrives', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const transport: Transport = async req => {
      await gate
      return echoing(req)
    }
    const seen: Progress[] = []
    const run = await start(doc, blocks, transport, { onProgress: p => seen.push(p) })
    const pending = run.translate([byId(blocks, 'p1')])
    const node = doc.getElementById('p1')!.nextElementSibling!
    expect(node.classList.contains(PENDING_CLASS)).toBe(true)
    expect(node.querySelector('.axt-skel')).not.toBeNull()
    expect(run.progress()).toMatchObject({ requested: 1, inFlight: 1, done: 0 })
    expect(seen.at(-1)).toMatchObject({ inFlight: 1 })
    release()
    await pending
    expect(doc.getElementById('p1')!.nextElementSibling!.classList.contains(PENDING_CLASS)).toBe(false)
    expect(doc.querySelectorAll('.axt-skel')).toHaveLength(0)
    expect(seen.at(-1)).toMatchObject({ inFlight: 0, done: 1 })
  })

  it('the page replaced a formula while the request was out: the block fails as `stale`, nothing is inserted, no resend; a retry serialises it afresh and succeeds', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    let swapped = false
    const { transport, requests } = makeTransport((_req, seg) => {
      if (seg.id === 'p1' && !swapped) {
        swapped = true
        // While the translation is out, the page swaps x for y
        const fresh = doc.createElement('math')
        fresh.className = 'ltx_Math'
        fresh.innerHTML = '<mi>y</mi>'
        doc.querySelector('#p1 math')!.replaceWith(fresh)
      }
      return undefined as unknown as string
    })
    const run = await start(doc, blocks, transport)
    await run.translate([byId(blocks, 'p1')])
    expect(doc.getElementById('p1')?.getAttribute(STATE_ATTR)).toBe('failed')
    expect(run.progress()).toMatchObject({ done: 0, failed: 1 })
    // No translation carrying the stale copy; the widget names the cause, and `parseFatal` reads it as unknown, not as the engine's fault
    expect(doc.querySelector(`.${T_CLASS}[${FOR_ATTR}="p1"]:not(.${ERROR_CLASS})`)).toBeNull()
    expect(doc.querySelector(`.${ERROR_CLASS}`)?.getAttribute('data-axt-reason')).toBe('stale: slot 1 <math> is not the node it was')
    // Resending the same wire text would only fail the same way: one request carried p1
    expect(requests.filter(r => r.units.some(u => u.id === 'p1'))).toHaveLength(1)
    // The Retry path serialises the block afresh: the translation shows what the page shows now
    await run.translate(run.failed())
    expect(run.progress()).toMatchObject({ done: 1, failed: 0 })
    expect(doc.querySelector(`.${T_CLASS}[${FOR_ATTR}="p1"]`)?.querySelector('mi')?.textContent).toBe('y')
  })

  it('the reason the page carries is the kind, the status and the length of the message — an endpoint\'s words never reach the page (issue #237)', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    const transport: Transport = async req => ({ ok: true, results: req.units.map(u => failureOf(u.id, 'auth', 'Unauthorized: key=sk-live-0123456789 echoed; the Fourier transform of f', 401)), cached: 0 })
    const run = await start(doc, blocks, transport)
    await run.translate(blocks.slice(1, 2))
    const reason = doc.querySelector(`.${ERROR_CLASS}`)!.getAttribute('data-axt-reason')!
    expect(reason).toBe('auth: HTTP 401, message withheld (71 chars)')
    expect(reason).not.toMatch(/sk-live|Fourier/)
    expect(doc.querySelector(`.${ERROR_CLASS}`)!.getAttribute('title')).toBe(reasonText('auth'))
  })

  it('a unit that failed beside units that came back: the others are rendered, only it counts as failed', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    const { transport } = makeTransport((_req, seg) => (seg.id === 'p1' ? { error: 'timeout' } : undefined as unknown as string))
    const run = await start(doc, blocks, transport)
    await run.translate(blocks)
    expect(doc.getElementById('p1')?.getAttribute(STATE_ATTR)).toBe('failed')
    const others = ['p2', 'p3'].map(id => doc.querySelector(`.${T_CLASS}[${FOR_ATTR}="${id}"]`))
    expect(others.map(el => el !== null && !el.classList.contains(ERROR_CLASS))).toEqual([true, true])
    expect(run.progress().failed).toBe(1)
    expect(doc.querySelectorAll(`.${PENDING_CLASS}`)).toHaveLength(0)
  })

  it('the Retry button on the widget takes the same retry path', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    let fail = true
    const { transport } = makeTransport((_req, seg) => (fail && seg.id === 'p1' ? { error: 'network' } : undefined as unknown as string))
    const run = await start(doc, blocks, transport)
    await run.translate([byId(blocks, 'p1')])
    const widget = doc.querySelector(`.${ERROR_CLASS}[${FOR_ATTR}="p1"]`)!
    fail = false
    const button = widget.shadowRoot!.querySelector('button')!
    // A page script's click retries nothing (DESIGN §4.0c): the reader's own does
    button.click()
    expect(run.progress()).toMatchObject({ failed: 1 })
    button.dispatchEvent(Object.defineProperty(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }), 'isTrusted', { value: true }))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(run.progress()).toMatchObject({ failed: 0, done: 1 })
    expect(doc.querySelector(`.${ERROR_CLASS}`)).toBeNull()
  })

  it('no-key: after a fatal error the session stops and sends no new batch', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    const { transport, requests } = makeTransport(() => ({ error: 'no-key' }))
    const run = await start(doc, blocks, transport)
    await run.translate([byId(blocks, 'p1')])
    expect(requests).toHaveLength(1)
    expect(run.progress()).toMatchObject({ state: 'stopped', failed: 1 })
    expect(run.progress().fatal).toContain('no-key')
    await run.translate([byId(blocks, 'p3')])
    expect(requests).toHaveLength(1)
    expect(doc.querySelectorAll(`.${PENDING_CLASS}`)).toHaveLength(0)
  })

  it('stop: pending removed, translations arriving afterwards not rendered, progress no longer reported', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const transport: Transport = async req => {
      await gate
      return echoing(req)
    }
    const seen: Progress[] = []
    const run = await start(doc, blocks, transport, { onProgress: p => seen.push(p) })
    const pending = run.translate([byId(blocks, 'p1')])
    expect(doc.querySelectorAll(`.${PENDING_CLASS}`)).toHaveLength(1)
    const reportsBefore = seen.length
    run.stop()
    expect(doc.querySelectorAll(`.${PENDING_CLASS}`)).toHaveLength(0)
    expect(run.progress().state).toBe('stopped')
    release()
    await pending
    expect(doc.querySelectorAll(`.${T_CLASS}`)).toHaveLength(0)
    expect(seen).toHaveLength(reportsBefore)
    await run.translate([byId(blocks, 'p2')])
    expect(doc.querySelectorAll(`.${PENDING_CLASS}`)).toHaveLength(0)
  })

  it('the cancel scope is passed to every call; absent when not given', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    const { transport, requests } = makeTransport()
    const run = await start(doc, blocks, transport, { scope: 'run-1' })
    await run.translate(blocks)
    expect(requests.length).toBeGreaterThan(0)
    for (const r of requests) expect(r.scope).toBe('run-1')
    const bare = makeTransport()
    const doc2 = docOf()
    const blocks2 = extract(doc2)
    await (await start(doc2, blocks2, bare.transport)).translate(blocks2)
    for (const r of bare.requests) expect(r.scope).toBeUndefined()
  })

  it('the paper-level context (title, abstract) goes with every batch, merged with the batch\'s section heading', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    const { transport, requests } = makeTransport()
    await (await start(doc, blocks, transport, { context: { paperTitle: 'P', abstract: 'A' } })).translate(blocks)
    expect(requests.length).toBeGreaterThan(0)
    for (const r of requests) {
      expect(r.context?.paperTitle).toBe('P')
      expect(r.context?.abstract).toBe('A')
    }
    expect(requests.map(r => r.context?.sectionTitle)).toContain('Introduction')
  })

  it('a table half translated: the cells translated show as usual, the source table stays translated plus a partial mark, counted failed', async () => {
    const doc = docOf('<table class="ltx_tabular" id="T2"><tbody><tr><td class="ltx_td">Alpha</td><td class="ltx_td">Beta</td></tr></tbody></table>')
    const blocks = extract(doc)
    const { transport } = makeTransport((_req, seg) => (seg.id === 'T2#c1' ? { error: 'unknown' } : undefined as unknown as string))
    const run = await start(doc, blocks, transport)
    await run.translate(blocks)
    expect(run.progress()).toMatchObject({ done: 0, failed: 1 })
    const original = doc.getElementById('T2')!
    expect(original.getAttribute(STATE_ATTR)).toBe('translated')
    expect(original.hasAttribute(PARTIAL_ATTR)).toBe(true)
    const clone = doc.querySelector(`.${T_CLASS}[${FOR_ATTR}="T2"]`)
    expect(Array.from(clone?.querySelectorAll(TABLE_RULES.cell) ?? []).map(td => td.textContent)).toEqual(['Alpha', 'Beta'])
    await (await start(doc, blocks, makeTransport().transport)).translate(blocks)
    expect(original.hasAttribute(PARTIAL_ATTR)).toBe(false)
  })

  it('a short heading failing on retranslation: the inline mark is removed with the translation; added back on success', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    await (await start(doc, blocks, makeTransport().transport)).translate(blocks)
    const title = doc.getElementById('s1')!
    expect(title.hasAttribute(INLINE_ATTR)).toBe(true)
    const { transport } = makeTransport((_req, seg) => (seg.id === 's1' ? { error: 'unknown' } : undefined as unknown as string))
    await (await start(doc, blocks, transport)).translate(blocks)
    expect(title.getAttribute(STATE_ATTR)).toBe('failed')
    expect(title.hasAttribute(INLINE_ATTR)).toBe(false)
    // Beside it only the failure widget remains, no translation
    expect(doc.querySelector(`.${T_CLASS}[${FOR_ATTR}="s1"]`)?.classList.contains(ERROR_CLASS)).toBe(true)
    await (await start(doc, blocks, makeTransport().transport)).translate(blocks)
    expect(title.hasAttribute(INLINE_ATTR)).toBe(true)
  })

  it('a block failing on retranslation has to delete the previous round\'s translation, not leave the old one posing as this round\'s', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    await (await start(doc, blocks, makeTransport().transport)).translate(blocks)
    expect(doc.querySelector(`.${T_CLASS}[${FOR_ATTR}="p1"]`)).not.toBeNull()
    const { transport } = makeTransport((_req, seg) => (seg.id === 'p1' ? { error: 'unknown' } : undefined as unknown as string))
    const run = await start(doc, blocks, transport)
    await run.translate(blocks)
    expect(run.progress().failed).toBe(1)
    expect(doc.getElementById('p1')?.getAttribute(STATE_ATTR)).toBe('failed')
    const sibling = doc.querySelector(`.${T_CLASS}[${FOR_ATTR}="p1"]`)!
    expect(sibling.classList.contains(ERROR_CLASS)).toBe(true)
    expect(sibling.querySelector('math')).toBeNull()
    expect(doc.querySelectorAll(`.${T_CLASS}[${FOR_ATTR}="p3"]`)).toHaveLength(1)
  })

  it('a restart under translation only shows no original: a block whose translation from the round before is still there keeps its original hidden until it is asked again (DESIGN §8.5)', async () => {
    // The rules of modes.css that hide a node under only, as the page's sheet has them
    const onlyHides = rules(sheet('../../src/styles/modes.css'))
      .filter(r => r.within.length === 0 && r.selector.includes('[data-axt-mode="only"]') && declarations(r.body).display === 'none')
      .flatMap(r => r.selector.split(',').map(sel => sel.trim()))
    expect(onlyHides.length).toBeGreaterThan(0)
    const shown = (el: Element) => !onlyHides.some(sel => el.matches(sel))
    const doc = docOf()
    const blocks = extract(doc)
    const first = await start(doc, blocks, makeTransport().transport, { mode: 'only' })
    await first.translate(blocks)
    expect(blocks.filter(b => shown(b.el))).toEqual([])
    first.stop()
    // The restart (another service, another language): a new run over the page as it is, nothing asked yet — the
    // viewport hands the blocks over as the reader reaches them, and each one's old translation goes as it is asked
    await start(doc, blocks, makeTransport().transport, { mode: 'only' })
    expect(doc.querySelectorAll(`.${T_CLASS}`)).toHaveLength(blocks.length)
    expect(blocks.filter(b => shown(b.el)).map(b => b.id)).toEqual([])
  })
})

describe('the gate: a block refused is not asked for, and is offered again when the gate may have opened (§15.6)', () => {
  const FIGURE = '<p class="ltx_p" id="p1">Body text.</p>'
    + '<figure class="ltx_figure"><svg class="ltx_picture"><foreignObject><span class="ltx_foreignobject_container"><span class="ltx_foreignobject_content" id="label">Shared Expert</span></span></foreignObject></svg></figure>'

  it('a figure\'s label is a block like any other: its translation is its next sibling inside the node, the formula beside the words kept', async () => {
    const doc = docOf(FIGURE.replace('Shared Expert', 'Block <math class="ltx_Math"><mi>n</mi></math>'))
    const blocks = extract(doc)
    const { transport } = makeTransport((_req, seg) => seg.text.replace('Block', 'Bloc'))
    const run = await start(doc, blocks, transport)
    await run.translate(blocks)
    const label = doc.getElementById('label')!
    const translation = label.nextElementSibling!
    expect(translation.classList.contains(T_CLASS)).toBe(true)
    expect(translation.classList.contains('ltx_foreignobject_content')).toBe(true)
    expect(translation.parentElement).toBe(label.parentElement)
    expect(translation.textContent).toContain('Bloc')
    expect(translation.querySelector('math')).not.toBeNull()
    // The original is what it was (§7.1): a mark, and nothing else
    expect(label.textContent).toBe('Block n')
  })

  it('refused, the label is neither requested nor rendered while the text beside it is; resume() asks for it once the gate is open, and only for it', async () => {
    const doc = docOf(FIGURE)
    const blocks = extract(doc)
    const { transport, requests } = makeTransport()
    let figures = false
    const run = await start(doc, blocks, transport, { admit: block => block.id !== 'label' || figures })
    await run.translate(blocks)
    expect(requests.flatMap(r => r.units.map(u => u.id))).toEqual(['p1'])
    expect(doc.getElementById('label')!.nextElementSibling).toBeNull()
    expect(run.progress()).toMatchObject({ total: 2, requested: 1, done: 1 })

    // The gate still shut: resume asks for nothing
    run.resume()
    await Promise.resolve()
    expect(requests).toHaveLength(1)

    figures = true
    run.resume()
    await vi.waitFor(() => expect(run.progress()).toMatchObject({ requested: 2, done: 2 }))
    expect(requests.flatMap(r => r.units.map(u => u.id))).toEqual(['p1', 'label'])
    expect(doc.getElementById('label')!.nextElementSibling?.classList.contains(T_CLASS)).toBe(true)

    // Nothing is held any more: a second resume asks for nothing
    run.resume()
    await Promise.resolve()
    expect(requests).toHaveLength(2)
  })
})

describe('onRendered: hands over the blocks whose DOM just changed, for each batch (issue #46)', () => {
  it('twice per batch: once after the skeletons are inserted, once after the results are rendered, both with this batch\'s blocks', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    const { transport } = makeTransport()
    const seen: Block[][] = []
    const run = await start(doc, blocks, transport, { onRendered: b => seen.push(b) })
    expect(seen).toEqual([]) // the marking phase does not count as “rendering”
    const p1 = byId(blocks, blocks[1]!.id)
    await run.translate([p1])
    expect(seen).toHaveLength(2)
    expect(seen[0]).toEqual([p1])
    expect(seen[1]).toEqual([p1])
  })

  it('after stop() nothing more is handed over', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const transport: Transport = async req => {
      await gate
      return echoing(req)
    }
    const seen: Block[][] = []
    const run = await start(doc, blocks, transport, { onRendered: b => seen.push(b) })
    const pending = run.translate([blocks[1]!])
    expect(seen).toHaveLength(1) // the skeleton one was already issued
    run.stop()
    release()
    await pending
    expect(seen).toHaveLength(1) // the result one did not come
  })

  it('the retry path hands over too', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    let calls = 0
    const { transport } = makeTransport((_, seg) => (++calls === 1 ? { error: 'network' } : seg.text))
    const seen: Block[][] = []
    const run = await start(doc, blocks, transport, { onRendered: b => seen.push(b) })
    const p1 = blocks[1]!
    await run.translate([p1])
    expect(run.progress().failed).toBe(1)
    expect(seen).toHaveLength(2)
    await run.translate([p1]) // a failed block can be handed over again
    expect(seen).toHaveLength(4)
    expect(seen[3]).toEqual([p1])
  })
})

// The start reads, then writes (DESIGN §10): asked after `enable` has restyled the paper, where a block is costs the
// whole paper's style recalculation and layout in the middle of the script — 190 ms on 2312.17141 — and once more for
// the frame after the states and the first skeletons were written behind it
describe('the start of a run reads the layout before it writes to the page', () => {
  const box = (top: number): DOMRect => ({ top, bottom: top + 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: top, toJSON: () => ({}) })

  it('every geometry read comes before the page is enabled, and none after', () => {
    const doc = docOf()
    const blocks = extract(doc)
    const asked: boolean[] = []
    for (const [i, block] of blocks.entries()) {
      block.el.getBoundingClientRect = () => {
        asked.push(doc.documentElement.hasAttribute(ON_ATTR))
        return box(100 + i * 5000)
      }
    }
    const { transport } = makeTransport()
    startTranslation({ doc, blocks, target: 'zh-CN', mode: 'side', paper: 'test', transport, preload: DEFAULT_PRELOAD, capabilities: { maxBatchChars: 100_000, maxBatchItems: 100, renderPath: 'tags' } })
    expect(asked.length).toBeGreaterThanOrEqual(blocks.length)
    expect(asked).not.toContain(true)
  })

  it('when it returns the states are all written and the first screen has its skeleton and its request — nothing of the start is left for later', async () => {
    const doc = docOf()
    const blocks = extract(doc)
    // The heading alone is on the reader's screen; everything else is far below any preload distance
    for (const [i, block] of blocks.entries()) block.el.getBoundingClientRect = () => box(i === 0 ? 100 : 50_000 + i * 100)
    vi.stubGlobal('innerHeight', 800)
    const { transport, requests } = makeTransport()
    startTranslation({ doc, blocks, target: 'zh-CN', mode: 'stack', paper: 'test', transport, preload: DEFAULT_PRELOAD, capabilities: { maxBatchChars: 100_000, maxBatchItems: 100, renderPath: 'tags' } })
    expect(blocks.every(b => b.el.hasAttribute(STATE_ATTR))).toBe(true)
    expect(doc.querySelectorAll(`.${PENDING_CLASS}`)).toHaveLength(1)
    expect(doc.querySelector(`.${PENDING_CLASS}`)?.getAttribute(FOR_ATTR)).toBe('s1')
    expect(requests).toHaveLength(1)
    expect(requests[0]!.units.map(u => u.id)).toEqual(['s1'])
    vi.unstubAllGlobals()
  })
})
