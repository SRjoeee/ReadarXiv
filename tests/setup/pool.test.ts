import { describe, expect, it } from 'vitest'
import { workersFor } from '../pool'

// Issue #234: how many workers the suite starts, by the memory the machine has (tests/pool.ts, vitest.config.ts)
const GB = 1024

describe('workersFor', () => {
  it('starts one fewer than the cores when the memory allows it, as vitest does', () => {
    expect(workersFor({ cores: 14, totalMemoryMB: 48 * GB })).toBe(13)
    expect(workersFor({ cores: 4, totalMemoryMB: 16 * GB })).toBe(3)
  })

  it('starts fewer when the memory does not: 8 GB is two workers, 4 GB one', () => {
    expect(workersFor({ cores: 8, totalMemoryMB: 8 * GB })).toBe(2)
    expect(workersFor({ cores: 8, totalMemoryMB: 4 * GB })).toBe(1)
  })

  it('never starts fewer than one, on a machine of one core or of no memory to speak of', () => {
    expect(workersFor({ cores: 1, totalMemoryMB: 16 * GB })).toBe(1)
    expect(workersFor({ cores: 2, totalMemoryMB: 1 * GB })).toBe(1)
  })
})
