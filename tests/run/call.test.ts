import { describe, expect, it } from 'vitest'
import { cacheKeyFor } from '@/cache/key'
import { translateCall } from '@/core/run/call'

// The one envelope a session's requests go out in (DESIGN §8.0): the text run's batches, the image labels, the title

const BASE = { target: 'cmn', paper: '2410.00260', scope: 's1', context: { paperTitle: 'A Paper', abstract: 'About things.' } }
const SEGMENTS = [{ id: 'b1', text: 'Hello.' }]

describe('translateCall', () => {
  it('carries the session\'s target, paper and scope, and the render path of this call', () => {
    expect(translateCall(BASE, SEGMENTS, 'tags')).toEqual({
      request: { segments: SEGMENTS, source: 'en', target: 'cmn', context: BASE.context },
      cache: { paper: '2410.00260', renderPath: 'tags' },
      scope: 's1',
    })
    // A block resent as runs is cached apart from its tagged self (§6.3): the path is the call's, not the session's
    expect(translateCall(BASE, SEGMENTS, 'runs').cache).toEqual({ paper: '2410.00260', renderPath: 'runs' })
  })

  it('reads the segments under their heading — for an image, its caption — on top of the paper\'s context', () => {
    const call = translateCall(BASE, SEGMENTS, 'tags', { sectionTitle: '3 Method' })
    expect(call.request.context).toEqual({ ...BASE.context, sectionTitle: '3 Method' })
    // The session's context is not written to
    expect(BASE.context).toEqual({ paperTitle: 'A Paper', abstract: 'About things.' })
  })

  it('leaves an empty context out, whichever way it is empty', () => {
    expect(translateCall({ target: 'cmn', paper: 'p' }, SEGMENTS, 'tags').request.context).toBeUndefined()
    expect(translateCall({ target: 'cmn', paper: 'p', context: {} }, SEGMENTS, 'tags').request.context).toBeUndefined()
    // A heading alone is a context
    expect(translateCall({ target: 'cmn', paper: 'p', context: {} }, SEGMENTS, 'tags', { sectionTitle: 'Figure 1' }).request.context).toEqual({ sectionTitle: 'Figure 1' })
  })

  it('why it matters: to the cache key an absent context and an empty one are two contexts', async () => {
    const identity = { providerId: 'svc-1', model: 'm', promptKey: 'default', target: 'cmn', renderPath: 'tags' as const, text: 'Hello.' }
    const absent = await cacheKeyFor(identity)
    const empty = await cacheKeyFor({ ...identity, context: {} })
    expect(empty).not.toBe(absent)
  })

  it('asks the cache to be bypassed only when told to, and names no scope where there is none', () => {
    expect(translateCall(BASE, SEGMENTS, 'tags', { bypassCache: true }).cache).toEqual({ paper: '2410.00260', renderPath: 'tags', bypass: true })
    expect(translateCall(BASE, SEGMENTS, 'tags').cache).not.toHaveProperty('bypass')
    expect(translateCall({ target: 'cmn', paper: 'p' }, SEGMENTS, 'tags')).not.toHaveProperty('scope')
  })
})
