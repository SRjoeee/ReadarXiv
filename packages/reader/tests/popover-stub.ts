// A copy of the extension's tests/pdf-reader/ui/popover-stub.ts, for the chrome's tests: the popover API as the reader uses
// it, for happy-dom, which has none: showPopover / hidePopover, the open state as an attribute the tests read, and the toggle
// event a light dismiss sends. The extension's tests keep theirs: a package's tests import nothing of the extension
import { vi } from 'vitest'

export function stubPopovers() {
  const proto = HTMLElement.prototype as HTMLElement & Record<string, unknown>
  const saved = { show: proto.showPopover, hide: proto.hidePopover }
  const fire = (el: HTMLElement, open: boolean) =>
    el.dispatchEvent(
      Object.assign(new Event('toggle'), { newState: open ? 'open' : 'closed', oldState: open ? 'closed' : 'open' }),
    )
  proto.showPopover = vi.fn(function (this: HTMLElement) {
    if (!this.hasAttribute('data-open')) {
      this.setAttribute('data-open', '')
      fire(this, true)
    }
  })
  proto.hidePopover = vi.fn(function (this: HTMLElement) {
    if (this.hasAttribute('data-open')) {
      this.removeAttribute('data-open')
      fire(this, false)
    }
  })
  return () => {
    proto.showPopover = saved.show
    proto.hidePopover = saved.hide
  }
}
export const isOpen = (el: Element | null) => !!el?.hasAttribute('data-open')
