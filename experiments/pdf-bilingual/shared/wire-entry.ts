// The chain's wire grammar, from the extension's own source (built by spikes/build-shared.mjs): an engine's answer is
// read here as the background reads it before it caches a translation, placeholders and their ids alike (Devin on #296).
// Pure, so that the Node spikes load it as the reader does.
export { fromAlpha, TAG_RE, toAlpha } from '@/core/protector/tokens'
