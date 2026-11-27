// The way back, one capsule (BackCapsule.tsx, UI.md S-R-29; link previews' §3.7): at the reader's foot while a jump can be gone
// back from, the same words whatever the depth, a press one jump back; side by side, at the document area's centre, moved with
// it by the contents; with one pane shown, the first segment of that pane's page pill, which stays shown while it is
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, createElement, Fragment } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { R, setLocale } from '@readarxiv/ui'
import { BackCapsule } from '../../src/chrome/BackCapsule.tsx'
import { PagePill } from '../../src/chrome/PagePill.tsx'
import { mountElement } from '../render-hook.ts'
import { fakeController } from './fake-controller.ts'
import { withParts } from './parts.ts'

beforeAll(() => setLocale('zh-CN'))
afterEach(() => {
  document.body.innerHTML = ''
})

const SIDES = { left: { page: 2, pages: 9 }, right: { page: 2, pages: 9 } }
const mount = (over = {}) => {
  const fake = fakeController({ sides: SIDES, ...over })
  const controller = fake.controller
  return mountElement(
    withParts(
      createElement(
        Fragment,
        null,
        createElement(BackCapsule, { controller }),
        createElement(PagePill, { controller, side: 'left' }),
        createElement(PagePill, { controller, side: 'right' }),
      ),
    ),
  ).then((m) => ({ ...m, ...fake }))
}
const capsules = (c: HTMLElement) => c.querySelectorAll<HTMLButtonElement>('button.back')
const SHEET = readFileSync(join(__dirname, '../../src/chrome/reader.css'), 'utf8')

describe('the back capsule', () => {
  it('no capsule while there is no jump to go back from', async () => {
    const m = await mount({ back: false })
    expect(capsules(m.container)).toHaveLength(0)
  })

  it('one capsule while there is, its words its name, the same at any depth; a press goes back one', async () => {
    const m = await mount({ back: true })
    const all = capsules(m.container)
    expect(all).toHaveLength(1)
    const b = all[0] as HTMLButtonElement
    expect(b.textContent).toBe(R.back)
    expect(b.getAttribute('aria-label')).toBeNull()
    expect(b.closest('.back-slot')).not.toBeNull()
    await act(async () => b.click())
    expect(m.controller.back).toHaveBeenCalledOnce()
  })

  it('leaves with its own motion, then is gone', async () => {
    const m = await mount({ back: true })
    await act(async () => m.set({ back: false }))
    expect(capsules(m.container)[0]?.hasAttribute('data-out')).toBe(true)
    await act(async () => new Promise((r) => setTimeout(r, 200)))
    expect(capsules(m.container)).toHaveLength(0)
  })

  it('one pane shown (narrow): the capsule is the shown pill’s first segment, and the pill stays shown', async () => {
    const m = await mount({ back: true, narrow: true })
    const all = capsules(m.container)
    expect(all).toHaveLength(1)
    const pill = all[0]?.closest('.pill') as HTMLElement
    expect(pill).not.toBeNull()
    expect(pill.firstElementChild).toBe(all[0])
    expect(pill.hasAttribute('data-held')).toBe(true)
    expect(pill.querySelector('input')?.getAttribute('aria-label')).toBe(R.pill.translation)
    expect(m.container.querySelector('.back-slot')).toBeNull()
  })

  it('the original alone shown: joined to the original’s pill', async () => {
    const m = await mount({ back: true, display: 'original' })
    const pill = capsules(m.container)[0]?.closest('.pill') as HTMLElement
    expect(pill.querySelector('input')?.getAttribute('aria-label')).toBe(R.pill.original)
  })

  it('the contents open move it with the document area; its dress the pills’, at the foot, 16 px up', () => {
    expect(SHEET).toMatch(/html\[data-axt-contents\] \.back-slot \{ left: var\(--push\); \}/)
    expect(SHEET).toMatch(/\.back-slot \{[^}]*inset: auto 0 16px 0;/)
    expect(SHEET).toMatch(/\.back \{[^}]*height: 30px;[^}]*font-size: 12px;[^}]*font-weight: 500;/)
    expect(SHEET).toMatch(/\.pill\[data-held\] \{ opacity: 1; pointer-events: auto; \}/)
  })

  it('moves by opacity alone under reduced motion', () => {
    expect(SHEET).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*\.back[^}]*\}/)
  })
})
