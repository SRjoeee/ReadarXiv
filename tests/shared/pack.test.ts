import { describe, expect, it } from 'vitest'
import { type PackState, createPackLookup } from '@/shared/pack'

// The pack lookups' bookkeeping shared by the popup and the settings page (INVENTORY S1): the committed target owns
// what is shown, only the newest lookup publishes, none while a download of its target is in flight

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

function harness() {
  /** Lookups in flight, in the order they were issued; the test answers them in the order it chooses */
  const lookups: { target: string; answer: ReturnType<typeof deferred<PackState>> }[] = []
  const published: (PackState | null)[] = []
  /** What our downloads told the other surfaces (INVENTORY S7) */
  const announced: [string, PackState][] = []
  const lookup = createPackLookup({
    publish: state => published.push(state),
    state: target => { const answer = deferred<PackState>(); lookups.push({ target, answer }); return answer.promise },
    announce: (target, state) => announced.push([target, state]),
  })
  return { lookup, lookups, published, announced, answer: (at: number, state: PackState) => lookups[at]?.answer.resolve(state) }
}

describe('createPackLookup', () => {
  it('publishes the lookup for the wanted target, and null while nothing is known for it', async () => {
    const h = harness()
    h.lookup.want('cmn')
    expect(h.published).toEqual([null])
    const check = h.lookup.check('cmn')
    h.answer(0, 'available')
    expect(await check).toBe('available')
    expect(h.published).toEqual([null, 'available'])
  })

  it('a lookup for another target than the wanted one answers but publishes nothing', async () => {
    const h = harness()
    h.lookup.want('cmn')
    const check = h.lookup.check('jpn')
    h.answer(0, 'downloadable')
    expect(await check).toBe('downloadable')
    expect(h.published).toEqual([null])
  })

  it('another wanted target forgets the previous state at once, and the previous target lookups in flight', async () => {
    const h = harness()
    h.lookup.want('cmn')
    void h.lookup.check('cmn')
    h.lookup.want('jpn')
    h.lookup.want('jpn')
    expect(h.published).toEqual([null, null])
    h.answer(0, 'available')
    await tick()
    expect(h.published).toEqual([null, null])
  })

  it('an older lookup that answers after a newer one publishes nothing: a download that completed stays available', async () => {
    // The third local pass of S1: while A downloads, a configuration change looks A up; the download ends and its own
    // lookup says available; the earlier lookup then answers downloadable — and must not put the Download button back
    const h = harness()
    h.lookup.want('cmn')
    const run = deferred<void>()
    const download = h.lookup.download('cmn', () => run.promise)
    expect(h.published).toEqual([null, 'downloading'])
    void h.lookup.check('cmn') // the watcher's lookup, answer held
    run.resolve()
    await tick()
    expect(h.lookups.map(l => l.target)).toEqual(['cmn', 'cmn'])
    h.answer(1, 'available')
    await download
    expect(h.published.at(-1)).toBe('available')
    h.answer(0, 'downloadable')
    await tick()
    expect(h.published.at(-1)).toBe('available')
  })

  it('while a download of the target is in flight, a lookup of it publishes nothing', async () => {
    const h = harness()
    h.lookup.want('cmn')
    const run = deferred<void>()
    void h.lookup.download('cmn', () => run.promise)
    const check = h.lookup.check('cmn')
    h.answer(0, 'downloadable')
    expect(await check).toBe('downloadable')
    expect(h.published).toEqual([null, 'downloading'])
  })

  it('runs the download from the call itself, before anything is awaited', () => {
    const h = harness()
    let ran: string | null = null
    void h.lookup.download('cmn', target => { ran = target; return Promise.resolve() })
    expect(ran).toBe('cmn')
  })

  it('a download that ends looks up the target of the moment, not the one downloaded', async () => {
    const h = harness()
    h.lookup.want('cmn')
    const run = deferred<void>()
    const download = h.lookup.download('cmn', () => run.promise)
    h.lookup.want('jpn')
    run.resolve()
    await tick()
    expect(h.lookups.map(l => l.target)).toEqual(['jpn'])
    h.answer(0, 'downloadable')
    await download
    expect(h.published).toEqual([null, 'downloading', null, 'downloadable'])
  })

  it('a download that fails still looks the wanted target up', async () => {
    const h = harness()
    h.lookup.want('cmn')
    const download = h.lookup.download('cmn', () => Promise.reject(new Error('NotAllowedError')))
    await tick()
    h.answer(0, 'downloadable')
    await expect(download).rejects.toThrow('NotAllowedError')
    expect(h.published.at(-1)).toBe('downloadable')
  })

  it('downloads of two targets keep their own markers: A → B → A', async () => {
    const h = harness()
    h.lookup.want('cmn')
    const runA = deferred<void>()
    void h.lookup.download('cmn', () => runA.promise)
    h.lookup.want('jpn')
    const runB = deferred<void>()
    const downloadB = h.lookup.download('jpn', () => runB.promise)
    h.lookup.want('cmn')
    runB.resolve()
    await tick()
    // B's end looks the wanted target up — A, still downloading: nothing publishes
    expect(h.lookups.map(l => l.target)).toEqual(['cmn'])
    h.answer(0, 'downloadable')
    await downloadB
    expect(h.published.at(-1)).toBe(null)
    runA.resolve()
    await tick()
    h.answer(1, 'available')
    await tick()
    expect(h.published.at(-1)).toBe('available')
  })

  // INVENTORY S7: the popup and the settings page each hold a lookup; a download finished in one is announced to the other

  it('a state another surface announced for the wanted target publishes, and outranks a lookup of ours still in flight', async () => {
    const h = harness()
    h.lookup.want('cmn')
    void h.lookup.check('cmn') // answer held
    h.lookup.receive('cmn', 'available')
    expect(h.published).toEqual([null, 'available'])
    h.answer(0, 'downloadable') // older than what was announced: must not put the Download button back
    await tick()
    expect(h.published.at(-1)).toBe('available')
  })

  it('an announcement for another target, or for one this surface is downloading itself, is ignored', async () => {
    const h = harness()
    h.lookup.want('cmn')
    h.lookup.receive('jpn', 'available')
    expect(h.published).toEqual([null])
    const run = deferred<void>()
    const download = h.lookup.download('cmn', () => run.promise)
    h.lookup.receive('cmn', 'available')
    expect(h.published).toEqual([null, 'downloading'])
    run.resolve()
    await tick()
    h.answer(0, 'available')
    await download
    expect(h.published.at(-1)).toBe('available')
  })

  it('a download announces what it found while its target is still the wanted one; a target the reader left behind is not announced', async () => {
    const h = harness()
    h.lookup.want('cmn')
    const run = deferred<void>()
    const download = h.lookup.download('cmn', () => run.promise)
    run.resolve()
    await tick()
    h.answer(0, 'available')
    await download
    expect(h.announced).toEqual([['cmn', 'available']])
    // The reader chose another language while a second download ran: the other surfaces show that language as well
    const again = deferred<void>()
    const second = h.lookup.download('cmn', () => again.promise)
    h.lookup.want('jpn')
    again.resolve()
    await tick()
    expect(h.lookups.map(l => l.target)).toEqual(['cmn', 'jpn'])
    h.answer(1, 'downloadable')
    await second
    expect(h.announced).toEqual([['cmn', 'available']])
    expect(h.published.at(-1)).toBe('downloadable')
  })

})
