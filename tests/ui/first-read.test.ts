import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { answeredBy, FIRST_READ_MS, firstReadTime } from '@/ui/first-read'

// A page gives its first read of the settings 1,500 ms, from the page's start; what has not answered by then is
// painted without (D2: the reader, the popup and the settings page share this one clock and this one answer)
describe('the first read of the settings, bounded', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('is 1,500 ms, one clock for every read the page makes before it paints', async () => {
    expect(FIRST_READ_MS).toBe(1500)
    const time = firstReadTime()
    let over = false
    void time.then(() => { over = true })
    await vi.advanceTimersByTimeAsync(1499)
    expect(over).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(over).toBe(true)
    // a read that comes after the time is over is answered at once: nothing waits twice
    await expect(answeredBy(new Promise<number>(() => {}), time)).resolves.toBeUndefined()
  })

  it('answers with the read when it comes in time, with nothing when it throws or is late', async () => {
    const time = firstReadTime()
    await expect(answeredBy(Promise.resolve(7), time)).resolves.toBe(7)
    await expect(answeredBy(Promise.reject(new Error('the extension context was invalidated')), time)).resolves.toBeUndefined()
    let late!: (n: number) => void
    const slow = new Promise<number>(r => { late = r })
    const answer = answeredBy(slow, time)
    await vi.advanceTimersByTimeAsync(FIRST_READ_MS)
    await expect(answer).resolves.toBeUndefined()
    // its answer after the page painted changes nothing it has said
    late(9)
    await expect(answer).resolves.toBeUndefined()
  })
})
