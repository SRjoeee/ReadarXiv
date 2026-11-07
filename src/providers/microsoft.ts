// Whether Microsoft's endpoint serves a target language, for the popup and the settings page, which say so before any
// translation (UI.md); the request code is the package's adapter (`@readarxiv/translate` microsoft)
export { supportsTarget } from './targets'
// The old adapter, for the website's Worker (readarxiv-web, @vendor/providers/microsoft) until its cut-over; nothing in the
// extension uses it. See tests/contract/website-imports.test.ts.
export { createMicrosoftProvider } from './compat/microsoft'
