// Moved whole into the engine package (packages/engine/src/source/arg-roles.mjs); this path re-exports it through its transition
// path for what still imports it here. The cut-over deletes the path and the package's transition exports.
export { LATEXML_COMMIT, ROLES, paramsOf, bindingsOf, loads, commandParams, paperOf, fallbackDefinition, overriddenFallback, inOwnCall, paperParams, environmentParams, FRONT_ROLES, groupEnd, readArgs, textArgsOf, textless } from '@readarxiv/engine/today/source/arg-roles.mjs'
