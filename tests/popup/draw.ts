// The popup drawn from a fixture, as the gallery draws it, every action a spy (tests/popup/view.test.ts, find-view.test.ts)
import { createElement } from 'react'
import { type Mock, vi } from 'vitest'
import type { PopupActions } from '@/entrypoints/popup/data'
import { POPUP_FIXTURES } from '@/entrypoints/popup/fixtures'
import { PopupView } from '@/entrypoints/popup/PopupView'
import { derivePopupView } from '@/entrypoints/popup/view-model'
import type { PopupInput } from '@/entrypoints/popup/view-model'
import { mountElement } from '../ui/render-hook'

const ACTIONS = ['translate', 'openHtml', 'openPdf', 'readerTranslate', 'readerOriginal', 'retranslate', 'restore', 'chooseMode', 'retryFailed', 'openMenu', 'closeMenu', 'chooseService', 'chooseLanguage', 'choosePrompt', 'chooseStyle', 'setHighlight', 'setImages', 'downloadPack', 'openOptions', 'setQuery', 'openLink'] as const satisfies readonly (keyof PopupActions)[]

export const fixture = (id: string) => POPUP_FIXTURES.find(f => f.id === id)!

/** The popup drawn straight from an input, for a state no fixture names — an override on one's, as view-model.test.ts makes one inline */
export async function drawInput(input: PopupInput, error: string | null = null) {
  const actions = Object.fromEntries(ACTIONS.map(name => [name, vi.fn()])) as Record<(typeof ACTIONS)[number], Mock>
  const mounted = await mountElement(createElement(PopupView, { view: derivePopupView(input), error, actions: actions as unknown as PopupActions }))
  return { ...mounted, actions, main: mounted.container.querySelector('main')! }
}

export async function draw(id: string) {
  const f = fixture(id)
  return drawInput(f.input, f.error ?? null)
}

/** A button's name as assistive technology reads it here: its label, or its words */
export const nameOf = (button: Element) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''

/** A segment's words: its visible span, not the hidden one that holds its title (Part 3's Segmented) */
export const wordsOf = (segment: Element) => segment.querySelector('span:not([hidden])')?.textContent ?? ''
