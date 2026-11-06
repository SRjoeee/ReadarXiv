import { describe, expect, it } from 'vitest'
import { type ChromeApi, chrome, normalizeSpacing } from '../../src/adapters/chrome.ts'
import { chainOf } from '../../src/chain.ts'
import { Fault, type Result, type Signal } from '../../src/contract.ts'
import { NEVER } from '../../src/testing/fakes.ts'
import { fakeClock } from '../../src/testing/ports.ts'
import { translatorSuite } from '../../src/testing/suite.ts'
import { GOOGLE_REPLIES, UNITS } from './fixtures.ts'

/** a stand-in of the platform's Translator: available for the targets given, its sessions answering with `answer` */
function api(
  o: {
    available?: string[]
    answer?: (s: string) => string
    create?: () => Promise<never>
    availability?: () => Promise<string>
  } = {},
): ChromeApi & { created: number } {
  const self = {
    created: 0,
    availability:
      o.availability ??
      (async ({ targetLanguage }: { targetLanguage: string }) =>
        (o.available ?? ['zh']).includes(targetLanguage) ? 'available' : 'downloadable'),
    async create() {
      self.created++
      if (o.create) return o.create()
      return {
        translate: async (s: string, opt?: { signal?: Signal }) => {
          if (opt?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
          return (o.answer ?? ((x) => x))(s)
        },
      }
    },
  }
  return self as ChromeApi & { created: number }
}

translatorSuite('chrome', {
  make: () => chrome({ api: api() }),
  target: 'zh-Hans',
  units: UNITS,
  echo: () => ({ status: 200, body: '' }),
  replies: GOOGLE_REPLIES,
  faults: [],
})

const drain = async (it: AsyncIterable<readonly [number, string]>) => {
  const out: [number, string][] = []
  for await (const [i, s] of it) out.push([i, s])
  return out
}

describe("chrome: the platform's translator, injected", () => {
  it('serves a target only when its model is available; a probe that never answers is bounded', async () => {
    const clock = fakeClock()
    expect(await chrome({ api: api(), clock }).supports('zh-Hans')).toBe(true)
    expect(await chrome({ api: api(), clock }).supports('ja')).toBe(false)
    expect(await chrome({ api: null, clock }).supports('zh-Hans')).toBe(false)
    expect(
      await chrome({ api: api({ availability: () => new Promise<string>(() => {}) }), clock }).supports('zh-Hans'),
    ).toBe(false)
  })
  it('one session per target, shared by every request, made once', async () => {
    const a = api()
    const c = chrome({ api: a })
    await drain(c.send(['one'], { target: 'zh-Hans' }, NEVER))
    await drain(c.send(['two'], { target: 'zh-Hans' }, NEVER))
    expect(a.created).toBe(1)
  })
  it('a gesture needed is `off`; a pair not supported passes; a session that never comes is a timeout', async () => {
    const gesture = chrome({
      api: api({ create: () => Promise.reject(Object.assign(new Error('no gesture'), { name: 'NotAllowedError' })) }),
    })
    await expect(drain(gesture.send(['x'], { target: 'zh-Hans' }, NEVER))).rejects.toMatchObject({
      remedy: 'off',
      code: 'needs-gesture',
    })
    const pair = chrome({
      api: api({ create: () => Promise.reject(Object.assign(new Error('no'), { name: 'NotSupportedError' })) }),
    })
    await expect(drain(pair.send(['x'], { target: 'zh-Hans' }, NEVER))).rejects.toMatchObject({
      remedy: 'pass',
      code: 'unsupported',
    })
    const clock = fakeClock()
    const never = chrome({ api: api({ create: () => new Promise<never>(() => {}) }), clock })
    const err = await drain(never.send(['x'], { target: 'zh-Hans' }, NEVER)).catch((e) => e)
    expect(err).toBeInstanceOf(Fault)
    expect(err).toMatchObject({ remedy: 'again', code: 'timeout' })
  })
  it('a gesture needed leaves the unit unconfigured where nothing else serves it, through the chain', async () => {
    const gesture = chrome({
      api: api({ create: () => Promise.reject(Object.assign(new Error('no gesture'), { name: 'NotAllowedError' })) }),
    })
    const rs: Result[] = []
    for await (const r of chainOf({ clock: fakeClock() }).translate([UNITS[0] as never], 'zh-Hans', {
      translators: [gesture],
    }))
      rs.push(r)
    expect(rs[0]).toEqual({ id: 'plain', ok: false, why: { kind: 'unconfigured', code: 'needs-gesture' } })
  })
  it('the space the model sets after CJK punctuation is taken off', async () => {
    expect(normalizeSpacing('第一句。 第二句， 第三')).toBe('第一句。第二句，第三')
    const c = chrome({ api: api({ answer: (s) => s.replace('It is hard.', '这很难。 是的') }) })
    const [[, raw]] = (await drain(c.send(['It is hard.'], { target: 'zh-Hans' }, NEVER))) as [[number, string]]
    expect(raw).toBe('这很难。是的')
  })
})
