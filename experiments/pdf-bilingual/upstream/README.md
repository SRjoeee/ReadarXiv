# BusyTeX fixes, as filed upstream

Five problems found in BusyTeX while measuring whether arXiv sources compile in the browser (`../REPORT.md`, third
addendum), filed at TeXlyre/texlyre-busytex-build:

| Issue | Problem | Patch here |
|---|---|---|
| [#33](https://github.com/TeXlyre/texlyre-busytex-build/issues/33) | `\bibliography{refs.bib}` finds no database; the PDF has no bibliography | `patches/A-bibtex8-extension-in-aux.diff` |
| [#34](https://github.com/TeXlyre/texlyre-busytex-build/issues/34) | a main file in a subdirectory is compiled from its own directory, not the package root | `patches/B-workdir-root-option.diff` (a sketch; the experiment runs the hard-wired form in `../busytex/research.diff`) |
| [#35](https://github.com/TeXlyre/texlyre-busytex-build/issues/35) | backend detection reads comments; biblatex's default taken as bibtex8 | `patches/C-texlyre-bibliography-backend.diff` |
| [#36](https://github.com/TeXlyre/texlyre-busytex-build/issues/36) | biber writes `\'e` as a double-encoded combining accent | `patches/D-biber-output-safechars-workaround.diff` (a workaround) |
| [#37](https://github.com/TeXlyre/texlyre-busytex-build/issues/37) | METAFONT-only fonts: no `mktexpk`, and PK lookups skip the remote endpoint | none (build-level) |

`repro/` holds the self-made reproductions (no arXiv content): `r1` for A, `r5` for B, `r2` and `r3` for C, `r4` for D,
`r6` for E. Each was run with TeX Live 2026 natively (all build), with BusyTeX as published (all fail or lose the
bibliography) and with the patches applied (all build; `r6` only with pre-generated fonts).

The code the patches touch comes from busytex/busytex (A, B: unchanged there), whose code is MIT by its README, and from
TeXlyre's build of it, which is AGPL-3.0; a patch offered upstream is under that repository's licence.
