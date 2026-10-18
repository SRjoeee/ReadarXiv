// The engine's rules entry (Node and browser): the layout rule set and its reader, the font roles and the script a target is written in.
// Re-exports only: the directory is the contract (docs/PDF-READER.md, the engine's contract), tests/pdf-reader/engine-contract.json its snapshot.

export { BUILTIN_RULES, RULES_CAP, RULES_FIELDS, RULES_SCHEMA, RULES_VALUES, RULE_SET, RulesRefusal, SCRIPTS, TARGETS, parseRules, readRules, resolveRules, writeRules } from './rules/layout.mjs'
export { ENGLISH_FAMILIES, FACES, canDraw, canDrawIn, classifyFont, faceFor, familyOfFonts, familyOfProbe, rolesFor } from './rules/font-roles.mjs'
export { scriptOf } from './rules/script.mjs'
