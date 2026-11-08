// The served faces and the reader's Metrics over them (compose/served.ts), over a fake of our site's tables and slices and a fake
// canvas: nothing is ready before the tables are read; the slices a text needs are loaded, no other; a character no served face
// holds is never ready; a text is measured in runs cut where its slice changes, a CJK run unkerned and cut between two
// punctuation marks, never in small capitals; a slice not there is lost (its face told once), one that does not come in time
// is a failure for now; a table not to be had loses its faces; a 408 or 429 is asked once more after its Retry-After; the
// patterns read as the typesetter reads them, none where they do not come in time.
import * as T from '@readarxiv/typeset'
import { describe, expect, it, vi } from 'vitest'
import type { Timers } from '../src/bytes/source.ts'
import { WAVE_SLOTS } from '../src/compose/faces.ts'
import {
  BUSY_MAX_MS,
  createServed,
  HYPH_WAIT,
  PROBE_FACE,
  partsOf,
  type Platform,
  unicodeRangeOf,
} from '../src/compose/served.ts'
import { typesetLay } from '../src/compose/typeset.ts'
import { REQUEST_MS, RETRY_MS } from '../src/session/client.ts'

const LATIN = [0x20, 0x7e],
  ACCENTS = [0xa0, 0x17f],
  HAN = [0x3000, 0x303f, 0x4e00, 0x9fff, 0xff00, 0xffef]
/** our site's tables: Nimbus Roman in two slices (ASCII, Latin-1 and Extended-A), Source Han Serif SC in one */
const TABLES: Record<string, unknown> = {
  '/static-fonts/index.json': {
    schema: 1,
    fonts: '6',
    faces: {
      'nimbus-roman-regular': { group: 'nimbus-roman' },
      'shs-sc-regular': { group: 'shs-sc' },
      'cmun-serif-regular': { group: 'cmun-serif' },
    },
  },
  '/static-fonts/cmun-serif.json?fonts=6': {
    schema: 1,
    group: 'cmun-serif',
    slices: [LATIN],
    faces: { 'cmun-serif-regular': [{ path: 'static-fonts/0000000000000004.woff2' }] },
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

/** an answer given in place of a url's own: a status, or a status with its Retry-After */
type Given = number | { status: number; after: string }
function site(
  o: {
    missing?: string[]
    failing?: string[]
    malformed?: string[]
    offline?: string[]
    /** never answered: only the ask's own abort ends it, as a browser's fetch */
    stalled?: string[]
    /** answered, its body never ending until the ask is let go */
    stalledBody?: string[]
    /** the answers each url's asks get first, in order (its own after them) */
    answers?: Record<string, Given[]>
    timers?: Timers
  } = {},
) {
  const asked: string[] = []
  const fetch = async (url: string, init?: RequestInit) => {
    asked.push(url)
    const signal = init?.signal
    const given = o.answers?.[url]?.shift()
    if (given !== undefined)
      return typeof given === 'number'
        ? new Response('', { status: given })
        : new Response('', { status: given.status, headers: { 'retry-after': given.after } })
    if (o.stalled?.includes(url))
      return new Promise<Response>((_, no) =>
        signal?.addEventListener('abort', () => no(signal.reason), { once: true }),
      )
    if (o.stalledBody?.includes(url))
      return new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            signal?.addEventListener('abort', () => c.error(signal.reason), { once: true })
          },
        }),
        { status: 200 },
      )
    if (o.missing?.includes(url)) return new Response('', { status: 404 })
    if (o.failing?.includes(url)) return new Response('', { status: 503 })
    if (o.malformed?.includes(url)) return new Response('{"schema":1,', { status: 200 })
    if (o.offline?.includes(url)) throw new TypeError('Failed to fetch')
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
  const warned: string[] = []
  const s = createServed({
    fetch,
    root: document.body,
    platform,
    lost: (id) => lost.push(id),
    warn: (what) => warned.push(what),
    ...(o.timers ? { timers: o.timers } : {}),
  })
  return { s, asked, faces, measured, lost, warned }
}
/** timers moved by hand: `run` lets what falls due run, in order, the promises they start settled between (a timer one of them
 *  sets that falls due within the run included) */
function handTimers() {
  let now = 0,
    id = 0
  const due = new Map<number, { at: number; f: () => void }>()
  const flush = async () => {
    for (let i = 0; i < 6; i++) await new Promise((go) => setTimeout(go, 0))
  }
  return {
    later(f: () => void, ms: number) {
      due.set(++id, { at: now + ms, f })
      return id
    },
    clear: (t: unknown) => void due.delete(t as number),
    async run(ms: number) {
      const end = now + ms
      for (;;) {
        await flush()
        const next = [...due].sort((a, b) => a[1].at - b[1].at)[0]
        if (!next || next[1].at > end) break
        due.delete(next[0])
        now = next[1].at
        next[1].f()
      }
      now = end
    },
  }
}

