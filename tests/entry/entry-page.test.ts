import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { answerEntryMessages, type EntryPage } from '@/shared/entry-page'

// What an abstract or PDF page answers the popup (§4.0b, UI.md S-P-03b)

let assign: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fakeBrowser.reset()
  // `reset()` clears the fake's state but keeps the listeners registered by earlier tests, and two answers to one
  // message is exactly what this file must not confuse itself with
  fakeBrowser.runtime.onMessage.removeAllListeners()
  // A second `spyOn` of the same method hands back the first spy, calls and all, so the history is cleared explicitly
  vi.restoreAllMocks()
  assign = vi.spyOn(globalThis.location, 'assign').mockImplementation(() => undefined)
})

/**
 * Deliver a message the way the runtime does, and hand back what the page answered.
 *
 * The fake types `trigger` as returning `void | Promise<any>`; what a listener returned is exactly what this file
 * has to see, since a listener that answers asynchronously **must** return `true` or the sender gets `undefined`
 * (the class of defect #228 closed). Hence one narrowing of the fake's own signature, here and nowhere else.
 */
type Trigger = (message: unknown, sender: unknown, sendResponse: (reply: unknown) => void) => Promise<unknown[]>

async function ask(type: string): Promise<{ reply: unknown; answered: boolean; keptChannelOpen: boolean }> {
  let reply: unknown
  let answered = false
  const trigger = fakeBrowser.runtime.onMessage.trigger as unknown as Trigger
  const kept = await trigger({ type }, {}, (r: unknown) => { reply = r; answered = true })
  await Promise.resolve()
  return { reply, answered, keptChannelOpen: (Array.isArray(kept) ? kept : [kept]).some(k => k === true) }
}

/** an abstract page's answers, unless a test says otherwise */
const page = (over: Partial<EntryPage>): EntryPage => ({ kind: 'abs', paper: () => '2501.07202', html: () => null, pdf: () => null, readerOpen: () => false, ...over })

describe('answerEntryMessages', () => {
  it('answers what paper this is and where its HTML version is', async () => {
    answerEntryMessages(page({ paper: () => '2501.07202v1', html: () => 'https://arxiv.org/html/2501.07202v1#readarxiv' }))
    const { reply, keptChannelOpen } = await ask('axt:entry-status')
    expect(reply).toEqual({ paper: '2501.07202v1', html: 'https://arxiv.org/html/2501.07202v1#readarxiv', kind: 'abs', pdf: null, readerOpen: false })
    // The channel is held open for the asynchronous reply, or the popup receives undefined
    expect(keptChannelOpen).toBe(true)
  })

  it('says a paper has no HTML version rather than staying silent: the popup needs the difference', async () => {
    answerEntryMessages(page({ paper: () => 'hep-th/9711200' }))
    const { reply } = await ask('axt:entry-status')
    expect(reply).toEqual({ paper: 'hep-th/9711200', html: null, kind: 'abs', pdf: null, readerOpen: false })
  })

  it('stays silent where the path is not a paper, so the popup shows its “not an arXiv page” screen', async () => {
    answerEntryMessages(page({ paper: () => null }))
    const { answered, keptChannelOpen } = await ask('axt:entry-status')
    expect(answered).toBe(false)
    expect(keptChannelOpen).toBe(false)
  })

  it('opens the HTML version itself, so no permission is needed to navigate the tab', async () => {
    answerEntryMessages(page({ html: () => 'https://arxiv.org/html/2501.07202#readarxiv' }))
    const { reply } = await ask('axt:open-html')
    expect(assign).toHaveBeenCalledWith('https://arxiv.org/html/2501.07202#readarxiv')
    expect(reply).toEqual({ opened: true })
  })

  it('opens nothing when there is nothing to open, and says so', async () => {
    answerEntryMessages(page({ paper: () => 'hep-th/9711200' }))
    const { reply } = await ask('axt:open-html')
    expect(assign).not.toHaveBeenCalled()
    expect(reply).toEqual({ opened: false })
  })

  it('says which page it is, where the PDF entry leads, and whether the reader is open, read as it answers (the reader\'s design, §2, §9.2)', async () => {
    let open = false
    answerEntryMessages(page({ kind: 'pdf', pdf: () => 'https://arxiv.org/pdf/2501.07202#readarxiv', readerOpen: () => open }))
    expect((await ask('axt:entry-status')).reply).toMatchObject({ kind: 'pdf', pdf: 'https://arxiv.org/pdf/2501.07202#readarxiv', readerOpen: false })
    open = true
    expect((await ask('axt:entry-status')).reply).toMatchObject({ readerOpen: true })
  })

  it('leaves every other message to whoever it belongs to', async () => {
    answerEntryMessages(page({ html: () => 'https://arxiv.org/html/2501.07202' }))
    const { answered, keptChannelOpen } = await ask('axt:page-status')
    expect(answered).toBe(false)
    expect(keptChannelOpen).toBe(false)
  })
})
