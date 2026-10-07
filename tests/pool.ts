// How many workers `pnpm test` starts (issue #234, vitest.config.ts): vitest's own answer is one fewer than the cores,
// and a worker on the suite's heaviest files — a paper of 1.8 MB parsed into happy-dom — holds about 1.4 GB, so on a
// machine of 8 GB and eight cores seven of them were more than it has. The measurements are in vitest.config.ts

/** What one worker is planned at: the heaviest pair of files measured 1.4 GB each, 1.5 with the room a collection needs */
const WORKER_MB = 1_500
/** What the run takes besides its workers: vitest's own process and the package manager's, 450 MB measured */
const RUNNER_MB = 500
/** The share of the machine's memory the suite may take; the rest is the system's and the reader's own work */
const SHARE = 0.6

export function workersFor({ cores, totalMemoryMB }: { cores: number; totalMemoryMB: number }): number {
  const byMemory = Math.floor((totalMemoryMB * SHARE - RUNNER_MB) / WORKER_MB)
  return Math.max(1, Math.min(cores - 1, byMemory))
}
