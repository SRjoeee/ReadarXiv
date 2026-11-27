// The landing band (compose/highlight.ts `land`, `litAt`; link previews' §3.7 "One highlight"): a jump's arrival and its way
// back lit in the reader's own band, full for its first 18 % of 1,700 ms then fading, whatever the hover switch says, in the
// highlight's own layer, a new landing replacing the last; and the sentence (or unit) a point of a page lights, read before a
// jump for the light of the place it leaves. Over a stand-in of the panes (one upright page 600 × 800 at scale 1: a PDF unit a
// CSS px, y down) and of the composer (one laid Page), and the reader's clock stood in for.
import { describe, expect, it } from 'vitest'
import type { Composer } from '../src/compose/composer.ts'
import { createHighlight, LAND_FULL, LAND_MS } from '../src/compose/highlight.ts'
import type { Box, Page } from '../src/compose/page.ts'
import type { Panes } from '../src/panes/panes.ts'
import type { Clock } from '../src/stack/clock.ts'
import { READER_CSS } from '../src/styles.ts'

const H = 800
/** a clock whose time the test moves: what is due runs as it passes */
function testClock() {
  let now = 0,
    next = 1
  const due = new Map<number, { at: number; f: () => void }>()
  const clock: Clock = {
    now: () => now,
    later: (f, ms) => {
      const id = next++
      due.set(id, { at: now + ms, f })
      return id
    },
    clear: (id) => void due.delete(id),
    frame: () => 0,
    cancel: () => {},
  }
  const pass = (ms: number) => {
    now += ms
    for (const [id, t] of [...due])
      if (t.at <= now) {
        due.delete(id)
        t.f()
      }
  }
  return { clock, pass }
}

function setUp(page: Page, on = true) {
  const els = { left: document.createElement('div'), right: document.createElement('div') }
  for (const el of Object.values(els)) document.body.append(el)
  const panes = {
    scale: 1,
    right: { pages: 1, on: () => () => {} },
    on: () => () => {},
    pageElement: (side: 'left' | 'right') => els[side],
    pointAt: () => null,
    containerOf: () => document.body,
    frameOf: () => ({ turn: 0, w: 600, h: H, width: 600, height: H }),
    boxOf: (_side: string, _n: number, r: Box) => ({
      left: Math.min(r[0], r[2]),
      top: H - Math.max(r[1], r[3]),
      width: Math.abs(r[2] - r[0]),
      height: Math.abs(r[3] - r[1]),
    }),
  } as unknown as Panes
  const composer = { page: () => page, laid: () => page, muted: () => false, on: () => () => {} } as unknown as Composer
  const t = testClock()
  return { els, t, hl: createHighlight({ panes, composer, clock: t.clock, on }) }
}

/** a paragraph of two sentences (ord 4), a heading (ord 2) over it */
const page: Page = {
  page: 1,
  wait: { rows: [], faces: [] },
  links: [],
  members: [
    {
      ord: 2,
      page: 1,
      state: 'laid',
      off: 1,
      lines: [],
      lit: { left: [[[72, 700, 300, 712]]], right: [[[72, 700, 300, 712]]], own: [] },
    },
    {
      ord: 4,
      page: 1,
      state: 'laid',
      off: 1,
      lines: [],
      lit: {
        left: [[[72, 600, 540, 612]], [[72, 586, 300, 598]]],
        right: [[[72, 600, 540, 612]], [[72, 586, 300, 598]]],
        own: [],
      },
    },
  ],
} as unknown as Page
const landed = (el: HTMLElement) => el.querySelectorAll('.axt-land')

describe('the landing band', () => {
  it('lights the target box on each pane that shows it, and is gone after 1,700 ms', () => {
    const { els, hl, t } = setUp(page)
    hl.land({ page: 1, box: [72, 600, 540, 612] })
    expect(landed(els.left)).toHaveLength(1)
    expect(landed(els.right)).toHaveLength(1)
    t.pass(LAND_MS - 1)
    expect(landed(els.right)).toHaveLength(1)
    t.pass(1)
    expect(landed(els.left)).toHaveLength(0)
    expect(landed(els.right)).toHaveLength(0)
    hl.dispose()
  })

  it('a box of one pane’s lights that pane alone', () => {
    const { els, hl } = setUp(page)
    hl.land({ page: 1, box: [72, 600, 90, 612], side: 'right' })
    expect([landed(els.left).length, landed(els.right).length]).toEqual([0, 1])
    hl.dispose()
  })

  it('a unit lit whole lands on both panes, its sentences’ shapes', () => {
    const { els, hl } = setUp(page)
    hl.land({ lit: { id: 4, s: -1 } })
    expect(landed(els.left).length).toBeGreaterThan(0)
    expect(landed(els.right).length).toBeGreaterThan(0)
    hl.dispose()
  })

  it('draws with the hover switch off, and is not taken away by the hover’s painting', () => {
    const { els, hl } = setUp(page, false)
    hl.land({ lit: { id: 2, s: -1 } })
    expect(landed(els.right).length).toBeGreaterThan(0)
    hl.setOn(true)
    hl.light({ id: 4, s: 0 })
    expect(landed(els.right).length).toBeGreaterThan(0)
    hl.dispose()
  })

  it('a new landing replaces the last', () => {
    const { els, hl } = setUp(page)
    hl.land({ page: 1, box: [72, 600, 540, 612] })
    hl.land({ page: 1, box: [72, 700, 300, 712] })
    expect(landed(els.right)).toHaveLength(1)
    hl.dispose()
  })

  it('its look: the band at full strength for its first 18 %, then fading, opacity alone', () => {
    expect(LAND_MS).toBe(1700)
    expect(LAND_FULL).toBe(0.18)
    expect(READER_CSS).toMatch(/@keyframes axt-land \{ 0%, 18% \{ opacity: 1; \} 100% \{ opacity: 0; \} \}/)
  })
})

describe('what a point of a page lights', () => {
  it('the sentence under it, where its member lights by sentence', () => {
    const { hl } = setUp(page)
    expect(hl.litAt('left', 1, 100, 606)).toEqual({ id: 4, s: 0 })
    expect(hl.litAt('right', 1, 100, 590)).toEqual({ id: 4, s: 1 })
  })
  it('the unit whole where its member lights whole', () => {
    const { hl } = setUp(page)
    expect(hl.litAt('left', 1, 100, 705)).toEqual({ id: 2, s: -1 })
  })
  it('nothing over no member, nor over a member under the point: no landing rule of the reader’s own (the lead’s ruling of 2026-11-28)', () => {
    const { hl } = setUp(page)
    expect(hl.litAt('left', 1, 100, 650)).toBeNull()
    expect(hl.litAt('left', 1, 100, 720)).toBeNull()
    expect(hl.litAt('left', 1, null, 720)).toBeNull()
  })
})

describe('the half tint', () => {
  it('a hovered or held link takes the band at half, on both panes, PDF.js’s yellow overridden', () => {
    const half =
      'color-mix(in oklab, var(--axt-hl-color, var(--axt-green)) calc(var(--axt-hl-mix, 22%) / 2), transparent)'
    expect(READER_CSS).toContain(half)
    expect(READER_CSS).not.toContain('rgb(255 255 0 / 0.2)')
    expect(READER_CSS).toMatch(/\.annotationLayer .*\.linkAnnotation/)
  })
})
