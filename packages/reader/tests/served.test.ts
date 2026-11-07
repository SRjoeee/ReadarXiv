// The served faces and the reader's Metrics over them (compose/served.ts), over a fake of our site's tables and slices and a fake
// canvas: nothing is ready before the tables are read; the slices a text needs are loaded, no other; a character no served face
// holds is never ready; a text is measured in runs cut where its slice changes, a CJK run unkerned and cut between two
// punctuation marks, never in small capitals; a slice not there is lost (its face told once); the patterns read as the
// typesetter reads them.
import { describe, expect, it, vi } from 'vitest'
import { WAVE_SLOTS } from '../src/compose/faces.ts'
import { createServed, HYPH_WAIT, partsOf, type Platform, unicodeRangeOf } from '../src/compose/served.ts'

const LATIN = [0x20, 0x7e],
  ACCENTS = [0xa0, 0x17f],
  HAN = [0x3000, 0x303f, 0x4e00, 0x9fff, 0xff00, 0xffef]
/** our site's tables: Nimbus Roman in two slices (ASCII, Latin-1 and Extended-A), Source Han Serif SC in one */
const TABLES: Record<string, unknown> = {
  '/static-fonts/index.json': {
    schema: 1,
    fonts: '6',
    faces: { 'nimbus-roman-regular': { group: 'nimbus-roman' }, 'shs-sc-regular': { group: 'shs-sc' } },
  },
  '/static-fonts/nimbus-roman.json?fonts=6': {
    schema: 1,
    group: 'nimbus-roman',
    slices: [LATIN, ACCENTS],
    faces: {
      'nimbus-roman-regular': [
        { path: 'static-fonts/0000000000000001.woff2' },
        { path: 'static-fonts/0000000000000002.woff2' },
      ],
    },
  },
  '/static-fonts/shs-sc.json?fonts=6': {
    schema: 1,
    group: 'shs-sc',
    slices: [HAN],
    faces: { 'shs-sc-regular': [{ path: 'static-fonts/0000000000000003.woff2' }] },
  },
  '/hyph/de.json': { patterns: ['.ab3a4s', '2b1'], exceptions: ['ta-ble'] },
}
const FONT = '400 100px "axt-nimbus-roman", "axt-shs-sc"'

function site(o: { missing?: string[]; failing?: string[] } = {}) {
  const asked: string[] = []
  const fetch = async (url: string) => {
    asked.push(url)
    if (o.missing?.includes(url)) return new Response('', { status: 404 })
    if (o.failing?.includes(url)) return new Response('', { status: 503 })
    if (url in TABLES) return new Response(JSON.stringify(TABLES[url]), { status: 200 })
    if (/^\/static-fonts\/[0-9a-f]{16}\.woff2$/.test(url))
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    return new Response('', { status: 404 })
  }
  const faces: { family: string; range: string; added: boolean }[] = []
  const measured: [string, string, boolean][] = []
  const platform: Platform = {
    // (each character 50 units wide at 100 px, a CJK one 100; its ink 70 over, 20 under, ending at its advance)
    measure(font, text, unkerned) {
      measured.push([font, text, unkerned])
      const width = [...text].reduce((w, ch) => w + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 100 : 50), 0)
      return { width, ascent: 70, descent: 20, right: width }
    },
    async face(family, _bytes, d) {
      const f = { family, range: d.unicodeRange, added: false }
      faces.push(f)
      return {
        add: () => {
          f.added = true
        },
        remove: () => {
          f.added = false
        },
      }
    },
  }
  const lost: string[] = []
  const s = createServed({ fetch, root: document.body, platform, lost: (id) => lost.push(id) })
  return { s, asked, faces, measured, lost }
}

