# UI contract — copy, states and tokens

The single basis for the interface implementation; a change to the interface starts here. The design canvas that preceded it is not in the repository.
Numbering: `P` popup states, `O` the options page, `I` in-page components; copy ids are `S-<surface>-<number>`. Cite the ids directly in feedback.

Status: **implemented** — the copy of §3, the tokens of §5 and the language of §6 are in `src/ui/strings.ts`, `src/locales/` and `src/shared/tokens.ts` (§5); the [open] marks of §1, §2, §3 and §5 dated from the drafting and were changed to [implemented] on 2026-09-13; the popup, the settings page and the controls on arXiv's pages were redrawn on 2026-09-27 (the redesign: `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md`). Settled sections are marked [decided]. "The redesign's §n" names a section of that design; a bare §n is this document's.

---

## 1. Tone rules [implemented; marked 2026-09-13]

1. **Speak to the user, not about the system's insides.** No provider, engine chain, fallback, block, session, background, fixture and the like; every internal concept takes the user word of §2.
2. **Buttons are verb phrases, 3–5 characters.** 翻译本页, 显示原文, 重试, 连接, 下载, 清空. Never “确定” or “OK”, words that say nothing about the consequence.
3. **States are nouns or adjectives, 2–4 characters.** 就绪, 翻译中, 已暂停, 需要设置.
4. **An error says three things only: what happened, what it affects, what you can do.** No error codes, no guessing at causes, no apologies. The error code and the raw message go into the hover `title` for diagnosis.
5. **A number appears only where the user can act on it.** “2 段没翻出来 · 重试” is fine; “已翻 24 / 已触发 31（共 120）” is not.
6. **One sentence, ≤ 30 characters.** What does not fit becomes explanatory text on the options page; the popup explains no mechanism.
7. **No pleasantries and no modal particles**: 请, 哦, 一下, 吧, 啦. No exclamation marks. A single sentence takes no final full stop; two or more sentences do.
8. **One word per concept across the whole product**, see §2.
9. **A space between Chinese and Latin text**; product names, model names and “API Key” keep their original casing.
10. **Full-width punctuation**; the ellipsis is the single character “…”, the separator “·”.

## 2. Terminology [implemented; marked 2026-09-13]

