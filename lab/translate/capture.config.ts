// The capture run (capture-setup.ts): today's reader tests of the PDF wire and of the HTML page's protector, run as they are,
// with the readers' entry points recorded. AXT_CAPTURE names the JSONL file the records go to. Offline: no global setup
// (the fixtures on disk are what the protector's fixture tests read)
import { defineConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing/vitest-plugin'

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    root: new URL('../..', import.meta.url).pathname,
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true, handleDisabledFileLoadingAsSuccess: true, navigation: { disableMainFrameNavigation: true } } } },
    include: [
      'tests/pdf-reader/mt.test.ts',
      'tests/pdf-reader/mt-wire.test.ts',
      'tests/pdf-reader/mt-runs.test.ts',
      'tests/pdf-reader/display-stop.test.ts',
      'tests/pdf-reader/identity-pairs.test.ts',
      'tests/pdf-reader/sentences-tags.test.ts',
      'tests/protector/markers.test.ts',
      'tests/protector/validate.test.ts',
      'tests/protector/rehydrate.test.ts',
      'tests/protector/label.test.ts',
      'tests/protector/fixtures.test.ts',
      'tests/protector/fixtures-markers.test.ts',
    ],
    setupFiles: ['tests/setup.ts', 'lab/translate/capture-setup.ts'],
    testTimeout: 120_000,
    maxWorkers: 2,
    execArgv: ['--max-old-space-size=2048'],
  },
})
