// The conformance suite any translator passes to be built (design-b §5.1): determinism of `write` and its behaviour digest,
// a round trip on an echo endpoint, every mangled reply refused or unread and never a throw, sentences that reconstruct,
// each fault mapped to its remedy through a scripted fetch, streams. Registered as vitest tests by the caller's test file.
import { describe, expect, it } from 'vitest'
import { accept, projectionOf, validSentences } from '../accept.ts'
import {
  Fault,
  type FaultCode,
  type Fetch,
  type FetchInit,
  type Lang,
  type OutPiece,
  type Remedy,
  type Translator,
  type UnitIn,
} from '../contract.ts'
import { sha256Hex } from '../sha256.ts'
import { NEVER, type Scripted, scriptedFetch } from './fakes.ts'

export interface AdapterFixtures {
  /** the adapter, built over the fetch the suite scripts (null for an adapter with no fetch of its own) */
  make(fetch: Fetch): Translator
  target: Lang
  /** fixture units: every element kind, nested spans, `must` spans, a display before a full stop, adjacent elements */
  units: readonly UnitIn[]
  /** the endpoint answering each wire with itself: the request as the endpoint is asked it, its reply */
  echo(url: string, init: FetchInit): Scripted
  /** recorded raw replies (as `send` yields them) for a fixture unit, and whether the reading is taken */
  replies: readonly { unit: number; raw: string; taken: boolean; why?: string }[]
  /** each failure the endpoint is known to answer, scripted, with the remedy (and code) it is named */
  faults: readonly { name: string; answer: Scripted; remedy: Remedy; code?: FaultCode; retryAfterMs?: number }[]
  /** a string that must reach no fault's message (an adapter's key), where it has one */
  secret?: string
}

/** what the behaviour digest is taken over: write's output on every fixture unit, read's on every recorded reply */
export function goldenOf(t: Translator, f: Pick<AdapterFixtures, 'target' | 'units' | 'replies'>): string {
  const writes = f.units.map((u) => t.write(u, f.target))
  const reads = f.replies.map((r) => {
    const unit = f.units[r.unit] as UnitIn
    try {
      return t.read(unit, r.raw)
    } catch (e) {
      return { threw: String(e) }
    }
  })
  return sha256Hex(JSON.stringify({ writes, reads }))
}