| Internal word (code / DESIGN.md) | What the user sees | Notes |
|---|---|---|
| provider / engine | **翻译服务** (shortened to “服务” where the context is clear) | All three reference products say “翻译服务” |
| `openai-compat` | **LLM**; each service of one's own by its name | The pack's word since 2026-09-10: the service menu's slot (S-P-46), the notes (S-P-32a), the settings page's group (S-O-60). The draft said “AI 模型” (users recognise “AI”, not “LLM” or “OpenAI-compatible”): §9's first item |
| `google-web` | **Google 翻译** | |
| `chrome-builtin` | **Chrome 翻译** | The pack's word since 2026-09-10 (the draft said Chrome 离线翻译); its hint says 浏览器内置，无需联网 (S-P-43) |
| fallback / demoted | **已改用 ×××** | Described as an action, no coined noun |
| block / segment | **段落** | Tables and equation blocks are “段落” to the user too |
| translate page | **翻译本页** | |
| restore | **显示原文** | Pairs with “翻译本页”; “恢复” implies something went wrong |
| mode: stack / side / only | **上下对照 / 左右对照 / 仅译文** (in the segmented control simply 上下 / 左右 / 仅译文) | |
| targetLanguage | **目标语言** | The pack's word since 2026-09-10 (the draft said 翻译为, “译成” reading bookish) |
| language pack | **语言包** | The pack's word since 2026-09-10 (the draft said 离线语言包): 需要先下载语言包, 语言包下载中 (S-O-11, S-P-41) |
| prompt | **提示词** | The common word among AI users |
| glossary | **术语表** | |
| cache | **已缓存的译文** | Never “缓存” on its own |
| `preload` (`'on-demand' \| 'whole'`, v20) | **翻译方式**: **按需翻译** / **整篇翻译** | The one-to-three-screen steps and the later starts went with v20 (the redesign's §4, §11: R2, R3, 2026-09-26); on demand is the old default, 1 000 px ahead and a threshold of 0 |
| thinking | **深度思考** | The common name in Chinese AI products |
| baseURL | **接口地址** | |
| apiKey | **API Key** | Kept in English; it is what the user sees at the vendor |
| model | **模型** | |
| test connection | **连接** | = verify one sentence, then save: a service is added or re-keyed only once it connects (the redesign's §6.3, §11) |
| the service health record (`local:serviceHealth`) | **API Key 已失效** | A key the service answered 401; cleared by a connection that succeeds, a new key or address, or the service's deletion (DESIGN §9). S-P-32e, S-P-45, S-O-21a |
| retry failed | **重试** | |
| fatal / stopped | **已暂停** | Part of the translation is still on the page, so “paused”, not “failed” |
| image translation / overlay | **图片翻译**; the overlay has no name | §15; figure text shows in every display since v20 |
| `theme` (v20) | **外观**: 跟随系统 / 浅色 / 深色 | One setting for the whole extension since v20, the reader's before (`pdfReader.appearance`); set on the settings page's 外观 (S-O-35) and in the reader's reading options (S-R-08) |
| reading typography (#47) | **排版** | Kept apart from “译文样式” (decoration): typography covers font size, line height, width, spacing |
| split view (#83) | **分栏** | Experimental |
| hosted free LLM (#97) | **免费 AI 翻译** | Candidate; alongside the reader's own LLM services (own key) |
| `microsoft` (#98, implemented) | **Microsoft 翻译** | Free; chosen by hand only, never in the automatic fallback list (DESIGN §8.5). Links and formulas survive; what is lost is inline styling such as italics (a leading label is restored, #150) |
| `reading.sentenceHighlight` (#105 / #141) | **对照高亮** | The sentence under the pointer lights up; in translation-only mode, dwelling brings the original up |

## 3. Copy tables [implemented; marked 2026-09-13]

### 3.1 Popup

Revised 2026-09-10 in review (see §4 for the states). Copy is the product's register: nouns for
states, verbs for buttons, no spoken phrases (去填 / 去修 are out), every note that can be acted on gets a real button.
Redrawn 2026-09-27 (the redesign's §5, §10.1).

| Id | Where / when | Copy | Notes |
|---|---|---|---|
| S-P-01 | Brand row | Read arXiv | [decided; 2026-09-11 set as two words, upheld on the 09-12 re-check] **The reader sees the name with a space**, arXiv in its official casing. The repository (`SRjoeee/ReadarXiv`) and the domain (readarxiv.org) can only use the unspaced form, **which is no basis for the display name** — two spellings of one product; never change this row after the repository name (on 2026-09-12 that nearly happened). The roadmap #155's “the product becomes Readarxiv” speaks of that identity, not of this string. The extension manifest `name`, the three pages' `<title>` and the toolbar tooltip all follow this row; the store name is pending. The brand mark is in §5.1 |
| S-P-02 | Gear in the brand row (its name and tooltip); a note's button | 设置 | Opens the settings page (`openOptionsPage`, which brings a tab already open to the front). A note the settings can answer carries it (S-P-30…35); the failure note carries 重试 instead (S-P-61), and the no-HTML notes none (S-P-33a, S-P-33b) |
| S-P-03 | Not a paper's page (P0) | 打开 arXiv 论文（HTML 或 PDF）即可翻译 | The sentence over P0's search field (S-P-04…08). An arXiv page still loading is not P0 (S-P-03d). Everything P0 opens, it opens in a new tab whatever S-O-49b says — that setting is about leaving a paper's page, and the page under this popup is not one — and the popup closes once it has; pasting never navigates by itself (the redesign's §5.4) |
| S-P-03b | Abstract or PDF page (P17) | (the entry pages' popup) | **The popup works on every arXiv page the reader may be on** (the maintainer, 2026-09-18). The entry pages show 翻译服务, 目标语言 (and 提示词) and S-P-50b's two entries only — the display, the two switches and the style belong to a translated page (the redesign's §5.5). An entry that cannot act is **disabled**, not hidden, so a reader is told the answer rather than left with a control that does nothing: with no HTML version, HTML 翻译 is disabled with S-P-33a below it beside a PDF entry that works, or with S-P-33b when neither can be had. A service that cannot run speaks first (S-P-31 / S-P-32) and, with nothing to take over, disables both. No shortcut label: ⌥T acts on a translated page, and this is not one. The translation opens where S-O-49b says, a new tab by default, and the popup closes with it |
| S-P-03c | A PDF page with the reader open (PR) | (the popup, acting on the reader) | The PDF reader's design, §9.2: the popup acts on the reader through the settings alone, which the reader follows. The group is the ordinary one; the language menu holds the nine languages the reader typesets. 上下 is greyed with S-P-75, and a stored 上下 shows as 左右 chosen, what the reader shows — pressed, it stays 上下 for the HTML page, as the reader's own switch keeps it (`withDisplay`). 译文样式 stays in the foot, greyed (`aria-disabled`, no menu, and no tooltip: a technical reason is only greyed, never explained; the maintainer, 2026-09-28), styles doing nothing on a typeset PDF. The display and the two switches stay, and the reader follows them. The button is 翻译本页 (brand) while the reader shows the original and 显示原文 (neutral) while it shows a translation (`pdfReader.original`), greyed without words when the reader has to hold the original (no source, or a language it does not typeset); no shortcut label. A service's note as elsewhere; the HTML version's is not this page's matter |
| S-P-03d | An arXiv paper's page still loading (PL) | 页面加载中 | A line under the brand row, and no field: the view model tells a paper's page still asked (its content script comes at `document_idle`) from P0. Before the first answer about the tab (PW), the brand row alone |
| S-P-04 | P0's field | 按标题、作者、摘要或链接搜索论文 | Its placeholder and its name. What it takes is decided as it is typed, and nothing happens until Enter (an Enter that ends an input method's composition is the method's): an arXiv PDF or HTML address (S-P-07); an abstract address, a bare id (`2501.07202`, `2501.07202v1`, `arXiv:2501.07202`, `hep-th/9901001`) or an arXiv DOI — the paper's two entries (S-P-50b), greyed as P17's are by the same two checks, which run once per id after 300 ms of stillness, the entries appearing when both have answered; words (S-P-06); a link elsewhere (S-P-08). It takes the focus as P0 opens — P0's one purpose (kept, the maintainer, 2026-09-28) — and what it understood is said in a hidden polite status (`role="status"`), one short line: a paper's entries and their note stay out of it; an address row greyed (S-P-07) is said with its reason, the note's words after a ` · ` — the row is what the field's Enter acts on, and the echo must not promise it (Codex on #306) |
| S-P-05 | Under the empty field | 按回车搜索 · 高级搜索 | 高级搜索 links to arXiv's advanced search (`arxiv.org/search/advanced`) |
| S-P-06 | Words typed (P0a) | 在 arXiv 搜索「{q}」 | A neutral row (`group-hover`), a search icon leading, the ↵ label in `ink` trailing; Enter opens `arxiv.org/search/?query={q}&searchtype=all&source=header` in a new tab. The popup lists no results |
| S-P-07 | An arXiv PDF or HTML address (P0b, P0c) | PDF 翻译 · arXiv {id} / HTML 翻译 · arXiv {id} | S-P-50b's words and `S.find.paper`: one brand row, `file-text` or `globe` leading, the ↵ label on `brand-chip` trailing; Enter opens that page with `#readarxiv`. The id at 400 after the words at 500, 85 % white in light, white in dark (`on-brand-2`; the redesign's §5.4). The same `arXiv {id}`, after a book, heads P0d–P0f's line over the paper's two entries. Where this browser cannot run the PDF reader (`src/pdf-reader/support.ts`), a PDF address is the paper it names instead: its line, and its two entries once checked, the PDF one greyed as P0's checks grey it there and as P17's is — never a row that would leave the PDF in the browser's own viewer without a word (`find.ts offeredQuery`; Codex on #306). The row is gated as those entries are (`canStart`, A-I1): with no service able to run and none to take over, it is greyed as a greyed entry is — the large button's fill, its words `ink-3`, still in the tab order, no ↵ label —, a click and Enter open nothing, and the service's reason stands under it with 设置, as P17b's and P0's entries say it; with a service to take over it opens (Codex on #306) |
| S-P-08 | A link elsewhere (P0g) | 只能打开 arXiv 的论文链接。也可以输入标题或作者搜索。 | A line with the information icon under the field; Enter does nothing |
| S-P-10 | Service row label | 翻译服务 | The row opens the service menu (S-P-40…48) under itself |
| S-P-11 | Service row value | {模型名 / 服务名} | A service of one's own shows its name (the model's by default, `deepseek-v4-flash`), the others theirs; while replaced (S-P-30) the service in use, then the one put aside struck through in the value's `ink-2` (`ink-3` read under 4.5:1; Task 101). A value cut short shows whole in its tooltip |
| S-P-20 | Language row label | 目标语言 | The row opens the language menu. What a new reader finds here follows the browser's languages, chosen once at install (DESIGN §9): the first preferred language that is not English, else the browser interface's language if that is not English, else Simplified Chinese; a language the table cannot give in the script asked for is passed over |
| S-P-21 | Language row value | {语言名} | `languages.ts` label |
| S-P-22 | Language menu search box | 搜索语言 | Matches the Chinese name, the local name, the English name and the code. The list under it is five rows and a half, the half saying there is more, and scrolls in a box of its own: the field stays in view as the list brings the chosen language or the active one into view. The settings page's list is the same (S-O-23); the PDF reader's nine languages are not capped |
| S-P-23 | Language menu, no results | 没有匹配的语言 | |
| S-P-30 | Note · switched | {原服务}：{原因}。本页已改用 {新服务} | A permanent hand-over restarts the whole page on the new service (DESIGN §8.5); reason per S-E. The information tone, with 设置 |
| S-P-31 | Note · will switch | {为何不能用}，本次将使用 {服务} | Idle, the chosen service cannot run, another takes over. The information tone, with 设置 |
| S-P-32 | Note · cannot translate | {为何不能用} | Idle with nothing to take over, or the page left behind by a choice that cannot run (P13). The alert tone, with 设置 |
| S-P-32a | {为何不能用} · LLM | LLM 尚未配置 API Key | A service stored with no key keeps these words; one whose key the service refused says S-P-32e instead |
| S-P-32b | {为何不能用} · Chrome | Chrome 翻译的语言包尚未下载 / Chrome 翻译的语言包下载中，约需 1 分钟 | Reachable from the options page only: the popup's item is greyed |
| S-P-32c | {为何不能用} · Microsoft | Microsoft 翻译不支持当前目标语言 | |
| S-P-32d | {为何不能用} · the chosen service deleted | 选中的翻译服务已被删除，请重新选择 | The chosen id names no service: a popup left open while another tab deleted it. It cannot run — saying it could would have the reader believe their LLM translates while a built-in one does (Codex on #157) |
| S-P-32e | {为何不能用} · a refused key | API Key 已失效 | The service health record (DESIGN §9): a service whose key the service answered 401 counts as one that cannot run, and P7 / P8 follow as for any other (P7b, P8b); the chain passes over it as the note says; a connection from the settings page clears it (S-O-21a) |
| S-P-33 | Note · paused | {原因}。请检查设置后重新翻译 | Reason per S-E. The alert tone, with 设置 |
| S-P-33a | Note · no HTML version, the PDF entry offered | arXiv 没有这篇论文的 HTML 版本 | S-P-33b without its last clause where PDF 翻译 is offered beside it, which does translate (Part 5's final review): the information tone and no settings button (in P0, a line with the information icon). A service that cannot run speaks first on these pages (S-P-31 / S-P-32), and under P0's paper when nothing takes over (S-P-32): it is why both entries are greyed |
| S-P-33b | Note · no HTML version, nothing to translate | arXiv 没有这篇论文的 HTML 版本，无法翻译 | Numbered S-P-33 until 2026-09-28, beside the paused note, which keeps S-P-33. On an entry page (S-P-03b) and P0's paper when neither entry can be had: the alert tone and no settings button, since nothing in the settings changes what arXiv converted. The floating button says it too (S-I-06) |
| S-P-35 | Note · image translation paused | 图片翻译已暂停：{原因} | `images.fatal`; shown while text translation continues. The alert tone, with 设置 |
| S-P-40 | Service menu · Chrome item action | 下载 | A neutral button in the item while `downloadable` (the redesign's §5.3); the item is greyed until the pack is there; the click itself starts the download (user gesture) |
| S-P-41 | Service menu · Chrome item subtitle · downloading | 语言包下载中 | Spinner in place of the button; no progress events, so no bar |
| S-P-42 | Service menu · Chrome item subtitle · unavailable | 当前不可用 | `unavailable` / `unsupported`, greyed, no button |
| S-P-43 | Service menu · Chrome item subtitle · ready | 浏览器内置，无需联网 | |
| S-P-44 | Service menu · Microsoft / Google subtitle | 免费 | Microsoft with an unsupported target: 不支持当前目标语言, greyed |
| S-P-45 | Service menu · LLM subtitle | {模型名} / 尚未配置 API Key / API Key 已失效 | An item of two lines, the name and its hint (the redesign's §5.3). Selectable without a key and with a refused one; the note S-P-31 / S-P-32 and its 设置 button follow |
| S-P-46 | Service menu · names and order | Microsoft 翻译 · Google 翻译 · LLM · Chrome 翻译 | [decided] 2026-09-10; Microsoft is the shipped default |
| S-P-47 | Prompt row | 提示词 / {名称} | Only while the LLM is chosen; opens the prompt menu, which ends with S-P-49. A built-in prompt is named by the pack in the interface's language (默认 · 精准改写, S-O-61c), one's own as stored |
| S-P-48 | Service menu · last row | 管理翻译服务… | Not a service: opens the settings page at `options.html#translate/services` (S-O-06), in a tab of its own (`openOptionsPage` passes no hash); in the floating button's panel the popup closes after it. The reader's service menu ends with it too |
| S-P-49 | Prompt menu · last row | 管理提示词… | As S-P-48, at `options.html#translate/prompts`: every menu whose list the reader can change ends with its 「管理…」 row, the language menu has none (the redesign's §5.3) |
| S-P-50 | Primary button · not translated | 翻译本页 | The brand's fill (§5's red) with `on-brand` words, 15 px / 600 on a button 44 px tall, radius 10 (round 7's F; the maintainer, 2026-09-28); its shortcut label, 12 px, on `brand-chip` (the redesign's §5.1), on a neutral face in `ink` (Task 101). The label is the key Chrome reports for `axt-toggle` (suggested Alt+T). **On every enabled face of the button** (2026-09-11): the key translates an untranslated page and restores a translated one, so 显示原文 carries it too; a paused session's, a page behind its settings' and the retranslate cue's 重新翻译 is what the key does there (P9, P13, P6b). Chrome reports nothing when another extension — or another copy of this one — already holds the combination, and then no label is drawn |
| S-P-50b | The two entries · abstract or PDF page (P17) | HTML 翻译 · PDF 翻译 | **In the primary button's place, side by side** (the PDF reader's design, §2): the HTML version or the bilingual PDF, the reader's to choose (the maintainer: 「在PDF入口和HTML入口中自选——我们不替用户做决定」), in as few words as stay clear (the maintainer, 2026-09-25). Brand buttons with icons, equal widths — HTML 翻译 with Lucide `globe`, PDF 翻译 with `file-text` — the one that cannot be used greyed (the redesign's §5.5); also P0's entries for a paper it names (P0d–P0f). HTML 翻译 is disabled with S-P-33a or S-P-33b when arXiv has no HTML version; PDF 翻译 is disabled **without words** when the paper cannot be had as a bilingual PDF (a PDF-only submission, or a browser the reader cannot run on). Both are disabled when no service can run and none takes over, S-P-32 and 设置 saying why — under P0's paper too, in the place of S-P-33a / S-P-33b (the final review of Part 7). Each opens where S-O-49b says (P0's in a new tab, S-P-03); the PDF entry opens the paper's PDF with `#readarxiv`, the reader translating. Replaces 双语版本 |
| S-P-51 | Primary button · translating | 显示原文 | The only sign that the page is on: no pill. A neutral button (`fill`), carrying the same shortcut label as S-P-50, in `ink` |
| S-P-52 | Primary button · paused, a page behind its settings, the retranslate cue | 重新翻译 | P9, P13 and P6b: 重新翻译 (brand) and 显示原文 (S-P-53, neutral) side by side, equal widths, the brand first (the redesign's §5.2); the shortcut label only on the brand one — in P6b too, where the key, the context menu and the floating button retranslate as the button does (`src/shared/page-action.ts`, `keyMadeGood`). Disabled while the saved service cannot run (P13): neutral grey, without a shortcut. English: Retranslate, one word — Translate again with its label ran past its half of the pair at the large buttons' 15 px / 600 (Part 7's final review; `popup-align.mjs` checks every button's content against its box) |
| S-P-53 | The pair's second button | 显示原文 | Beside S-P-52: the neutral one (`fill`), of equal width, with no shortcut label |
| S-P-60 | Failure note | {n} 处翻译失败 | A note in the alert tone (§4), its button S-P-61. Paragraphs and figures counted together; only when `progress.failed + images.failed > 0` and nothing is fatal |
| S-P-61 | Failure note's button | 重试 | |
| S-P-70 | Mode segments | 左右 · 上下 · 仅译文 | `title` S-P-71/72/73. A fitted segmented control (`.seg.fit`), the thumb following the chosen segment, with the reader's family of icons. Since 2026-09-11 **左右 comes first**: on a wide screen it is the main way to read, so it takes first place; `MODE_ORDER` (`src/ui/strings.ts`) is the single source of that order. **A fresh install defaults to 左右 as well** (owner, 2026-09-11): on a wide screen it is the main way to read, and in a narrow window the page falls back to 上下 by itself (S-P-74) |
| S-P-71 | Mode `title` · 上下 | 译文紧跟在原文下方 | |
| S-P-72 | Mode `title` · 左右 | 原文与译文并排；窗口较窄时按上下显示 | |
| S-P-73 | Mode `title` · 仅译文 | 隐藏原文，参考文献仍保留双语 | |
| S-P-74 | Remark under the mode bar · narrow window | 窗口较窄，暂按上下显示 | Only when 左右 is chosen and the page shows 上下 |
| S-P-75 | Mode bar · 上下 greyed, the reader open | PDF 对照不支持上下排列 | The segment's title (S-P-03c): a layout the reader can see it does not offer, not a technical reason |
| S-P-80 | Hover highlight switch, in the foot | 对照高亮 | A switch with its words, its whole row its label (`reading.sentenceHighlight`); saved at once, live on the page; its colours are the settings page's (S-O-49) |
| S-P-81 | Hover highlight `title` | 悬停时高亮对应句子；仅译文模式下停留可查看原文 | |
| S-P-82 | Translation style · the foot's trailing button | 译文样式 | [decided, 2026-09-11, the reader's final word] The foot is 对照高亮 · 图片翻译 · 译文样式 side by side — all three are "how this reads". The entry is its words and a chevron, the chosen style in its tooltip; the **preview is inside the menu**: its rows are one line a style, its name leading and the sample sentence (`PREVIEW_TARGET`, `src/locales/preview.ts`) trailing, drawn in that style — 淡一档 and 模糊 mean nothing as names. The list is `appearance.styles`, in the settings page's order, under the same name it has there. **The menu opens upward**: the foot is the popup's last row. The page's config watcher redraws in the new style, so nothing restarts. Where there is no style to choose — the reader (S-P-03c), the settings not read yet — the same button in the same place, greyed, so that the foot is the same on every page (the maintainer, 2026-09-28) |
| S-P-83 | Translation style menu · last row | 管理译文样式… | [decided, 2026-09-11, proposed by the reader] The same role as the service menu's 管理翻译服务…: the menu's last row is not a style but the way in to managing them, so it carries no preview and takes no part in selection. It opens `options.html#appearance/styles` (the settings page's 外观, S-O-06), in a tab of its own; the entries without a row (the gear at the top right, the 设置 in a note) still use `openOptionsPage`, which brings the tab already open to the front |
| S-P-85 | Image translation switch, in the foot | 图片翻译 | A switch with its words (`image.enabled`, v11); saved at once, live on the page; figure text shows in every display since v20 |
| S-P-90 | Action failed | {原始信息} · 设置读取失败，更改未保存，请到设置页处理 | A line under the primary (in P0, under the field's row): the alert icon in `danger`, the words `ink`; said politely (`role="status"`), not an alert (ruling 14); cleared before the next action. The second wording is for a change the store refused because the saved settings cannot be read (DESIGN §9): the popup's own write, or the mode's save on the page |

Removed 2026-09-10: the state pills (S-P-12…18) and the config-fallback note (S-P-34; the options page announces it).

Retired 2026-09-27 (the redesign): S-P-03's old sentence (P0 finds a paper now, S-P-03…08).

### 3.2 Options page

Rebuilt 2026-09-27 (the redesign's §6, §10.2): four sections behind a sidebar with a search;
every control writes as it changes; forms and editors open in place, under the row that opened them.

| Id | Where | Copy | Notes |
|---|---|---|---|
| S-O-01 | Sidebar · sections | 翻译 · 外观 · 阅读 · 数据 | Lucide `languages`, `palette`, `book-open`, `database`; the current one a raised row, the others `ink-2`; the hash keeps the place (`#<section>`, S-O-06); `#services`, `#prompts`, `#pdf-reader` lead to their new places. The sidebar (232 px) and the column (up to 680 px) are one group, centred on a window wider than the two (the maintainer, 2026-09-28); below 640 px the sidebar folds above the column, the sections wrapping into a row |
| S-O-02 | Settings could not be read | 设置读取失败，当前使用默认设置；已保存的 API Key 与服务选择均未生效。原设置保留未动，重置后可重新填写。 · 重置设置 → 确认重置 · 重置没有成功，请再试一次 | Drawn as a card at the top of the main column, the reason under it, its reset the confirm pattern of S-O-72; while it shows only 数据 is drawn (the interface language neither), and the search finds only what is drawn: the other sections would show the defaults as if they were the reader's, and nothing they save is accepted — what is stored is never written over except by this reset (DESIGN §9). The popup carries no notice of its own; a change made there is answered by S-P-90 |
| S-O-03 | Sidebar · the page's name, the search | 设置 · 搜索设置 · 清空搜索 | Rows filtered by their label, their description and a few keywords of their own (`O.search.keywords`), which carry their group's name — 翻译服务, LLM, 译文样式 — so that the heading a reader sees finds the rows under it (Part 7's final review); each section's matches under its name, the matched words on `mark`, in `ink` (a description's `ink-2` there read under 4.5:1; Task 101); no current section meanwhile; Escape clears. While a search runs, the interface language has a row of its own (S-O-05), a deletion's undo row (S-O-21) is never filtered out: it is the only way back, and a row found keeps what it opens — a list, a form, a sub-row — shown with it, so that a list opened from a result shows its rows (Part 7's final review) |
| S-O-04 | Search · the count / nothing found | 找到 {n} 项设置 / 没有与「{q}」匹配的设置 | The count a polite status; nothing found carries 清空搜索 |
| S-O-05 | Sidebar's foot · interface language | 界面语言 · Interface language / 跟随浏览器 · 也在左下角 / 也在右上角 | [decided, 2026-09-11] Away from the target language: the two are two different things (§6). A globe on the icons' edge, the value, a chevron; its name (界面语言 · Interface language) the control's and its menu's; a menu opening upward, each language in its own name (`lang`); 「Interface language」 added where the interface's word is not English. Below 640 px the same control sits at the end of the title row (设置 … 🌐 value ▾), its menu opening downward (the maintainer, 2026-09-28). The row only a search shows (label 界面语言) says where the control is at the window's width: 也在左下角, and below 640 px 也在右上角 (`uiLanguageElsewhereNarrow`) — both in its description, the one not true at the width hidden by the query that moves the control, out of the accessibility tree too; neither is a search word, the row found by its name (Task 104b). A change reloads the page, once the write has landed and no draft is open. Until the settings are read the value is held out of sight in its place and nothing is checked — never 跟随浏览器 first and the reader's choice after (S-O-49c's rule; Part 7's final review) |
| S-O-06 | A deep link | (no text) | `options.html#<section>/<row>` opens the section, scrolls the row into view and lights it once (`ink` 9 %, 1.4 s), and gives it the focus; on a load with no pointer yet the keyboard's ring shows beside the flash (kept, the maintainer, 2026-09-28). Used by S-P-48, S-P-49, S-P-83, the reader's service menu and failure card (`#translate/services`) and its settings link (`#reading/pdf`) |
| S-O-10 | 翻译 · the services' card | 翻译服务 · Microsoft 翻译 · Google 翻译 · 免费 · Chrome 翻译 · 浏览器内置，无需联网 | One radio group; the arrows move the choice. Microsoft with an unsupported target: 不支持当前目标语言, greyed |
| S-O-11 | The Chrome row | · 需要先下载语言包 · 下载 · 语言包下载中 · 当前不可用 | 下载 a neutral button while the pack can be fetched; not choosable until it is there; greyed when Chrome has none |
| S-O-12 | The reader's own services | {名称} / {模型} · {主机} · 「{名称}」的更多操作 · 编辑… · 删除 | Nothing trailing while it works, the status and 「…」 otherwise; 「…」 on the row's hover or the keyboard's focus (always on a touch screen) |
| S-O-14 | Add | 添加服务… · 最多 {n} 个服务 | The last row, its plus on the controls' edge; the form opens under it. At the schema's cap (`SERVICES_MAX`, 20) the row is greyed (`GrayText` in forced colours, as a disabled button), still in the tab order, with 最多 20 个服务 as its description, and a press opens nothing: a service connected there could not be stored (Codex on #306) |
| S-O-15 | The service form | 接口地址 · 常用地址 · OpenRouter · DeepSeek · 本机 Ollama · API Key · 模型 · 名称（选填） · 默认使用模型名 · 更多 · 连接 · 取消 · 连接成功后才会添加 | The suggestions fill the address, nothing else (T4); their group is named 常用地址 for a screen reader (heard, not drawn; kept, the maintainer, 2026-09-28), so that 接口地址 names one control; an origin is asked for on a gesture (a suggestion, opening the model list, 连接). Editing, the same form under the service's row, filled in, saying 连接成功后才会保存 |
| S-O-15a | The model field | 填好接口地址和 API Key 后列出 · 正在获取模型… · 搜索 {n} 个模型 · 没有匹配的模型，可以直接填写 · 没能列出模型，可以直接填写 | A combobox over the endpoint's list, `aria-busy` while it loads; a name can be typed. The list loads by itself only for an origin already granted |
| S-O-15b | The form's checks | 填写接口地址，例如 https://openrouter.ai/api/v1 · 填写 API Key · 选择或填写一个模型 · 接口地址不合法 · 没有拿到访问 {origin} 的权限，浏览器的弹窗里需要点「允许」 | Checked on submit: each field at fault `aria-invalid` with its reason, the first focused. The last two for an address the browser cannot be asked about and an origin refused: at the address when a suggestion or the model list asked, beside 连接 when it did |
| S-O-17 | Editing · the key | 已保存 · 留空则不改 · 清除 | The saved key kept unless one is typed; 清除 under it (ruling 18). The saved key goes only to the origin it was saved for |
| S-O-18 | API Key · a local address | · 本机地址可以不填 | In the key's label, for localhost and 127.0.0.1 |
| S-O-19 | Connect | 连接 / 连接中… | Tests the service as it would be saved, then adds it and chooses it, or saves an edit in place, the choice left as it is, and closes the form (the redesign's §11: nothing is added without a connection; an edit of a spare service must not change what the next page translates with — the old drawer's rule, Codex on #157) |
| S-O-20 | Its result | 已连接 · {ms} ms / 连接失败：{原因} | Success on the row with the icon's arrival, for as long as the page stays open; a failure beside the button, the form kept, the focus on the field at fault; a polite status. The reason per S-E. A connection whose save does not land — the store refused it, or answered with the configuration in effect — is no success: 保存失败，请再试一次 beside the button, the form kept, the row not marked (Task 107) |
| S-O-21 | Delete | 已删除「{名称}」 · 撤销 · 保存失败，请再试一次 | The row replaced for 5 s; a chosen service deleted falls back to Microsoft 翻译 and comes back chosen if undone, without its refused mark until its next refusal; a deletion the store refuses leaves the row, the focus on it, and says 保存失败，请再试一次 (`O.saveFailed`, the page's one sentence for a failed save) at the list's foot — the prompts' and the styles' lists too; in all three any other write of the list's the store refuses (a choice, an edit, a style or a prompt added, S-O-41's 恢复内置样式) says the same, until one of the list's writes lands (Codex on #306) |
| S-O-21a | A refused key | API Key 已失效 · 服务拒绝了这个 API Key，它可能无效或已过期。换一个新的，其他设置不变。 · 新的 API Key · 更新并连接 · 连接成功后才会保存 | The row's status with the alert icon while the health record holds the service; choosing it opens the form; one stored with no key says 尚未配置 API Key, the same form without the first sentence |
| S-O-22 | Automatic switch | 出问题时自动改用免费服务 / API Key 失效、额度用尽或断网时，翻译不会停下 | A sub-row card, only while an LLM service is chosen (a free one has nothing to fall back from); on by default |
| S-O-23 | Target language | 目标语言 | The popup's searchable menu (S-P-22 / 23), its list the same: five rows and a half in a box of its own under the search field, which stays in view on a language far down and as the arrows walk the list — one rule for both pages (`src/styles/ui.css`; the maintainer, 2026-09-30). Before, the whole menu scrolled and the field with it |
| S-O-30 | Deep thinking | 深度思考 / 翻译不需要推理，开启会明显变慢 | Under the service form's 更多, folded |
| S-O-60 | The LLM group | LLM · 提示词与术语表只对 LLM 服务生效 / 添加 LLM 服务后可设置提示词与术语表 | The aside on the heading (`ink-2`); with no service of one's own, the one line |
| S-O-61 | Prompts | 提示词 · 我的 · 复制后修改 · 内置提示词不能直接改 · 完成 · 删除 · 新建提示词… · 导入… · 导出… · 新提示词 | The row's value the prompt in use, its description the prompt's. A radio list in place, each with its description, one's own tagged 我的; the chosen one's text read as words; a built-in copied as 「{名称}（副本）」 and opened, a new prompt too, each once its write has landed (Codex on #306); one's own edited in place (名称 and its two parts), deleted with the undo row; 导出… once there is one of one's own |
| S-O-61a | A prompt's two parts, its variables | 指令 · 翻译时始终遵守的要求 · 消息 · 每次随原文一起发送 · 目标语言 · 原文 · 论文标题 · 摘要 · 章节标题 · 术语表 | Never `{{…}}`; nothing names the protocol the extension appends |
| S-O-61b | An import, an empty field | 已导入 {n} 条 · 无法读取这个文件 · 这个文件里没有可用的提示词 · 名称不能为空 · 消息不能为空 | The last two derived (ruling 18); 完成 says them, the editor staying open. While 名称 or 消息 is empty the prompt keeps the value it had when the editor opened, so no way of leaving (another prompt, a new one, the list folded, the section or the page going, a deletion undone) stores the letter a clearing stopped at: S-O-43's rule (Codex on #306). 已导入 once the import's write has landed; a write the store refuses says S-O-21's 保存失败，请再试一次 instead (Part 7's final review) |
| S-O-61c | The built-in prompts | 默认 · 精准改写 / 通用学术翻译：术语用既定译法，人名、期刊名、代码与链接保留原文 / 翻译即改写：摆脱原文句法、消除翻译腔，按目标语言的表达习惯重写，术语与格式照旧 | Named by the pack in the interface's language (`O.prompts.builtInNames`, drawn through `promptName`; the maintainer, 2026-09-28) wherever a prompt's name is drawn — this list, the popup's row and menu (S-P-47), a copy's name; one's own keeps the name it was given. The descriptions as settings-2 draws them, 翻译即改写：… without quotes (kept, the maintainer, 2026-09-28) |
| S-O-62 | Glossary | 术语表 / 让同一篇里的译法一致 · {n} 条 · 原文 · 译文 · 添加原文 · 删除第 {n} 行 · 可以直接粘贴多行「原文, 译文」，会自动拆成多行 · 保存失败，请再试一次 · 重试 | A table in place, an empty row at the end to add one, its source cell saying 添加原文 (kept, the maintainer, 2026-09-28); pasted lines split into rows; a write the store refuses keeps the rows and says so at the table's foot, with 重试 (kept, the maintainer, 2026-09-28) |
| S-O-63 | Glossary · a row with a problem, the table too long | 原文为空 / 译文为空 · 术语表太长，超出上限后没有保存；请减少条目或缩短内容 | A row's reason at its row once the focus has left it, without line numbers; the table saves the rows that are whole, within `GLOSSARY_LIMITS`, and over them says so at its foot — a row added at the entry limit too, kept in the table and not saved: the table's own treatment of its limits, which the other lists' greyed add rows (S-O-14, S-O-40) leave as it is (Codex on #306) |
| S-O-35 | 外观 · appearance | 外观 · 跟随系统 · 浅色 · 深色 | The reader's equal segments with a monitor, a sun, a moon; one setting for the extension (`theme`, v20); a card too narrow for them (below 312 px of content) drops the icons and keeps the words |
| S-O-36 | Dimming | 深色时调暗 PDF 页面 / 深色外观下把 PDF 页面调暗；高亮与图中译文保持原色 | A sub-row for 跟随系统 and 深色 (`pdfReader.dimPages`) |
| S-O-40 | Translation style | 译文样式 · 编辑「{名称}」 · 新建样式… · 新样式 · 最多 {n} 个样式 | One radio group: a row a style, its name over the sample written in it, a pencil trailing. The pencil chooses the style it opens, so looking restyles the open pages (kept, the maintainer, 2026-09-28). A new style, or S-O-48's copy, comes in chosen, its row's arrival there from its first draw, and its editor opens once its write has landed; refused, the editor stays where it was and S-O-21's line says so. At the schema's cap (`APPEARANCE_LIMITS.styles`, 50) 新建样式… is greyed (`GrayText` in forced colours), still in the tab order, with 最多 50 个样式 as its description, and a press writes nothing; S-O-48's 复制一份 likewise (Codex on #306) |
| S-O-41 | Restore | 恢复内置样式 · 最多 {n} 个样式 | On the group's heading: the built-ins as shipped, the reader's own kept. When the built-ins it would bring back would take the list past the schema's cap (`APPEARANCE_LIMITS.styles`, 50), it is greyed, still in the tab order, with S-O-40's 最多 50 个样式 before it, which it is described by, and a press writes nothing; where the button (with the reason, when shown) does not fit beside the heading's name — English at a 320 px window, greyed or not, and at 200 % zoom greyed — it goes under the name, on the trailing edge, and the name keeps one line; when the built-ins fit it restores as before (Codex on #306) |
| S-O-42 | Built-in styles | 与原文相同 · 绿色 · 蓝色 · 琥珀 · 淡一档 · 模糊 | Ordinary entries: editable and deletable. Their colours are kept as shipped (the maintainer, 2026-09-28), though green, amber and blue read under 4.5:1 on a light ground (2.50, 2.73, 3.62; Task 101): a sample shows the colour as it renders |
| S-O-43 | The style editor | 名称 · 浓淡 · 原样 · 淡一些 · 更淡 · 更多 · 完成 · 名称不能为空 | In place under the row, for every style; the preview; 浓淡 1 · 0.7 · 0.5, a value between them showing no step chosen. The name is written as it is typed, and while its field is empty the style keeps the name the editor opened with, so no way of closing (the row's pencil, another row's, a new style, the section or the page going) leaves a name the reader did not choose. 完成 with the field empty keeps the editor open, says 名称不能为空 under the field (the prompt editor's words, `O.prompts.nameEmpty`), marks it invalid and gives it the focus; a name typed clears that (Codex on #306) |
| S-O-44 | Colour | 颜色 · 跟随原文 · 自选颜色 | Swatches: 跟随原文, the palette, one's own |
| S-O-45 | Underline | 下划线 · 无 · 实线 · 点线 · 虚线 · 波浪 · 线宽 · 1px · 2px | 线宽 a sub-line once a line is chosen |
| S-O-46 | Blur | 悬停前模糊 / 译文先糊着，鼠标停上去才清晰 | Under 更多 |
| S-O-47 | Custom declarations | 自定义 CSS（只写声明，例如 letter-spacing: 0.02em） | Under 更多; checked in place, a refused block saying why (`O.reading.advancedRejected`) and never stored; the field holds back more than the schema's 2000 characters (`CSS_MAX`), which the store would refuse whatever the retry (Codex on #306) |
| S-O-48 | The editor's bar | 完成 · 复制一份 · 删除样式 | 删除样式 with the undo row; a chosen style deleted falls back to the first of the list (`styles[0]`), not the one chosen before the editor opened (kept, the maintainer, 2026-09-28); 复制一份 kept (ruling 18), greyed at the list's cap with S-O-40's 最多 50 个样式 beside it, which it is described by |
| S-O-49 | Hover highlight and its colours | 对照高亮 / 悬停时高亮对应的句子；仅译文时停留可查看原文 · 颜色 · 自选颜色 · 最多 {n} 种颜色 | The switch is S-P-80's setting; while on, the sub-row 颜色: the profiles as swatches, as in the reader (the built-ins named 柔和绿 · 淡黄 · 淡蓝), last a colour of one's own, one profile added the first time and changed after. With none of one's own yet and the list at the schema's cap (`APPEARANCE_LIMITS.highlights`, 50; 0.4.1's settings page could duplicate bands up to it), 自选颜色 is greyed, still in the tab order and described by 颜色's 最多 50 种颜色, its press refused so the browser's picker stays shut; a choice or a colour of one's own the store refuses — another tab filled the list after this page drew it — says S-O-21's 保存失败，请再试一次 under the row, until one of the colours' writes lands (Codex on #306) |
| S-O-50 | 阅读 · how to translate | 翻译方式 · 按需翻译 · 整篇翻译 / 只翻译正在阅读和即将读到的段落，用量最少 / 打开论文时就请求整篇译文，滚到哪里都已翻好，用量较多 | `preload` (v20); the description follows the choice; 整篇翻译 reaches an open paper at once |
| S-O-24 | Figure text | 图片翻译 / 图里的文字也翻，译文叠在图上，悬停查看原文 | The popup's switch (S-P-85) |
| S-O-49b | Where translations open | 译文在哪里打开 / 从摘要页或 PDF 页打开译文时 · 新标签页 · 当前标签页 | A small segmented control; configuration `reading.openIn` (v16). **新标签页 is the default** (the owner, 2026-09-18): the first version navigated the tab from the abstract page or the PDF, and the page the reader was on was gone. It reaches the abstract page's line (as `target`), the popup's entries on those pages (S-P-50b), in the toolbar and in the floating button's panel alike, and the PDF reader's 改用 HTML 翻译 (S-R-18); on the full text nothing navigates, and P0 opens every paper in a new tab (S-P-03), so nothing here applies |
| S-O-49c | The floating button | 显示悬浮按钮 / 在 arXiv 的摘要页、PDF 和全文页贴在窗口边缘 | Switch, storage key `floatingEntry` (`enabled`; not in the configuration, DESIGN §4.0c), on by default, written through the background like the button's own drags; the switch is held out of sight, its place kept, until the background says its state (it used to say on, then flip). The way back from S-I-06c's 不再显示; every open arXiv page follows it at once. The popup, the key and the menu work either way |
| S-O-55 | The PDF group | PDF · 在 arXiv 的 PDF 上使用对照阅读器 / 关掉后，PDF 用浏览器自带的查看器打开 · 同步滚动 / 原文和译文一起滚 | `#reading/pdf` (the reader's settings link); configuration `pdfReader.enabled`, `sync`, the values the reader's own menus change (S-R-06), in their words. 同步滚动 a sub-row while the reader is on. On, arXiv's PDFs open in the reader; off, the browser's viewer keeps them and `#readarxiv` still opens the reader. The appearance and the dimming are S-O-35 and S-O-36 now |
| S-O-70 | Data · cache | 已缓存的译文 / {n} 段 · {size} MB · 换了服务、模型或提示词会自动分开存，通常不用清 | |
| S-O-71 | Read failed | 没能读取缓存 | Never shown as a count of 0 |
| S-O-72 | Clear | 清空… → 确认清空 → 已清空 | A neutral button; a press arms it with a trash icon, its words `danger` on `button-danger`; back after 3 s untouched, not while the pointer rests on it; done, 已清空 with the success icon |
| S-O-73 | Data · PDF translations | 已缓存的 PDF 译文 / {n} 篇 · {size} MB | The papers the PDF reader keeps on this machine (the reader's design, §9.3) — a paper once, whatever versions and languages it is kept in — read from its store on the page's own origin; cleared as S-O-72, reported as S-O-71 when the store cannot be read |
| S-O-74 | Diagnostics | 诊断日志 / 最近几百条运行记录：请求失败、服务切换、页面事件。不含 API Key 与论文正文，可随问题反馈一并附上 · 导出 · 没能导出 | Issue #156: a neutral 导出 downloads the log; the words as the pack has them (its description says API Key, the pack's one term for it) |

Retired 2026-09-27 (the redesign's §10, §11): S-O-13 (the empty list), S-O-16 (the address hint),
S-O-26 (the image modes), S-O-51 (when translation starts); S-O-01's five old section names, S-O-10's 内置服务 and
S-O-12's 我的服务, S-O-14's and S-O-15's drawer titles, S-O-41's 添加配置 and 重置, S-O-43's 编辑配置, S-O-46's 适合自测,
S-O-49's 背景高亮 and its editor, S-O-50's 提前翻译的范围, the prompt manager's 查看, 复制并自定义, System prompt …,
用户提示词, 插入变量 and 导出自定义 (S-O-61), and S-O-62's text-box hint. Gone with them where the row stays, beyond the
design's list: S-O-02's and S-O-72's 取消 (a confirm returns by itself after 3 s), S-O-21's 确认删除 (a deletion is
undone, not confirmed), S-O-15's 更多选项 (now 更多), S-O-17's dots, S-O-40's description, S-O-44's 自定义 (now
自选颜色) and S-O-47's 高级 with its description.

### 3.3 In-page components

| Id | Where | Copy | Notes |
|---|---|---|---|
| S-I-01 | Loading | (no text) | The skeleton: one to three faint red bars sized by the paper's font size, breathing as a whole (DESIGN §7.6). The original mock-up's spinner is gone — a placeholder the size of the translation says “where and how much” better than a 6px ring |
| S-I-02 | Failed block | {S-E 原因} · 重试 | The raw message in `title`; its retry and its line in danger, light or dark by the paper's colour scheme (DESIGN §4.0c) |
| S-I-04 | Image overlay | (the translation itself) | A white translucent rounded box over the original text; hover shows the original; no node while waiting or failed (§15) |
| S-I-05 | Split-view handle (#83, experimental) | (no text) | Appears on hovering the gutter; drag changes the column width, double-click resets |
| S-I-06 | Floating button · main button (every arXiv page: abstract, PDF, full text) | 翻译本页 / 显示原文 / 重新翻译 · 双语版本（Read arXiv） · arXiv 没有这篇论文的 HTML 版本，无法翻译 | **Our book in a white disc** (the maintainer's drawing, inline vector), in a tab docked to the window's edge, right side and 66 % down until the reader drags it (DESIGN §4.0c). The same size on the screen on every page and at every zoom. Whole and dim at rest (70 %), lit by the pointer at once, the other buttons out after 400 ms — Immersive Translate's manner on Read Frog's frame (the maintainer, 2026-09-18). The words are its name and its tooltip, and say what a click does **on this page**: on the full text the same toggle as the popup's button, the key and the menu, in the words that button says for the action the toggle decides (S-P-50…52): 翻译本页, 显示原文, and 重新翻译 on a paused page (P9), a page behind its settings (P13) and the retranslate cue (P6b) — where the saved service cannot run, the words the popup's button shows disabled, and a click opens the control panel. The words are asked of the toggle's own decision (`axt:toggle-decision`; `src/entrypoints/content/toggle-words.ts`) on a change of the page's state — never of an idle page, whose press always translates — and while it runs on a restart, a change of the saved settings that moves what the decision reads (the service, its key or model, the language, the prompt, the fallback — not a style or a display) or of the refused-key record, and on its return from the back/forward cache, one ask out at a time and at most one waiting; with no answer, they say whether the page is on; on the abstract and the PDF (the reader closed) the abstract entry's sentence (`page.abstractLink`), and a click opens the control panel (S-I-06a), where the paper's two entries are (S-P-50b) — the column then has no panel button of its own, since this one does what it did (the maintainer, 2026-09-24); with neither entry to offer, S-P-33b's sentence, and the panel says which is missing. A page showing its translation carries **a green tick** at the circle's lower right. A click nothing can serve (no service can run) opens the control panel, where the reason is. Drawn in the family's material and following the extension's appearance (DESIGN §4.0c) |
| S-I-06a | Floating button · control panel (above) | 控制面板 | Opens the extension's popup **in the page, beside the button** (Immersive Translate's manner; the maintainer, 2026-09-18) — every control the reader has, without a trip to the toolbar. It is the same popup, so S-P-* hold in it unchanged; a press elsewhere, Escape or a second click closes it. Lucide's `sliders-horizontal`. Drawn on the full text only: on the abstract and the PDF the main button opens the panel (S-I-06) |
| S-I-06b | Floating button · settings (below) and the corner controls | 设置 · 悬浮按钮选项 · 锁定位置 / 解锁位置 | The settings page; beside the main button a close control and a lock, Read Frog's words for Read Frog's controls. The lock's name says what a click will do; locked, the button cannot be dragged. No feedback button (the maintainer, 2026-09-18) |
| S-I-06c | Floating button · close menu | 本次隐藏 · 不再显示 | Read Frog's offers 当前网站禁用 · 全局禁用; on the one site this button lives on those are the same thing, so the two scopes here are this page and every page. 不再显示 turns off S-O-49c, which is where it comes back. The shared menu's look |
| S-I-07 | Figure viewer (every figure on the full text) | 放大查看 · 放大 · 缩小 · 关闭 | DeepWiki's manner (DESIGN §15.7): nothing at rest; under the pointer a round-cornered button fades in at the figure's top right — Lucide-style `maximize-2` arrows, its name the tooltip — and belongs to the figure: it scrolls with it, goes under the site's header with it, and is out of the window when the figure's top is; a dialog of nine tenths of the window over the dimmed page, `+` `−` `×` at its top right; a press zooms by 1.2, the wheel about the pointer, a drag pans, the arrows pan and + / − zoom from the keyboard, Escape or the backdrop closes; the page behind does not move. The dialog takes the button's name (放大查看), and closes if the page is restored under it. Shows what the page showed: the translation from a translated figure, the paper's words from the original. On a page not translated as well. The control and the bar in the family's floating material, light or dark by the paper |

Retired 2026-09-28: S-I-03 (an in-page notice of a switched service, never built; the hand-over is told by the popup's note, S-P-30).

### 3.4 Error reasons (S-E)

`ProviderErrorKind` → the user sentence. Used by S-P-30/33, S-O-20, S-I-02 (corrected 2026-09-13: the connection result is S-O-20; there is no S-O-28). The sentences are the pack's (`REASON`), quoted as it has them on 2026-09-28: five had drifted from this table since the build's first days (2026-09-10 and 09-11).

| kind | User sentence | What the user can do |
|---|---|---|
| `no-key` | 尚未配置 API Key | Go to settings |
| `auth` | API Key 无效或已过期 | Go to settings |
| `rate-limit` | 请求过于频繁，稍后自动重试 | Nothing |
| `timeout` | 翻译超时 | Retry |
| `network` | 网络连接失败 | Retry |
| `bad-request` | 翻译服务拒绝了请求 | Hover for the raw message |
| `invalid-response` | 译文格式无效 | Retry |
| `unknown` | 翻译失败 | Retry |
| `aborted` | (not shown) | The user cancelled it |

---

### 3.5 PDF reader (S-R) [decided 2026-09-25, built in the reader's Part 3]

The bilingual PDF reader's own words (the reader's design, `experiments/pdf-bilingual/plans/2026-09-25-reader-interface-design.md`
§15). Where the popup already says the same thing, the reader shows the popup's string: 翻译服务 (S-P-10), 目标语言
(S-P-20), 搜索语言 and 没有匹配的语言 (S-P-22/23), 对照高亮 (S-P-80), 图片翻译 (S-P-85), 设置 (S-P-02), {n} 处翻译失败 and
重试 (S-P-60/61), and the reasons (S-E). No reader-facing string names a technical path (a test checks both packs).

**The reader names a target language by its own name, wherever it shows one** [decided, the maintainer, 2026-10-04; §6]: the toolbar's language button
(and the one the reading options hold below 900 px) shows 日本語 in the Chinese and the English interface alike, never 日语 or "Japanese", exactly as its menu's
rows are written. The button's value and each row carry `lang` (the popup's rule for the same nine); the button is still labelled by its value, then 目标语言 (S-R-07's
rule, WCAG 2.5.3), so its name starts with the own name. A code the language table lacks shows as the code. S-R-13's sentence names the language the same way,
so that the button and the sentence agree.

| ID | Where | Copy | Notes |
|---|---|---|---|
| S-R-02 | Contents toggle, and the sidebar's header | 目录 | Expanded while the sidebar is open (`aria-expanded`, controlling it) |
| S-R-03 | The arXiv id's tooltip | 在 arXiv 打开摘要页 | The id links to the abstract page, in a new tab |
| S-R-04 | The display switch | 显示 · 原文 · 对照 · 译文 | The radio group's name and its three choices, in tooltips and to screen readers; the arrows move the choice. No single key chooses one (WCAG 2.1.4; the maintainer removed 1 2 3, 2026-09-26) |
| S-R-05 | Swap sides | 交换左右 | 对照 only; greyed in the single displays |
| S-R-06 | Sync scrolling | 同步滚动 | 对照 only; greyed in the single displays |
| S-R-07 | Zoom | 缩小 · 放大 · 缩放比例 · 适合宽度 · 适合页面 · 实际大小 | ⌘− and ⌘+ (Ctrl elsewhere), in `aria-keyshortcuts` too. The value's button is labelled by its value, then 缩放比例, as the language's and the service's are by theirs, then S-P-20 and S-P-10 (WCAG 2.5.3, `aria-labelledby`). Below 500 px − and + give way to the value's menu |
| S-R-08 | Reading options | 阅读选项 · 高亮颜色 · 外观 · 跟随系统 · 浅色 · 深色 · 深色时调暗页面 | With S-P-80 and S-P-85. The appearance's three are icons (a monitor, a sun, a moon), their words in tooltips and to screen readers, the system's first (the maintainer, 2026-09-26). The appearance is the extension's since v20 (`theme`, S-O-35): chosen here, it turns the popup and the settings page too. A switch's row is a label, its words a target as the switch is, as the popup's rows are |
| S-R-09 | Download | 下载 · 译文 PDF · 原文 PDF | 译文 PDF greyed until the final translation is on screen. Below 500 px a row of the reading options, with 设置 (S-P-02, a link) and S-R-10 |
| S-R-10 | Leave | 在默认查看器中打开 | Back to the browser's own viewer |
| S-R-11 | Page pills | 原文页码 · 译文页码 · 上一页 · 下一页 | |
| S-R-12 | A load or a translation under way | 正在加载 · 正在翻译 · 正在按当前设置重新翻译 | Said to screen readers in the status region, not shown: the 2 px line along the toolbar's foot shows how far it has come (the maintainer, 2026-09-25) |
| S-R-13 | Language not supported | PDF 对照暂不支持 {语言} · 选择语言 | {语言} is the language's own name (the maintainer, 2026-10-04), as the language button shows it, so a space follows 支持 (§1 rule 9): 「PDF 对照暂不支持 Türkçe」, English 「A bilingual PDF isn't available in Türkçe yet」. The action opens the language menu: the toolbar's, or below 900 px the one the reading options hold, opened in them |
| S-R-14 | Narrow window | 窗口较窄，暂只显示译文 | Once, when 对照 shows the translation alone (after S-P-74), for 5 s of being read: the time stands while the pointer is over it or it holds the focus, and the rest runs once neither does (the maintainer, 2026-10-01). Holding no action, it is a stop of its own for the keyboard while shown, a group its words name, rung as the chrome's controls are (Codex and Devin on #307) |
| S-R-15 | A notice's close button | 关闭 | |
| S-R-16 | The card · too many requests | 请求过于频繁 | The reader's own words for S-E's rate limit: S-E's 稍后自动重试 is the HTML page's chain retrying by itself, and a stopped run here does not — the reader retries (Part 6's interface review) |
| S-R-17 | Cannot be had | 这篇论文暂不支持 PDF 翻译 | The paper has no source, or none of the ways of setting it worked: the original shown, 对照 and 译文 greyed. It says that, never why (the section's rule), and has no close: nothing else can be done here (the maintainer, 2026-09-26) |
| S-R-18 | Its action | 改用 HTML 翻译 | Where arXiv has an HTML version (a HEAD; only a 404 or 410 means none): a link to it with `#readarxiv`, in a new tab or this one as S-O-49b says — this one being the PDF page the reader lies over. 改用 over 使用: the reader came for the PDF, and this is the other way |

## 4. Popup state table [decided, 2026-09-10; redrawn 2026-09-27]

Columns are elements, cells what they show, "—" absent. Conditions use the code's fields. Each state is a fixture of
`src/entrypoints/popup/fixtures.ts` (its `name` the State, its `when` the Condition), drawn by `derivePopupView` and
shown in the dev-build gallery. On a paper's page (P1–P16, P6b–P8b, PE) the group holds 翻译服务 / 目标语言 /
提示词 (LLM only) and the foot 对照高亮 / 图片翻译 / 译文样式; an entry page (P17…) the group and the two entries only;
the reader (PR) the group, the display and the foot, 上下 and 译文样式 greyed; PW, PL and P0… the brand row and their own
lines. The rows open at any time.

| Id | State | Condition | Service row value | Note | Failure line | Primary button | Secondary button |
|---|---|---|---|---|---|---|---|
| PW | Before the first answer | `tab === null` | — | — (the brand row alone) | — | — | — |
| PL | An arXiv paper still loading | `page = entry = null ∧ tab = a paper ∧ asking` | — | S-P-03d (a line, no field) | — | — | — |
| P0 | Not on a paper: search and open | `page = entry = null ∧ tab not a paper still asked` | — | S-P-03 and the field (S-P-04, S-P-05 under it) | — | — | — |
| P0a | P0, words typed | `find.query = words` | — | S-P-03, the field, S-P-06 | — | — | — |
| P0b | P0, an arXiv PDF address | `find.query = arxiv.org/pdf/…` | — | S-P-03, the field, S-P-07 (PDF 翻译) | — | — | — |
| P0c | P0, an arXiv HTML address | `find.query = arxiv.org/html/…` | — | S-P-03, the field, S-P-07 (HTML 翻译) | — | — | — |
| P0d | P0, a paper named, its checks out | `find.query names a paper ∧ !entries` | — | S-P-03, the field, the paper's line (`arXiv {id}`) | — | — (the entries wait for both checks) | — |
| P0e | P0, a paper named, both entries | `entries.html ∧ entries.pdf` | — | S-P-03, the field, the paper's line; S-P-32 + 设置 when the service cannot run and nothing takes over | — | S-P-50b's two entries (both **disabled** then) | — |
| P0f | P0, a paper with no HTML version | `entries.html = null` | — | S-P-03, the field, the paper's line; S-P-33a (S-P-33b, an alert note, with no PDF entry either); S-P-32 + 设置 in their place when the service cannot run and nothing takes over | — | S-P-50b, HTML 翻译 **disabled** (both then) | — |
| P0g | P0, a link elsewhere | `find.query = another site's link` | — | S-P-03, the field, S-P-08 | — | — | — |
| P1 | Ready | idle ∧ runnable | value | — | — | 翻译本页 | — |
| P2 | Service menu | menu = service | value | as the state | — | as the state | — |
| P3 | Language menu | menu = language | value | as the state | — | as the state | — |
| P4 | Translating | on | value | — | — | 显示原文 | — |
| P5 | Translating, with failures | on ∧ failed > 0 ∧ !fatal | value | — | S-P-60 + 重试 | 显示原文 | — |
| P6 | Switched to another service | on ∧ `engine.demoted` | the new service's name, the old struck through | S-P-30 + 设置 | per failed | 显示原文 | — |
| P6b | The key made good, the page still on the free service | `on ∧ demotions(auth, 401) ∧ !rejected ∧ saved.engine = demoted` | the new service's name, the old struck through | — (P6's note goes: its reason no longer holds) | per failed | 重新翻译 (brand, the shortcut label) | 显示原文 (neutral), beside it |
| P7 | The chosen service cannot run, a fallback available | idle ∧ !runnable ∧ fallback | value | S-P-31 + 设置 | — | 翻译本页 | — |
| P7b | A refused key, a fallback available | `idle ∧ rejected ∧ fallback` | value | S-P-31 (S-P-32e) + 设置 | — | 翻译本页 | — |
| P8 | The chosen service cannot run, no fallback | idle ∧ !runnable ∧ !fallback | value | S-P-32 + 设置 | — | 翻译本页 **disabled** | — |
| P8b | A refused key, no fallback | `idle ∧ rejected ∧ !fallback` | value | S-P-32 (S-P-32e) + 设置 | — | 翻译本页 **disabled** | — |
| P9 | Paused | stopped ∧ fatal | value | S-P-33 + 设置 | — | 重新翻译 (brand, the shortcut label) | 显示原文 (neutral), beside it |
| P10 | Chrome language pack downloading | chrome ∧ pack = downloading | value | S-P-31 (32b) + 设置 | — | per fallback | — |
| P11 | Image translation paused | `images.fatal` | per text state | S-P-35 + 设置 | text only | per text state | — |
| P12 | Narrow window | `mode !== preference` | value | as the state | — | as the state | — |
| P13 | Page behind the settings | on ∧ `running` ≠ settings ∧ !runnable | value (the saved one) | S-P-32 + 设置 | — | 重新翻译 **disabled** (neutral grey, no shortcut) | 显示原文 (neutral), beside it |
| P15 | Prompt menu | llm ∧ menu = prompt | value | as the state | — | as the state | — |
| P16 | Style menu | menu = style | value | as the state | — | as the state | — |
| PE | An action failed | `the last action threw (S-P-90)` | value | — | — | 翻译本页, S-P-90's line under it | — |
| P17 | Abstract or PDF page | `page === null ∧ entry.html` | value | — | — | S-P-50b's two entries | — |
| P17a | Abstract or PDF page, no HTML version | `page === null ∧ entry.html === null` | value | S-P-33a (S-P-33b, an alert note, with no PDF entry either) | — | S-P-50b, HTML 翻译 **disabled** | — |
| P17b | Abstract or PDF page, service cannot run, no fallback | `page === null ∧ entry.html ∧ !runnable ∧ !fallback` | value | S-P-32 + 设置 | — | S-P-50b, both **disabled** | — |
| P17c | Abstract or PDF page, service cannot run, a fallback available | `page === null ∧ entry.html ∧ !runnable ∧ fallback` | value | S-P-31 + 设置 | — | S-P-50b's two entries | — |
| PR | The PDF reader open | `page === null ∧ entry.readerOpen` | value | — (a service's note if it cannot run) | — | 显示原文 (neutral; 翻译本页 while the reader shows the original), no shortcut label | — |

Rules:
- `runnable` is decided from the settings alone (LLM: a key the service has not refused, S-P-32e; Chrome: the pack is
  `available`; Microsoft: the target is supported; Google: always), never from a possibly stale chain. A chosen id
  naming no service cannot run (S-P-32d).
- One note at a time: S-P-33 > S-P-30 > S-P-35 > S-P-31 / S-P-32. A note carries 设置 or 重试; an alert's icon in
  danger, an information's in ink-2, the words ink (the redesign's §5.2).
- A change of service, language or prompt while the page is on **restarts it in place** once the
  background reports the saved values (DESIGN §8.5): paragraphs are swapped as they are requested
  again, cached ones at once. A choice that cannot run only saves → P13. The two switches are
  applied by the page's config watcher, nothing restarts.
- A permanent hand-over (missing or rejected key) restarts the page on the service that took over,
  so P6 shows one service for the whole page, not "the rest of the paragraphs".
- **The retranslate cue (P6b)**: a page running on the free service since its own service's key was refused, that key
  made good since — the record holds the service no more, and the chain a start would run on runs it again — is offered
  its way back with P13's pair, without words of its own; P6's note goes. ⌥T, the context menu and the floating
  button's main button retranslate there as the button does (`src/shared/page-action.ts`, `keyMadeGood`), and the
  floating button says so in S-P-52's words, read from the same decision (S-I-06).
- The primary button is the only sign that the page is on. No counts anywhere. It is the brand's for translating
  (翻译本页, 重新翻译) and neutral for 显示原文; disabled, it is neutral grey without its shortcut.
- The failure note counts paragraphs and figures together (S-P-60).
- S-P-74 depends on `mode !== preference` only.
- A menu is the shared popover under its row; the popup takes a minimum height while it is open, so that its window
  or the panel's frame holds it, cleared as it closes; the style menu opens upward (the redesign's §5.3). The row
  toggles it, a press outside or Escape closes it.
- Layout (the redesign's §5.1): the brand row, the group (翻译服务, 目标语言, 提示词), a note, the primary, the display,
  the foot (对照高亮, 图片翻译, 译文样式). 320 px wide; the brand row 48 px, the mark 24 px and the name 15 px / 600; the
  large buttons (the primary, its pair, a paper's two entries) 44 px, radius 10, their words 15 px / 600 and a shortcut's
  label 12 px — round 7's F (the maintainer, 2026-09-28).
- Dev-only information (background version, block stats, raw `fatal` text) lives only in the
  dev-build gallery.

## 5. Tokens [implemented; the redesign, 2026-09-27]

One source, `src/shared/tokens.ts`, holds every token as data — the reader's neutral ramp (`n-0` … `n-10`, one cool
neutral at hue 255), the roles named for what they are for, the brand and status colours, the shadows, the font and the
ease — in light and dark (the redesign's design, §2.1). Nothing else in the tree writes a colour: a surface names a
role. The extension's own pages (the popup, the settings page, the PDF reader, the gallery, the controls sheet) read
the generated `src/styles/tokens.css`, unprefixed (`pnpm tokens` writes it; `tests/shared/tokens.test.ts` fails while
it and the source differ); the shadow roots on arXiv's pages take the same roles as `--axt-` variables from
`tokenSheet('host')`, marked light or dark inside the root (DESIGN §4.0c). `tests/shared/contrast.test.ts` holds every
pair a surface draws to its floor.

| Role | Light | Dark | For |
|---|---|---|---|
| `chrome` | n-0 | n-0 | popup, cards, menus, the reader's bars |
| `page` | n-1 | n-1 | the settings page's ground |
| `canvas` | n-3 | n-3 | the reader's document area |
| `ink` / `ink-2` / `ink-3` | n-10 / n-8 / n-7 | n-10 / n-8 / n-7 | text, secondary text and placeholders, chevrons and disabled |
| `chrome-line` | n-4 | n-4 | hairlines and separators |
| `line-strong` | n-7 | n-7 | an edge that marks a choice (a chosen swatch) |
| `well` / `lift` / `fill` | n-3 / n-0 / n-3 | n-2 / n-5 / n-4 | a segmented control's ground, its raised thumb, a pressed or large neutral control |
| `group` | n-2 | n-2 | the popup's grouped rows and its notes |
| `button` | n-2 | n-4 | a small neutral button (下载, 清空…, 导出) |
| `button-danger` | n-2 | n-3 | the same button asking to confirm a destructive action (its words in `danger`) |
| `button-raised` | n-0 + hairline | n-4 | a button on `group` (a note's 设置) |
| `field` / `field-edge` | n-1 / n-5 | n-2 / n-5 | a text field's ground and its 0.5 px edge |
| `focus` | ink | ink | the keyboard's ring, 2 px |
| `danger` | oklch(0.545 0.17 28) | oklch(0.69 0.15 28) | an alert's icon, a destructive action's words |
| `brand` | oklch(0.493 0.186 24.5) | oklch(0.559 0.188 24.5) | the fill of the one primary action, and a switch that is on in the popup and on the settings page; arXiv's red to the eye, another value — #B31925, ΔE OK 0.0097 from #B31B1B; #CB3438 in dark (the maintainer, 2026-09-28, round 8). The logo keeps its own red, #AA142D |
| `on-brand` | white | white | words and icons on `brand` |
| `brand-chip` | white 18 % | white 8 % | a shortcut label on `brand` (⌥T, ↵) |
| `success` | oklch(0.62 0.14 150) | oklch(0.72 0.14 150) | the connected icon, the floating button's tick |
| `mark` | oklch(0.85 0.12 95) at 70 % | oklch(0.55 0.1 95 / 0.55) | a search hit behind the words |
| `tip-bg` / `tip-ink` / `tip-ink-2` | oklch(0.22 0.01 255) / oklch(0.96 0 0) / oklch(0.74 0.01 255) | the same | tooltips, dark in both themes |
| `float-bg` | n-0 at 90 % | n-0 at 90 % | a floating pill or capsule |
| shadows | `page-shadow`, `float-shadow`, `pop-shadow`, `card-shadow` | their dark values | as the reader's, plus the settings card's |
| `group-hover` | n-3 | n-3 | a hovered or open row of the popup's group; P0's search row |
| `on-brand-2` | white 85 % | white | P0's paper id on the brand (5.25:1 light; 85 % read 4.11:1 in dark) |
| `tip-shadow` | 0 4px 12px black 20 % | the same | the tooltip's shadow, the same in both themes |
| `raised-shadow` | a hairline of n-4 and a 1 px shadow | none | a raised button's or row's hairline: a note's button, the settings sidebar's current section |

- **Brand and danger read as one hue** (24.5° and 28°), so danger is never a fill: a destructive confirmation is a
  neutral button with danger words and a trash icon (S-O-72), and brand is never used for an alert.
- **The brand fills one action per view**, and a switch that is on in the popup and on the settings page: the brand's
  track, its thumb white (the maintainer, 2026-09-28; each page's own sheet). The PDF reader's switches keep their ink,
  the reader's own. Chosen states, radios and the focus ring stay ink, as in the reader.
- **Words to be read are `ink` or `ink-2`, never `ink-3`** (chevrons, the disabled), which reads under 4.5:1: placeholders are `ink-2`;
  a shortcut label on a neutral button or row is `ink`, the struck-out service beside the one in use `ink-2`, a search
  hit's words `ink` on `mark` (Task 101).

The extension's own controls follow the extension's appearance (`theme`); the controls on the paper — the figure
viewer's control and bar, the failed block's retry — follow the paper's colour scheme (the redesign's §3, §15).

### 5.1 The brand mark [decided, 2026-09-11]

An open book: the left page dark grey with an `A`, the right page arXiv red with a `文`. It ships in
**two shapes**, because the two surfaces it lands on are different, and one shape cannot serve both.

| Vector | Shape | Where it goes |
|---|---|---|
| `public/icon/mark.svg` | the book on its white ground (2 units round it), no tile: the identity itself | `public/icon/mark-{16,32,48}.png`, declared as `action.default_icon` in `wxt.config.ts` — the toolbar button, the three pages' `<link rel="icon">`, the popup's brand row, which draws the file itself (`<img src="/icon/mark.svg">`, `src/entrypoints/popup/PopupView.tsx`), and the settings sidebar through `src/ui/BrandMark.tsx`. Everywhere the mark stands on its own, in other words. A white tile in those places reads as a sticker; the outline is what keeps it legible on a light and a dark surface alike |
| `public/icon/mark-off.svg` | the same book in grey, glyphs and outline dark | `public/icon/mark-off-{16,32,48}.png`, the manifest's `action.default_icon`: the toolbar button wherever the extension has nothing to do (below) |
| `public/icon/tile.svg` | the same book on a white rounded tile, the app-icon shape | `public/icon/{16,32,48,96,128}.png` (WXT fills the manifest's `icons` from those names) for the extensions page, the install dialog and the store — the places that frame an icon in a card of their own |
| `docs/brand/store-icon-128.png` | 96 of tile artwork inset in a 128 canvas | uploaded by hand to the store listing, which wants the inset rather than a full-bleed icon. Never shipped inside the extension |
| `docs/brand/mark-16.svg`, `docs/brand/mark-off-16.svg` | the two marks at 16 px, **drawn pixel by pixel**: one `<rect>` a pixel | `public/icon/mark-16.png` and `mark-off-16.png`. At 16 px a scaled vector blurs the letters, so the smallest size is drawn, not rendered; from 32 px up the vectors are |

**The toolbar button is grey until a page lights it** [decided, the maintainer 2026-09-21]. The extension works on
three kinds of page — the abstract, the PDF and the full text, the three its content scripts run on — and nowhere
else, so its button starts grey and each of those pages lights its own tab (`src/shared/action-icon.ts`, the message
`axt:page-usable`; the background sets the colour mark for that tab alone). Nothing turns it grey again: Chrome drops a
value set for one tab when the tab goes to another document, and keeps it across a hash change. A page brought back
from the back/forward cache runs no script, so it says so again on `pageshow`. A tab opened before the extension was
installed or updated stays grey until it is reloaded, which is the truth: its page has no script of ours either. All
of it measured in a real browser by `tests/e2e/probes/action-icon.mjs` (2026-09-21, Chromium 153) — the clearing read
from the button's title, since Chrome gives no getter for an icon. The title stands in for the icon on the source's
word: `ExtensionActionRunner::DidFinishNavigation` calls `ExtensionAction::ClearAllValuesForTab` for a committed,
cross-document navigation of the main frame, and that one function erases the tab's title and icon together
(`chrome/browser/extensions/extension_action_runner.cc`, `extensions/browser/extension_action.cc`, read 2026-09-21).
A restore from the back/forward cache is such a navigation too, which is why the page has to say so again. The popup still opens on a grey button and says what
it can do there.

`pnpm icons` renders every PNG from the vectors, the 16 px pair from their pixel drawings, and the README's
`docs/images/mark-256.png` beside them; the PNGs are committed, so an ordinary build needs neither the script nor a
browser. The mark is logo round 7 (the maintainer, 2026-09-26): the page curl deeper, the letters A and U+6587 redrawn,
the colours and the grey state kept. `docs/brand/social-preview.png`, the repository's social card, is not generated:
it is re-uploaded by hand in the repository's settings.

The mark is decorative wherever it appears: the name sits beside it as text, so it carries `alt=""`.

At 16 px the two glyphs lose their strokes. Both shapes ship at that size anyway: a retina toolbar
picks the 32, the silhouette and the two colours still identify it, and one mark at every size beats
two that differ. A simplified 16 is the fallback if it ever reads badly in the wild.

## 6. Interface language [decided, 2026-09-11]

**The interface language and the target language are two different things.** The target language is what the paper is translated into; the interface language is what the buttons and notes are written in. A reader may translate the paper
into Japanese and want a Japanese interface, or an English interface with the paper in Japanese; neither should be decided for them by the other. So the two controls sit far apart:
the target language in the settings' “翻译” section (S-O-23), the interface language at the settings sidebar's foot (S-O-05; at the end of the title row on a narrow window).

**The user is a non-English reader.** Someone who reads English needs no translator on arXiv. English is only the fallback — until a language has been written,
a paper reader can mostly get by in English for a while. So adding a language has to be cheap: one file, one line in `LOCALES`, everything else follows.

| Where | Content |
|---|---|
| `src/locales/zh-CN.ts` | Simplified Chinese, and **the source of the type**: the other packs are written in its shape, and a missing key fails to compile |
| `src/locales/en.ts` | English, the fallback |
| `src/locales/index.ts` | The language table, each language's own name, `pickLocale` (the reader's choice → the browser's exact code → the same language → English) |
| `src/ui/strings.ts` | Runtime: `S` / `O` are **live bindings**, `setLocale` swaps the pack |
| `src/ui/apply-locale.ts` | The three pages and the paper page each call it once **before the first render** |
| `public/_locales/` | Only the two strings Chrome itself displays: the description on the extensions page / in the store, and the shortcut description. Only the browser reads them, and only the browser picks their language |

- **Config v13 adds `uiLanguage`**: `auto` follows the browser (`browser.i18n.getUILanguage()`, not `accept-languages` —
  someone reading English papers has English in their language list, which does not mean they want an English interface). After a change the options page reloads whole: the copy is read once before the first frame,
  and a half-Chinese half-English interface looks far worse than half a second's delay.
- **`S` / `O` are live bindings, not constants.** A value computed at module top level does not follow a change (`const NAMES = { side: S.mode.side }` freezes
  the language of the moment of import); such tables go inside components and are computed per render. `tests/ui/locales.test.ts` guards this: after switching to English
  it checks every popup state for Chinese leaking through.
- **The styles and highlight colours shipped with the extension take their names from the interface language**; once the reader has renamed one, the reader's name is used (`profileName`).
  A configuration the reader added always keeps the name they wrote. The built-in prompts too (默认 · 精准改写, S-O-61c: `O.prompts.builtInNames` through `promptName`; the maintainer, 2026-09-28), which are copied, never renamed.
- **The target language's name is written in the interface language too**: the menu shows 「日语（日本語）」 / "Japanese (日本語)", the parentheses following
  the outer half, never mixing full-width and half-width. When an interface language has no table of language names the English names are read — adding a language need not start with 179 language names.
  **The row shows one name only** (`languageName`); the native name appears in the menu only (`languageLabel`) [decided, 2026-09-11, user feedback]:
  the row is one line of the interface, and where there is only one line, "Simplified Mandarin Chinese (简体中…)" is cut off mid-word in the English interface,
  while the Chinese interface, whose two names happen to coincide, shows a clean 「简体中文」 — a defect of the English side alone. Finding a language goes by the native name,
  and that is the menu's business.
  **The reader's rule is the other one** [decided, the maintainer, 2026-10-04]: wherever the PDF reader shows a target language — the toolbar's language button, the one in
  the reading options, S-R-13's sentence — it shows the language's own name (its endonym), exactly as its menu lists it, whatever the interface language:
  日本語, never 日语 or "Japanese" (`ownName`, from `LANG_CODE_TO_LOCALE_NAME`). An own name is one short name, so the cut-off argument above does not reach it.
  The popup's and the settings page's rows keep `languageName` and are not changed by this.
- **The language names in the interface and the ones sent to the model are two tables**: `LANG_CODE_TO_EN_NAME` holds the ISO 639-3 scholarly names
  (coded as "individual languages"), just right for the model — `Simplified Mandarin Chinese` is not the least ambiguous; for the reader it is a mouthful,
  and no product writes it so. `LANG_CODE_TO_EN_UI_NAME` overrides 14 entries on top of it (`Chinese (Simplified)`, `Arabic`,
  `Greek`, `Pashto`…), for the interface only. The base table is not changed because it enters the prompt: changing it means bumping `PROMPT_VERSION`
  and voiding the whole LLM cache, not worth it for a name. Directional words that really distinguish (`Western Frisian`, `Northern Sotho`) stay; parentheses
  naming a script (`Uzbek (Cyrillic)`, `Malay (Jawi)`) stay too — the reader really does get that script.

## 8. Feature coverage list

Every feature added on the main line is registered here first; a feature without a place is not designed yet.

| Feature | Source | Status | Where | Ids |
|---|---|---|---|---|
| Whole-page translation / show original | §10 | done | popup primary button; context menu (#146); shortcut Alt+T and the floating button's main button (the same toggle, the retranslate cue included) | S-P-50…53, P1–P9, P6b |
| The three comparison modes | §7 | done | popup mode bar; no in-page control | S-P-70…74 |
| Translation services (four built-in, the reader's own) + fallback chain | §8 | done | the popup's group / Settings · 翻译 | S-P-10…48, S-O-10…23 (ids reconciled with §3 on 2026-09-13) |
| Offline language pack download | §8.4 | done | popup service list + the settings page's Chrome row | S-P-40…43, S-O-11 |
| Prompt library (built-in / custom / import and export) | §8.2 | done | Settings · 翻译 · LLM; the popup's prompt row and menu | S-O-60…61c, S-P-47, S-P-49 |
| Glossary | §8.2 | done | Settings · 翻译 · LLM | S-O-62…63 |
| Translation styles (a configured list since v12) + custom CSS | §7.5 | done | Settings · 外观 | S-O-40…48 |
| How to translate: on demand or the whole paper (v20) | §10 | done | 翻译方式, Settings · 阅读 | S-O-50 (S-O-51 gone) |
| Cache statistics / clear | §9 | done | Settings · 数据 | S-O-70…73 |
| Config read-failure notice | §9 | done | top of the settings page (the popup's S-P-34 removed 2026-09-10) | S-O-02 |
| Thinking switch | §8.2 | done | the service form's 更多 | S-O-30 |
| Skeleton while loading / failed block retry | §7.6 | done | in page | S-I-01…02 |
| **Image translation**: a switch (the per-display list went with v20), progress, pause, retry | §15, PR #87–89 | done. [2026-09-21, issue #280] Bitmaps are read by the recogniser the extension ships (DESIGN §15.3): the macOS helper, its permission step and its guided install are gone, and with them S-P-86…88, S-O-25…27d, S-O-86…86b and P14…P14b — there is nothing left for a reader to set up | Settings · 阅读; the popup's foot, failure note and note; in-page overlay | S-O-24, S-P-35 / 60, S-I-04, P11 |
| **Reading typography** (font size / line height / width / spacing / colour / presets / reset) | #47 | decided, not built | Settings · 阅读 · typography card | — (no id yet; S-O-47 names the custom declarations) |
| Split-view dragging | #83 | experimental | in-page handle; one “恢复居中” in settings | S-I-05 (the settings entry has no id yet) |
| Free AI translation (hosted) | #97 | candidate | fourth item of the service list | — (no ids yet) |
| Microsoft translation | #98 | done | the service list (the shipped default) | S-P-32c / 44 / 46, S-O-10 |
| Hover highlight (sentence highlight on hover + the original floating up in translation-only mode) | #105 / #141 | done | the popup's foot switch; Settings · 外观 | S-P-80…81, S-O-49 |
| Image translation switch | §15 | done (2026-09-10) | the popup's foot switch; Settings · 阅读 | S-P-85, S-O-24 |
| Translation services the reader adds | §8.5 | done (2026-09-10, config v12) | Settings · 翻译; popup service menu | S-O-12…22, S-P-45 / 46 |
| Configuration lists for translation appearance and the highlight's colours | §7.5 | done (2026-09-10, config v12; the highlight's as swatches since 2026-09-27) | Settings · 外观 | S-O-40…49 |
| One appearance for the extension (`theme`) | the redesign's §3 | done (2026-09-27, config v20) | Settings · 外观; the reader's reading options | S-O-35, S-R-08 |
| Finding a paper from the popup | the redesign's §5.4 | done (2026-09-27) | the popup off a paper (P0) | S-P-03…08, P0a–P0g |
| A refused key remembered | the redesign's §4 | done (2026-09-27) | the popup's notes and service menu; Settings · 翻译 | S-P-32e, S-O-21a |
| The settings search and deep links | the redesign's §6.1 | done (2026-09-27) | the settings sidebar; the popup's 管理… rows, the reader's settings link | S-O-03, S-O-04, S-O-06 |
| Diagnostics log | #156 | done | Settings · 数据 | S-O-74 |
| In-page “switched” notice | proposed here | undecided | in page | S-I-03 |
| Reading toolbar | canvas proposal | undecided | in page | — |
| Background connectivity / block statistics | existing popup | removed | nowhere — the gallery never showed them, and `axt:ping` / `axt:stats` had no sender (noted 2026-09-13 and pruned) | — |

## 9. Open

1. The name "AI 模型" versus "AI 翻译" for the reader-added services.
2. Whether to build the in-page "switched" notice (S-I-03); without it the reader learns that the service changed only by opening the popup.
3. The field range and preset names of the typography card (#47), against the issue's acceptance items, if it is built.
4. Whether to bundle Manrope (about 60 KB woff2, Latin glyphs only); the system font stack today.

Decided and shipped, for the record: the product name (Read arXiv; DESIGN §3), the paused state's two buttons (S-P-52 / S-P-53), the searchable language list (S-P-22 / S-P-23).
