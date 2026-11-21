// Regression tests at the session boundary (issue #45). The originals were three diagnostic probes “asserting the defect exists”, rewritten here as expected behaviour.
import { describe, expect, it } from 'vitest'
import { extract } from '@/core/extractor'
import { startTranslation } from '@/core/pipeline'
import { restore } from '@/core/renderer/page'
import { preloadOf } from '@/core/scheduler/lazy'
import { answering } from '../helpers/units'

const docWith = (html: string) => new DOMParser().parseFromString(
  `<!doctype html><html><body><article class="ltx_document">${html}</article></body></html>`,
  'text/html',
)

const paragraphs = (n: number) => Array.from({ length: n }, (_, i) => `<p class="ltx_p">Sentence ${i}.</p>`).join('')

describe('restoring the original during start-up (issue #45, experiment 1)', () => {
  it('the start writes its marks in one synchronous go and nothing after it: once restore has cleaned up, no orphan data-axt-* may remain', async () => {
    const doc = docWith(paragraphs(40))
    const before = doc.documentElement.outerHTML
    const blocks = extract(doc)
    expect(blocks.length).toBeGreaterThan(1)

    const run = startTranslation({
      doc,
      blocks,
      target: 'cmn',
      mode: 'stack',
      paper: '0000.00000',
      capabilities: { maxBatchChars: 1000, maxBatchItems: 4, renderPath: 'tags' },
      preload: preloadOf('on-demand'),
      transport: async () => ({ ok: false, error: { kind: 'aborted', message: 'no request should be sent' } }),
    })
    // The reader restores at once. The marking used to be sliced, and a slice after the restore wrote its marks onto
    // the cleaned page; now nothing of the start is left to run later — waited for here, to be sure
    run.stop()
    restore(doc)
    await new Promise(resolve => setTimeout(resolve))

    expect(doc.querySelectorAll('[data-axt-id]')).toHaveLength(0)
    expect(doc.querySelectorAll('[data-axt-state]')).toHaveLength(0)
    // The DOM returns to the initial one node for node (§7.1)
    expect(doc.documentElement.outerHTML).toBe(before)
  })
})

describe('cancellation crosses the message boundary (issue #42)', () => {
  it('restoring the original: cancel goes to the background with the session scope, and a late successful translation no longer lands in the DOM', async () => {
    const { createMessageTransport } = await import('@/shared/transport')
    const doc = docWith(paragraphs(3))
    const before = doc.documentElement.outerHTML
    const blocks = extract(doc)

    const sent: { type: string }[] = []
    let release: (() => void) | null = null
    const held = new Promise<void>(resolve => { release = resolve })
    // The background stand-in: the translation request hangs, the cancel request answers at once
    const send = (async (message: { type: string } & Parameters<typeof answering>[0]) => {
      sent.push(message)
      if (message.type === 'axt:cancel-scope') return { cancelled: 2 }
      await held
      return answering(message, t => `译:${t}`)
    }) as never
    const transport = createMessageTransport(send)

    const run = startTranslation({
      doc,
      blocks,
      target: 'cmn',
      mode: 'stack',
      paper: '0000.00000',
      capabilities: { maxBatchChars: 1000, maxBatchItems: 10, renderPath: 'tags' },
      preload: preloadOf('on-demand'),
      scope: 'session-1',
      transport: call => transport.translate(call),
    })
    const pending = run.translate(blocks)
    // The request has gone out and still hangs at the background's end
    await Promise.resolve()
    expect(sent.map(m => m.type)).toEqual(['axt:translate'])

    // The reader clicks “Show original”: content stops the session, sends the cancel, clears the DOM
    run.stop()
    expect(await transport.cancel('session-1')).toBe(2)
    restore(doc)

    // The request that could not be withdrawn comes back only now
    release!()
    await pending

    expect(sent.map(m => m.type)).toEqual(['axt:translate', 'axt:cancel-scope'])
    expect(doc.querySelectorAll('[data-axt-id]')).toHaveLength(0)
    expect(doc.querySelectorAll('.axt-t')).toHaveLength(0)
    expect(doc.documentElement.outerHTML).toBe(before)
  })
})
