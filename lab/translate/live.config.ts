// The dump of the HTML fixtures' blocks for stage 4b's live run (html-blocks.lab.ts): happy-dom, the extension's aliases, offline
import { defineConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing/vitest-plugin'

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    root: new URL('../..', import.meta.url).pathname,
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true, handleDisabledFileLoadingAsSuccess: true, navigation: { disableMainFrameNavigation: true } } } },
    include: ['lab/translate/html-blocks.lab.ts', 'lab/translate/slips.lab.ts', 'lab/translate/cuts.lab.ts', 'lab/translate/replies.lab.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 600_000,
    execArgv: ['--max-old-space-size=4096'],
  },
})
