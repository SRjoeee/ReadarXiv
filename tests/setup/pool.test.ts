import { describe, expect, it } from 'vitest'
import { availableMemoryMB, workersFor } from '../pool'

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

// Devin on #329: a container's limit (a cgroup) is what the suite may use, not the host's memory `os.totalmem()` reports
describe('availableMemoryMB', () => {
  const host = 48 * GB * 1024 ** 2

  it('is the host\'s memory when nothing constrains the process (0, as macOS and an unlimited container report)', () => {
    expect(availableMemoryMB(host, 0)).toBe(48 * GB)
  })

  it('is the limit when the process is held below the host\'s memory, and the host\'s when the limit is above it', () => {
    expect(availableMemoryMB(host, 8 * GB * 1024 ** 2)).toBe(8 * GB)
    // a cgroup without a limit reports a number past any memory
    expect(availableMemoryMB(host, 2 ** 63)).toBe(48 * GB)
  })

  it('makes a 14-core container of 8 GB on a 48 GB host start two workers, not thirteen', () => {
    expect(workersFor({ cores: 14, totalMemoryMB: availableMemoryMB(host, 8 * GB * 1024 ** 2) })).toBe(2)
    expect(workersFor({ cores: 14, totalMemoryMB: availableMemoryMB(host, 0) })).toBe(13)
  })

  it('reads the running process\'s own limit when none is given', () => {
    expect(availableMemoryMB(host)).toBeGreaterThan(0)
    expect(availableMemoryMB(host)).toBeLessThanOrEqual(48 * GB)
  })
})
