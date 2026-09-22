// What the reader takes from the extension to translate, from the extension's own source: the message transport the
// HTML page's session uses (DESIGN §8.0), whose background chain holds the engine the reader chose on the settings page,
// its fallbacks, its cache and its queues; which of its errors are permanent; the target language's BCP 47 tag; and
// where the abstract that goes with every batch is cut.
// Built by spikes/build-shared.mjs.
export { createMessageTransport } from '@/shared/transport'
export { isPermanentErrorKind } from '@/providers/types'
export { toBcp47 } from '@/config/languages'
export { ABSTRACT_MAX_CHARS } from '@/core/extractor/context'
