// Moved whole into the engine package (packages/engine/src/source/arg-roles.mjs); this path re-exports it, through the
// package's transition entry, for what still imports it here, until the cut-over deletes the path.
export { LATEXML_COMMIT, ROLES, paramsOf, bindingsOf, loads, commandParams, paperOf, fallbackDefinition, overriddenFallback, inOwnCall, paperParams, environmentParams, FRONT_ROLES, groupEnd, readArgs, textArgsOf, textless } from '@readarxiv/engine/today'
