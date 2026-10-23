// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { markedSample, pixelsApart, renderPage, wrapped } from './helpers/ocg-pdfs'

// Our final pass wrapped by optional content (layout/wrap.mjs, layout/own.mjs; design docs/route/ocg-erasure.md §2, §3, §7):
// sample-1's pages with points written in, wrapped, proved, and rendered by PDF.js in Node

describe('wrapFinal on sample-1 marked by its shows', () => {
  it('wraps every page, and with every group ON renders our page exactly (G1)', async () => {
    const { bytes, units } = await markedSample()
    const r = await wrapped(bytes)
    if ('refused' in r) throw new Error(`${r.refused}: ${r.why}`)
    expect(r.stats.wrapped).toBe(4)
    expect(r.stats.refusedPages).toBe(0)
    expect(r.stats.groups).toBe(units)
    expect(r.unhidden).toEqual([])
    for (const p of [1, 2]) expect(pixelsApart(await renderPage(bytes, p), await renderPage(r.bytes, p))).toBe(0)
  })
  it('hides a unit\'s ink with its group OFF, and nothing else of the page (G2, against the page without it)', async () => {
    const { bytes } = await markedSample({ pages: [2] })
    const r = await wrapped(bytes)
    if ('refused' in r) throw new Error(r.why)
    const all = await renderPage(r.bytes, 2), none = await renderPage(r.bytes, 2, { off: n => /^axt:u\d+$/.test(n) })
    expect(pixelsApart(all, none)).toBeGreaterThan(10_000)
    const one = await renderPage(r.bytes, 2, { off: n => n === 'axt:u0' }), rest = await renderPage(r.bytes, 2, { off: n => /^axt:u\d+$/.test(n) && n !== 'axt:u0' })
    // (u0's ink is what one-OFF loses, and all-but-u0 OFF keeps: the two changes add up to all-OFF's)
    expect(pixelsApart(all, one) + pixelsApart(all, rest)).toBe(pixelsApart(all, none))
  })
  it('gives the same bytes for the same inputs (T2.3)', async () => {
    const { bytes } = await markedSample({ pages: [3] })
    const a = await wrapped(bytes), b = await wrapped(bytes)
    if ('refused' in a || 'refused' in b) throw new Error('refused')
    expect(a.sha256).toBe(b.sha256)
  })
})
