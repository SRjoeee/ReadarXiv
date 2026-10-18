// The contents on the layer (engine/view/contents.mjs; the shared reader view's contract §2.6, rows C1-C5 of its PR VC), over the
// format test's small paper (helpers/format-paper.ts): unit 0 its title, unit 6 its one heading of the contents, located on
// page 4 by the third part. The layer side's events (the outline told, the heading read on a scroll) are layer-side.test.ts's
import { describe, expect, it } from 'vitest'
import type { Row } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { createContents } from '@/pdf-reader/engine/view/contents.mjs'
import { made } from './helpers/format-paper'

const row = (id: number, text: string): Row => [id, [text], 'whole', 'test', null]
const outlineDoc = (items: unknown[], pageIndex = 2) => ({ getOutline: async () => items, getDestination: async () => [{ num: 9, gen: 0 }], getPageIndex: async () => pageIndex })

describe('C1-C4: the contents from the index, the parts, the outline and the rows', () => {
  it('C1: lists the index\'s headings at once, the title left out, none located', async () => {
    const M = await made()
    const c = createContents(M.index)
    expect(c.entries()).toEqual([{ id: 6, title: 'Intro', original: 'Intro', level: 1, page: null }])
  })

  it('C2: gives a heading the page of its first rectangle once a part locates it', async () => {
    const M = await made()
    const c = createContents(M.index)
    expect(c.addParts(M.readParts.slice(0, 2))).toBe(false)
    expect(c.entries()[0]?.page).toBeNull()
    expect(c.addParts([M.readParts[2]!])).toBe(true)
    expect(c.entries()[0]?.page).toBe(4)
    expect(c.firstRect(6)).toEqual({ page: 4, x0: 72, y0: 700, x1: 300, y1: 712 })
    expect(c.pageOf(6)).toBe(4)
    // (a part told again moves nothing)
    expect(c.addParts([M.readParts[2]!])).toBe(false)
  })

  it('C3: gives a heading not located the page of the outline\'s entry of its title, matched in order; a located one keeps its own', async () => {
    const M = await made()
    const c = createContents(M.index)
    expect(await c.outline(outlineDoc([{ title: 'Abstract', dest: 'a', items: [] }, { title: '1  Intro', dest: 'b', items: [] }]))).toBe(true)
    expect(c.entries()[0]?.page).toBe(3)
    expect(c.pageOf(6)).toBe(3)
    c.addParts(M.readParts)
    expect(c.entries()[0]?.page).toBe(4)
    // (an outline with no such title gives none)
    const d = createContents(M.index)
    expect(await d.outline(outlineDoc([{ title: 'Introduction and more', dest: 'b', items: [] }]))).toBe(false)
    expect(d.entries()[0]?.page).toBeNull()
  })

  it('C4: titles a heading by its row once taken, by its source before and where the row has no translation', async () => {
    const M = await made()
    const c = createContents(M.index)
    expect(c.take([row(2, 'not a heading')])).toBe(false)
    expect(c.take([row(6, 'Einleitung')])).toBe(true)
    expect(c.entries()[0]).toMatchObject({ title: 'Einleitung', original: 'Intro' })
    expect(c.take([[6, [], 'none', null, null]])).toBe(true)
    expect(c.entries()[0]?.title).toBe('Intro')
  })
})

describe('C5: the heading read', () => {
  it('is the last heading at or above the point; none before the first', async () => {
    const M = await made()
    const c = createContents(M.index)
    expect(c.headingAt(4, 600)).toBeNull()
    c.addParts(M.readParts)
    expect(c.headingAt(3, 100)).toBeNull()
    expect(c.headingAt(4, 720)).toBeNull()
    expect(c.headingAt(4, 712)).toBe(6)
    expect(c.headingAt(4, 100)).toBe(6)
    // (a heading the outline alone places is read from the top of its page)
    const d = createContents(M.index)
    await d.outline(outlineDoc([{ title: 'Intro', dest: 'b', items: [] }]))
    expect(d.headingAt(2, 10)).toBeNull()
    expect(d.headingAt(3, 790)).toBe(6)
  })
})
