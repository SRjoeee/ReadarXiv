// Lets the event loop turn (issue #234, tests/setup-memory.ts): V8 keeps what a WeakRef was made for — happy-dom makes
// them for its element caches — strongly reachable until it does, so a test that parses paper after paper in one
// synchronous loop holds every one of them until it ends. Awaited between the papers, this lets the last one go
export const turn = (): Promise<void> => new Promise<void>(resolve => setImmediate(resolve))
