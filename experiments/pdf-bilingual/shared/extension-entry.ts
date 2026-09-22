// What the reader takes from the extension, from the extension's own source (built by spikes/build-shared.mjs, and
// again by every build of the extension that copies the reader in):
// - the message transport the HTML page's session uses (DESIGN §8.0), whose background chain holds the service the
//   reader chose on the settings page, its fallbacks, its cache and its queues, and which of its errors are permanent;
// - the settings themselves, read, written and watched as the settings page does: the target language and the
//   highlight band are the extension's, not the reader's own;
// - the look sheet's variables for the active band (the HTML page's hover highlight, DESIGN §7.5);
// - the language table's BCP 47 tags and its names of each language in itself;
// - where the abstract that goes with every batch is cut.
export { createMessageTransport } from '@/shared/transport'
export { isPermanentErrorKind } from '@/providers/types'
export { getConfig, setConfig, watchConfig } from '@/config/storage'
export { lookOf } from '@/config/appearance'
export { appearanceRule } from '@/core/renderer/style-preset'
export { LANG_CODE_TO_LOCALE_NAME, toBcp47 } from '@/config/languages'
export { ABSTRACT_MAX_CHARS } from '@/core/extractor/context'
