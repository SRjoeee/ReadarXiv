// A host's parts for the chrome's tests (parts.tsx): target languages named by their own names, as a host's tables name
// them, and the chrome drawn inside the provider. The extension's own tables are its tests' (tests/pdf-reader/ui/languages.test.ts)
import { createElement, type ReactElement } from 'react'
import { type Languages, PARTS, type Parts, PartsProvider } from '../../src/chrome/parts.tsx'

/** the targets a host offers, by tag, each by its own name; the keywords the search finds them by */
export const NAMES: Readonly<Record<string, string>> = {
  ja: '日本語',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ko: '한국어',
  de: 'Deutsch',
  fr: 'Français',
  ru: 'Русский',
}
const KEYWORDS: Readonly<Record<string, string>> = { de: 'deu german', fr: 'fra french', ja: 'jpn japanese' }

/** a host's languages: a tag its table lacks is named by the tag itself */
export const LANGUAGES: Languages = {
  name: (tag) => NAMES[tag] ?? tag,
  tag: (tag) => tag,
  items: (current) =>
    Object.entries(NAMES).map(([id, name]) => ({ id, name, keywords: KEYWORDS[id] ?? '', selected: id === current })),
}

/** the parts the tests give: the defaults, with the languages above */
export const TEST_PARTS: Parts = { ...PARTS, languages: LANGUAGES }

/** an element drawn under a host's parts */
export const withParts = (element: ReactElement, over: Partial<Parts> = {}) =>
  createElement(PartsProvider, { value: { ...TEST_PARTS, ...over } }, element)
