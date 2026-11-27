// The extension gives the reader its history (PDF-READER §11.9 "The way back"; the lead's ruling on the framed probe,
// 2026-11-27): in its own tab and in its frame over arXiv's PDF page alike, the reader's entries under the page's history; and
// the reader's ordinary way out of the frame first steps back over them, so that none lingers in arXiv's page's history
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HistoryEntry } from '@readarxiv/reader'
import { leaveReader } from '@/pdf-reader/host/links'
import { readerHistory } from '@/pdf-reader/host/history'

const entry = (n: number): HistoryEntry => ({ v: 1, n, place: { page: n + 1, at: 0.25, side: 'right' }, light: null })

afterEach(() => {
  history.replaceState(null, '')
  vi.restoreAllMocks()
})

describe('the extension\'s history for the reader', () => {
  it('is the page\'s own, one for the page, wherever the reader runs (its own tab, its frame)', () => {
    const h = readerHistory()
    expect(readerHistory()).toBe(h)
    h.mark(entry(0))
    h.push(entry(1))
    expect(history.state).toEqual({ axt: entry(1) })
    expect(h.current()).toEqual(entry(1))
  })

  it('the way out of the frame steps back over the reader\'s entries before it asks arXiv\'s page to take the frame away', async () => {
    const h = readerHistory()
    h.mark(entry(0))
    h.push(entry(1))
    h.push(entry(2))
    const order: string[] = []
    window.addEventListener('popstate', () => order.push(`landed ${(history.state as { axt?: HistoryEntry } | null)?.axt?.n}`), { once: true })
    vi.spyOn(window.parent, 'postMessage').mockImplementation(((m: unknown) => void order.push(`close ${(m as { type: string }).type}`)) as never)
    await leaveReader()
    expect(order).toEqual(['landed 0', 'close axt-pdf-reader-close'])
  })

  it('with no entry of the reader\'s, closes at once', async () => {
    const posted = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {})
    await leaveReader()
    expect(posted).toHaveBeenCalledWith({ type: 'axt-pdf-reader-close' }, 'https://arxiv.org')
  })
})
