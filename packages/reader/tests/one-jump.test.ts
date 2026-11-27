// One jump for every jump (session/one-jump.ts; PDF-READER §11.9 "Followed"): a link from each of the three link sources (a
// laid link on the right, PDF.js's links on the left and on a right page not laid), Enter on a link, a page typed in the pill and
// a contents entry each push one entry, land, and leave a way back; the pill's arrows, a link out of the paper and a destination
// that resolves to nothing do none of it. Over the panes and the highlight stood in for (they record what they are asked) and a
// host's history over an array.
import { describe, expect, it } from 'vitest'
import { linkLayer } from '../src/compose/links.ts'
import type { Page } from '../src/compose/page.ts'
import { routeInPaper } from '../src/panes/panes.ts'
import { createJumps, type Entry, type HostHistory, type Light, type Place } from '../src/session/jumps.ts'
import { createOneJump, type JumpLights, type JumpPanes, ROOM_NARROW, ROOM_WIDE } from '../src/session/one-jump.ts'

function fakeHistory() {
  const entries: (Entry | null)[] = [null]
  let at = 0
  const listeners = new Set<(e: Entry | null) => void>()
  const go = (d: number) => {
    if (at + d < 0 || at + d >= entries.length) return
    at += d
    for (const f of [...listeners]) f(entries[at] ?? null)
  }
  const h: HostHistory & { entries: (Entry | null)[]; forward(): void; readonly at: number } = {
    entries,
    get at() {
      return at
    },
    mark(e) {
      entries[at] = e
    },
    push(e) {
      entries.length = at + 1
      entries.push(e)
      at++
    },
    back: () => go(-1),
    forward: () => go(1),
    listen(f) {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    current: () => entries[at] ?? null,
  }
  return h
}

/** the panes stood in for: a reading place that a move changes, what each move was asked */
function standIn(o: { pages?: Record<string, number> } = {}) {
  const asked: { name: string; args: unknown[] }[] = []
  let here: Place = { page: 1, at: 0.25, side: 'right' }
  const pages = o.pages ?? { 'cite.a': 9, 'section.2': 4 }
  const panes: JumpPanes = {
    async resolve(dest) {
      if (Array.isArray(dest)) return { page: (dest[0] as number) + 1, dest }
      const page = pages[dest]
      return page ? { page, dest: [page - 1, { name: 'XYZ' }, 72, 700, null] } : null
    },
    goTo(t, x) {
      asked.push({ name: 'goTo', args: [t, x] })
      here = { page: t.page, at: 0.1, side: x.side }
    },
    goToPage(side, n) {
      asked.push({ name: 'goToPage', args: [side, n] })
      here = { page: n, at: 0, side }
    },
    goToRect(r) {
      asked.push({ name: 'goToRect', args: [r] })
      here = { page: r[0], at: 0.2, side: 'right' }
    },
    reading: () => here,
    goToPlace(p) {
      asked.push({ name: 'goToPlace', args: [p] })
      here = p
    },
    inView: (p) => p.page === here.page && Math.abs(p.at - here.at) < 0.1,
    focusPage(side, n) {
      asked.push({ name: 'focusPage', args: [side, n] })
      return true
    },
  }
  const landed: NonNullable<Light>[] = []
  const lights: JumpLights = {
    // (a sentence lit under a point of page 1's band 0..100 high, the unit whole on page 9 at its point)
    litAt: (_side, page, _x, y, below = 0) =>
      page === 1 && y >= 0 && y <= 100 ? { id: 3, s: 1 } : page === 9 && y - below <= 700 ? { id: 7, s: 0 } : null,
    land: (l) => landed.push(l),
  }
  const h = fakeHistory()
  const jumps = createJumps({ history: h })
  let narrow = false
  const one = createOneJump({ panes: () => panes, lights: () => lights, jumps, narrow: () => narrow })
  return { asked, panes, landed, h, jumps, one, setNarrow: (on: boolean) => (narrow = on), here: () => here }
}
const settle = () => new Promise<void>((r) => setTimeout(r, 0))

/** a laid page of one link inside the paper and one out of it, over a viewport of its frame at scale 1 */
function laidPage(): Page {
  return {
    page: 1,
    wait: { rows: [], faces: [] },
    members: [],
    links: [
      [[100, 40, 120, 52], { dest: 'cite.a' }, 3],
      [[200, 40, 260, 52], { url: 'https://example.org/x' }, 3],
    ],
  }
}
const viewport = {
  width: 612,
  height: 792,
  convertToViewportPoint: (x: number, y: number) => [x, 792 - y],
} as never

describe('one jump for every source', () => {
  it('a laid link on the right pushes one entry, lands, and leaves a way back', async () => {
    const t = standIn()
    const layer = linkLayer(laidPage(), viewport, {
      open: () => {},
      follow: (dest, how) => void t.one.link({ side: 'right', dest, keyboard: how.keyboard, origin: how.origin }),
      unnamed: () => '',
    }) as HTMLElement
    document.body.append(layer)
    ;(layer.querySelector('a[href^="#"]') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1 }),
    )
    await settle()
    expect(t.h.entries).toHaveLength(2)
    expect(t.jumps.depth).toBe(1)
    expect(t.asked[0]).toMatchObject({
      name: 'goTo',
      args: [{ page: 9 }, { side: 'right', keyboard: false, room: ROOM_WIDE }],
    })
    // (the target: the unit at the destination's point, lit whole; the place left: the sentence under the link)
    expect(t.landed).toEqual([{ lit: { id: 7, s: -1 } }])
    expect(t.h.entries[0]?.left?.light).toEqual({ lit: { id: 3, s: 1 } })
    layer.remove()
  })

  it('Enter on a laid link jumps by the keyboard (the focus to the place jumped to)', async () => {
    const t = standIn()
    const layer = linkLayer(laidPage(), viewport, {
      open: () => {},
      follow: (dest, how) => void t.one.link({ side: 'right', dest, keyboard: how.keyboard, origin: how.origin }),
      unnamed: () => '',
    }) as HTMLElement
    document.body.append(layer)
    ;(layer.querySelector('a[href^="#"]') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 0 }),
    )
    await settle()
    expect(t.asked[0]).toMatchObject({ name: 'goTo', args: [{ page: 9 }, { keyboard: true }] })
    expect(t.jumps.depth).toBe(1)
    layer.remove()
  })

  it('a PDF.js link on the left (its service’s goToDestination) is the one jump', async () => {
    const t = standIn()
    const moved: unknown[] = []
    const service = {
      goToDestination: async (d: unknown) => void moved.push(d),
      goToPage: (n: unknown) => void moved.push(n),
    }
    routeInPaper(
      service,
      'left',
      (j) => void t.one.link(j),
      () => ({ keyboard: false, origin: { side: 'left', page: 2, box: [10, 10, 30, 30] } }),
    )
    await service.goToDestination('cite.a')
    await settle()
    expect(moved).toEqual([])
    expect(t.asked[0]).toMatchObject({ name: 'goTo', args: [{ page: 9 }, { side: 'left' }] })
    expect(t.jumps.depth).toBe(1)
    // (the link left lights its own box where no sentence is known under it: open item 7)
    expect(t.h.entries[0]?.left?.light).toEqual({ page: 2, box: [10, 10, 30, 30], side: 'left' })
  })

  it('a PDF.js link on a right page not laid (the right’s service) is the one jump, a page link too', async () => {
    const t = standIn()
    const service = { goToDestination: async (_d: unknown) => {}, goToPage: (_n: unknown) => {} }
    routeInPaper(
      service,
      'right',
      (j) => void t.one.link(j),
      () => null,
    )
    service.goToPage(5)
    await settle()
    expect(t.asked[0]).toMatchObject({ name: 'goTo', args: [{ page: 5 }, { side: 'right' }] })
    expect(t.jumps.depth).toBe(1)
  })

  it('a page typed in the pill pushes one entry and lands with nothing', () => {
    const t = standIn()
    t.one.page('left', 6)
    expect(t.asked).toEqual([{ name: 'goToPage', args: ['left', 6] }])
    expect(t.jumps.depth).toBe(1)
    expect(t.landed).toEqual([])
  })

  it('a contents entry pushes one entry and lights the heading’s first rectangle', () => {
    const t = standIn()
    const from = t.one.begin()
    t.one.heading(from, [4, 72, 600, 300, 612], 4)
    expect(t.asked[0]).toEqual({ name: 'goToRect', args: [[4, 72, 600, 300, 612]] })
    expect(t.landed).toEqual([{ page: 4, box: [72, 600, 300, 612] }])
    expect(t.jumps.depth).toBe(1)
  })

  it('a contents entry with no rectangle goes to its page, a jump all the same', () => {
    const t = standIn()
    t.one.heading(t.one.begin(), null, 3)
    expect(t.asked[0]).toEqual({ name: 'goToPage', args: ['right', 3] })
    expect(t.jumps.depth).toBe(1)
  })

  it('a link out of the paper is no jump', () => {
    const t = standIn()
    const opened: string[] = []
    const layer = linkLayer(laidPage(), viewport, {
      open: (u) => opened.push(u),
      follow: (dest, how) => void t.one.link({ side: 'right', dest, keyboard: how.keyboard, origin: how.origin }),
      unnamed: () => '',
    }) as HTMLElement
    ;(layer.querySelector('a[href^="https"]') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1 }),
    )
    expect(opened).toEqual(['https://example.org/x'])
    expect(t.jumps.depth).toBe(0)
    expect(t.h.entries).toHaveLength(1)
  })

  it('a destination that resolves to nothing does nothing', async () => {
    const t = standIn()
    await t.one.link({ side: 'right', dest: 'nowhere', keyboard: false, origin: null })
    expect(t.asked).toEqual([])
    expect(t.jumps.depth).toBe(0)
    expect(t.h.entries).toHaveLength(1)
  })

  it('leaves less room above the target in a narrow window', async () => {
    const t = standIn()
    t.setNarrow(true)
    await t.one.link({ side: 'right', dest: 'section.2', keyboard: false, origin: null })
    expect(t.asked[0]).toMatchObject({ name: 'goTo', args: [{ page: 4 }, { room: ROOM_NARROW }] })
  })
})

