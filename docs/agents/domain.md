# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

This repository keeps its domain language and its decisions in one document, not in a `CONTEXT.md` and a directory of ADRs:

- **`docs/DESIGN.md`**: the current design. **§3 Terms is the glossary**; §4 maps the modules; every other section says what is built, why each non-obvious choice was made, and the measurement beside the decision. Read the sections that touch the area you are about to work in, and cite them by section (`DESIGN §7.2`).
- **`docs/UI.md`**: the interface contract — every control and string of the popup and the settings page by id (`S-P-80`), with its reasons. Read it before touching the interface or any reader-facing wording.
- **`CLAUDE.md`**: the hard rules and the working rules. They outrank a skill's default way of doing things.

The rebuild's one-decision-per-file records were archived from the tree on 2026-09-17 and stay in the history, for when a section's reasoning needs its origin: `git show d91debb:docs/adr/`.

## Layout

Single-context. There is **no `CONTEXT.md`, no `CONTEXT-MAP.md` and no `docs/adr/`**, by decision (2026-09-17: one design document, a decision recorded in the section it belongs to). Do not create them. A skill that would — `/domain-modeling`, reached via `/grill-with-docs` and `/improve-codebase-architecture` — writes here instead:

- a new or sharpened **term** → a row of `docs/DESIGN.md` §3;
- a **decision** → the section of `docs/DESIGN.md` it belongs to, with its reason and its measurement, in the same pull request as the code; an interface decision → `docs/UI.md`, under its id.

If the maintainer asks for a `CONTEXT.md` or an ADR by name, that request wins.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as `docs/DESIGN.md` §3 defines it — block, protected node, placeholder, wire format, render path, …. Don't drift to synonyms the glossary avoids.

If the concept you need isn't there yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (propose the row).

## Flag conflicts with the design

If your output contradicts a section of `docs/DESIGN.md` or a hard rule of `CLAUDE.md`, surface it explicitly rather than silently overriding:

> _Contradicts DESIGN §7.1 (a translation node is only ever the next sibling of its block), but worth reopening because…_
