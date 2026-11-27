// The previews' words (docs/UI.md S-R-30 to S-R-33): from the string catalogue (`@readarxiv/ui`) in the interface's language, read
// at each use, as the reader's other words are (compose/words.ts).
import { R } from '@readarxiv/ui'
import type { PreviewWords } from './previews.ts'

export const previewWords = (): PreviewWords => ({
  go: R.preview.go,
  search: R.preview.search,
  keep: (label) => R.preview.keep(label),
  close: (label) => R.preview.close(label),
})
