import { describe, expect, it } from 'vitest'
import { keepOverlays, pinned } from '@/pdf-reader/engine/overlay.mjs'

describe('pinned: an overlay that scales with its page (the reader\'s design, §10.1)', () => {
  const box = { left: 12, top: 30.5, width: 100, height: 20 }

  it('keeps the box in the pixels it was drawn at', () => {
    expect(pinned(box, 1.5)).toMatchObject({ left: '12px', top: '30.5px', width: '100px', height: '20px' })
  })

  it('scales about the page\'s origin, by the page\'s scale over the one it was drawn at', () => {
    expect(pinned(box, 1.5)).toMatchObject({ transformOrigin: '-12px -30.5px', scale: 'calc(var(--total-scale-factor) / 1.5)' })
  })
})

const settle = () => new Promise(resolve => setTimeout(resolve, 0))
function pageWith(...classes: string[]) {
  const page = document.createElement('div')
  for (const c of classes) page.append(Object.assign(document.createElement('div'), { className: c }))
  document.body.append(page)
  return page
}

describe('keepOverlays: what PDF.js removes from a page it draws again is put back (§10.2)', () => {
  it('puts back an overlay removed by anyone else, and leaves PDF.js\'s own layers removed', async () => {
    const page = pageWith('canvasWrapper', 'axt-fig', 'axt-hl-layer'), keeper = keepOverlays('.axt-fig, .axt-hl-layer')
    keeper.observe(page)
    for (let i = page.childNodes.length - 1; i >= 0; i--) page.childNodes[i]!.remove() // PDFPageView.reset()
    await settle()
    expect([...page.children].map(c => c.className).sort()).toEqual(['axt-fig', 'axt-hl-layer'])
    keeper.disconnect()
  })

  it('leaves removed an overlay the reader drops', async () => {
    const page = pageWith('axt-fig'), keeper = keepOverlays('.axt-fig')
    keeper.observe(page)
    keeper.drop(page.firstElementChild as Element)
    await settle()
    expect(page.children.length).toBe(0)
    keeper.disconnect()
  })

  it('puts back nothing once disconnected: a viewer being torn down', async () => {
    const page = pageWith('axt-fig'), keeper = keepOverlays('.axt-fig')
    keeper.observe(page)
    keeper.disconnect()
    page.firstElementChild?.remove()
    await settle()
    expect(page.children.length).toBe(0)
  })

  it('does not double an overlay put back by someone else first', async () => {
    const page = pageWith('axt-fig'), keeper = keepOverlays('.axt-fig'), fig = page.firstElementChild as Element
    keeper.observe(page)
    fig.remove()
    page.append(fig)
    await settle()
    expect(page.querySelectorAll('.axt-fig').length).toBe(1)
    keeper.disconnect()
  })
})