describe('the way back', () => {
  it('Back lands the place left on the pane that went, lit; Forward lands the target, lit', async () => {
    const t = standIn()
    await t.one.link({
      side: 'left',
      dest: 'cite.a',
      keyboard: false,
      origin: { side: 'left', page: 1, box: [10, 50, 30, 60] },
    })
    t.one.back()
    expect(t.asked.at(-1)).toEqual({ name: 'goToPlace', args: [{ page: 1, at: 0.25, side: 'right' }] })
    expect(t.landed.at(-1)).toEqual({ lit: { id: 3, s: 1 } })
    expect(t.jumps.depth).toBe(0)
    t.h.forward()
    expect(t.asked.at(-1)).toEqual({ name: 'goToPlace', args: [{ page: 9, at: 0.1, side: 'left' }] })
    expect(t.landed.at(-1)).toEqual({ lit: { id: 7, s: -1 } })
    expect(t.jumps.depth).toBe(1)
  })

  it('scrolling back to the place left spends the entry: nothing moves, nothing lights', async () => {
    const t = standIn()
    await t.one.link({ side: 'right', dest: 'cite.a', keyboard: false, origin: null })
    const moves = t.asked.length,
      lands = t.landed.length
    t.one.scrolled()
    // (the reader scrolls back to the place left by itself)
    t.panes.goToPlace({ page: 1, at: 0.25, side: 'right' })
    t.asked.pop()
    t.one.scrolled()
    expect(t.jumps.depth).toBe(0)
    expect(t.h.at).toBe(0)
    expect(t.asked.length).toBe(moves)
    expect(t.landed.length).toBe(lands)
  })
})