describe('the served faces and the Metrics over them', () => {
  it("the text rendering's probe face: a served Latin face, Computer Modern's serif, loaded for the probe's text; none where it cannot be had", async () => {
    const { s, asked, faces } = site()
    expect(PROBE_FACE).toBe('400 100px "axt-cmun-serif"')
    expect(await s.faces.probeFace('Sphinx')).toBe(PROBE_FACE)
    expect(s.metrics.ready(PROBE_FACE, 'Sphinx')).toBe(true)
    expect(asked).toEqual([
      '/static-fonts/index.json',
      '/static-fonts/cmun-serif.json?fonts=6',
      '/static-fonts/0000000000000004.woff2',
    ])
    expect(faces).toEqual([{ family: 'axt-cmun-serif', range: unicodeRangeOf(LATIN), added: true }])
    // (its slice not there, or its table: no probe face, the sheet's geometricPrecision; a system face would tell nothing)
    expect(await site({ missing: ['/static-fonts/0000000000000004.woff2'] }).s.faces.probeFace('Sphinx')).toBeNull()
    expect(await site({ missing: ['/static-fonts/cmun-serif.json?fonts=6'] }).s.faces.probeFace('Sphinx')).toBeNull()
    s.faces.dispose()
  })
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
    // (a 503: asked once more after RETRY_MS within the ask, the ask a failure for now)
    const timers = handTimers()
    const flaky = site({ failing: ['/static-fonts/0000000000000001.woff2'], timers })
    const one = flaky.s.faces.ready([[FONT, 'Satz']])
    await timers.run(RETRY_MS)
    await one
    expect([flaky.s.metrics.ready(FONT, 'Satz'), flaky.lost]).toEqual([false, []])
    const two = flaky.s.faces.ready([[FONT, 'Satz']])
    await timers.run(RETRY_MS)
    await two
    expect([flaky.s.metrics.ready(FONT, 'Satz'), flaky.lost]).toEqual(['never', ['nimbus-roman-regular']])
    expect(flaky.asked.filter((u) => u.endsWith('1.woff2'))).toHaveLength(4)
    // (a 410: not there, as a 404)
    const gone410 = site({ answers: { '/static-fonts/0000000000000001.woff2': [410] } })
    await gone410.s.faces.ready([[FONT, 'Satz']])
    expect([gone410.s.metrics.ready(FONT, 'Satz'), gone410.lost]).toEqual(['never', ['nimbus-roman-regular']])
  })
  it('a slice that does not come within the bound of an ask (no answer, or a body that stops) is a failure for now: lost once it fails again', async () => {
    const SLICE = '/static-fonts/0000000000000001.woff2'
    const timers = handTimers()
    // (no answer: let go at REQUEST_MS, asked once more after RETRY_MS, let go again)
    const BOUND = REQUEST_MS + RETRY_MS + REQUEST_MS
    const at = site({ stalled: [SLICE], timers })
    let done = false
    void at.s.faces.ready([[FONT, 'Satz']]).then(() => {
      done = true
    })
    await timers.run(BOUND - 1)
    expect(done).toBe(false)
    await timers.run(1)
    expect([done, at.s.metrics.ready(FONT, 'Satz'), at.lost]).toEqual([true, false, []])
    expect(at.asked.filter((u) => u === SLICE)).toHaveLength(2)
    const again = at.s.faces.ready([[FONT, 'Satz']])
    await timers.run(BOUND)
    await again
    expect([at.s.metrics.ready(FONT, 'Satz'), at.lost]).toEqual(['never', ['nimbus-roman-regular']])
    expect(at.asked.filter((u) => u === SLICE)).toHaveLength(4)
    // (a body that stops after its answer: let go at REQUEST_MS with its answer, a failure for now)
    const body = site({ stalledBody: [SLICE], timers })
    let read = false
    void body.s.faces.ready([[FONT, 'Satz']]).then(() => {
      read = true
    })
    await timers.run(REQUEST_MS - 1)
    expect(read).toBe(false)
    await timers.run(1)
    expect([read, body.s.metrics.ready(FONT, 'Satz'), body.lost]).toEqual([true, false, []])
  })
  it("a 408 or 429 (our site's visitor limit) is a failure for now: asked once more after its Retry-After (RETRY_MS where it names none, BUSY_MAX_MS at most), a table, a slice and the patterns alike", async () => {
    const INDEX = '/static-fonts/index.json',
      SLICE = '/static-fonts/0000000000000001.woff2'
    // (busy once: read at the wait)
    for (const [url, given, wait] of [
      [INDEX, { status: 429, after: '5' }, 5000],
      [INDEX, 408, RETRY_MS],
      [INDEX, { status: 429, after: '3600' }, BUSY_MAX_MS],
      [SLICE, { status: 429, after: '7' }, 7000],
      [SLICE, 403, RETRY_MS],
    ] as const) {
      const timers = handTimers()
      const at = site({ answers: { [url]: [given] }, timers })
      let done = false
      void at.s.faces.ready([[FONT, 'Satz']]).then(() => {
        done = true
      })
      await timers.run(wait - 1)
      expect([url, done, at.asked.filter((u) => u === url).length]).toEqual([url, false, 1])
      await timers.run(1)
      expect([url, done, at.asked.filter((u) => u === url).length]).toEqual([url, true, 2])
      expect([at.s.metrics.ready(FONT, 'Satz'), at.lost]).toEqual([true, []])
    }
    // (busy twice: a table lost with its faces; a slice a failure for now, lost once it fails again)
    const timers = handTimers()
    const table = site({ answers: { [INDEX]: [429, 429] }, timers })
    const t = table.s.faces.ready([[FONT, 'Satz']])
    await timers.run(RETRY_MS)
    await t
    expect([table.s.metrics.ready(FONT, 'Satz'), table.lost]).toEqual([
      'never',
      ['nimbus-roman-regular', 'shs-sc-regular'],
    ])
    const slice = site({ answers: { [SLICE]: [429, 429, 429, 429] }, timers })
    const one = slice.s.faces.ready([[FONT, 'Satz']])
    await timers.run(RETRY_MS)
    await one
    expect([slice.s.metrics.ready(FONT, 'Satz'), slice.lost]).toEqual([false, []])
    const two = slice.s.faces.ready([[FONT, 'Satz']])
    await timers.run(RETRY_MS)
    await two
    expect([slice.s.metrics.ready(FONT, 'Satz'), slice.lost]).toEqual(['never', ['nimbus-roman-regular']])
    // (the patterns busy once: read at the wait)
    const hyph = site({ answers: { '/hyph/de.json': [{ status: 429, after: '2' }] }, timers })
    let got: unknown
    void hyph.s.hyph(['de']).then((v) => {
      got = v.de
    })
    await timers.run(1999)
    expect(got).toBeUndefined()
    await timers.run(1)
    expect((got as { exceptions: Map<string, string> } | undefined)?.exceptions.get('table')).toBe('ta-ble')
  })
  it('a table not there or of another shape loses its faces at once, each told once; one that fails for now is asked once more after a pause, then its faces are lost', async () => {
    const INDEX = '/static-fonts/index.json',
      CJK = '/static-fonts/shs-sc.json?fonts=6'
    const BOTH = ['nimbus-roman-regular', 'shs-sc-regular']
    for (const [url, how] of [
      [INDEX, 'missing'],
      [INDEX, 'malformed'],
      [CJK, 'missing'],
      [CJK, 'malformed'],
    ] as const) {
      const lost = url === INDEX ? BOTH : ['shs-sc-regular']
      const at = site(how === 'missing' ? { missing: [url] } : { malformed: [url] })
      await at.s.faces.ready([
        [FONT, 'Satz'],
        [FONT, '\u4e2d\u6587'],
      ])
      const ready = [at.s.metrics.ready(FONT, 'Satz'), at.s.metrics.ready(FONT, '\u4e2d\u6587')]
      expect(ready).toEqual([lost.length === 2 ? 'never' : true, 'never'])
      expect(at.lost).toEqual(lost)
      // (asked once: a page laid again with the faces lost asks nothing, tells nothing again)
      const asked = at.asked.length
      await at.s.faces.ready([
        [FONT, 'Wort'],
        [FONT, '\u4e2d'],
      ])
      expect(at.asked).toHaveLength(asked)
      expect(at.asked.filter((u) => u === url)).toHaveLength(1)
      expect(at.lost).toEqual(lost)
    }
    for (const failing of [INDEX, CJK]) {
      const timers = handTimers()
      for (const how of ['offline', 'failing'] as const) {
        const at = site(how === 'offline' ? { offline: [failing], timers } : { failing: [failing], timers })
        let done = false
        void at.s.faces.ready([[FONT, '\u4e2d']]).then(() => {
          done = true
        })
        await timers.run(RETRY_MS - 1)
        expect([done, at.asked.filter((u) => u === failing)]).toEqual([false, [failing]])
        await timers.run(1)
        expect([done, at.asked.filter((u) => u === failing)]).toEqual([true, [failing, failing]])
        expect(at.s.metrics.ready(FONT, '\u4e2d')).toBe('never')
        expect(at.lost).toEqual(failing === INDEX ? BOTH : ['shs-sc-regular'])
        await at.s.faces.ready([[FONT, '\u4e2d']])
        expect(at.asked.filter((u) => u === failing)).toHaveLength(2)
      }
    }
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
  it("reads ahead the tables a font string's faces need (the index, their groups'), no slice: a page's first slice then waits for no table", async () => {
    const { s, asked } = site()
    await s.warm(['400 100px "axt-shs-sc"'])
    expect(asked).toEqual(['/static-fonts/index.json', '/static-fonts/shs-sc.json?fonts=6'])
    await s.faces.ready([[FONT, '\u4e2d']])
    expect(asked.slice(2)).toEqual(['/static-fonts/nimbus-roman.json?fonts=6', '/static-fonts/0000000000000003.woff2'])
    const bare = site()
    await bare.s.warm([])
    expect(bare.asked).toEqual(['/static-fonts/index.json'])
  })
  it("a language's patterns that do not come are none by the bound of an ask (REQUEST_MS, asked once more after RETRY_MS): the lay comes back", async () => {
    const timers = handTimers()
    const asked: string[] = []
    const fetch = (url: string, init?: RequestInit) => {
      asked.push(url)
      // (a connection taken and never answered: only the ask's own abort ends it, as a browser's fetch)
      return new Promise<Response>((_, no) => {
        const signal = init?.signal
        signal?.addEventListener('abort', () => no(signal.reason), { once: true })
      })
    }
    const s = createServed({ fetch, root: document.body, platform: platformOf(), timers })
    const langs = T.rulesFor('de').patterns
    let lay: unknown = null
    void typesetLay({ served: s, target: () => 'de', classes: () => null }).then((l) => {
      lay = l
    })
    const BOUND = REQUEST_MS + RETRY_MS + REQUEST_MS
    await timers.run(BOUND - 1)
    expect(lay).toBeNull()
    await timers.run(1)
    expect(lay).toBeTypeOf('function')
    expect(langs.map((l) => s.hyphNow(l))).toEqual(langs.map(() => null))
    expect(asked.sort()).toEqual(langs.flatMap((l) => [`/hyph/${l}.json`, `/hyph/${l}.json`]).sort())
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
  it('a slice queued behind the wave whose demand is gone (its page scrolled away, another generation) asks nothing; a demand later asks it again', async () => {
    const SLICES = Array.from({ length: 6 }, (_, k) => [0x41 + k, 0x41 + k])
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
    let wanted = true
    const ready = s.faces.ready([[FONT, 'ABCDEF']], () => wanted)
    await vi.waitFor(() => expect(open).toHaveLength(WAVE_SLOTS))
    // (the page's demand gone while two of its slices wait for a slot: those two are never asked)
    wanted = false
    for (const go of open.splice(0)) go()
    await ready
    await new Promise((go) => setTimeout(go, 0))
    const slices = () => asked.filter((u) => u.endsWith('.woff2'))
    expect(slices()).toHaveLength(WAVE_SLOTS)
    expect(s.metrics.ready(FONT, 'ABCD')).toBe(true)
    expect(s.metrics.ready(FONT, 'EF')).toBe(false)
    // (a page that wants them later asks them, as any slice not loaded)
    const again = s.faces.ready([[FONT, 'EF']], () => true)
    await vi.waitFor(() => expect(open).toHaveLength(2))
    for (const go of open.splice(0)) go()
    await again
    expect(slices()).toHaveLength(WAVE_SLOTS + 2)
    expect(s.metrics.ready(FONT, 'EF')).toBe(true)
  })
  it('a face table whose index comes in after the reader is closed is never asked', async () => {
    const asked: string[] = []
    let release: (() => void) | undefined
    const fetch = async (url: string) => {
      asked.push(url)
      if (url === '/static-fonts/index.json') await new Promise<void>((go) => (release = go))
      if (url in TABLES) return new Response(JSON.stringify(TABLES[url]), { status: 200 })
      return new Response(new Uint8Array([1]), { status: 200 })
    }
    const s = createServed({ fetch, root: document.body, platform: platformOf() })
    const ready = s.faces.ready([[FONT, 'Satz']])
    await vi.waitFor(() => expect(release).toBeDefined())
    s.faces.dispose()
    release?.()
    await ready
    await new Promise((go) => setTimeout(go, 0))
    expect(asked).toEqual(['/static-fonts/index.json'])
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
      warn: (w, e) => warned.push(`${w}: ${e}`),
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
    expect(warned).toHaveLength(1)
    // (an answer no ask would mend: its faces lost)
    expect(s.metrics.ready(FONT, 'a')).toBe('never')
  })
})