/** drain an adapter's send */
async function sent(t: Translator, wires: readonly string[], target: Lang): Promise<[number, string][]> {
  const out: [number, string][] = []
  for await (const [i, raw] of t.send(wires, { target }, NEVER)) out.push([i, raw])
  return out
}
const els = (content: readonly OutPiece[], out: string[] = []): string[] => {
  for (const p of content) {
    if (p.t === 'el') out.push(p.id)
    else if (p.t === 'span') els(p.content, out)
  }
  return out
}
const unitEls = (u: UnitIn): Set<string> => {
  const out = new Set<string>()
  const walk = (ps: UnitIn['content']) => {
    for (const p of ps) {
      if (p.t === 'el') out.add(p.id)
      else if (p.t === 'span') walk(p.content)
    }
  }
  walk(u.content)
  return out
}
/** small deterministic changes of a raw reply: none may throw, and none may read back an element the unit lacks */
function mangled(raw: string): string[] {
  const out = [
    '',
    raw.slice(0, raw.length >> 1),
    raw.slice(raw.length >> 1),
    `${raw}${raw}`,
    raw.replace(/#/g, ''),
    raw.replace(/@/g, ''),
    raw.replace(/</g, '＜').replace(/>/g, '＞'),
    raw.replace(/"/g, ''),
    raw.replace(/\\/g, ''),
    raw.toUpperCase(),
    '{"text":1}',
    'null',
    '[]',
  ]
  // every character dropped once, for short raws; every tenth for longer ones
  const step = raw.length > 400 ? 10 : 1
  for (let i = 0; i < raw.length; i += step) out.push(raw.slice(0, i) + raw.slice(i + 1))
  return out
}

/** Registers the suite for one adapter: `name` titles it */
export function translatorSuite(name: string, f: AdapterFixtures): void {
  describe(`translatorSuite: ${name}`, () => {
    const echoing = () => f.make(scriptedFetch((url, init) => f.echo(url, init)).fetch)

    it('write is deterministic and pure: equal units, equal wires; the unit is not changed', () => {
      const t = echoing()
      for (const u of f.units) {
        const before = JSON.stringify(u)
        const a = t.write(u, f.target)
        const b = t.write(JSON.parse(before) as UnitIn, f.target)
        expect(a).toBe(b)
        expect(JSON.stringify(u)).toBe(before)
      }
    })

    it('holds its behaviour digest: a change of what it writes or reads moves `digest`', () => {
      const t = echoing()
      const got = goldenOf(t, f)
      expect(got, `${name}: update the adapter's digest to ${got}`).toBe(t.digest)
    })

    it('an identity with no secret, named <name>:<16 hex>', () => {
      const t = echoing()
      expect(t.identity).toMatch(/^[a-z][a-z0-9-]*:[0-9a-f]{16}$/)
      if (f.secret) expect(t.identity).not.toContain(f.secret)
    })

    it('round trip on an echo: each unit reads back as itself (but for white space a wire sets), accepted', async () => {
      const t = echoing()
      const wires = f.units.map((u) => t.write(u, f.target))
      const raws = await sent(t, wires, f.target)
      expect(raws.map(([i]) => i).sort((a, b) => a - b)).toEqual(wires.map((_, i) => i))
      for (const [i, raw] of raws) {
        const u = f.units[i] as UnitIn
        const r = t.read(u, raw)
        expect(r, `unit ${i}`).not.toBeNull()
        expect(accept(u, r?.content ?? []), `unit ${i}`).toEqual({ ok: true })
        const flat = (s: string) => s.replace(/\s+/g, '')
        expect(flat(projectionOf(r?.content ?? [])), `unit ${i}`).toBe(flat(projectionOf(u.content)))
        if (r?.sentences && u.sentences) expect(validSentences(u, r.content, r.sentences), `unit ${i}`).toBe(true)
      }
    })

    it('recorded replies read as recorded: taken or refused', () => {
      const t = echoing()
      for (const [k, r] of f.replies.entries()) {
        const u = f.units[r.unit] as UnitIn
        const got = t.read(u, r.raw)
        const taken = !!got && accept(u, got.content).ok
        expect(taken, `reply ${k}${r.why ? ` (${r.why})` : ''}`).toBe(r.taken)
      }
    })

    it('mangled replies are refused or unread: never a throw, never an element the unit lacks', async () => {
      const t = echoing()
      const wires = f.units.map((u) => t.write(u, f.target))
      const raws = await sent(t, wires, f.target)
      for (const [i, raw] of [...raws, ...f.replies.map((r) => [r.unit, r.raw] as [number, string])]) {
        const u = f.units[i] as UnitIn
        const allowed = unitEls(u)
        for (const m of mangled(raw)) {
          let r: ReturnType<Translator['read']> = null
          expect(() => {
            r = t.read(u, m)
          }).not.toThrow()
          const got = r as ReturnType<Translator['read']>
          if (got)
            for (const id of els(got.content))
              expect(allowed.has(id), `unit ${i}: ${JSON.stringify(m).slice(0, 80)}`).toBe(true)
        }
      }
    })

    for (const fault of f.faults) {
      it(`a fault through the endpoint: ${fault.name} → ${fault.remedy}${fault.code ? ` (${fault.code})` : ''}`, async () => {
        const t = f.make(scriptedFetch(() => fault.answer).fetch)
        const wires = f.units.slice(0, 2).map((u) => t.write(u, f.target))
        const err = await sent(t, wires, f.target).then(
          () => null,
          (e) => e,
        )
        expect(err).toBeInstanceOf(Fault)
        expect((err as Fault).remedy).toBe(fault.remedy)
        if (fault.code) expect((err as Fault).code).toBe(fault.code)
        if (fault.retryAfterMs !== undefined) expect((err as Fault).retryAfterMs).toBe(fault.retryAfterMs)
        expect((err as Fault).message.length).toBeLessThanOrEqual(300)
        if (f.secret) expect((err as Fault).message).not.toContain(f.secret)
      })
    }

    it('an aborted request is `abort`', async () => {
      const t = f.make(scriptedFetch(() => ({ hang: true })).fetch)
      const c = new (
        globalThis as unknown as { AbortController: new () => { signal: typeof NEVER; abort(): void } }
      ).AbortController()
      const p = (async () => {
        for await (const _ of t.send([t.write(f.units[0] as UnitIn, f.target)], { target: f.target }, c.signal)) {
          // nothing comes
        }
      })().then(
        () => null,
        (e) => e,
      )
      c.abort()
      const err = await p
      expect(err).toBeInstanceOf(Fault)
      expect((err as Fault).remedy).toBe('abort')
    })

    it('streams: each index at most once, only indices sent; a request at its limits is taken', async () => {
      const t = echoing()
      const u = f.units[0] as UnitIn
      const w = t.write(u, f.target)
      const n = Math.max(1, Math.min(t.limits.units, Math.floor(t.limits.chars / Math.max(1, w.length))))
      const raws = await sent(
        t,
        Array.from({ length: n }, () => w),
        f.target,
      )
      const seen = raws.map(([i]) => i)
      expect(new Set(seen).size).toBe(seen.length)
      expect(seen.every((i) => i >= 0 && i < n)).toBe(true)
    })
  })
}
