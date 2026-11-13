// How the repository's browser checks launch Chromium where a page can stand behind another: every persistent context (its
// pages are the tabs of one window, and the extension's own process holds its service worker whatever tab is in front) has
// its launch options made here, and nowhere else, so that the features they turn off are one list
// (tests/e2e/lib/chromium.test.ts holds every launch of tests/e2e and lab to it). A browser whose every page is the one page
// of its own context (`browser.newPage()`, a context a page) needs none of it: each such page is the front tab of its own
// window.

/**
 * The features Playwright turns off (its chromiumSwitches.ts, 1.63). Chromium takes the last --disable-features it is given,
 * so a launch that turns off one more replaces Playwright's whole list, and passes it again: this one.
 */
export const PLAYWRIGHT_OFF = Object.freeze(['AvoidUnnecessaryBeforeUnloadCheckSync', 'DestroyProfileOnBrowserClose', 'DialMediaRouteProvider', 'GlobalMediaControls', 'HttpsUpgrades', 'LensOverlay', 'MediaRouter', 'PaintHolding', 'ThirdPartyStoragePartitioning', 'BlockOriginHeaderModificationOnRedirect', 'Translate', 'AutoDeElevate', 'OptimizationHints', 'msForceBrowserSignIn', 'msEdgeUpdateLaunchServicesPreferredVersion'])

/**
 * And one of Chrome's own: its performance manager's process priority policy. On macOS it gives a renderer none of whose tabs
 * is in front the lowest priority, 4 (darwin background), Playwright's `--disable-renderer-backgrounding` notwithstanding, and a
 * machine busy with other work then gives that process next to no CPU. The checks drive pages while another tab is in front:
 * the reader behind the tab its link opened, the popup beside the PDF page, an arXiv page behind an extension page, the
 * extension's service worker while a web page is in front. Measured 2026-11-13 on Chromium 153 under the load of other jobs
 * (100 to 300 on 14 cores), `ps` and a Chromium trace of every process: the reader's process went from 37 to 4 the moment the tab
 * of its link opened; every thread of it then stood silent 224 s while the browser, which had answered its window.open in
 * 16.7 ms, ran on; the click on the link, its input not acknowledged, timed out at 30 s; brought to the front, the reader
 * acknowledged it 20 ms later. With the policy off every renderer stays at 37 whichever tab is in front: each page the checks
 * drive is given what a reader's Chrome gives the tab they are looking at.
 */
export const CHROME_OFF = Object.freeze(['PMProcessPriorityPolicy'])

/**
 * A launch's options with those features off, its own switches after them. `partitioned`: storage partitioning left on, as a
 * reader's Chrome has it (Playwright turns it off): the reader's checks and the TeX page's probe, where the cache a frame
 * shares is what is checked (tests/e2e/lib/extension.mjs)
 */
export function chromiumOptions(options = {}, { partitioned = false } = {}) {
  const off = [...PLAYWRIGHT_OFF.filter(f => !(partitioned && f === 'ThirdPartyStoragePartitioning')), ...CHROME_OFF]
  const own = options.args ?? []
  const clash = own.find(a => a.startsWith('--disable-features='))
  if (clash) throw new Error(`${clash}: the features a check turns off are tests/e2e/lib/chromium.mjs's list, one list (a second --disable-features replaces it)`)
  return { ...options, args: [`--disable-features=${off.join(',')}`, ...own] }
}
