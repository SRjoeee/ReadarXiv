import { describe, expect, it } from 'vitest'
import { createDiagnostics } from '@/entrypoints/background/diagnostics'
import type { DiagnosticEntry } from '@/shared/diagnostics'

// The ring buffer behind the settings page's diagnostics export (issue #156): capped, restored from session storage
// across service workers, saved once per burst, and never holding a key

function harness(stored?: DiagnosticEntry[], limit = 3) {
  const saves: DiagnosticEntry[][] = []
  const timers: (() => void)[] = []
  let clock = 1000
  const d = createDiagnostics({
    load: async () => stored,
    save: async entries => { saves.push(entries) },
    now: () => clock++,
    limit,
    schedule: run => { timers.push(run); return timers.length },
    cancel: id => { timers[id - 1] = () => undefined },
  })
  return { d, saves, fire: () => { for (const run of timers.splice(0)) run() } }
}

describe('createDiagnostics', () => {
  it('keeps the newest `limit` lines in order, and what a previous worker left comes first', async () => {
    const { d } = harness([{ t: 1, src: 'background', line: 'old' }])
    d.record('content', 'a')
    await d.restored
    d.record('background', 'b')
    d.record('content', 'c')
    expect(d.entries().map(e => e.line)).toEqual(['a', 'b', 'c'])
    expect(d.entries().map(e => e.src)).toEqual(['content', 'background', 'content'])
  })

  it('a burst is saved once, after the last line; a key in a line is blanked before it is stored', async () => {
    const { d, saves, fire } = harness(undefined, 10)
    await d.restored
    d.record('background', 'demoted (auth): key sk-0123456789abcdef refused')
    d.record('background', 'again')
    expect(saves).toEqual([])
    fire()
    expect(saves).toHaveLength(1)
    expect(saves[0]![0]!.line).toBe('demoted (auth): key sk-… refused')
  })

  it('the export carries the environment, a timestamp, and a copy of the entries', async () => {
    const { d } = harness(undefined, 10)
    await d.restored
    d.record('popup', 'x')
    const out = d.export({ extension: { version: '0.0.0', buildRef: 'main' }, browser: 'UA', platform: 'mac' })
    expect(out.extension).toEqual({ version: '0.0.0', buildRef: 'main' })
    expect(out.entries.map(e => e.line)).toEqual(['x'])
    expect(typeof out.exportedAt).toBe('string')
    out.entries.push({ t: 0, src: 'popup', line: 'not mine' })
    expect(d.entries()).toHaveLength(1)
  })

  it('a storage that cannot be read starts empty rather than failing the worker', async () => {
    const d = createDiagnostics({ load: async () => { throw new Error('no session storage') }, save: async () => undefined, schedule: () => 0, cancel: () => undefined })
    await d.restored
    d.record('background', 'fine')
    expect(d.entries().map(e => e.line)).toEqual(['fine'])
  })
})
