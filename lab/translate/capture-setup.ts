// Records, while today's tests run, every reply today's readers are asked to judge: the PDF engine's (mt.mjs: a unit's
// pieces, its wire, the reply, readsBack's verdict) and the HTML page's (protector validate: the source wire, the reply, the
// verdict). The records are the material of the equivalence check (equivalence.ts); nothing here changes what a test sees.
import { appendFileSync } from 'node:fs'
import { expect, vi } from 'vitest'

const OUT = process.env.AXT_CAPTURE ?? ''
const testName = () => {
  try {
    return expect.getState()
  } catch {
    return undefined
  }
}
const put = (record: Record<string, unknown>) => {
  if (!OUT) return
  const s = testName()
  appendFileSync(OUT, `${JSON.stringify({ ...record, test: s?.currentTestName ?? null, file: s?.testPath?.replace(/^.*\/tests\//, 'tests/') ?? null })}\n`)
}

vi.mock('../../src/pdf-reader/engine/translate/mt.mjs', async importOriginal => {
  const mt = await importOriginal<Record<string, (...a: unknown[]) => unknown>>()
  const units = new WeakMap<object, { u: { kind?: string; pieces: unknown[] }; format: string }>()
  const judge = (text: unknown, ser: unknown, format: string) => {
    const m = ser && typeof ser === 'object' ? units.get(ser) : undefined
    if (!m || typeof text !== 'string') return
    // (an open's `sets` 0, the front end's verdict that the pair sets nothing, is not enumerable: written out here)
    const pieces = m.u.pieces.map(p => ((p as { sets?: number })?.sets === 0 ? { ...(p as object), sets: 0 } : p))
    put({ src: 'pdf', format, kind: m.u.kind ?? null, pieces, wire: (ser as { wire: string }).wire, reply: text, today: mt.readsBack(text, ser, format) === true })
  }
  const serialize = (u: { pieces: unknown[] }) => {
    const s = mt.serialize(u) as object
    units.set(s, { u, format: 'markers' })
    return s
  }
  const serializeTags = (u: { pieces: unknown[] }) => {
    const s = mt.serializeTags(u) as object
    units.set(s, { u, format: 'tags' })
    return s
  }
  return {
    ...mt,
    serialize,
    serializeTags,
    rehydrate: (text: string, ser: unknown, tolerant?: boolean) => {
      judge(text, ser, 'markers')
      return mt.rehydrate(text, ser, tolerant)
    },
    rehydrateTags: (text: string, ser: unknown) => {
      judge(text, ser, 'tags')
      return mt.rehydrateTags(text, ser)
    },
    readsBack: (text: string, ser: unknown, format = 'markers') => {
      judge(text, ser, format)
      return mt.readsBack(text, ser, format)
    },
    translateUnits: async (us: { pieces: unknown[] }[], send: (...a: unknown[]) => Promise<({ text?: string } | null)[]>, format = 'markers') => {
      const byWire = new Map<string, object>()
      if (format === 'markers' || format === 'tags') for (const u of us) {
        const s = (format === 'tags' ? serializeTags(u) : serialize(u)) as { wire: string }
        if (!byWire.has(s.wire)) byWire.set(s.wire, s)
      }
      const wrapped = async (texts: string[], ...rest: unknown[]) => {
        const got = await send(texts, ...rest)
        texts.forEach((t, i) => {
          const ser = byWire.get(t)
          const reply = got?.[i]?.text
          if (ser && typeof reply === 'string') judge(reply, ser, format)
        })
        return got
      }
      return mt.translateUnits(us, wrapped, format)
    },
  }
})

vi.mock('../../src/core/protector/validate.ts', async importOriginal => {
  const v = await importOriginal<typeof import('../../src/core/protector/validate.ts')>()
  const sources = new WeakMap<object, string>()
  return {
    ...v,
    expectationsFromText: (text: string, format?: 'tags' | 'markers') => {
      const e = v.expectationsFromText(text, format)
      sources.set(e, text)
      return e
    },
    validate: (translated: string, block: Parameters<typeof v.validate>[1]) => {
      const r = v.validate(translated, block)
      const wire = (block as { text?: unknown }).text ?? sources.get(block)
      if (typeof wire === 'string') put({ src: 'html', format: block.format, wire, reply: translated, today: r.ok, reason: r.ok ? null : r.reason })
      return r
    },
  }
})
