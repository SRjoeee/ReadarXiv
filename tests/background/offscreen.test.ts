// The one offscreen document (src/entrypoints/background/offscreen.ts): Chrome allows one per extension, and both the
// figure recogniser and the TeX page's warm-up use it — whichever asks first opens it, for both reasons, and two asking
// at once open one
import { describe, expect, it, vi } from 'vitest'
import { createOffscreenDocument } from '@/entrypoints/background/offscreen'

function api(open = false) {
  return {
    hasDocument: vi.fn(async () => open),
    createDocument: vi.fn(async (_: { url: string; reasons: string[]; justification: string }) => { await new Promise(r => setTimeout(r, 0)); open = true }),
    closeDocument: vi.fn(async () => { open = false }),
  }
}

describe('createOffscreenDocument', () => {
  it('opens the document once for two clients asking at once, with the reasons of both', async () => {
    const a = api()
    const doc = createOffscreenDocument(a, 'chrome-extension://x/ocr.html')
    await Promise.all([doc.create(), doc.create()])
    expect(a.createDocument).toHaveBeenCalledTimes(1)
    expect(a.createDocument.mock.calls[0]?.[0]).toMatchObject({ url: 'chrome-extension://x/ocr.html', reasons: ['WORKERS', 'IFRAME_SCRIPTING'] })
  })

  it('a document already open is used as it is', async () => {
    const a = api(true)
    const doc = createOffscreenDocument(a, 'chrome-extension://x/ocr.html')
    await doc.create()
    expect(a.createDocument).not.toHaveBeenCalled()
    await expect(doc.has()).resolves.toBe(true)
    await doc.close()
    await expect(doc.has()).resolves.toBe(false)
  })
})
