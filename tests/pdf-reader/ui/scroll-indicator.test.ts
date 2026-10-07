import { act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ScrollIndicator } from '@/pdf-reader/ui/ScrollIndicator'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'

// A pane's scroll indicator (the reader's design, §6.5): a drag of its thumb ends however the pointer goes

afterEach(() => { document.body.innerHTML = '' })

async function mount() {
  const fake = fakeController()
  const mounted = await mountElement(createElement(ScrollIndicator, { controller: fake.controller, side: 'left' }))
  const track = mounted.container.querySelector<HTMLElement>('.indicator')!
  // the pane: its scroller beside the track, with the sizes a layout would give (happy-dom lays nothing out)
  const scroller = Object.assign(document.createElement('div'), { className: 'viewerContainer' })
  Object.defineProperties(scroller, { scrollHeight: { value: 5000 }, clientHeight: { value: 500 } })
  mounted.container.append(scroller)
  Object.defineProperty(track, 'clientHeight', { value: 400 })
  Object.defineProperty(track.querySelector('i')!, 'offsetHeight', { value: 40 })
  // happy-dom has no pointer capture: stood in for, as the browser's
  track.setPointerCapture = () => undefined
  return { track, scroller }
}
const pointer = (type: string, init: PointerEventInit = {}) => new PointerEvent(type, { bubbles: true, pointerId: 1, clientY: 100, ...init })

describe('ScrollIndicator: the thumb\'s drag', () => {
  for (const end of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    it(`ends on ${end}: the grabbing state goes, and the thumb no longer follows the pointer (Codex on #301)`, async () => {
      const { track, scroller } = await mount()
      const thumb = track.querySelector('i')!
      await act(async () => { thumb.dispatchEvent(pointer('pointerdown')) })
      expect(track.hasAttribute('data-drag')).toBe(true)
      // while it drags, the pane follows the thumb
      track.dispatchEvent(pointer('pointermove', { clientY: 120 }))
      const dragged = scroller.scrollTop
      expect(dragged).toBeGreaterThan(0)
      track.dispatchEvent(pointer(end))
      expect(track.hasAttribute('data-drag')).toBe(false)
      track.dispatchEvent(pointer('pointermove', { clientY: 400 }))
      expect(scroller.scrollTop).toBe(dragged)
    })
  }
})
