// What the reader takes from the extension, from the extension's own source (built by spikes/build-shared.mjs, and
// again by every build of the extension that copies the reader in):
// - the message transport the HTML page's session uses (DESIGN §8.0), whose background chain holds the service the
//   reader chose on the settings page, its fallbacks, its cache and its queues, and which of its errors are permanent;
// - the settings themselves, read, written and followed as the popup and the settings page do (shared/surface-config.ts):
//   the target language and the highlight band are the extension's, not the reader's own;
// - the look sheet's variables for the active band (the HTML page's hover highlight, DESIGN §7.5);
// - the language table's BCP 47 tags and its names of each language in itself;
// - where the abstract that goes with every batch is cut;
// - the cache of compiled translations (src/cache/pdf-store.ts), the rule a copy is current by, and the digest.
export { createMessageTransport } from '@/shared/transport'
export { isPermanentErrorKind } from '@/providers/types'
export { createSurfaceConfig } from '@/shared/surface-config'
export { lookOf } from '@/config/appearance'
export { appearanceRule } from '@/core/renderer/style-preset'
export { LANG_CODE_TO_LOCALE_NAME, toBcp47 } from '@/config/languages'
export { ABSTRACT_MAX_CHARS } from '@/core/extractor/context'
export { createPdfStore } from '@/cache/pdf-store'
export { isCurrent } from '@/cache/pdf-record'
export { sha256Hex } from '@/shared/digest'
