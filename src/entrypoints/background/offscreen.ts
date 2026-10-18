// The one offscreen document (DESIGN §15.3, §16): Chrome allows one per extension, and two things use it — the figure
// recogniser and the TeX page's warm-up, which frames the TeX page in it. Whichever needs it first opens it, for both
// reasons; two asking at once open one (a second `createDocument` while one is open throws)

/** `chrome.offscreen`, narrowed to what is used */
export interface OffscreenApi {
  hasDocument(): Promise<boolean>
  createDocument(parameters: { url: string; reasons: string[]; justification: string }): Promise<void>
  closeDocument(): Promise<void>
}

export function createOffscreenDocument(api: OffscreenApi, url: string) {
  let opening: Promise<void> | null = null
  return {
    has: () => api.hasDocument(),
    create: (): Promise<void> => {
      opening ??= (async () => {
        if (await api.hasDocument()) return
        await api.createDocument({
          url,
          reasons: ['WORKERS', 'IFRAME_SCRIPTING'],
          justification: 'Runs text recognition for figure translation in a WebAssembly worker, and downloads ahead the typesetting files the PDF reader uses',
        })
      })().finally(() => { opening = null })
      return opening
    },
    close: () => api.closeDocument(),
  }
}
