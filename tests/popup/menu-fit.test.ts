import { describe, expect, it } from 'vitest'
import { fitMenu } from '@/entrypoints/popup/ui/menu-fit'

// A menu the popup holds (the redesign's design, §5.3): the popup grows under one below its row and gives the room back
// as it shuts; the style menu, above the foot, is held to the room above its button
const at = (el: HTMLElement, rect: Partial<DOMRect>) => { el.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...rect }) as DOMRect }
function parts(rootTop: number, trigger: Partial<DOMRect>, tall: number) {
  const root = document.createElement('main'), button = document.createElement('button'), menu = document.createElement('div')
  at(root, { top: rootTop })
  at(button, trigger)
  Object.defineProperty(menu, 'scrollHeight', { configurable: true, value: tall })
  return { root, button, menu }
}

describe('fitMenu (the redesign\'s design, §5.3)', () => {
  it('below its row: the popup grows to hold the menu, 4 px under the row and 8 px to spare, and gives it back', () => {
    const { root, button, menu } = parts(0, { top: 84, bottom: 120 }, 200)
    const done = fitMenu(root, button, menu, false)
    expect(root.style.minHeight).toBe('332px')
    done()
    expect(root.style.minHeight).toBe('')
  })

  it('a menu taller than its cap asks for the cap alone', () => {
    const { root, button, menu } = parts(0, { top: 84, bottom: 120 }, 900)
    // in the document: happy-dom computes no style for a detached element, and the cap would go unread
    document.body.append(menu)
    menu.style.maxHeight = '400px'
    fitMenu(root, button, menu, false)
    expect(root.style.minHeight).toBe('532px')
  })

  it('measures from the popup\'s own top: in the gallery, frames stand down the page', () => {
    const { root, button, menu } = parts(1000, { top: 1084, bottom: 1120 }, 200)
    fitMenu(root, button, menu, false)
    expect(root.style.minHeight).toBe('332px')
  })

  it('above its button: held to the room there, 6 px from the button and 8 from the popup\'s top; the popup untouched', () => {
    const { root, button, menu } = parts(0, { top: 250, bottom: 280 }, 600)
    const done = fitMenu(root, button, menu, true)
    expect([menu.style.maxHeight, root.style.minHeight]).toEqual(['236px', ''])
    done()
    expect(menu.style.maxHeight).toBe('')
  })
})
