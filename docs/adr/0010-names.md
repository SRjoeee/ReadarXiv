# ADR-0010: One internal name, and the names that stay by contract

- Status: accepted (2026-09-17); implemented in the same PR (`package.json`, `Package.swift`, the module renames below).
- Evidence: `docs/rebuild/INVENTORY.md` §4.6 ("Five spellings of the name") and §5 D; the owner's decision of 2026-09-17 (internal name `readarxiv`); ADR-0001 §6 (external contracts); `docs/UI.md` S-P-01 (the display name).

## Context

The project began as "arXiv HTML Translator" (`arxiv-html-translator` in `package.json`, the phrase in file headers), was named **Read arXiv** for readers on 2026-09-10 (two words, arXiv in its official casing), lives in the repository `SRjoeee/ReadarXiv`, installs its helper under `~/Library/Application Support/Readarxiv/helper`, registers the Native Messaging host `io.github.srjoeee.arxivtranslate`, and prefixes everything it writes with `axt-`. Five spellings, each with a reason at the time and none written down as the rule, so every sweep of the code had to ask which ones were mistakes.

Some of them are contracts. The host name is in every installed reader's manifest file and in the extension's `connectNative` call. The install directory is where those readers' helper sources and binary live and where `register.sh` points. The prefix is on every class, attribute and CSS variable the extension injects, on the message types, the storage keys and the helper binary (`axt-helper`). The prompts export is written as `arxiv-translate_prompts.json`, and readers may hold such files. Renaming any of these means a migration for people who never asked for one, for no benefit a reader can see (charter §3: contracts with external users get explicit handling, not a quiet change).

## Decisions

1. **The internal name is `readarxiv`.** It is the `package.json` name and the word used when the project has to be named in an identifier, a directory, a document or a test. The old spellings — `ArxivTranslate`, `arxiv-html-translator`, `arXiv HTML Translator` — remain only in history (PROGRESS entries, commit messages) and in the contracts of decision 3.
2. **The display name is `Read arXiv`** (manifest, interface, README, store text) and **the repository is `ReadarXiv`** (URLs, the installer's `INSTALLER_REPO`). Neither changes.
3. **The names that stay, by contract.** Kept as they are, with the reason beside each so that nobody "fixes" them:

   | Name | Where | Why it stays |
   |---|---|---|
   | `io.github.srjoeee.arxivtranslate` | the Native Messaging host: `helper/register.sh`, every installed reader's manifest file, `HELPER_HOST` in the background | written into readers' profiles; a new name needs a re-install on every Mac |
   | `~/Library/Application Support/Readarxiv/helper` | `helper/install-remote.sh`, `helper/README*.md` | where installed readers' helper lives and where their manifests point (INVENTORY §5 D, ADR-0001 §6) |
   | `axt-`, `data-axt-`, `--axt-`, `axt:`; `axt-helper` | every injected class, attribute and CSS variable; message types; storage keys; the helper binary | the product's namespace on the page and on disk (hard rule 5); short on purpose, and changing it touches every reader's cache and storage |
   | `arxiv-translate_prompts.json` | `PROMPT_FILE_NAME`: the prompts export | readers may hold exported files; the import does not depend on the file name, so the constant stays only so that a reader's files and a fresh export look alike |

4. **Same-named modules.** A file name may repeat across directories when the directory is the qualifier and the concern is the same at two layers: `shared/ocr.ts` and `background/ocr.ts`, `shared/diagnostics.ts` and `background/diagnostics.ts`, `providers/transport.ts` and `shared/transport.ts`, `core/strings.ts` and `ui/strings.ts`, `pipeline/run.ts` and `image/run.ts` (the two pipelines). It may not repeat for different concerns; those four were renamed on 2026-09-17, each after reading the pair:

   | Was | Is | Concern |
   |---|---|---|
   | `core/pipeline/sentences.ts` | `core/pipeline/cuts.ts` | which blocks get their sentences cut, and where (`cutsOf`) |
   | `core/renderer/sentences.ts` | `core/renderer/sentence-map.ts` | the registry of sentence maps on both sides (`registerSentences`, `sentenceMapOf`, the mirrors) |
   | `core/protector/text.ts` | `core/protector/escape.ts` | escaping and unescaping by wire format |
   | `core/svg/runs.ts` | `core/svg/code.ts` | which runs of a figure are source code (`looksLikeCode`) |

   What they stood beside keeps its name: `core/sentences/` (the splitter), `core/text.ts` (the text walker), `core/protector/runs.ts` (the runs path).

## Consequences

- `package.json`'s name reaches nothing but the build's archive name; no workflow or script consumed the old one (checked 2026-09-17). `version` is set by the release checkpoint (C), `description` here is the developer-facing sentence — the store text is the owner's.
- The tests of the renamed modules are renamed with them (`tests/pipeline/cuts.test.ts`, `tests/renderer/sentence-map.test.ts`); ADR-0007 and INVENTORY cite the new paths, PROGRESS's earlier entries keep the paths of their day.
- A future name collision is judged by decision 4 before the file is created, not swept up later.
