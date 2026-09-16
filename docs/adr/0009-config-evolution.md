# ADR-0009: The version number says what is stored

- Status: accepted (2026-09-16); implemented in the same PR (`CONFIG_VERSION` 13 → 14).
- Evidence: `docs/rebuild/INVENTORY.md` P6; `docs/rebuild/inventory/runtime.md` §2d (the version table) and D29; `src/config/schema.ts`, `src/config/storage.ts`, `src/config/services.ts` as of 4ebd4b6. (the `inventory/*` reports were deleted on 2026-09-17; read them at `git show c0c044d:docs/rebuild/inventory/<name>.md`)

## Context

The configuration lives in `chrome.storage.local` under `config`, read through WXT's `storage.defineItem` with `version: CONFIG_VERSION` and a chain of migration functions (`storage.ts`), then validated with the zod schema (`schema.ts`); a value that fails validation falls back to the defaults, visibly, naming the field (DESIGN.md, decided 2026-09-06). Two mechanisms evolved the stored shape side by side:

- **Versioned migrations.** A new field or a changed value bumps `CONFIG_VERSION` and gets a function from the previous version; WXT runs the chain on read. Thirteen versions so far. v10 changed nothing but the number, so that an older build meeting a value it cannot read reports `tooNew` instead of resetting the reader's settings (Codex on #115).
- **Schema defaults.** Nine fields of `configSchema` carried `.default()`, so a stored value missing them passed validation and received the default. `reading` (db38c5d, 2026-09-09) was added this way alone — no bump, no migration; the other eight had a default *and* a migration writing the same value. `serviceSchema.thinking` carried a default one level down, though nothing legitimately stored lacks the field — the v11 → v12 migration writes `openaiCompat.thinking ?? 'disabled'` and the settings drawer writes it on every service — so that default only ever masked a hand edit.

What that cost:

1. **The number no longer said what is stored.** A `version: 13` value may or may not hold `reading`. Everything that reads storage — the fallback notice, the next migration, a debugger — has to know which fields might be missing, and the migration functions' parameter types, which spell out each version's shape, were no longer true.
2. **The downgrade guard did not fire.** `version > CONFIG_VERSION` is what tells an older build to leave storage alone. A field added by default alone does not raise the number, so an older build reads the value, zod strips the key it does not know, the next write drops the reader's setting, and the upgrade after that finds the default. With a bump the older build reports `tooNew` and writes nothing.
3. **Two places to look** when a field is added, and no rule saying which; every review had to ask.

What the defaults bought: a value missing one field after a hand edit recovered that field instead of falling back whole. The case is rare, the fallback is by decision visible and names the field, and partial recovery of hand-edited storage was never promised.

Considered and not taken:

- *Defaults instead of versions.* Impossible: migrations transform values (BCP-47 → ISO 639-3 at v4, the single endpoint → `services[]` at v12), and the downgrade guard needs the number.
- *Both, under a written rule.* Every addition bumps anyway, so the default is then dead code — and dead code with a behaviour (masking a missing field) is worse than none.
- *`.strict()` on the object.* A newer value under an older build is already caught by the version guard before zod runs; an extra key from a hand edit is not worth a whole fallback.

## Decisions

1. **One mechanism.** The stored shape changes only through `CONFIG_VERSION` and a migration. `configSchema` and the schemas it embeds (`serviceSchema`, `appearanceSchema`) carry no `.default()`; a field is exactly as present as the version says. Normalising a *value* at read time — an unknown `uiLanguage` code falling back to `auto` — is not shape and stays where it is.
2. **v14 catches up.** The field that came in by default alone (`reading`) is written by the 13 → 14 migration — a value migrated to 13 and never saved since has none — so every v14 value holds every field. Only an absent field is written; `null` or another wrong value is a hand edit and fails validation, named. Nothing else moves; a v13 value with the field migrates to the same value at 14, and a service without `thinking` is not repaired — no legitimate value lacks it.
3. **The test says so.** `tests/config/storage.test.ts` walks the shapes of the three schemas and fails on any zod default; a v13 fixture without `reading` climbs to 14 with the rest untouched; a v13 service without `thinking` falls back, naming the field; a value missing a field fails validation rather than being completed quietly.
4. **Adding a field from now on:** bump `CONFIG_VERSION`; a migration that writes the value every existing reader had in effect; a test with the previous version's fixture; `DEFAULT_CONFIG` for the first install. The v10 precedent stands: a change an older build cannot read bumps even when no field moves.

## Consequences

- A value missing a field falls back whole, as one with a wrong field does today, and the notice names the field. Whoever edits storage by hand edits a complete value.
- `Config`'s TypeScript type is unchanged (zod's output type was already required); its input type now equals the output type, which is what every caller passed.
- A migration function's parameter type can again be a true description of the version it came from; the 13 → 14 one is. The older ones lean on `Omit<Config, …>` and inherit fields added later — a habit this decision does not rewrite retroactively (Copilot on #209).
- `runtime.md` §2d and D29 describe the state before this decision and stay as the record; INVENTORY P6 closes on this ADR.
