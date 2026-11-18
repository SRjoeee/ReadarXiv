// `@readarxiv/ui/languages`: the interface's languages and the pick of one (the visitor's choice where it is one of them, else
// the first of the browser's languages near one, else English), with no pack and no control, so that a host's own pages around
// the reader, which may not load the packs, show the interface in the language the reader will (the package's tests hold it
// so: tests/host-entries.test.ts). The packs, their names and the rest of the catalogue are the package's entry's.
export { LOCALE_CODES, type LocaleCode, pickLocale } from './locales/codes.ts'
