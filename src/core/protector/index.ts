// The placeholder engine (DESIGN §6): serialize → translate (a unit of the chain, units.ts) → validate → rehydrate.
export { VOID_DENSE_THRESHOLD, serialize, staleSlot, type ProtectedBlock } from './serialize'
export { PlaceholderIntegrityError, expectationsFromText, validate, type IntegrityReason, type PlaceholderExpectations, type ValidationResult } from './validate'
export { rehydrate } from './rehydrate'
export { fromAlpha, toAlpha, tokenize, writeVoid, type Token, type WireFormat } from './tokens'
export { decodeText, escapeText, unescapeText } from './escape'
export { MARKER_RE, TAG_RE } from './tokens'
export { indexSpans, nodeOffsetAt, rangesOf, scanTokens, spanAt, wholeRanges, wireOffsetAt, type PositionedToken, type SpanIndex, type WireSpan } from './offsets'
