// A component mounted in a real React root over happy-dom, for what a control shows. The extension's tests keep their own
// (tests/ui/render-hook.ts, with its hook mounting): a package's tests import nothing of the extension
import { act, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export interface MountedElement {
  container: HTMLElement
  /** Render another element into the same root and settle */
  rerender(element: ReactElement): Promise<void>
  flush(): Promise<void>
  unmount(): Promise<void>
}

export async function mountElement(element: ReactElement): Promise<MountedElement> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const flush = async () => {
    await act(async () => {
      await tick()
    })
  }
  await act(async () => {
    root.render(element)
  })
  await flush()
  return {
    container,
    rerender: async (next) => {
      await act(async () => {
        root.render(next)
      })
      await flush()
    },
    flush,
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}
