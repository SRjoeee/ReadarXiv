// Where two of the bar's controls go, shared by the bar and by the reading options, which hold them in a narrow window
// (the reader's design, §5): the settings page at its PDF reader section, and the way back to the browser's viewer
import { browser } from 'wxt/browser'

export const settingsUrl = () => (browser.runtime.getURL as (p: string) => string)('/options.html#pdf-reader')
/** the page the reader lies over takes it away (pdf.content.ts) */
export const leaveReader = () => parent.postMessage({ type: 'axt-pdf-reader-close' }, 'https://arxiv.org')
