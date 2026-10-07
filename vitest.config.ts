import { availableParallelism, totalmem } from 'node:os'
import { configDefaults, defineConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing/vitest-plugin'
import { workersFor } from './tests/pool'

// WxtVitest: in-memory browser extension APIs, auto-imports, the @/ alias
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    // The fixtures link external CSS / scripts; the test environment never loads them and runs no page script
    environmentOptions: {
      happyDOM: {
        settings: {
          disableCSSFileLoading: true,
          disableJavaScriptFileLoading: true,
          disableJavaScriptEvaluation: true,
          handleDisabledFileLoadingAsSuccess: true,
          // A unit test must produce no navigation intent. happy-dom treats `location.hash = …` as a navigation and fetches,
          // so the in-page anchor fallback (issue #44) became a real request to `http://localhost:3000/#tgt` in tests —
          // green by luck locally and on CI, and a crash in a sandbox without network (Codex hit it reviewing #131, issue #132).
          // A real browser sends no request for a same-document fragment jump, so this pulls happy-dom back to real behaviour rather than dodging the test
          navigation: { disableMainFrameNavigation: true },
        },
      },
    },
    include: ['tests/**/*.test.ts'],
    // parked/ (parked/README.md) holds tests that are no longer run
    exclude: [...configDefaults.exclude, 'parked/**'],
    // The fixtures the repository may not hold are downloaded and verified once, before the first test file (tests/fixtures/README.md)
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup.ts', 'tests/setup-memory.ts'],
    // Fixture-level tests walk every element of a 1.8 MB page, up to 6 s per case on a CI machine; the default 5 s would misreport
    testTimeout: 30_000,
    // Memory (issue #234). `pnpm test` used to need a 16 GB machine: the fixture tests parse papers of up to 1.8 MB into
    // happy-dom, and a worker reached 4.2 GB RSS (protector/fixtures.test.ts; renderer/fixtures 3.9, renderer/side-layout
    // 3.7, rules/latexml 3.3) because every paper it had parsed stayed alive until it exited — tests/setup-memory.ts says
    // what held them. With that gone a worker's live set is the one paper in hand, about 1 GB, and the numbers below are
    // measured on this machine (14 cores, 48 GB; node 22, vitest 4.1) with the process tree's RSS sampled every 200 ms:
    //
    //   the heaviest file alone               RSS 1.5–2.5 GB at V8's default heap (it takes what it is given), 1.0–1.1 GB under a 1 GiB cap
    //   the heaviest pair, two workers        2.95 GB in all at a 1.5 GiB cap, 3.3 GB at 2 GiB: 1.4 GB a worker, the runner 0.45 GB
    //   the heaviest four, four workers       6.1 GB in all at 2 GiB
    //   the whole suite, heap 2 GiB           2 workers 125 s, 3.1 GB peak · 3 workers 74 s, 5.2 GB · 4 workers 53 s, 5.5 GB · 6 workers 40 s, 6.4 GB
    //   the whole suite, heap 1.5 GiB         a worker ran out of heap (4 workers): the cap has to stay above the largest live set, not just above the heaviest pair
    //
    // So the heap is capped at 2 GiB — what V8 itself would take on an 8 GB machine, now the same on every machine, and
    // the bound on a worker's RSS (2.15 GB measured at the peak) — and the workers by what the memory holds (tests/pool.ts:
    // 1.5 GB a worker and 0.5 for the runner, out of 60 % of the memory): 2 on an 8 GB machine, 3 on a four-core CI runner,
    // 13 here. `--expose-gc` is tests/setup/memory.test.ts's: it asks whether a parsed paper is really collected
    maxWorkers: workersFor({ cores: availableParallelism(), totalMemoryMB: totalmem() / 1024 ** 2 }),
    execArgv: ['--expose-gc', '--max-old-space-size=2048'],
  },
})