describe('the served faces and the Metrics over them', () => {
  it('nothing ready before the tables are read; the slices a text needs loaded, no other; a character no face holds never ready', async () => {
    const { s, asked, faces } = site()
    expect(s.metrics.ready(FONT, 'Satz')).toBe(false)
    await s.faces.ready([[FONT, 'Satz']])
    expect(s.metrics.ready(FONT, 'Satz')).toBe(true)
    expect(asked).toEqual([
      '/static-fonts/index.json',
      '/static-fonts/nimbus-roman.json?fonts=6',
      '/static-fonts/shs-sc.json?fonts=6',
      '/static-fonts/0000000000000001.woff2',
    ])
    expect(faces).toEqual([{ family: 'axt-nimbus-roman', range: unicodeRangeOf(LATIN), added: true }])
    // (a character of the second slice: not ready until that slice is in; one of the CJK face's, in its own)
    expect(s.metrics.ready(FONT, 'Größe')).toBe(false)
    await s.faces.ready([[FONT, 'Größe \u4e2d\u6587']])
    expect([s.metrics.ready(FONT, 'Größe'), s.metrics.ready(FONT, '\u4e2d\u6587')]).toEqual([true, true])
    expect(faces.map((f) => f.family)).toEqual(['axt-nimbus-roman', 'axt-nimbus-roman', 'axt-shs-sc'])
    // (an emoji no served face holds; a face the font string names that is no catalogue's)
    expect(s.metrics.ready(FONT, 'a \u{1F600}')).toBe('never')
    expect(s.metrics.ready('400 100px "Arial"', 'a')).toBe('never')
    s.faces.dispose()
    expect(faces.every((f) => !f.added)).toBe(true)
  })
  it('measures a text in runs cut where its slice changes, a CJK run unkerned and cut between two punctuation marks, never in small capitals', async () => {
    const { s, measured } = site()
    await s.faces.ready([[FONT, 'aé\u4e2d\u3002\u300db']])
    expect(s.metrics.advance(FONT, 10, 'aé\u4e2d\u3002\u300db')).toBeCloseTo((50 + 50 + 100 + 100 + 100 + 50) / 10)
    expect(measured).toEqual([
      [FONT, 'a', false],
      [FONT, 'é', false],
      [FONT, '\u4e2d\u3002', true],
      [FONT, '\u300d', true],
      [FONT, 'b', false],
    ])
    expect(s.metrics.ink(FONT, 10, 'aé')).toEqual([7, 2, 10])
    expect(partsOf(`small-caps ${FONT}`, [{ text: 'Ab', cjk: false }])).toEqual([[FONT, 'Ab', false]])
    expect(partsOf(`italic small-caps ${FONT}`, [{ text: 'Ab', cjk: false }])).toEqual([
      [`italic ${FONT}`, 'Ab', false],
    ])
  })
  it('a slice not there is lost, its face told once; one that fails for now is lost once it fails again', async () => {
    const gone = site({ missing: ['/static-fonts/0000000000000001.woff2'] })
    await gone.s.faces.ready([[FONT, 'Satz']])
    expect([gone.s.metrics.ready(FONT, 'Satz'), gone.lost]).toEqual(['never', ['nimbus-roman-regular']])
    await gone.s.faces.ready([[FONT, 'Wort']])
    expect(gone.lost).toEqual(['nimbus-roman-regular'])
    const flaky = site({ failing: ['/static-fonts/0000000000000001.woff2'] })
    await flaky.s.faces.ready([[FONT, 'Satz']])
    expect([flaky.s.metrics.ready(FONT, 'Satz'), flaky.lost]).toEqual([false, []])
    await flaky.s.faces.ready([[FONT, 'Satz']])
    expect([flaky.s.metrics.ready(FONT, 'Satz'), flaky.lost]).toEqual(['never', ['nimbus-roman-regular']])
  })
  it("reads a language's patterns as the typesetter reads them, once; one not to be had is none; the lay's wait for them loads them", async () => {
    const { s, asked } = site()
    expect(s.hyphNow('de')).toBeUndefined()
    const got = await s.hyph(['de', 'xx'])
    expect(got.xx).toBeNull()
    expect(got.de?.exceptions.get('table')).toBe('ta-ble')
    expect(s.hyphNow('de')).toBe(got.de)
    await s.hyph(['de'])
    expect(asked.filter((u) => u === '/hyph/de.json')).toHaveLength(1)
    const late = site()
    await late.s.faces.ready([[HYPH_WAIT, 'de']])
    expect(late.s.hyphNow('de')).not.toBeUndefined()
  })
  it('draws a font string by a class of its own: its families, weight, style and small capitals, nothing synthesized', () => {
    const { s } = site()
    const c = s.faces.classOf(`italic small-caps 700 100px "axt-nimbus-roman", "axt-shs-sc"`)
    const rule = [...document.querySelectorAll('style')]
      .flatMap((x) => [...(x.sheet?.cssRules ?? [])].map((r) => r.cssText))
      .join('')
    expect(rule).toContain(`.${c}`)
    expect(s.faces.familyOf(FONT)).toBe('"axt-nimbus-roman", "axt-shs-sc"')
    expect(rule).toMatch(/font-weight: 700/)
    expect(rule).toMatch(/font-style: italic/)
    expect(s.faces.classOf(`italic small-caps 700 100px "axt-nimbus-roman", "axt-shs-sc"`)).toBe(c)
  })
})

