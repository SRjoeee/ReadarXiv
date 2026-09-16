# Changelog

Reader-facing changes, newest first. The engineering record is `docs/rebuild/PROGRESS.md`; the design is `docs/DESIGN.md`.

## 1.0.0 — unreleased

The first release. Read arXiv translates arXiv's HTML papers in place and keeps them working.

### Reading

- Three modes — side by side, stacked, translation only — switched at any time; restoring the original is lossless (the page is node for node what it was).
- Formulas, citations, cross-references, code, links, footnotes and tables survive translation; a footnote appears once, in the margin, original above translation; figures split into both columns in side mode.
- Sentence highlight on hover, on both sides at once; in translation-only mode the original sentence floats beside the translation. In-page links to a hidden original land on its translation.
- The translation's appearance is yours: colour, opacity, underline, blur-until-hover, advanced CSS; background highlights likewise; built-ins are ordinary entries you can change or reset.
- Translate from the popup, the toolbar button, the right-click menu, Alt+T, or the **Bilingual version** link on a paper's abstract page.

### Services

- Microsoft's web translator by default, needing no account; Google's web translator and Chrome's built-in offline translator as well; any OpenAI-compatible endpoint you add (OpenRouter, DeepSeek, a local Ollama or LM Studio) with its own key and model.
- A failing service — an expired key, a spent quota, a dropped connection — hands the rest of the page to a free one and the popup says so; turn the fallback off to stay with one service.
- Prompts (built-in, copied and edited, imported and exported) and a glossary for the LLM services; a paper's title and abstract go with every request as context.
- 179 target languages; a service that cannot serve the chosen one says so before you start. Interface in English and Chinese.

### Images

- The words inside figures are translated and overlaid in place: vector figures and TikZ pictures without any install, bitmap figures on macOS through a small local helper (Apple Vision) installed with one command from the popup; the popup notices when the install is done.

### Privacy and data

- Paragraphs go to the service you chose; Chrome's built-in translation and a local endpoint keep them on your machine. API keys stay in the browser's extension storage and never enter logs, the cache or the diagnostics export.
- Translations are cached locally (30 days) so a paper reopens at once; the settings page shows the cache and clears it.
- A diagnostics log — request failures, hand-overs, the extension's own trace lines, never page text or a key — can be exported from the settings page to attach to an issue.

### Compatibility

- Chrome 131 or newer (Chrome's built-in translator needs 138; on 131–137 it is simply not offered).
- The macOS helper is installed at `~/Library/Application Support/Readarxiv/helper` and registered as the Native Messaging host `io.github.srjoeee.arxivtranslate`; the install command is stamped with the extension's own version, so the two match.

## 0.3.0-mvp — 2026-09-12

An archive mark, not a release: the MVP as it stood when the rebuild toward 1.0 began (`main` is frozen there; `docs/rebuild/CHARTER.md`). Everything above is what the rebuild made of it.
