// The reader's render scheduler (stack/scheduler.ts): a job no longer wanted at its turn is dropped unrun, and told so, so that
// its owner lets go of it (#688's review, Codex 4710771362: a detail cut dropped so, its ownership kept, was never asked again).
import { describe, expect, it } from 'vitest'
import { createScheduler, type Job } from '../src/stack/scheduler.ts'

describe('the scheduler', () => {
  it('drops a job no longer wanted at its turn, unrun, and tells it', async () => {
    const s = createScheduler()
    let release: () => void = () => {}
    const first: Job = { rank: () => 0, order: () => 0, run: () => new Promise<void>((r) => (release = r)) }
    let wanted = true,
      ran = 0,
      dropped = 0
    const second: Job = {
      rank: () => (wanted ? 1 : null),
      order: () => 1,
      run: async () => void ran++,
      dropped: () => void dropped++,
    }
    s.want(first)
    s.want(second)
    await new Promise((r) => setTimeout(r, 0))
    wanted = false
    release()
    await s.idle()
    expect([ran, dropped]).toEqual([0, 1])
  })
})
