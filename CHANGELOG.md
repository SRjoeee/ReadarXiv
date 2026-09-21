# Changelog

Reader-facing changes, newest first. The design is `docs/DESIGN.md`.

## 0.4.1 — unreleased

- Opening a paper's PDF on arXiv now offers its bilingual version: straight to the HTML full text, already translating. Where arXiv has no HTML version of a paper, the button says so.
- The extension's popup now works on a paper's abstract and PDF pages as well: the same settings, and a translate button that opens the paper's HTML version and translates it there. Where arXiv has no HTML version of a paper, the button says so instead of being a dead end.
- A floating button on every arXiv page — abstract, PDF and full text — docked to the edge of the window. Click it to translate the page you are on (a green tick shows a translated page; click again for the original), or, from an abstract or a PDF, to open the paper's bilingual version. Point at it for two more buttons: the control panel, which is the extension's popup, and the settings. Drag it to either edge and it stays there, lock it in place, or hide it for now or for good; the settings page, under Reading, brings it back.
- The translation opens in a new tab, so the abstract page or PDF you were reading stays where it is. The settings page has the choice, under Reading, if you would rather it opened in the tab you are on.
- A new installation starts with your language. The target language used to be Simplified Chinese for everyone; it is now taken from your browser's languages when the extension is installed — the first one that is not English, since the papers already are — and stays yours to change on the popup's first screen. Nothing changes for an extension already installed.
- You keep your place. Translating a page you had scrolled into, switching between split, stacked and translation only, and going back to the original each lay the whole paper out again, and the paragraph you were reading used to end up several screens away — every time. It now stays where it was on the screen, translated or not, formulas and figures included.
- The words in every figure are translated, on every system, with nothing to install. Text in a bitmap figure — a plot saved as an image, a screenshot — used to be read only on a Mac, and only after installing a recognition tool from the terminal. It is now read inside the extension, in your browser: the image goes nowhere, and nothing is downloaded to do it. Axis labels set on their side are read the right way up. The extension is larger for it, about 10 MB to download where it was half a megabyte. The recognition tool is no longer used; if you installed it, you can delete `~/Library/Application Support/Readarxiv` and the file `io.github.srjoeee.arxivtranslate.json` in the `NativeMessagingHosts` folder of Chrome's data directory.
- Diagrams drawn in the paper itself (TikZ) keep their look when translated. Their labels are text, and are now translated as text, each in its place in the figure's own lettering and colour; a white box used to be drawn over every one, which washed out a diagram's colour coding and let the English show through. The switch for translating figures still governs them. A change of the rules every translation is made under, so papers read before are translated afresh once.
- Text set wholly in italics, bold or a colour — a theorem's statement, a coloured remark — keeps it in the translation with every translator. With Microsoft's, only short run-in labels did.
- Translated labels on figures look like Safari's: the figure's own colours come through them and the original words no longer show behind the translation, and they sit lighter on the figure, in a softer grey, lifted by a slight shadow.
- Long papers answer sooner. Translating asks for the first screen's text at once instead of after the page has been laid out again: the first translations appear about a third sooner on a paper of several hundred formulas, and a little sooner on any paper. Showing the original again is a little quicker too.
- A page opened already translating now ends in `#readarxiv` rather than `#axt-translate`: the ending stays in the address bar and travels with a link you pass on, so it carries the product's name. Bookmarks and links with the old ending keep working.
- Fixed, in figures: labels that were left in English. Two causes, both ours and neither the recogniser's — these figures are read, not recognised. A figure made by TeX writes no spaces, only gaps, so its title went to the translator as one long glued word and came back unchanged; the gaps are now read as the spaces they are. And a title that merely names an identifier (`train_gpt convergence — minitriton vs torch eager`) was taken for source code and skipped whole; a name mentioned in a sentence is now a sentence.
- Fixed, in split mode and in translation only: an image placed straight in the text rather than in a numbered figure — the large picture many papers put under the abstract — showed its translation on the original's side and none on the translation's, and in translation only none at all. It is now treated as any figure is.
- Fixed, in split mode: a figure of several panels in rows — two above two, say — kept its rows on the original's side and ran them all in one row, each panel a sliver, on the translation's side. Both sides are laid out alike now.
- Fixed, with Microsoft Translator: a numbered heading came back with its first word left in English — a one-word heading not translated at all, the number sometimes moved into the middle — and so did the word a footnote mark or a citation sits on. The blocks this touched are translated afresh rather than taken from the cache.
- Inline code (`\lstinline`) is left as the paper has it. It used to go to the translator as prose and could come back altered — an operator doubled, punctuation made full-width, a keyword translated. This is a change of the rules every translation is made under, so papers read before are translated afresh once.

## 0.4.0 — 2026-09-17

The first release. Numbered 0.4.0 rather than 1.0.0 (the owner, 2026-09-17): the number continues the line of the MVP's tags (`v0.1.0-phase1`, `v0.2.0-phase2`, `v0.3.0-mvp`), and small numbers suit a project that still changes often — fixes go to 0.4.x, features to 0.5.0. Read arXiv translates arXiv's HTML papers in place and keeps them working.

### Reading

- Three modes — split, stacked, translation only — switched at any time; restoring the original is lossless (the page is node for node what it was).
- Formulas, citations, cross-references, code, links, footnotes and tables survive translation; a footnote appears once, in the margin, original above translation; figures split into both columns in side mode.
- Sentence highlight on hover, on both sides at once — every paired block lights up, sentence by sentence where the service reports boundaries and as a whole where it does not; in translation-only mode the original sentence floats beside the translation. In-page links to a hidden original land on its translation.
- Long papers stay smooth: the highlight follows the pointer and translations land without the page pausing — no style rule makes the browser re-examine the whole document any more (a 160 ms pause per sentence on a 60 000-element paper before).
- The translation's appearance is yours: colour, opacity, underline, blur-until-hover, advanced CSS; background highlights likewise; built-ins are ordinary entries you can change or reset.
- Translate from the popup, the toolbar button, the right-click menu, Alt+T, or the **Bilingual version** link on a paper's abstract page.
- Translation follows your reading: paragraphs one to three screens ahead are requested as you scroll, or the whole paper at once if you prefer; a paragraph never scrolled to costs nothing.

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
- Saved settings this version cannot read — written by a newer version, or damaged — are left exactly as they are: the defaults are used, the settings page says why, and nothing overwrites what was saved until you choose to reset it.
- A diagnostics log — request failures, hand-overs, the extension's own trace lines, never page text or a key — can be exported from the settings page to attach to an issue.

### Compatibility

- Chrome 131 or newer (Chrome's built-in translator needs 138; on 131–137 it is simply not offered).
- The macOS helper is installed at `~/Library/Application Support/Readarxiv/helper` and registered as the Native Messaging host `io.github.srjoeee.arxivtranslate`; the install command is stamped with the extension's own version, so the two match.

## 0.3.0-mvp — 2026-09-12

An archive mark, not a release: the MVP as it stood when the rebuild began (`main` is frozen there). Everything above is what the rebuild made of it.