/** a body of `size`-byte chunks that never ends, pulled one chunk at a read (a counter on the pulls, a flag on the cancel) */
function endless(size: number) {
  const seen = { pulled: 0, cancelled: false }
  const body = new ReadableStream<Uint8Array>(
    {
      pull(c) {
        seen.pulled++
        c.enqueue(new Uint8Array(size))
      },
      cancel() {
        seen.cancelled = true
      },
    },
    { highWaterMark: 0 },
  )
  return { seen, response: new Response(body, { status: 200 }) }
}
const platformOf = (): Platform => ({
  measure: (_f, text) => ({ width: text.length * 50, ascent: 70, descent: 20, right: text.length * 50 }),
  face: async () => ({ add() {}, remove() {} }),
})

describe('the reader closed, and the bounds of what is read', () => {
  it('a slice queued behind the wave asks nothing once the reader is closed', async () => {
    const SLICES = Array.from({ length: 7 }, (_, k) => [0x41 + k, 0x41 + k])
    const tables: Record<string, unknown> = {
      '/static-fonts/index.json': {
        schema: 1,
        fonts: '6',
        faces: { 'nimbus-roman-regular': { group: 'nimbus-roman' } },
      },
      '/static-fonts/nimbus-roman.json?fonts=6': {
        schema: 1,
        group: 'nimbus-roman',
        slices: SLICES,
        faces: {
          'nimbus-roman-regular': SLICES.map((_, k) => ({ path: `static-fonts/${String(k).padStart(16, '0')}.woff2` })),
        },
      },
    }
    const asked: string[] = []
    const open: (() => void)[] = []
    const fetch = async (url: string) => {
      asked.push(url)
      if (url in tables) return new Response(JSON.stringify(tables[url]), { status: 200 })
      await new Promise<void>((go) => open.push(go))
      return new Response(new Uint8Array([1]), { status: 200 })
    }
    const s = createServed({ fetch, root: document.body, platform: platformOf() })
    const ready = s.faces.ready([[FONT, 'ABCDEFG']])
    await vi.waitFor(() => expect(open).toHaveLength(WAVE_SLOTS))
    const before = asked.length
    expect(s.faces.most).toBe(WAVE_SLOTS)
    s.faces.dispose()
    for (const go of open) go()
    await ready
    await new Promise((go) => setTimeout(go, 0))
    expect(asked).toHaveLength(before)
  })
  it('a slice past its cap is let go at the chunk that passes it, and is lost as one too large is today', async () => {
    const bad = endless(1024 * 1024)
    const warned: string[] = []
    const tables: Record<string, unknown> = {
      '/static-fonts/index.json': {
        schema: 1,
        fonts: '6',
        faces: { 'nimbus-roman-regular': { group: 'nimbus-roman' } },
      },
      '/static-fonts/nimbus-roman.json?fonts=6': {
        schema: 1,
        group: 'nimbus-roman',
        slices: [LATIN],
        faces: { 'nimbus-roman-regular': [{ path: 'static-fonts/0000000000000001.woff2' }] },
      },
    }
    const fetch = async (url: string) =>
      url in tables ? new Response(JSON.stringify(tables[url]), { status: 200 }) : bad.response
    const s = createServed({
      fetch,
      root: document.body,
      platform: platformOf(),
      warn: (_w, e) => warned.push(String(e)),
    })
    await s.faces.ready([[FONT, 'a']])
    expect(bad.seen).toEqual({ pulled: 5, cancelled: true })
    expect(s.metrics.ready(FONT, 'a')).toBe(false)
    expect(warned).toHaveLength(1)
    expect(warned[0]).toMatch(/slice/)
  })
  it('a table past its cap is let go at the chunk that passes it, and is not read', async () => {
    const bad = endless(100 * 1024)
    const warned: string[] = []
    const s = createServed({
      fetch: async () => bad.response,
      root: document.body,
      platform: platformOf(),
      warn: (_w, e) => warned.push(String(e)),
    })
    await s.faces.ready([[FONT, 'a']])
    expect(bad.seen).toEqual({ pulled: 3, cancelled: true })
    expect(warned.some((w) => /answer/.test(w))).toBe(true)
    expect(s.metrics.ready(FONT, 'a')).toBe(false)
  })
})
