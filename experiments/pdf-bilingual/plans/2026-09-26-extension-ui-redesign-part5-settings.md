# The extension's interface, redesigned: Part 5, the settings page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the settings page as the design's §6 specifies — the frame with its sidebar, search and deep links;
one row grammar for every list; 翻译 (the services, adding and editing in place, the refused key, the LLM group with
its prompts and glossary), 外观, 阅读, 数据 and S-O-02 — with §8's motions, §9's accessibility and §10.2's words, every
measure settings-2's, and nothing the reader can do today lost unless §11 lists it.

**Architecture:** The page keeps its data layer (`src/entrypoints/options/data.ts`) and its rule that every control
writes at once. A frame (`App.tsx`) draws the sidebar and one section, or every section's matches while a search runs;
the search and the deep links work on attributes the rows carry (`data-row`, `data-search`), with no layout read. The
page's own controls live in `src/entrypoints/options/ui/` — the card, the row and its parts, the group heading, the undo
row, the confirm button, the combobox — beside Part 3's shared ones (`Button`, `Field`, `TextInput`, `Reveal`, `Radio`,
`Segmented`, `MenuList`) and Part 1's (`Switch`, `Popover`, `Icon`, `radioKeys`, `trackModality`). Its sheet is
`src/entrypoints/options/ui/settings.css`, every colour a role of `src/shared/tokens.ts` (the page adds none). A service
is added or re-keyed only once it connects: the connection test carries the service as it would be saved (`candidate`,
through the background as today's test is), and the page saves on success. The page never writes the refused-key
record: the background clears it when a service's saved key or address changes and when it is deleted, and on a
candidate's successful test only when the candidate carries the stored key and address. Until a section's task replaces it, the new frame draws the page's old section in its
place, so every commit runs.

**Tech Stack:** WXT 0.21, React 19, TypeScript, Tailwind v4 (ui.css only; the new page writes no utility classes), zod,
Lucide, Vitest + happy-dom, Playwright (Chromium) for the browser checks.

**Spec:** `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md` (the design): §6, §8, §9, §10.2,
§11, S-O-02 (§6.7). The prototype the maintainer agreed, local and read-only:
`/Users/cheongzhiyan/Downloads/readarxiv-test/design/extension-ui/settings-2/` (`index.html`, `app.js`,
`tools/body.html`, `tools/extra.css`, `README.md`, `png/`), with `../settings-review.md`. Section references (§n) are the
design's; where the design and the prototype disagree, the design wins (the list is in "Where the design and the
prototype disagree" below).

**Where:** the worktree `/Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/redesign-settings`, branch
`exp/ui-settings` (ruling 15). **The controller creates it** from Part 3's last commit before dispatching Task 50 —
`git worktree add ../redesign-settings -b exp/ui-settings <Part 3's last commit>` run from the `exp-pdf` worktree, then
`pnpm install` and `pnpm build` there — and merges it back into `exp/extension-ui-redesign` with a merge commit after
Part 4's popup. Implementers work only inside it and never create, move or remove a worktree.

## The controller's rulings this plan builds

`.superpowers/sdd/2026-09-26-extension-ui-redesign/plan-rulings.md` (rulings 1–11 fix Part 3's interfaces, 15–21 rule
this part's questions), Part 3's revised plan's section "What Parts 4 and 5 use"
(`experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-part3-controls.md`), the main plan's amended
"## Part 3's interfaces" (5e1274c1) and the design's amended §4 (bc0f63ea).

| Ruling | What this plan does with it | Task |
|---|---|---|
| 1 `MenuList` items carry `lang` | the interface language's menu writes each language in its own name with `lang` on its item | 53 |
| 2 `Button`'s `busy` | 连接中… and 更新并连接's wait are `busy` on the brand button: the words kept, a second submit refused by the button | 59 |
| 3 `words-in` in `controls.css` | a swapped description (翻译方式) runs `animation: words-in 180ms ease-out`; the page defines no keyframes of its own for it | 50, 57 |
| 4 a disabled button on its size's neutral ground | the page draws no disabled look of its own; none of its buttons is disabled today (a form checks on submit, 导出… shows once there is something to export), and one that becomes so takes Part 3's | — |
| 6 `ui` paints no ground | the frame's root carries `ui`; the page paints its own `page` ground on `body` (Task 52's sheet) | 52 |
| 9 the tokens are Part 3's | the page adds none; a role it turns out to need is raised with the controller, not added in the worktree | all |
| 10 `SegmentOption.icon` a `ReactNode` | 外观's options pass `<Icon node={…} size={14} />` | 55 |
| 11 the action API is Part 3's | the menus pick with `onPick`, mark the choice with `checked`; the settings page's menus carry no `action` (Chrome's 下载 is a button in its row, not a menu item) | 53, 60 |
| — `Segmented` with a value none of its options holds | draws no step and keeps its first enabled segment in the tab order (Part 3's plan): 浓淡 at 0.85 shows none chosen | 56 |
| — `Radio` in `radio.ts`, the radio's direct child | a radio row renders `<Radio />` as the first child of its `role="radio"` element | 50 |
| — the `.spin` class | the busy status's loader turns with Part 3's `.spin` (still under reduced motion) | 50 |
| — `useRejected` in `src/ui/use-rejected.ts` (ruled on Part 6's draft) | the page imports Part 3's hook and writes none of its own; its tests are Part 3's, and Task 60's test mocks it to drive the rows | 60 |
| — the `tip-shadow` role (Part 3) | the page draws no tooltip, so it names no tooltip shadow | — |
| 15 the worktree | `.worktrees/redesign-settings` on `exp/ui-settings`, created by the controller from Part 3's last commit | — |
| 16 connect first, save on success | adds and edits (and a new key) test the definition as a `candidate`; the page saves on success. The background clears a mark on a candidate's success only when it carries the stored key and address (`testsStoredKey`, beside the guard); another key's success and any failure touch nothing (the controller's ruling on this plan's first open point) | 58–60 |
| 17 every write to the record is the background's | the page never calls `markRejected` / `clearRejected` and sends no clearing message: a key or an address saved after its connection succeeds, and a deletion, are cleared by the background's configuration watcher | 58, 60 |
| 18 复制一份 and 清除 kept; the derived words stand | 复制一份 in the style editor's bar, 清除 under a saved key; 消息不能为空, 原文为空 / 译文为空, the heading 「PDF」, the cache line's English | 54, 56, 57, 59, 62, 63 |
| 19 a heading's aside is `ink-2` | `.o-aside` is `ink-2`; Task 50 amends the design's §6.2 wording | 50 |
| 20 files outside the page | listed in "Files outside the settings page", disjoint from Part 4's; the shared test files and the allowlist are re-joined by the controller at the second merge | — |
| 21 the trailing glyph 16 px, 浓淡 1 / 0.7 / 0.5 | as drawn | 50, 56 |
| 22, 23 | the PDF reader's service menu reading the record is Part 6's; `styleTile` (which the new page draws its samples with) is moved by Part 7, not deleted | — |

**Kept for Part 7**: the `O` keys the old components of `src/ui/appearance/*` still read (`O.reading.add`, `reset`,
`resetHint`, `editTitle`, `editAria`, `duplicate`, `bandColor`, `custom`, `opacity`, `advanced`, `advancedHint`,
`preview`, `color`, `followText`, …, `O.services.cancel`, `deleteConfirm`, `O.close`) stay until Part 7 removes their
readers. So do `O.services.baseURLHint` and `O.services.more`, which Part 3's controls sheet reads
(`src/entrypoints/controls/specimens/forms.tsx:25`, `:49`): Part 7 repoints the controls sheet's `specimens/forms.tsx`
at words the pages use, then deletes the two keys.

## Settled after the rulings

1. **An edit that keeps a refused key and connects** (adopted): a candidate's success clears the service's mark when
   the candidate's key and address equal the stored service's — the stored key answered (§4: "a successful connection
   clears it"). Another key's success does not clear (the save that follows changes the key, and the watcher clears
   then); a failure touches nothing. The decision is `testsStoredKey` in `src/entrypoints/background/health-guard.ts`,
   beside the fix wave's `isRefusal`, `shouldMarkRefusal`, `idsToClear` (e0901916). Task 58, with its tests.
2. **A deletion undone** (accepted): the page stores a deletion at once (the choice falls back to Microsoft at once,
   §6.3), so the background's watcher clears a refused service's mark at the deletion, not when the undo passes;
   undone, the service comes back unmarked until its next refusal marks it again (one refused request). Task 60's test
   says so. Storing the deletion only when the undo passes would leave the popup listing a service the settings page
   shows as gone for 5 s.

Nothing is open.

## Where the design and the prototype disagree, and the reading this plan takes

- **浓淡**: settings-2 steps 1 / 0.8 / 0.6; the design 1 / 0.7 / 0.5 (0.7 is 淡一档's). The design's.
- **The trailing icon button's glyph**: settings-2 draws a 14 px glyph in the 28 px square pulled 6 px out, which ends
  its glyph box at 15 px from the card (its own probe reports the square at 8). The design's rule — "its glyph ends on
  the trailing edge the switches keep" — holds exactly with Lucide's default 16 px glyph (28 − 16 = 12, 6 a side). The
  plan draws 16 px and its probe holds the glyph box to 14.
- **Text in `ink-3`**: settings-2 writes the glossary's column names and hint, the model list's ids, the local-key
  hint and the search's section names in `ink-3`, which reads 3.49–3.64:1, under 4.5:1 — the design's own reason for
  `ink-2` placeholders (§2.1). The plan writes them in `ink-2`, and the group heading's aside too, the one place the
  design named `ink-3` for words (ruling 19; Task 50 amends §6.2's wording).
- **The search field's focus**: settings-2 draws a 3 px halo on any focus; §9 says a field clicked shows its edge, not
  a ring. The plan draws the 1 px edge on focus and the keyboard's 2 px ring, as Part 3's `TextInput` does.
- **Copy**: where settings-2's words differ from §10.2 (the refused-key sentence, the cache line, the diagnostics hint,
  the glossary hint's full stop, 「需要 API Key」 in shot 17), §10.2 and "as today" win.
- **Editing a service** saves only on a successful connection, as adding does: §6.3 opens "the same form", and §11's
  reason for adding ("a service without a working key should not exist") holds for an edit. Stated here because §11
  names adding only.
- **The model field** holds the model's id (what is stored and what the row's 「{模型} · {主机}」 shows); the list shows
  the endpoint's name for it beside the id, and the name becomes the service's default name.
- **The key field** is a password field, as today's is (settings-2 shows it in clear).

## Every control of today's page, and where it goes

Today's sections (`src/entrypoints/options/App.tsx`, `sections/*`, `PromptManager.tsx`), each control mapped. "Goes"
only where §11 (or §10's list of words that go, for an element §11 removes) says so.

| Today (file · control) | Id | New place | Task |
|---|---|---|---|
| App · the five sections in the navigation | S-O-01 | sidebar 翻译 · 外观 · 阅读 · 数据 with icons | 52 |
| App · the hash keeps the place; `#services`, `#pdf-reader` from the popup and the reader | S-O-01 | `#<section>[/<row>]`, lit on arrival; `#services`, `#prompts`, `#pdf-reader` aliased | 52 |
| App · settings that cannot be read: notice, reason, 重置设置 → 确认重置, reset failed | S-O-02 | a card at the top of the column, `ConfirmButton`; only 数据 drawn | 52 |
| App · the interface language menu under the navigation | S-O-05 | the sidebar's foot, a menu opening upward; a row a search shows | 53 |
| Services · Microsoft / Google / Chrome cards with a radio | S-O-10 | radio rows of the 翻译服务 card | 60 |
| Services · Microsoft greyed for a language it cannot | — | the same row greyed, 「不支持当前目标语言」 | 60 |
| Services · Chrome's 下载, 语言包下载中, 当前不可用 | S-O-11 | the Chrome row: neutral 下载, the status, greyed | 60 |
| Services · 我的服务: radio, name, 模型 · 主机 | S-O-12 | radio rows in the same card | 60 |
| Services · the empty list's sentence | S-O-13 | goes (§10: S-O-10 … 15's words; 添加服务… is always there) | 60 |
| Services · 添加服务 → drawer | S-O-14/15 | 添加服务…, the form in place | 59, 60 |
| Services · 编辑 → drawer | S-O-14 | 「…」 → 编辑…, the form under the row | 60 |
| Drawer · 名称 | S-O-15 | 名称（选填）, the model's name by default | 59 |
| Drawer · 接口地址 and its hint | S-O-15/16 | 接口地址 with three suggestions; the hint goes (§10) | 59 |
| Drawer · API Key, saved as •••• | S-O-17 | editing: empty with 「已保存 · 留空则不改」 | 59 |
| Drawer · 清除 (the saved key) | S-O-17 | kept: 「清除」 under the key field while a saved key is kept (§11 does not list it; ruling 18) | 59 |
| Drawer · 本机地址可以不填 | S-O-18 | the key's label: 「API Key · 本机地址可以不填」 | 59 |
| Drawer · 模型, typed | — | a combobox over the endpoint's list; typing still takes a name | 59 |
| Drawer · 更多选项 ▸ 深度思考 | S-O-30 | 更多 ▸ 深度思考 | 59 |
| Drawer · 连接 / 连接中…: saves, then tests | S-O-19 | 连接 / 连接中…: tests, saves on success only (§11) | 58, 59 |
| Drawer · 已连接 · {ms} ms / the S-E reason | S-O-20 | the row's 「已连接 · {ms} ms」 / 「连接失败：{原因}」 beside the button | 59, 60 |
| Drawer · 删除 → 确认删除; a chosen one falls back to Microsoft | S-O-21 | 「…」 → 删除, the undo row for 5 s; back chosen on undo | 60 |
| Services · 出问题时自动改用免费服务 | S-O-22 | a card under the services, while an LLM service is chosen | 60 |
| Services · 目标语言, the searchable menu | S-O-23 | a row and its popover | 60 |
| Services · 图片翻译 | S-O-24 | 阅读 · 图片翻译 | 57 |
| Reading · 译文样式's tiles: choose | S-O-40 | 外观 · 译文样式 radio rows, each its sample | 56 |
| Reading · 添加配置 (styles) | S-O-41 | 「＋ 新建样式…」 | 56 |
| Reading · 重置 (styles) | S-O-41 | 「恢复内置样式」 on the group's heading | 56 |
| Reading · the chosen tile's pencil → drawer | S-O-43 | a pencil on every row, the editor under it | 56 |
| Drawer · 预览 | S-O-43 | the editor's preview | 56 |
| Drawer · 名称 | S-O-43 | 名称 | 56 |
| Drawer · 文字颜色: 跟随原文, eight swatches, the picker | S-O-44 | 颜色: 跟随原文, the palette, 自选颜色 | 56 |
| Drawer · 透明度, a slider | S-O-43 | 浓淡 原样 · 淡一些 · 更淡 (§6.4) | 56 |
| Drawer · 下划线, 线宽 once a line is chosen | S-O-45 | 下划线, 线宽 a sub-line | 56 |
| Drawer · 悬停前模糊 | S-O-46 | 更多 ▸ 悬停前模糊 | 56 |
| Drawer · 高级 (declarations) | S-O-47 | 更多 ▸ 自定义 CSS, checked in place | 56 |
| Drawer · 复制一份 | S-O-48 | kept: 「复制一份」 in the editor's bar (§11 does not list it; ruling 18) | 56 |
| Drawer · 删除 → 确认删除; the first style chosen after | S-O-48 | 删除样式, the undo row | 56 |
| Drawer · 完成 | S-O-48 | 完成 | 56 |
| Reading · 对照高亮 | S-P-80 | 外观 · 对照高亮 | 55 |
| Reading · 背景高亮's tiles: choose | S-O-49 | the 颜色 sub-row's swatches | 55 |
| Reading · 背景高亮's 添加配置, 重置, editor (名称, 底色, 透明度, 复制一份, 删除) | S-O-49 | goes (§11, A5); a swatch holds one colour of the reader's; earlier profiles stay as swatches | 55 |
| Reading · 译文在哪里打开 | S-O-49b | 阅读 · a small segmented control | 57 |
| Reading · 显示悬浮按钮 | S-O-49c | 阅读 · a switch | 57 |
| Reading · 翻译方式 | S-O-50 (v20) | 阅读 · a small segmented control, the description following | 57 |
| PdfReader · 在 arXiv 的 PDF 上使用对照阅读器 | S-O-55 | 阅读 · the PDF group | 57 |
| PdfReader · 同步滚动 | S-O-55 | its sub-row while the reader is on | 57 |
| PdfReader · 外观 | S-O-55 | 外观 · the first row, for the whole extension (§3) | 55 |
| PdfReader · 深色时调暗页面 | S-O-55 | 外观 · a sub-row for 跟随系统 and 深色 | 55 |
| Prompts · 只对 LLM 服务生效 | S-O-60 | the LLM group's aside; with no LLM service, one line | 63 |
| PromptManager · the list: built-in and one's own, a radio each | S-O-61 | 提示词 row → a radio list in place | 63 |
| PromptManager · 查看 a built-in (read-only) | S-O-61 | the chosen prompt's text under it, read as words | 63 |
| PromptManager · 复制并自定义 | S-O-61 | 复制后修改 → 「{名称}（副本）」, chosen and open | 63 |
| PromptManager · 新建 | S-O-61 | 「＋ 新建提示词…」 | 63 |
| PromptManager · 编辑: 名称, system, user, 插入变量 | S-O-61 | in place: 名称, 指令, 消息, the variables as labels | 63 |
| PromptManager · 删除 → 确认删除 | S-O-61 | 删除, the undo row | 63 |
| PromptManager · 导入 JSON | S-O-61 | 导入… | 63 |
| PromptManager · 导出自定义 (greyed with none) | S-O-61 | 导出…, shown once there is one to export | 63 |
| Prompts · 术语表: a text box, 「{n} 条」, per-line reasons, too long | S-O-62/63 | 术语表 row → a table in place (§11, T8) | 62, 63 |
| Data · 已缓存的译文, 清空 → 确认清空, 已清空, 没能读取缓存 | S-O-70–72 | a row with `ConfirmButton` | 54 |
| Data · 已缓存的 PDF 译文 | S-O-73 | a row with `ConfirmButton` | 54 |
| Data · 诊断日志, 导出, 没能导出 | #156 | a row with a neutral 导出 | 54 |
| Every draft (a form, an editor, an unfinished glossary row) holds the reload an interface language takes | — | kept: `drafts.hold()` in each | 53–63 |

## Global Constraints

The main plan's, verbatim:

- Chrome 131 is the floor (`minimum_chrome_version`); no polyfills, no cross-browser branches.
- No `:has()` in any style sheet (DESIGN §7.2; `tests/styles/no-has.test.ts`).
- Every colour, shadow and ease a surface draws names a token of `src/shared/tokens.ts`; no raw colour in new code.
- Everything injected into arXiv's pages is prefixed `axt-` / `data-axt-` / `--axt-` (hard rule 2).
- The reader renders pixel for pixel as before (§2.4): `experiments/pdf-bilingual/spikes/reader-pixels.mjs` against the
  baseline Task 3 records, after every task that touches its sheet, its controls or its settings.
- Developer-visible text is English; reader-facing words come from the locale packs (`src/locales/zh-CN.ts`, `en.ts`),
  never hard-coded. No reader-facing string names a technical path (§1). `pnpm lint` runs the English gate; a file that
  must hold Chinese (a test finding a control by its Chinese name) gets an exact entry in `scripts/english-allowlist.txt`.
- API keys never enter the service health record, a log line, a cache key, a fixture or git (hard rule 5).
- The gate before each commit that ends a task: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, judged by the
  exit code.
- Commits are local on `exp/extension-ui-redesign`; the stage goes out as one pull request when the last part is done
  (never `main`; merge commits). Files are added by name, never `git add -A`. Never commit
  the untracked `experiments/pdf-bilingual/spikes/geometry-lock*.mjs` / `prompt-ablation.mjs` (another session's
  work). The gallery's break harness that stood beside them was removed on 2026-09-27: a task that changes
  `src/entrypoints/gallery/main.tsx` commits it with its own files. Never run `git reset --hard`,
  `git checkout -- <path>`, `git restore`, `git clean` or `git stash`: rewind with `--mixed` / `--soft`, and put back
  only files named, by their content.
- Every commit message is `type(scope): summary` and ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

Part 5's own:

- **Branch**: Part 5's commits are on `exp/ui-settings` in `.worktrees/redesign-settings` (the controller merges it
  into `exp/extension-ui-redesign`); the main plan's "local on `exp/extension-ui-redesign`" reads as that branch here.
- **Lane**: this part changes the settings page (`src/entrypoints/options/**`), the `O` section of the two locale
  packs, `tests/options/**`, and the files "Files outside the settings page" lists. It never deletes a file of `src/ui/`
  (Part 7 does) and never edits the packs' `S` or `R` sections (it reads them: the popup's service and row names are the
  same words).
- **No token, no shared control changed** (ruling 9): every colour a role `src/shared/tokens.ts` already has; a role the
  page turns out to need is raised with the controller, never added in the worktree. Part 3's controls are used through
  their props, and their class names (`ui`, `btn`, `kbd`, `field`, `field-hint`, `field-error`, `input`, `radio`,
  `reveal`, `spin`, `seg`, `pop`, `tip`, `switch`, `swatch`) name none of this page's own controls. Three rules place a
  shared control in the page's context without redrawing it: a muted row's `.radio` greyed (Task 50), and `.pop.o-up`
  / `.pop.o-end`, where a popover opens (Task 53).
- **The refused-key record is the background's** (ruling 17): nothing on this page calls `markRejected` or
  `clearRejected` or sends a message that would; it reads the record through Part 3's `useRejected`
  (`src/ui/use-rejected.ts`) and nothing else. The background
  answers a candidate's test itself (Task 58).
- **The page's sheet**: `src/entrypoints/options/ui/settings.css`, imported after `ui.css`, its component rules in
  `@layer components` so that a rule here wins a tie with a shared control's; its classes start `o-` (the page is the
  extension's own document, not injected, so hard rule 2 does not apply). New code on this page writes no Tailwind
  utility class and no inline colour; an inline `style` carries only data (a style's sample, a band's colour, a
  segmented control's agreed width).
- **Pages translating stay on the chain they started on.** Nothing on this page sends `axt:engine-ready` with a `scope`;
  `rebindAll` only when a deletion is committed (its undo past), as today; adding, editing, re-keying or choosing a
  service sends nothing — the configuration's own watcher rebuilds the chain for the sessions that start after.
- **Unit tests** run in English (`setLocale('en')` or `applyLocaleFrom('en')`) and find words through `O`, `S`, `R`, so
  no Chinese enters them; the e2e suites find controls by their Chinese names, as they do today.
- **Motion** (§8): every motion named in the task that owns it, with its reduced-motion form in the same sheet block.
- **Comments, CSS comments and test names are English** (CLAUDE.md § Language): a control is named by its role or
  its key (`O.data.clear`), never by its Chinese words. Chinese stays only in the packs, in the labels e2e scripts and
  probes find controls by, and in multilingual test data or expectations of product copy. Before committing, `git add`
  the task's files and run `node scripts/check-english.mjs` (it reads the index, and its counts are exact: a file
  over or under its entry fails); a file that must hold Chinese gets its exact entry in
  `scripts/english-allowlist.txt`, with a one-line English reason, added in the same commit.

## Review Focus

- **The refused-key record is the background's alone** (rulings 16, 17): a candidate's test clears a mark only when it
  succeeded with the stored key and address, and marks nothing; nothing on the page marks or clears one or sends a
  message that would — a new key or address is only saved, and the background's configuration watcher clears the mark.
  Pinned in Task 58 (`testsStoredKey` and the handler: same key + success → cleared, new key + success → not, failure →
  untouched), Task 60 (the logs: `connect`, `patch`, nothing after; and a source check over
  `src/entrypoints/options/**`).
- **The chosen service deleted and undone within 5 s**: it comes back at its place and chosen, and nothing
  irreversible has happened — no `rebindAll`, no origin released. Only when the undo row expires (or the page is left)
  do those run, in today's order. Its refused-key mark, if it had one, is cleared by the background when the deletion is
  stored ("Settled after the rulings" 2). Pinned in Task 60.
- **An address typed by hand for an origin not granted**: no permission is asked outside a gesture and the model list
  does not load by itself; a press on the model field (or 连接) asks, then loads. For an origin already granted the list
  loads once the address and the key have been still 300 ms. Pinned in Task 59.
- **A style whose opacity an earlier version set between the steps** (0.85): the editor opens with no 浓淡 step chosen
  and writes nothing; choosing a step writes it. Pinned in Task 56.
- **A glossary row with one side filled**: not saved, its reason shown at the row once the focus leaves it, a draft
  held (the interface language's reload waits); a pasted batch over `GLOSSARY_LIMITS` saves nothing and says so.
  Pinned in Task 62.

## Measures and colours

settings-2's values as this plan writes them (each is in the task's CSS; this is the index a reviewer checks against).

| What | Value | Colour (role) |
|---|---|---|
| Sidebar | 232 px; 18 × 12 in; items 2 px apart | `page` |
| The mark and 设置 | 32 px high, 10 px in, 10 px below; 13 px / 600; the mark 20 px | `ink` |
| Search field | 32 px, radius 8, 10 px in, gap 8, 12 px below; icon 14 | `chrome`, edge `chrome-line`; focus 1 px `ink-3`, keyboard 2 px `focus` |
| A section in the sidebar | 32 px, radius 8, 10 px in, gap 10; icon 14 | `ink-2` / icon `ink-3`; current `chrome` + `raised-shadow`, `ink`; hover `ink` 5 % |
| Main column | up to 680 px; 30 px from the top, 48 px from the sidebar, 40 px at the foot | — |
| Section title | 20 px / 600, −0.01 em, 18 px below; while searching 13 px / 500, 18 px above, 8 below | `ink`; searching `ink-2` |
| Card | radius 10, 4 px in; 8 px between cards | `chrome`, `card-shadow` |
| Group heading | 13 px / 600 on the 14 px edge; 22 px after the card before, 8 px above its own; aside 12 px | `ink`; aside `ink-2` (ruling 19) |
| Row | ≥ 48 px, 8 × 10 in, radius 6, gap 12; label 13 px / 1.4; description 12 px / 1.4, 2 px below | `ink` / `ink-2` |
| Edges | controls 14, words 42 after a lead, 70 at level 2; trailing 14 | — |
| Separator | 0.5 px, inset 10 px | `chrome-line` |
| Hover | the row's box to the card's inner edge, radius 6 | `ink` 4 %; separators step aside |
| Trailing icon button | 28 px square, radius 7, pulled 6 px; glyph 16 | `ink-2`; hover `fill` + `ink` |
| Value, chevron | gap 4; chevron 14 | `ink-2` / `ink-3` |
| Status | 12 px, gap 5, icon 14 | words `ink-2`; icon `danger` / `success` |
| Form in place | 12 px above, 14 below, 42 / 14 edges; fields 14 px apart; label 12 px, 6 px above the field | `ink-2` |
| Suggestion chips | 24 px, radius 999, 9 px in, 6 px apart, 12 px | `button`, `ink-2`; hover `fill`, `ink` |
| Form bar | gap 10; 连接 32 px brand, 16 px in; text buttons 32 px, 10 px in, radius 7; note 12 px | `brand` / `ink-2` |
| Model list | 6 px under the field, radius 10, 4 px in, ≤ 172 px; items 30 px, radius 7, 12.5 px; id 11.5 px | `chrome` + `pop-shadow`; active `fill`; id `ink-2` |
| Prompt panel | 2 px above, 10 below, from 70 to 14; text 12 × 14 in, radius 8, 12.5 px / 1.7 | `field`; editable edge `field-edge`, focus 1 px `ink-3` |
| Variable label | 19 px, 6 px in, radius 5, 11.5 px, 1 px up | `fill`, `ink-2` |
| Glossary table | from 42 to 14, 2 px above, 12 below; radius 8; head 28 px, 11.5 px; rows 32 px, 13 px; remove 24 px in a 32 px column | edge `field-edge`; head `field`, `ink-2`; row lines `chrome-line`; cell focus `ink` 4 % |
| Style editor | 8 px above, 14 below, from 42 to 14, 14 px apart; preview 12 × 14 in, radius 8, 1.7 | `field`; the original `ink-2` 12.5 px |
| Swatches | 20 px, 10 px apart; chosen 1.5 px ring 2 px out | `line-strong` |
| Small segmented control | 26 px (`.seg.small`); 翻译方式 220, 译文在哪里打开 200, 浓淡 210, 下划线 300, 线宽 120 px wide | the shared `.seg` |
| Undo row | ≥ 48 px; words 12.5 px | `ink-2` |
| Confirm | the neutral 28 px button; armed: trash icon, words | `button-danger`, `danger` |
| Search hit | 1 px in, radius 2 | `mark` |
| Deep link | a fill over the row, held 30 %, gone at 1.4 s | `ink` 9 % |

## Files

| File | Task | Responsibility |
|---|---|---|
| `src/entrypoints/options/ui/settings.css` (new) | 50–63 | The page's sheet: the frame, the row grammar, the page's controls, the sections' parts |
| `src/entrypoints/options/ui/Row.tsx` (new) | 50 | `Row` and its parts: `Status`, `Value`, `IconButton` |
| `src/entrypoints/options/ui/Card.tsx` (new) | 50 | `Card` (and its separators' stepping aside), `GroupHeading` |
| `src/entrypoints/options/ui/search.tsx` (new) | 50, 52 | `SearchQuery`, `Marked`; `applySearch` |
| `src/entrypoints/options/ui/UndoRow.tsx`, `ConfirmButton.tsx`, `Combobox.tsx` (new) | 51 | The undo row, the confirm in place, the model field |
| `src/entrypoints/options/ui/lists.ts` (new) | 51 | `withUndo`, `insertAt`, `useLinger`, `shut`, `withItem`, `segmentWidth` |
| `src/entrypoints/options/ui/ColourPick.tsx` (new) | 55 | A colour of one's own |
| `src/entrypoints/options/hash.ts` (new) | 52 | Sections, deep links, the old hashes' aliases; `reach` |
| `src/entrypoints/options/App.tsx` | 52–63 | The frame |
| `src/entrypoints/options/main.tsx` | 50 | The sheet, after `ui.css` (the modality is Part 3's) |
| `src/entrypoints/options/sections/Language.tsx` (new) | 53 | The interface language: the sidebar's foot, the row a search shows |
| `src/entrypoints/options/sections/Data.tsx` | 54 | 数据 |
| `src/entrypoints/options/sections/Appearance.tsx`, `StyleEditor.tsx` (new) | 55, 56 | 外观 |
| `src/entrypoints/options/sections/Reading.tsx` | 57 | 阅读 (replaces the old one) |
| `src/entrypoints/options/connect.ts`, `models.ts` (new) | 58 | The connection test, the model list |
| `src/entrypoints/options/permissions.ts` | 58 | `hasHostPermission` |
| `src/providers/translate-service.ts`, `src/providers/transport.ts`, `src/entrypoints/background/handlers.ts`, `src/entrypoints/background/health-guard.ts` | 58 | A call's `candidate`; the record's answer to it (`testsStoredKey`) |
| `src/entrypoints/options/sections/ServiceForm.tsx` (new) | 59 | `ServiceForm`, `KeyForm` |
| `src/entrypoints/options/sections/Translate.tsx` (new) | 60, 63 | 翻译 |
| `src/entrypoints/options/sections/Glossary.tsx`, `PromptText.tsx`, `Prompts.tsx`, `Llm.tsx` (new or rewritten) | 62, 63 | The LLM group |
| deleted: `sections/{Services,ServiceDrawer,PdfReader}.tsx`, `PromptManager.tsx`, the old `sections/{Reading,Prompts}.tsx` | 57, 60, 63 | — |
| `src/locales/zh-CN.ts`, `src/locales/en.ts` (`O`) | 50–63 | §10.2's words |
| `tests/options/*` | 50–63 | The page's tests |
| `tests/e2e/options-page.mjs`, `extension.mjs`, `local-endpoint.mjs`; spikes | 52–63 | The browser checks |
| `tests/e2e/probes/settings-align.mjs` (new) | 64 | The alignment probe and the screenshots |

## Files outside the settings page

Every file this part changes outside `src/entrypoints/options/**` and `tests/options/**`, for the controller to check
against Part 4's (the popup's files, the packs' `S` section, `tests/popup/**`, and the lines its plan names). None of
the first group is in Part 4's plan; Part 4 names `src/pdf-reader/ui/Menus.tsx` only to say it leaves it alone (ruling
22 gives its record to Part 6, which starts from this part's link change).

| File | Task | What changes |
|---|---|---|
| `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md` | 50 | §6.2's one line: the aside `ink-2` (ruling 19) |
| `src/pdf-reader/ui/links.ts`, `src/pdf-reader/ui/Menus.tsx`, `src/pdf-reader/ui/FailureCard.tsx`, `tests/pdf-reader/ui/toolbar.test.ts` | 52 | the reader's links to the settings page take the new hashes; nothing else |
| `src/providers/translate-service.ts`, `src/providers/transport.ts`, `tests/providers/transport.test.ts` | 58 | a call's `candidate`, asked off the chain |
| `src/entrypoints/background/health-guard.ts`, `src/entrypoints/background/handlers.ts`, `tests/background/health-guard.test.ts`, `tests/background/handlers.test.ts` | 58 | `testsStoredKey` beside the guard; the handler's branch for a candidate; their tests |
| `src/providers/glossary.ts` | 62 | its separator exported |
| `tests/ui/strings.test.ts` | 60 | the drawer's issue sentence's case goes with its key |
| `tests/e2e/options-page.mjs` | 52–61 | the settings helpers (`openSection`, `addService`, `clearKeyAndReconnect`, `seedService`, `chooseStyle`, `setPreload`, `setSwitch`) |
| `tests/e2e/local-endpoint.mjs` | 61 | the endpoint answers `GET /v1/models`; the list's check |
| `experiments/pdf-bilingual/spikes/cache-faults.mjs`, `experiments/pdf-bilingual/spikes/cache-revisit.mjs`, `experiments/pdf-bilingual/spikes/viewer-faults.mjs` | 61 | their settings steps |
| `tests/e2e/probes/settings-align.mjs` (new) | 64 | the alignment probe and the screenshots |

Shared with Part 4, each part in its own place; the controller re-joins them at the second merge (ruling 20):

| File | This part | Part 4 |
|---|---|---|
| `src/locales/zh-CN.ts`, `src/locales/en.ts` | the `O` section only (reads `S` and `R`, never edits them) | `S` |
| `tests/e2e/extension.mjs` | the settings blocks (the interface language, the cache, the highlight, the styles, the preload, the wrong key, the cleared key, S-O-02's waits, the prompt) | the popup's blocks and its mode buttons |
| `experiments/pdf-bilingual/spikes/entries.mjs` | its settings sections (3 and 5) | `popupOver` |
| `tests/ui/locales.test.ts` | the ASCII pattern gains `\|O\.reading\.pdf$` (57); the per-line glossary sentence's case goes (63) | its own literals and cases |
| `scripts/english-allowlist.txt` | the counts of the files above and of the tests and the probe this part adds (recounted with `node scripts/check-english.mjs`; each task names its numbers) | its own files' counts |

Not touched by this part: `src/shared/tokens.ts`, `src/styles/tokens.css`, `src/styles/controls.css`, `src/ui/controls/**`
(Part 3's, ruling 9), `src/ui/**` otherwise (Part 7 deletes), `package.json`, `wxt.config.ts`.

---

# Part 5: the settings page

### Task 50: the row grammar

The page's own building blocks (§6.2): the card, the row and its parts, the group heading, the search's highlight, and
the sheet that measures them. Nothing mounts them yet.

**Files:**
- Create: `src/entrypoints/options/ui/settings.css`
- Create: `src/entrypoints/options/ui/search.tsx`
- Create: `src/entrypoints/options/ui/Row.tsx`
- Create: `src/entrypoints/options/ui/Card.tsx`
- Modify: `src/entrypoints/options/main.tsx` (imports the sheet)
- Modify: `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md` (§6.2: the aside's colour, ruling 19)
- Test: `tests/options/rows.test.ts`, `tests/options/sheet.test.ts`
- Check: `scripts/english-allowlist.txt` (the English gate: nothing new in it; the design keeps its 175)

**Interfaces:**
- Consumes: Part 1's `Icon` (`@/ui/controls/Icon`), `Switch` (`@/ui/controls/Switch`); Part 3's `Radio` (`@/ui/controls/radio`).
- Produces:
  - `SearchQuery: React.Context<string>` (the query, trimmed and lowercased; `''` when none) and
    `Marked({ text }: { text: string })` in `@/entrypoints/options/ui/search`.
  - `Row(props: RowProps)` in `@/entrypoints/options/ui/Row`, where `RowProps` is
    `{ row?: string; words?: string; label: string; tag?: string; description?: string; swap?: boolean; sample?: CSSProperties; lead?: ReactNode; level?: 0 | 1 | 2; trailing?: ReactNode; muted?: boolean; quiet?: boolean; arriving?: boolean }`
    and one of `{ kind?: 'plain'; toggles?: boolean }`,
    `{ kind: 'button'; onPress?: () => void; expanded?: boolean; buttonProps?: ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> } }`,
    `{ kind: 'radio'; checked: boolean; disabled?: boolean; onChoose: (how: 'pointer' | 'key') => void; radioRef?: Ref<HTMLSpanElement> }`.
    It renders `[data-srow]` with `data-row`, `data-search` (label, description and words, lowercased), `data-level`,
    `data-lead`, `data-press` (a row that lights on hover), and its parts `[data-part="lead" | "words" | "trail"]`.
  - `Status({ tone, arriving, children }: { tone?: 'alert' | 'ok' | 'busy'; arriving?: boolean; children: ReactNode })`,
    `Value({ children })`, `IconButton({ icon, label, hover, ...button }: { icon: IconNode; label: string; hover?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>)` (`[data-icon-button]`).
  - `Card({ children, gap, row, role, label, onKeyDown })` (`[data-card]`) and
    `GroupHeading({ title, aside, action }: { title: string; aside?: string; action?: ReactNode })` (`[data-heading]`)
    in `@/entrypoints/options/ui/Card`.
  - The classes `.o-card`, `.o-row`, `.o-lead`, `.o-words`, `.o-label`, `.o-desc`, `.o-trail`, `.o-value`, `.o-status`,
    `.o-icon-button`, `.o-heading`, `.o-aside`, `.o-hit`, `.o-sr`, `.o-arrive`, `.o-swap` (no class of Part 3's
    reserved list: `ui`, `btn`, `kbd`, `field`, `field-hint`, `field-error`, `input`, `radio`, `reveal`, `spin`, `seg`,
    `pop`, `tip`, `switch`, `swatch` — it uses them, it does not redefine them).

- [ ] **Step 1: Check Part 3's names before writing a line against them**

Run:
```bash
ls src/ui/controls
grep -n "^export function\|^export const\|^export type\|^export interface" src/ui/controls/*.tsx src/ui/controls/*.ts
grep -n "busy\|lang" src/ui/controls/Button.tsx src/ui/controls/MenuList.tsx
grep -n "^export" src/ui/use-rejected.ts
grep -n "trackModality" src/entrypoints/options/main.tsx src/entrypoints/popup/main.tsx src/ui/first-paint.ts
grep -n "@keyframes words-in\|@keyframes turn\|^ *\.spin\|\.btn\.text" src/styles/controls.css
```
Expected, as Part 3's plan's "What Parts 4 and 5 use" names them: `Button.tsx` (`Button` with `kind`, `size`, `icon`,
`shortcut`, `disabled`, `busy`), `Kbd.tsx`, `Field.tsx` (`Field`, `TextInput`, `useField`), `radio.ts` (`Radio`,
`radioKeys`), `Reveal.tsx`, `Segmented.tsx` (`Segmented`, `SegmentOption` with a `ReactNode` icon and `size`),
`MenuList.tsx` (`MenuList`, `MenuListItem` with `checked`, `lang`, `action`, `manage`; `onPick`, `onAction`,
`onClose`) beside Part 1's `Icon.tsx`, `Popover.tsx`, `Switch.tsx`, `modality.ts`, `tip.tsx`, `transitions.ts`;
`src/ui/use-rejected.ts` exporting `useRejected(): readonly string[]`;
`trackModality()` called before both pages' first paint (in their `main.tsx` or in `src/ui/first-paint.ts`); `controls.css` holding `@keyframes words-in`, `@keyframes turn` with `.spin`, and
`.btn.text` at 10 px of padding and a radius of 7. If a file, a name or a prop differs, stop and report it: every import
in this plan is written against those names.

- [ ] **Step 2: Write the failing tests**

`tests/options/rows.test.ts`:

```ts
// The settings page's row grammar (the redesign's design, §6.2): the parts a row carries and the edges they sit on
// (measured in a real browser by tests/e2e/probes/settings-align.mjs), how each kind of row answers a press, the
// separators stepping aside for a hovered row, and the search's marks
import { Ellipsis } from 'lucide'
import { createElement as h } from 'react'
import { describe, expect, it } from 'vitest'
import { Card, GroupHeading } from '@/entrypoints/options/ui/Card'
import { IconButton, Row, Status, Value } from '@/entrypoints/options/ui/Row'
import { SearchQuery } from '@/entrypoints/options/ui/search'
import { Switch } from '@/ui/controls/Switch'
import { mountElement } from '../ui/render-hook'

const rows = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[data-srow]')]

describe('the row grammar (the redesign\'s design, §6.2)', () => {
  it('a row carries its place, its search words and its parts; a lead and a level say which edge its words take', async () => {
    const m = await mountElement(h(Card, null,
      h(Row, { row: 'translate/language', label: 'Target language', description: 'Into', words: 'Language', trailing: h(Value, null, 'Japanese') }),
      h(Row, { label: 'Sub', level: 1, lead: h('span', null, '+') })))
    const [first, second] = rows(m.container)
    expect(first!.dataset.row).toBe('translate/language')
    expect(first!.dataset.search).toBe('target language into language')
    expect([...first!.querySelectorAll('[data-part]')].map(e => e.getAttribute('data-part'))).toEqual(['words', 'trail'])
    expect(first!.hasAttribute('data-press')).toBe(false)
    expect(second!.dataset.level).toBe('1')
    expect(second!.hasAttribute('data-lead')).toBe(true)
    expect(second!.querySelector('[data-part="lead"]')).not.toBeNull()
    await m.unmount()
  })

  it('a radio row is named by its label, described by its description, and chosen by a press anywhere but a button in it', async () => {
    const chosen: string[] = []
    const m = await mountElement(h(Card, { role: 'radiogroup', label: 'Services' }, h(Row, {
      kind: 'radio', label: 'Google', description: 'Free', checked: false, onChoose: how => chosen.push(how),
      trailing: h(IconButton, { icon: Ellipsis, label: 'More for Google', hover: true }),
    })))
    const radio = m.container.querySelector<HTMLElement>('[role="radio"]')!
    expect(radio.getAttribute('aria-checked')).toBe('false')
    expect(radio.tabIndex).toBe(-1)
    expect(document.getElementById(radio.getAttribute('aria-labelledby')!)!.textContent).toBe('Google')
    expect(document.getElementById(radio.getAttribute('aria-describedby')!)!.textContent).toBe('Free')
    rows(m.container)[0]!.click()
    m.container.querySelector<HTMLElement>('[data-icon-button]')!.click()
    radio.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(chosen).toEqual(['pointer', 'key'])
    expect(rows(m.container)[0]!.hasAttribute('data-press')).toBe(true)
    // the mark is the radio's direct child, so that it reads the radio's state (Part 3's Radio), and the row has a lead
    expect(radio.firstElementChild!.classList.contains('radio')).toBe(true)
    expect(rows(m.container)[0]!.hasAttribute('data-lead')).toBe(true)
    await m.unmount()
  })

  it('a disabled radio row is greyed and chosen by nothing', async () => {
    const chosen: string[] = []
    const m = await mountElement(h(Card, null, h(Row, { kind: 'radio', label: 'Chrome', checked: false, disabled: true, muted: true, onChoose: how => chosen.push(how) })))
    rows(m.container)[0]!.click()
    expect(chosen).toEqual([])
    expect(m.container.querySelector('[role="radio"]')!.getAttribute('aria-disabled')).toBe('true')
    expect(rows(m.container)[0]!.hasAttribute('data-muted')).toBe(true)
    await m.unmount()
  })

  it('a switch\'s whole row is its label (§9): a press on its words flips the switch, a press on the switch flips it once', async () => {
    const flips: boolean[] = []
    const m = await mountElement(h(Card, null, h(Row, { label: 'Images', toggles: true, trailing: h(Switch, { label: 'Images', checked: false, onChange: on => flips.push(on) }) })))
    m.container.querySelector<HTMLElement>('.o-label')!.click()
    m.container.querySelector<HTMLElement>('[role="switch"]')!.click()
    expect(flips).toEqual([true, true])
    await m.unmount()
  })

  it('a button row is one button, its value and chevron inside it', async () => {
    let pressed = 0
    const m = await mountElement(h(Card, null, h(Row, { kind: 'button', label: 'Prompt', expanded: false, onPress: () => { pressed++ }, trailing: h(Value, null, 'Default') })))
    const button = m.container.querySelector<HTMLButtonElement>('button[data-srow]')!
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.querySelector('.o-value svg')).not.toBeNull()
    button.click()
    expect(pressed).toBe(1)
    await m.unmount()
  })

  it('a hovered row\'s separators step aside: its own, and the next row the reader can see, past a closed reveal', async () => {
    const press = () => {}
    const m = await mountElement(h(Card, null,
      h(Row, { kind: 'button', label: 'One', onPress: press }),
      h(Row, { kind: 'button', label: 'Two', onPress: press }),
      h('div', { inert: true }, h(Row, { label: 'Hidden' })),
      h(Row, { kind: 'button', label: 'Three', onPress: press }),
      h(Row, { label: 'Plain' })))
    const all = rows(m.container)
    all[1]!.dispatchEvent(new Event('pointerover', { bubbles: true }))
    expect(all.map(r => r.hasAttribute('data-sep-off'))).toEqual([false, true, false, true, false])
    all[3]!.dispatchEvent(new Event('pointerover', { bubbles: true }))
    expect(all.map(r => r.hasAttribute('data-sep-off'))).toEqual([false, false, false, true, true])
    // a row that does not light on hover moves no separator
    all[4]!.dispatchEvent(new Event('pointerover', { bubbles: true }))
    expect(all.some(r => r.hasAttribute('data-sep-off'))).toBe(false)
    m.container.querySelector<HTMLElement>('[data-card]')!.dispatchEvent(new Event('pointerleave'))
    expect(all.some(r => r.hasAttribute('data-sep-off'))).toBe(false)
    await m.unmount()
  })

  it('marks what a search found, in the label and the description, whatever the case', async () => {
    const m = await mountElement(h(SearchQuery.Provider, { value: 'high' }, h(Card, null, h(Row, { label: 'Highlight', description: 'Highlights on hover' }))))
    expect([...m.container.querySelectorAll('mark.o-hit')].map(e => e.textContent)).toEqual(['High', 'High'])
    await m.unmount()
  })

  it('a status carries its tone\'s icon; a heading its aside and its action', async () => {
    const m = await mountElement(h('div', null,
      h(GroupHeading, { title: 'LLM', aside: 'Only for LLM services', action: h('button', null, 'Restore') }),
      h(Status, { tone: 'alert' }, 'API key no longer valid')))
    expect(m.container.querySelector('[data-heading] h2')!.textContent).toBe('LLM')
    expect(m.container.querySelector('.o-aside')!.textContent).toBe('Only for LLM services')
    expect(m.container.querySelector('.o-status[data-tone="alert"] svg')).not.toBeNull()
    await m.unmount()
  })
})
```

`tests/options/sheet.test.ts`:

```ts
// The settings page's own sheet (the redesign's design, §6.2, §8): the house rules — no :has() (DESIGN §7.2), no colour
// but a token's — and the agreed measures that no unit test sees drawn (tests/e2e/probes/settings-align.mjs measures
// them in a browser)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SHEET = readFileSync(join(import.meta.dirname, '../../src/entrypoints/options/ui/settings.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('the settings page\'s sheet', () => {
  it('carries no :has() and names no colour but through a token', () => {
    expect(SHEET).not.toContain(':has(')
    expect(SHEET).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgba?\(|hsla?\(/i)
  })

  it('writes the row grammar\'s measures: a row 48 px, 8 × 10 in; a level 28 px more; the trailing icon button 28 px pulled 6 px', () => {
    expect(SHEET).toMatch(/\.o-row \{[^}]*min-height: 48px;[^}]*padding: 8px 10px;/)
    expect(SHEET).toContain('.o-row[data-level="1"] { padding-inline-start: 38px; }')
    expect(SHEET).toContain('.o-row[data-level="2"] { padding-inline-start: 66px; }')
    expect(SHEET).toMatch(/\.o-icon-button \{[^}]*width: 28px; height: 28px;[^}]*margin-inline-end: -6px;/)
    expect(SHEET).toMatch(/\.o-card \{[^}]*padding: 4px; border-radius: 10px;/)
    // a heading's aside is words a reader reads: ink-2, 4.5:1 (ink-3 is under it; ruling 19)
    expect(SHEET).toContain('.o-aside { color: var(--ink-2);')
  })

  it('gives every motion its reduced form', () => {
    const motions = [...SHEET.matchAll(/animation: (o-[a-z-]+)/g)].map(m => m[1])
    expect(motions.length).toBeGreaterThan(0)
    const reduced = SHEET.slice(SHEET.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const name of new Set(motions)) expect(SHEET.includes(`@keyframes ${name}`), name).toBe(true)
    expect(reduced).toContain('.o-arrive')
    expect(reduced).toContain('.o-swap')
    // the reader's words-in is Part 3's (controls.css): used here, never defined again
    expect(SHEET).toContain('animation: words-in 180ms ease-out')
    expect(SHEET).not.toContain('@keyframes words-in')
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run tests/options/rows.test.ts tests/options/sheet.test.ts`
Expected: FAIL — `Failed to resolve import "@/entrypoints/options/ui/Card"`, and `ENOENT` for `settings.css`.

- [ ] **Step 4: Write the search's context and marks**

`src/entrypoints/options/ui/search.tsx`:

```tsx
// The settings page's search (the redesign's design, §6.1): the query every row reads to mark what it found, the words
// on `mark`. The pass that hides what a search did not find is `applySearch`, below (Task 52)
import { createContext, type ReactNode, useContext } from 'react'

/** The query, trimmed and lowercased; '' while there is none */
export const SearchQuery = createContext('')

/** A row's words with what the search found on `mark` */
export function Marked({ text }: { text: string }) {
  const q = useContext(SearchQuery)
  if (!q) return text
  const lower = text.toLowerCase()
  const parts: ReactNode[] = []
  let at = 0
  for (let i = lower.indexOf(q); i >= 0; i = lower.indexOf(q, at)) {
    parts.push(text.slice(at, i), <mark key={i} className="o-hit">{text.slice(i, i + q.length)}</mark>)
    at = i + q.length
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}
```

- [ ] **Step 5: Write the row and its parts**

`src/entrypoints/options/ui/Row.tsx`:

```tsx
// The settings page's row (the redesign's design, §6.2): at least 48 px, a label over a description, a value, a switch,
// a status or a button at its trailing edge. Three leading edges and one trailing, 14 px from the card's: controls at
// 14, words at 42 after a leading control, one step of 28 px per level. Every part carries `data-part`, so that the
// alignment probe (tests/e2e/probes/settings-align.mjs) measures what is drawn. A row carries its place (`row`, the deep
// link's `section/row`) and its words (`data-search`), which the search and the links read — attributes, no layout.
// Three kinds: a plain row (whose whole surface is its switch's label when it `toggles`), a button row (a disclosure, a
// menu, an add row), a radio row (the radio and the words are the control; buttons at its end stay their own)
import { ChevronDown, CircleAlert, CircleCheck, type IconNode, LoaderCircle } from 'lucide'
import { type ButtonHTMLAttributes, type CSSProperties, type MouseEvent, type ReactNode, type Ref, useId, useRef } from 'react'
import { Icon } from '@/ui/controls/Icon'
import { Radio } from '@/ui/controls/radio'
import { Marked } from './search'

interface RowBase {
  /** `section/row`: the deep link's target and the search's unit (§6.1) */
  row?: string
  /** words a search finds the row by besides its own (O.search.keywords) */
  words?: string
  label: string
  /** a small label after the name: a prompt of one's own carries O.prompts.mine */
  tag?: string
  description?: string
  /** the description is swapped as a choice changes (the way to translate): it comes in with the reader's words-in (§8; Part 3 moved it into controls.css) */
  swap?: boolean
  /** the description written in a translation style: the styles list's sample */
  sample?: CSSProperties
  /** a leading control on the controls' edge (a plus, an alert); the words move to the next edge. A radio row draws its
   *  own mark there */
  lead?: ReactNode
  /** one step of 28 px per level (§6.2) */
  level?: 0 | 1 | 2
  trailing?: ReactNode
  /** greyed: a service that cannot be chosen yet */
  muted?: boolean
  /** its words in ink-2: an add row, a line with nothing to set */
  quiet?: boolean
  /** it has just come (a service added, a style or a prompt made): §8's row motion */
  arriving?: boolean
}

export type RowProps = RowBase & (
  | { kind?: 'plain'; toggles?: boolean }
  | { kind: 'button'; onPress?: () => void; expanded?: boolean; buttonProps?: ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> } }
  | { kind: 'radio'; checked: boolean; disabled?: boolean; onChoose: (how: 'pointer' | 'key') => void; radioRef?: Ref<HTMLSpanElement> }
)

/** a press on one of these inside a row is theirs, not the row's */
const OWN_CONTROL = 'button, a, input, [role="switch"]'
const inControl = (e: MouseEvent, row: Element) => {
  const hit = (e.target as Element).closest(OWN_CONTROL)
  return hit !== null && hit !== row && row.contains(hit)
}

export function Row(props: RowProps) {
  const { row, words, label, tag, description, swap, sample, lead, level = 0, trailing, muted, quiet, arriving } = props
  const labelId = useId()
  const descId = useId()
  // a swapped description comes in with words-in from its first change on — not as the section is first drawn. Once it
  // has changed, the description's span is keyed by its words, so that each new one mounts, and animates, once
  const first = useRef(description)
  const changed = useRef(false)
  if (description !== first.current) changed.current = true
  const swapping = swap === true && changed.current
  const press = props.kind === 'button' || props.kind === 'radio' || (props.kind !== 'button' && props.kind !== 'radio' && props.toggles === true)
  const attrs = {
    className: 'o-row',
    'data-srow': '',
    'data-row': row,
    'data-search': `${label} ${description ?? ''} ${words ?? ''}`.trim().toLowerCase(),
    'data-level': level || undefined,
    'data-lead': lead || props.kind === 'radio' ? '' : undefined,
    'data-press': press ? '' : undefined,
    'data-muted': muted ? '' : undefined,
    'data-quiet': quiet ? '' : undefined,
    'data-arriving': arriving ? '' : undefined,
  }
  const leadPart = lead ? <span data-part="lead" className="o-lead">{lead}</span> : null
  const wordsPart = (
    <span data-part="words" className="o-words">
      <span id={labelId} className="o-label"><Marked text={label} />{tag && <span className="o-var o-tag">{tag}</span>}</span>
      {description && (
        <span key={swapping ? description : 'description'} id={descId} className={swapping ? 'o-desc o-swap' : 'o-desc'} data-sample={sample ? '' : undefined} style={sample}>
          <Marked text={description} />
        </span>
      )}
    </span>
  )
  const trail = trailing ? <span data-part="trail" className="o-trail">{trailing}</span> : null

  if (props.kind === 'button') {
    return (
      // a popover's trigger (buttonProps) says itself whether it is expanded; a disclosure says it with `expanded`
      <button type="button" {...attrs} aria-expanded={props.expanded} {...props.buttonProps} onClick={props.onPress}>
        {leadPart}{wordsPart}{trail}
      </button>
    )
  }
  if (props.kind === 'radio') {
    const { checked, disabled, onChoose, radioRef } = props
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: the radio inside is the keyboard's; the row is its surface for the pointer
      // biome-ignore lint/a11y/noStaticElementInteractions: as above
      <div {...attrs} onClick={e => { if (!disabled && !inControl(e, e.currentTarget)) onChoose('pointer') }}>
        {/* biome-ignore lint/a11y/useSemanticElements: an ARIA radio drawn as a row (§6.2), its group's keys are its card's */}
        <span ref={radioRef} role="radio" aria-checked={checked} aria-disabled={disabled || undefined} tabIndex={checked ? 0 : -1}
          aria-labelledby={labelId} aria-describedby={description ? descId : undefined} className="o-choice"
          onKeyDown={e => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onChoose('key') } }}>
          {/* the mark reads its state from the radio it is the direct child of (Part 3's Radio): on the controls' edge */}
          <Radio />
          {wordsPart}
        </span>
        {trail}
      </div>
    )
  }
  const toggles = props.toggles === true
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the switch is the keyboard's control; the row is its label for the pointer (§9)
    // biome-ignore lint/a11y/noStaticElementInteractions: as above
    <div {...attrs} onClick={toggles ? e => { if (!inControl(e, e.currentTarget)) e.currentTarget.querySelector<HTMLElement>('[role="switch"]')?.click() } : undefined}>
      {leadPart}{wordsPart}{trail}
    </div>
  )
}

/** A value at a row's end, with the chevron that says the row opens something */
export function Value({ children }: { children: ReactNode }) {
  return (
    <span className="o-value">
      <span className="o-value-words">{children}</span>
      <Icon node={ChevronDown} size={14} />
    </span>
  )
}

const TONES: Record<'alert' | 'ok' | 'busy', IconNode> = { alert: CircleAlert, ok: CircleCheck, busy: LoaderCircle }

/** A state at a row's end: an alert in danger, a success in green, a wait turning; the words stay ink-2 (§5.2) */
export function Status({ tone, arriving = false, children }: { tone?: 'alert' | 'ok' | 'busy'; arriving?: boolean; children: ReactNode }) {
  return (
    <span className="o-status" data-tone={tone}>
      {/* a wait turns with Part 3's `.spin`, under reduced motion too: a loader that stops reads as stuck */}
      {tone && <Icon node={TONES[tone]} size={14} className={tone === 'busy' ? 'spin' : arriving ? 'o-arrive' : undefined} />}
      {children}
    </span>
  )
}

/**
 * A trailing icon button: a 28 px square pulled 6 px outward, so that its 16 px glyph ends on the trailing edge the
 * switches keep (better-ui: optical alignment). `hover`: a row of one's own shows it on the row's hover or the
 * keyboard's focus, always on a touch screen (§6.2)
 */
export function IconButton({ icon, label, hover = false, ...button }: { icon: IconNode; label: string; hover?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} data-icon-button="" data-on-hover={hover ? '' : undefined} className="o-icon-button" {...button}>
      <Icon node={icon} />
    </button>
  )
}
```

The swapped description in plain words: `first` holds the description the row was first drawn with; once one differs,
`changed` stays true and the span is keyed by its words and carries `o-swap`, so each new description mounts a new span
whose animation runs once. A re-render with the same words keeps the span; before any change nothing animates.

- [ ] **Step 6: Write the card and the group heading**

`src/entrypoints/options/ui/Card.tsx`:

```tsx
// Cards and group headings (the redesign's design, §6.2). A card owns its rows' separators: the hairline on a hovered
// row's top edge and the next shown row's step aside, as grouped lists do. Found by attribute, never by layout: a row in
// a closed reveal is inert, a row a search left out carries data-miss
import { type KeyboardEvent, type ReactNode, useEffect, useRef } from 'react'

const shownRows = (card: HTMLElement) => [...card.querySelectorAll<HTMLElement>('[data-srow]')].filter(r => !r.closest('[inert]') && !r.hasAttribute('data-miss'))

export function Card({ children, gap = false, row, role, label, onKeyDown }: {
  children: ReactNode
  /** 8 px after the card before it */
  gap?: boolean
  /** `section/row`: a deep link to the whole list (translate/services, appearance/styles) */
  row?: string
  role?: 'radiogroup'
  label?: string
  onKeyDown?: (e: KeyboardEvent) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const card = ref.current
    if (!card) return
    let current: HTMLElement | null = null
    const clear = () => { for (const r of card.querySelectorAll('[data-sep-off]')) r.removeAttribute('data-sep-off') }
    const over = (e: Event) => {
      const row = (e.target as Element).closest<HTMLElement>('[data-srow]')
      if (row === current) return
      current = row
      clear()
      if (!row || !row.hasAttribute('data-press') || row.closest('[data-card]') !== card) return
      const rows = shownRows(card)
      row.setAttribute('data-sep-off', '')
      rows[rows.indexOf(row) + 1]?.setAttribute('data-sep-off', '')
    }
    const leave = () => { current = null; clear() }
    card.addEventListener('pointerover', over)
    card.addEventListener('pointerleave', leave)
    return () => {
      card.removeEventListener('pointerover', over)
      card.removeEventListener('pointerleave', leave)
    }
  }, [])
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a radio group's arrows, when it is one (§9)
    <div ref={ref} className="o-card" data-card="" data-row={row} data-gap={gap ? '' : undefined} role={role} aria-label={label} onKeyDown={onKeyDown}>
      {children}
    </div>
  )
}

/** A group's heading on the words' edge, an aside or a text button at its end */
export function GroupHeading({ title, aside, action }: { title: string; aside?: string; action?: ReactNode }) {
  return (
    <div className="o-heading" data-heading="">
      <h2>{title}</h2>
      {aside && <span className="o-aside">{aside}</span>}
      {action}
    </div>
  )
}
```

- [ ] **Step 7: Write the sheet**

`src/entrypoints/options/ui/settings.css`:

```css
/* The settings page's own sheet (the redesign's design, §6): its frame, the row grammar and the controls only this page
   has. Every colour a role of src/shared/tokens.ts and every measure settings-2's, the prototype the maintainer agreed.
   Imported after ui.css; the component rules join its `components` layer, so that a rule here wins a tie with a shared
   control's. Later tasks append their blocks below this one */
@layer components {
  /* §6.2 a card: chrome, radius 10, 4 px in; a hairline and a 1 px shadow in light, a hairline of white 6 % in dark */
  .o-card { position: relative; padding: 4px; border-radius: 10px; background: var(--chrome); box-shadow: var(--card-shadow); }
  .o-card[data-gap] { margin-top: 8px; }
  /* a group's heading on the words' edge: 22 px after the card before it, 8 px above its own */
  .o-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 18px; margin: 22px 14px 8px; }
  .o-heading h2 { margin: 0; font-size: 13px; font-weight: 600; }
  .o-aside { color: var(--ink-2); font-size: 12px; }
  .o-title + .o-heading { margin-top: 0; }
  /* a row: at least 48 px, 8 × 10 in, radius 6. The edges, from the card's: controls 14 (its 4 + the row's 10), words 42
     after a leading control (16 + 12), one step of 28 per level; the trailing edge 14 */
  .o-row { position: relative; display: flex; align-items: center; gap: 12px; box-sizing: border-box; width: 100%; min-height: 48px; padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); font: inherit; text-align: start; }
  button.o-row { cursor: pointer; transition: background-color 150ms ease-out; }
  button.o-row:focus-visible { outline-offset: -2px; }
  .o-row[data-level="1"] { padding-inline-start: 38px; }
  .o-row[data-level="2"] { padding-inline-start: 66px; }
  .o-row[data-press] { cursor: pointer; }
  /* the hairline between rows, inset 10 px, drawn by the row below; a card's first row has none */
  .o-row::before { content: ""; position: absolute; inset: 0 10px auto; height: 0.5px; background: var(--chrome-line); transition: opacity 150ms ease-out; }
  .o-card > .o-row:first-child::before, .o-row[data-first]::before { content: none; }
  /* the hover: the row's fill to the card's inner edge, radius 6 (the card's 10 less its 4); the separators on either
     side step aside (Card.tsx marks them) */
  @media (hover: hover) {
    .o-row[data-press]:hover { background: color-mix(in oklab, var(--ink) 4%, transparent); }
    .o-row[data-sep-off]::before { opacity: 0; }
  }
  .o-lead { display: inline-flex; flex: none; justify-content: center; width: 16px; color: var(--ink-2); }
  .o-lead .o-danger { color: var(--danger); }
  .o-words { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
  .o-label { font-size: 13px; line-height: 1.4; }
  .o-desc { color: var(--ink-2); font-size: 12px; line-height: 1.4; }
  /* a style's sample: the translation's sentence written in the style itself */
  .o-desc[data-sample] { color: var(--ink); font-size: 13px; line-height: 1.5; }
  .o-row[data-quiet] .o-label, .o-row[data-muted] .o-label { color: var(--ink-2); }
  .o-row[data-muted] .radio { opacity: 0.45; }
  /* a radio row: the radio and the words are the control; its keyboard ring runs to the row's leading edge */
  .o-choice { display: flex; flex: 1; align-items: center; gap: 12px; min-width: 0; margin-block: -8px; margin-inline-start: -10px; padding-block: 8px; padding-inline-start: 10px; border-radius: 6px; outline: none; }
  .o-row[data-level="1"] > .o-choice { margin-inline-start: -38px; padding-inline-start: 38px; }
  .o-row[data-level="2"] > .o-choice { margin-inline-start: -66px; padding-inline-start: 66px; }
  .o-choice:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
  .o-trail { display: inline-flex; flex: none; align-items: center; gap: 12px; }
  .o-value { display: inline-flex; align-items: center; gap: 4px; min-width: 0; color: var(--ink-2); }
  .o-value svg { flex: none; color: var(--ink-3); }
  .o-status { display: inline-flex; flex: none; align-items: center; gap: 5px; color: var(--ink-2); font-size: 12px; font-variant-numeric: tabular-nums; }
  .o-status[data-tone="alert"] svg { color: var(--danger); }
  .o-status[data-tone="ok"] svg { color: var(--success); }
  /* a trailing icon button: a 28 px square pulled 6 px out, so that its 16 px glyph ends on the trailing edge */
  .o-icon-button { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 28px; height: 28px; margin-inline-end: -6px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--ink-2); cursor: pointer; transition: opacity 150ms ease-out, background-color 150ms ease-out, scale 150ms ease-out; }
  @media (hover: hover) { .o-icon-button:hover { background: var(--fill); color: var(--ink); } }
  .o-icon-button:active { scale: 0.96; }
  /* a row of one's own carries its actions behind it: shown on the row's hover or the keyboard's focus, always on touch */
  .o-icon-button[data-on-hover] { opacity: 0; }
  .o-row:hover .o-icon-button[data-on-hover], .o-icon-button[data-on-hover]:focus-visible, .o-icon-button[data-on-hover][aria-expanded="true"] { opacity: 1; }
  @media (hover: none) { .o-icon-button[data-on-hover] { opacity: 1; } }
  /* a small label in the words: a prompt of one's own, O.prompts.mine (and, in Task 63, a prompt's variables) */
  .o-var { display: inline-flex; align-items: center; height: 19px; padding: 0 6px; border-radius: 5px; background: var(--fill); color: var(--ink-2); font-size: 11.5px; vertical-align: 1px; }
  .o-tag { margin-inline-start: 6px; }
  /* a search hit, behind the words */
  .o-hit { padding: 0 1px; border-radius: 2px; background: var(--mark); color: inherit; }
  .o-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  /* a narrow window: a row's end moves under its words when they need the room (§9: 320 px) */
  @media (width < 640px) {
    .o-row { flex-wrap: wrap; }
    .o-words { flex: 1 1 12em; }
    .o-trail { margin-inline-start: auto; }
  }
}
/* §8: an icon arriving (connected, cleared) — scale, opacity and blur; a description swapped, with the reader's words-in
   (Part 3's, in controls.css). A wait turns with Part 3's .spin */
@keyframes o-icon-in { from { opacity: 0; scale: 0.25; filter: blur(4px); } }
.o-arrive { animation: o-icon-in 300ms var(--ease); }
.o-swap { animation: words-in 180ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .o-arrive { animation: none; }
  .o-swap { animation: none; }
  .o-row::before, button.o-row, .o-icon-button { transition: none; }
  .o-icon-button:active { scale: 1; }
}
/* forced colours (Windows' contrast themes) drop the fills: a hovered row is outlined */
@media (forced-colors: active) { .o-row[data-press]:hover { outline: 1px solid Highlight; outline-offset: -1px; } }
```

In `src/entrypoints/options/main.tsx`, after its first line, `import '@/styles/ui.css'`, add (the rest — the
`await prepareFirstPaint(…)` before the first paint, the render — stays as it is):

```ts
// the settings page's own sheet (the redesign's design, §6), after the shared one so that its rules win a tie
import './ui/settings.css'
```

- [ ] **Step 8: Amend the design's §6.2: the aside is `ink-2`**

In `experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md`, §6.2's card paragraph (ruling 19),
replace

```
  heading may carry an aside at its trailing end (12 px, `ink-3`) or a text button.
```

with

```
  heading may carry an aside at its trailing end (12 px, `ink-2`: `ink-3` words read under 4.5:1) or a text button.
```

Nothing else in the design changes.

- [ ] **Step 9: Run the tests**

Run: `pnpm vitest run tests/options/rows.test.ts tests/options/sheet.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 10: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0. Then `git add` the files and run `node scripts/check-english.mjs` again — it reads the index, so only
now does it see the new files: it passes with the allowlist as it is (the new files hold no CJK line; the design's
entry stays at 175, its §6.2 line holding none before or after).

```bash
git add src/entrypoints/options/ui/settings.css src/entrypoints/options/ui/search.tsx src/entrypoints/options/ui/Row.tsx src/entrypoints/options/ui/Card.tsx src/entrypoints/options/main.tsx experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-design.md tests/options/rows.test.ts tests/options/sheet.test.ts scripts/english-allowlist.txt
node scripts/check-english.mjs
git commit -m "feat(options): the settings page's row grammar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 51: the undo row, the confirm in place, the combobox

The page's three other controls (§6.2, §6.3, §6.6) and the small list helpers the sections share.

**Files:**
- Create: `src/entrypoints/options/ui/UndoRow.tsx`, `src/entrypoints/options/ui/ConfirmButton.tsx`,
  `src/entrypoints/options/ui/Combobox.tsx`, `src/entrypoints/options/ui/lists.ts`
- Modify: `src/entrypoints/options/ui/settings.css` (append)
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`O.undo`)
- Modify: `tests/options/sheet.test.ts` (the row motion's reduced form)
- Test: `tests/options/controls.test.ts`

**Interfaces:**
- Consumes: `Row` (Task 50); Part 3's `Button` (`@/ui/controls/Button`), `TextInput` (`@/ui/controls/Field`);
  `useMenuNav` (`@/ui/menu-nav`).
- Produces:
  - `UNDO_MS = 5000`; `UndoRow({ name, onUndo, onExpire, level, focus }: { name: string; onUndo: () => void; onExpire: () => void; level?: 0 | 1; focus?: boolean })`.
  - `DISARM_MS = 3000`; `ConfirmButton({ label, confirmLabel, doneLabel, done, onConfirm }: { label: string; confirmLabel: string; doneLabel?: string; done?: boolean; onConfirm: () => void })`.
  - `ComboOption = { id: string; name?: string }`;
    `Combobox({ value, onValue, options, busy, noMatch, onOpen, ref, ...input }: { value: string; onValue: (text: string, option?: ComboOption) => void; options: readonly ComboOption[] | null; busy?: boolean; noMatch: string; onOpen?: () => void; ref?: Ref<HTMLInputElement> } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>)`.
  - In `lists.ts`: `withUndo<T, G extends { index: number }>(items: readonly T[], gone: readonly G[]): ({ item: T } | { gone: G })[]`,
    `insertAt<T>(list: readonly T[], index: number, item: T): T[]`, `useLinger<T>(value: T | null, ms?: number): T | null`,
    `shut(id: string): void`, `withItem<T extends { id: string }>(list: readonly T[], next: T): T[]`,
    `segmentWidth(px: number): CSSProperties`.
  - `O.undo: { deleted: (name: string) => string; undo: string }`.

- [ ] **Step 1: The words**

In `src/locales/zh-CN.ts`, inside `const O = {`, after `fallbackResetFailed: …,` add:

```ts
  /** §6.2: deleting is undone, not confirmed — the row gives way to this for 5 s */
  undo: { deleted: (name: string) => `已删除「${name}」`, undo: '撤销' },
```

In `src/locales/en.ts`, at the same place:

```ts
  undo: { deleted: name => `Deleted “${name}”`, undo: 'Undo' },
```

- [ ] **Step 2: Write the failing tests**

`tests/options/controls.test.ts`:

```ts
// The settings page's own controls (the redesign's design, §6.2, §6.3, §6.6): the undo row that stands for 5 s where a
// deleted row was, the confirm in place that turns back after 3 s untouched, the model field's combobox, and the list
// helpers the sections share
import { createElement as h, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Combobox, type ComboOption } from '@/entrypoints/options/ui/Combobox'
import { ConfirmButton, DISARM_MS } from '@/entrypoints/options/ui/ConfirmButton'
import { insertAt, withItem, withUndo } from '@/entrypoints/options/ui/lists'
import { UNDO_MS, UndoRow } from '@/entrypoints/options/ui/UndoRow'
import { O, setLocale } from '@/ui/strings'
import { mountElement } from '../ui/render-hook'

const buttons = (c: HTMLElement) => [...c.querySelectorAll('button')]
const byText = (c: HTMLElement, text: string) => buttons(c).find(b => b.textContent?.trim() === text)

describe('UndoRow (§6.2)', () => {
  beforeEach(() => { setLocale('en'); vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })

  it('says what went, undoes it on a press, and expires after 5 s untouched', async () => {
    const seen: string[] = []
    const m = await mountElement(h(UndoRow, { name: 'Mine', onUndo: () => seen.push('undo'), onExpire: () => seen.push('expire') }))
    const row = m.container.querySelector<HTMLElement>('[data-undo]')!
    expect(row.getAttribute('role')).toBe('status')
    expect(row.textContent).toContain(O.undo.deleted('Mine'))
    byText(m.container, O.undo.undo)!.click()
    // a flush moves the fake clock on by itself (shouldAdvanceTime: 20 ms a tick), so the boundary is read with a margin
    vi.advanceTimersByTime(UNDO_MS - 1000)
    expect(seen).toEqual(['undo'])
    vi.advanceTimersByTime(1000)
    expect(seen).toEqual(['undo', 'expire'])
    await m.unmount()
  })

  it('takes the focus when the deletion was the keyboard\'s, and expires nothing once gone', async () => {
    const seen: string[] = []
    const m = await mountElement(h(UndoRow, { name: 'Mine', focus: true, onUndo: () => {}, onExpire: () => seen.push('expire') }))
    expect(document.activeElement).toBe(byText(m.container, O.undo.undo))
    await m.unmount()
    vi.advanceTimersByTime(UNDO_MS)
    expect(seen).toEqual([])
  })
})

describe('ConfirmButton (§6.6)', () => {
  beforeEach(() => { setLocale('en'); vi.useFakeTimers({ shouldAdvanceTime: true }); document.documentElement.setAttribute('data-axt-pointer', '') })
  afterEach(() => { vi.useRealTimers(); document.documentElement.removeAttribute('data-axt-pointer') })

  it('a press arms it, a second confirms; untouched for 3 s it turns back', async () => {
    let confirmed = 0
    const m = await mountElement(h(ConfirmButton, { label: 'Clear…', confirmLabel: 'Clear now', onConfirm: () => { confirmed++ } }))
    byText(m.container, 'Clear…')!.click()
    await m.flush()
    const armed = byText(m.container, 'Clear now')!
    expect(armed.hasAttribute('data-armed')).toBe(true)
    expect(armed.querySelector('svg')).not.toBeNull()
    vi.advanceTimersByTime(DISARM_MS)
    await m.flush()
    expect(byText(m.container, 'Clear…')).toBeDefined()
    expect(confirmed).toBe(0)
    byText(m.container, 'Clear…')!.click()
    await m.flush()
    byText(m.container, 'Clear now')!.click()
    await m.flush()
    expect(confirmed).toBe(1)
    await m.unmount()
  })

  it('does not turn back while the pointer rests on it', async () => {
    const m = await mountElement(h(ConfirmButton, { label: 'Clear…', confirmLabel: 'Clear now', onConfirm: () => {} }))
    const button = byText(m.container, 'Clear…')!
    button.dispatchEvent(new Event('pointerover', { bubbles: true }))
    button.click()
    await m.flush()
    vi.advanceTimersByTime(DISARM_MS * 2)
    await m.flush()
    expect(byText(m.container, 'Clear now')).toBeDefined()
    byText(m.container, 'Clear now')!.dispatchEvent(new Event('pointerout', { bubbles: true }))
    vi.advanceTimersByTime(DISARM_MS)
    await m.flush()
    expect(byText(m.container, 'Clear…')).toBeDefined()
    await m.unmount()
  })

  it('done, the owner\'s words and the success icon stand in its place', async () => {
    const m = await mountElement(h(ConfirmButton, { label: 'Clear…', confirmLabel: 'Clear now', doneLabel: 'Cleared', done: true, onConfirm: () => {} }))
    expect(m.container.querySelector('.o-status[data-tone="ok"]')!.textContent).toBe('Cleared')
    expect(buttons(m.container)).toHaveLength(0)
    await m.unmount()
  })
})

describe('Combobox (§6.3)', () => {
  const OPTIONS: ComboOption[] = [{ id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash' }, { id: 'qwen/qwen3-235b', name: 'Qwen3 235B' }, { id: 'x/plain' }]
  function Harness({ options, onOpen, picks }: { options: readonly ComboOption[] | null; onOpen?: () => void; picks: string[] }) {
    const [value, setValue] = useState('')
    return h(Combobox, { value, options, noMatch: 'No model matches', onOpen, 'aria-label': 'Model', onValue: (text, option) => { setValue(text); if (option) picks.push(option.id) } })
  }
  const type = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const key = (input: HTMLInputElement, k: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))

  it('lists the options on focus, filters as typed, and takes one with the arrows and Enter', async () => {
    const picks: string[] = []
    const m = await mountElement(h(Harness, { options: OPTIONS, picks }))
    const input = m.container.querySelector<HTMLInputElement>('input[role="combobox"]')!
    input.focus()
    await m.flush()
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(m.container.querySelectorAll('[role="option"]')).toHaveLength(3)
    type(input, 'qw')
    await m.flush()
    expect([...m.container.querySelectorAll('[role="option"]')].map(o => o.textContent)).toEqual(['Qwen3 235Bqwen/qwen3-235b'])
    key(input, 'Enter')
    await m.flush()
    expect(picks).toEqual(['qwen/qwen3-235b'])
    expect(input.value).toBe('qwen/qwen3-235b')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    await m.unmount()
  })

  it('says so when nothing matches, and keeps what was typed as the name', async () => {
    const picks: string[] = []
    const m = await mountElement(h(Harness, { options: OPTIONS, picks }))
    const input = m.container.querySelector<HTMLInputElement>('input[role="combobox"]')!
    input.focus()
    type(input, 'mistral-large')
    await m.flush()
    const only = m.container.querySelector('[role="option"]')!
    expect(only.textContent).toBe('No model matches')
    expect(only.getAttribute('aria-disabled')).toBe('true')
    key(input, 'Enter')
    await m.flush()
    expect(picks).toEqual([])
    expect(input.value).toBe('mistral-large')
    await m.unmount()
  })

  it('with no list yet opens none; a press on the field asks for one (a gesture), and busy says so', async () => {
    const opened: number[] = []
    const m = await mountElement(h(Harness, { options: null, picks: [], onOpen: () => opened.push(1) }))
    const input = m.container.querySelector<HTMLInputElement>('input[role="combobox"]')!
    input.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    input.focus()
    await m.flush()
    expect(opened).toEqual([1])
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(m.container.querySelector('[role="listbox"]')).toBeNull()
    await m.rerender(h(Combobox, { value: '', options: null, busy: true, noMatch: '', onValue: () => {} }))
    expect(m.container.querySelector('input')!.getAttribute('aria-busy')).toBe('true')
    await m.unmount()
  })
})

describe('the list helpers', () => {
  it('puts each undo row back where its row was', () => {
    expect(withUndo(['a', 'b', 'c'], [{ index: 1, name: 'x' }])).toEqual([{ item: 'a' }, { gone: { index: 1, name: 'x' } }, { item: 'b' }, { item: 'c' }])
    expect(withUndo(['a'], [{ index: 5, name: 'x' }])).toEqual([{ item: 'a' }, { gone: { index: 5, name: 'x' } }])
    expect(insertAt(['a', 'c'], 1, 'b')).toEqual(['a', 'b', 'c'])
    expect(withItem([{ id: 'a', n: 1 }, { id: 'b', n: 2 }], { id: 'a', n: 3 })).toEqual([{ id: 'a', n: 3 }, { id: 'b', n: 2 }])
    expect(withItem([{ id: 'a', n: 1 }], { id: 'c', n: 3 })).toEqual([{ id: 'a', n: 1 }, { id: 'c', n: 3 }])
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run tests/options/controls.test.ts`
Expected: FAIL — `Failed to resolve import "@/entrypoints/options/ui/Combobox"`.

- [ ] **Step 4: Write the list helpers**

`src/entrypoints/options/ui/lists.ts`:

```ts
// What the settings page's sections share: an undo row back in its row's place, a reveal's content kept while it
// folds away, a popover shut from a pick, an edited item written back into its list, a small segmented control's width
import { type CSSProperties, useEffect, useState } from 'react'

/** A list with the rows its deletions left, each at the place its row had (§6.2: the undo row stands where the row was) */
export function withUndo<T, G extends { index: number }>(items: readonly T[], gone: readonly G[]): ({ item: T } | { gone: G })[] {
  const out: ({ item: T } | { gone: G })[] = items.map(item => ({ item }))
  for (const g of [...gone].sort((a, b) => a.index - b.index)) out.splice(Math.min(g.index, out.length), 0, { gone: g })
  return out
}

export const insertAt = <T,>(list: readonly T[], index: number, item: T): T[] => [...list.slice(0, index), item, ...list.slice(index)]

/** What was open, kept for the moment its reveal folds away (§8: closing is 180 ms), so that it folds with its content */
export function useLinger<T>(value: T | null, ms = 180): T | null {
  const [kept, setKept] = useState(value)
  useEffect(() => {
    if (value !== null) {
      setKept(value)
      return
    }
    const timer = setTimeout(() => setKept(null), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return value ?? kept
}

/** A popover shut, as a pick does */
export const shut = (id: string) => document.getElementById(id)?.hidePopover()

/**
 * A list with an edited item written into it — in place, or appended when it is no longer there (another tab deleted
 * it while its editor was open here): the reader's change is their later word on it (the old drawer's `withProfile`)
 */
export const withItem = <T extends { id: string }>(list: readonly T[], next: T): T[] =>
  list.some(x => x.id === next.id) ? list.map(x => (x.id === next.id ? next : x)) : [...list, next]

/** A small segmented control's agreed width (settings-2), read by `.o-seg` */
export const segmentWidth = (px: number) => ({ '--w': `${px}px` }) as CSSProperties
```

- [ ] **Step 5: Write the undo row**

`src/entrypoints/options/ui/UndoRow.tsx`:

```tsx
// Deleting is undone, not confirmed (the redesign's design, §6.2): the row gives way to O.undo's line and button for 5 s,
// coming in with §8's row motion. It takes the focus when the deletion was the keyboard's, so that Enter undoes it; the
// owner decides where the focus goes when it expires
import { useEffect, useRef } from 'react'
import { Button } from '@/ui/controls/Button'
import { O } from '@/ui/strings'

export const UNDO_MS = 5000

export function UndoRow({ name, onUndo, onExpire, level = 0, focus = false }: { name: string; onUndo: () => void; onExpire: () => void; level?: 0 | 1; focus?: boolean }) {
  const button = useRef<HTMLButtonElement>(null)
  // the latest owner's callback, read when the timer fires: the timer itself starts once
  const expire = useRef(onExpire)
  expire.current = onExpire
  useEffect(() => {
    if (focus) button.current?.focus()
    const timer = setTimeout(() => expire.current(), UNDO_MS)
    return () => clearTimeout(timer)
  }, [focus])
  return (
    <div className="o-row" data-srow="" data-undo="" data-arriving="" data-level={level || undefined} role="status">
      <span data-part="words" className="o-words"><span className="o-label">{O.undo.deleted(name)}</span></span>
      <span data-part="trail" className="o-trail">
        <Button type="button" kind="neutral" size="sm" ref={button} onClick={onUndo}>{O.undo.undo}</Button>
      </span>
    </div>
  )
}
```

- [ ] **Step 6: Write the confirm in place**

`src/entrypoints/options/ui/ConfirmButton.tsx`:

```tsx
// Clearing what cannot be undone is confirmed in place (the redesign's design, §6.6): a neutral button (O.data.clear)
// turns into its confirmation (O.data.clearConfirm) with a trash icon, its words in danger on the destructive button's ground (4.83:1 light, 5.01:1 dark);
// untouched for 3 s it turns back — not while the pointer rests on it or the keyboard is on it. Done, the owner's words
// stand in its place with the success icon arriving
import { CircleCheck, Trash2 } from 'lucide'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/ui/controls/Button'
import { Icon } from '@/ui/controls/Icon'

export const DISARM_MS = 3000

export function ConfirmButton({ label, confirmLabel, doneLabel, done = false, onConfirm }: { label: string; confirmLabel: string; doneLabel?: string; done?: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  /** the pointer rests on it, or the keyboard's focus is on it: it waits */
  const held = useRef({ pointer: false, keyboard: false })
  const timer = useRef(0)
  const wait = () => {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      if (held.current.pointer || held.current.keyboard) wait()
      else setArmed(false)
    }, DISARM_MS)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  if (done && doneLabel) {
    return <span className="o-status" data-tone="ok"><Icon node={CircleCheck} size={14} className="o-arrive" />{doneLabel}</span>
  }
  return (
    <Button type="button" kind="neutral" size="sm" className="o-confirm" data-armed={armed ? '' : undefined} icon={armed ? Trash2 : undefined}
      onPointerOver={() => { held.current.pointer = true }} onPointerOut={() => { held.current.pointer = false }}
      // the pointer's focus does not hold it (trackModality marks the pointer's turn): a click leaves the focus here
      onFocus={() => { held.current.keyboard = !document.documentElement.hasAttribute('data-axt-pointer') }}
      onBlur={() => { held.current.keyboard = false }}
      onClick={() => {
        if (!armed) {
          setArmed(true)
          wait()
          return
        }
        clearTimeout(timer.current)
        setArmed(false)
        onConfirm()
      }}>
      {armed ? confirmLabel : label}
    </Button>
  )
}
```

- [ ] **Step 7: Write the combobox**

`src/entrypoints/options/ui/Combobox.tsx`:

```tsx
// The model field (the redesign's design, §6.3): a combobox over the endpoint's models, searchable, a name typed when the
// list cannot be had. The list opens under the field in the form's flow (settings-2), pushing the fields below down
// rather than covering them. The field keeps the focus: the arrows move the active option (aria-activedescendant),
// Enter takes it, Escape closes; a press takes one without taking the focus. With no list yet, a press on the field —
// or the arrow down — is the gesture the form asks for the endpoint's origin on (`onOpen`)
import { type InputHTMLAttributes, type Ref, useId, useState } from 'react'
import { TextInput } from '@/ui/controls/Field'
import { useMenuNav } from '@/ui/menu-nav'

export interface ComboOption { id: string; name?: string }

export function Combobox({ value, onValue, options, busy = false, noMatch, onOpen, ref, ...input }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onValue: (text: string, option?: ComboOption) => void
  options: readonly ComboOption[] | null
  busy?: boolean
  noMatch: string
  onOpen?: () => void
  ref?: Ref<HTMLInputElement>
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const q = value.trim().toLowerCase()
  const shown = (options ?? []).filter(o => !q || `${o.id} ${o.name ?? ''}`.toLowerCase().includes(q))
  const pick = (o: ComboOption) => {
    onValue(o.id, o)
    setOpen(false)
  }
  const nav = useMenuNav({
    count: shown.length, initial: 0, isDisabled: () => false, labelOf: i => shown[i]?.id ?? '', typeahead: false,
    onPick: i => { const o = shown[i]; if (o) pick(o) }, onClose: () => setOpen(false),
  })
  const expanded = open && options !== null
  return (
    <div className="o-combo">
      <TextInput {...input} ref={ref} role="combobox" aria-expanded={expanded} aria-controls={listId} aria-autocomplete="list" aria-busy={busy || undefined}
        aria-activedescendant={expanded && shown.length ? nav.activeId : undefined} autoComplete="off" spellCheck={false} value={value}
        onChange={e => { onValue(e.target.value); setOpen(true); nav.setActive(0) }}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onPointerDown={() => { if (options === null) onOpen?.() }}
        onKeyDown={e => {
          if (options === null) { if (e.key === 'ArrowDown') { e.preventDefault(); onOpen?.() } return }
          if (!expanded) { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) } return }
          if (e.key === 'Enter' && !shown.length) return
          nav.onKeyDown(e)
        }} />
      {expanded && (
        <div id={listId} role="listbox" className="o-combo-list">
          {shown.map((o, i) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: the field's keys choose (aria-activedescendant)
            <div key={o.id} id={nav.idOf(i)} role="option" aria-selected={i === nav.active} data-active={i === nav.active || undefined} className="o-combo-item"
              onPointerDown={e => { e.preventDefault(); pick(o) }} onMouseEnter={() => nav.setActive(i)}>
              <span>{o.name ?? o.id}</span>
              {o.name && <small>{o.id}</small>}
            </div>
          ))}
          {!shown.length && <div role="option" aria-selected={false} aria-disabled="true" className="o-combo-item" data-empty="">{noMatch}</div>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Their rules**

Append to `src/entrypoints/options/ui/settings.css`:

```css
/* ---- Task 51: the undo row, the confirm in place, the model field's list ---- */
@layer components {
  .o-row[data-undo] .o-label { color: var(--ink-2); font-size: 12.5px; }
  /* §6.6: armed, the neutral button's ground turns to the destructive one's and its words to danger */
  .o-confirm[data-armed] { background: var(--button-danger); color: var(--danger); }
  /* §6.3: the model list under its field, in the form's flow */
  .o-combo { position: relative; display: flex; flex-direction: column; }
  .o-combo-list { margin-top: 6px; padding: 4px; border-radius: 10px; background: var(--chrome); box-shadow: var(--pop-shadow); max-height: 172px; overflow: auto; animation: pop-in 150ms var(--ease); }
  .o-combo-item { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 10px 0 8px; border-radius: 7px; font-size: 12.5px; cursor: pointer; }
  .o-combo-item small { margin-inline-start: auto; color: var(--ink-2); font-size: 11.5px; }
  .o-combo-item[data-active] { background: var(--fill); }
  .o-combo-item[data-empty] { color: var(--ink-2); cursor: default; }
  /* the option the keyboard moves carries the ring a focused control does (the reader's .pop .item) */
  html:not([data-axt-pointer]) .o-combo:focus-within .o-combo-item[data-active] { outline: 2px solid var(--focus); outline-offset: -2px; }
}
/* §8: a row arriving (an undo row, a new row) — opacity and 4 px down */
@keyframes o-row-in { from { opacity: 0; translate: 0 -4px; } }
[data-arriving] { animation: o-row-in 260ms var(--ease); }
@media (prefers-reduced-motion: reduce) { [data-arriving] { animation: none; } }
```

(`pop-in` is the shared menus' keyframes, in `controls.css`.)

In `tests/options/sheet.test.ts`, in `'gives every motion its reduced form'`, after
`expect(reduced).toContain('.o-swap')` add `expect(reduced).toContain('[data-arriving]')`.

- [ ] **Step 9: Run the tests**

Run: `pnpm vitest run tests/options/controls.test.ts tests/options/sheet.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 10: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/entrypoints/options/ui/UndoRow.tsx src/entrypoints/options/ui/ConfirmButton.tsx src/entrypoints/options/ui/Combobox.tsx src/entrypoints/options/ui/lists.ts src/entrypoints/options/ui/settings.css src/locales/zh-CN.ts src/locales/en.ts tests/options/controls.test.ts tests/options/sheet.test.ts
node scripts/check-english.mjs
git commit -m "feat(options): the undo row, the confirm in place and the model field

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 52: the frame — sidebar, search, deep links, S-O-02

The page's frame (§6.1, §6.7, §9's 320 px): the sidebar with the mark, the search and the four sections; a column of
up to 680 px; the search over every section; `#<section>/<row>` and the old hashes; the card that says the settings
cannot be read. Until the tasks after this replace them, each section draws the page's old parts: 翻译 the old
services and prompts, 阅读 the old reading and PDF reader sections, 数据 the old data section; 外观 is empty until
Task 55 (its two rows are still under 阅读, in the old PDF reader section).

**Files:**
- Create: `src/entrypoints/options/hash.ts`
- Modify: `src/entrypoints/options/ui/search.tsx` (`applySearch`)
- Rewrite: `src/entrypoints/options/App.tsx`
- Modify: `src/entrypoints/options/ui/settings.css` (append)
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`O.sections`, `O.search`; `O.nav` goes)
- Modify: `src/pdf-reader/ui/links.ts`, `src/pdf-reader/ui/Menus.tsx`, `src/pdf-reader/ui/FailureCard.tsx`,
  `tests/pdf-reader/ui/toolbar.test.ts`
- Modify: `tests/e2e/options-page.mjs`, `experiments/pdf-bilingual/spikes/entries.mjs`
- Check: `scripts/english-allowlist.txt` (the English gate: `options-page.mjs` stays at 13, `entries.mjs` at 14)
- Test: `tests/options/frame.test.ts`

**Interfaces:**
- Consumes: `Card`, `Row`, `SearchQuery` (Task 50); `ConfirmButton` (Task 51); `useOptionsData` (`./data`, unchanged).
- Produces:
  - `SECTIONS = ['translate', 'appearance', 'reading', 'data'] as const`, `type Section`, `interface Place { section: Section; row?: string }`,
    `parseHash(hash: string): Place`, `reach(root: HTMLElement, place: Place): void` in `@/entrypoints/options/hash`.
  - `applySearch(root: HTMLElement, q: string): number` in `@/entrypoints/options/ui/search`: marks `data-miss` on the
    rows, cards and sections a search left out and `data-first` on each card's first row found; returns the rows found.
  - `App({ content }: { content?: Record<Section, (data: OptionsData) => ReactNode> })` — `content` is the sections'
    table (a test passes its own).
  - `O.sections: Record<Section, string>`; `O.search: { placeholder; clear; found(n: number); none(q: string); keywords: Record<string, string> }`.

- [ ] **Step 1: The words**

In `src/locales/zh-CN.ts`, in `const O = {`, replace the line `nav: { services: '翻译服务', … },` with:

```ts
  /** The four sections of the sidebar (the redesign's design, §6.1); their hashes are these ids */
  sections: { translate: '翻译', appearance: '外观', reading: '阅读', data: '数据' },
  search: {
    placeholder: '搜索设置',
    clear: '清空搜索',
    found: (n: number) => `找到 ${n} 项设置`,
    none: (q: string) => `没有与「${q}」匹配的设置`,
    /** A few words each row answers to besides its own (§6.1: the interface language answers to “language” too) */
    keywords: {
      'translate/services': '服务 模型 LLM 接口 API Key',
      'translate/fallback': '失效 额度 断网 备用',
      'translate/language': '语言 翻译成 language',
      'translate/prompts': 'prompt 指令 消息',
      'translate/glossary': '术语 词汇 glossary',
      'appearance/theme': '主题 深色 浅色 夜间 theme dark',
      'appearance/styles': '颜色 下划线 模糊 字体',
      'appearance/highlight': '悬停 句子 背景',
      'reading/way': '提前 用量 按需 整篇',
      'reading/images': '图片 图 figure',
      'reading/open-in': '标签页 打开 tab',
      'reading/floating': '悬浮 按钮 贴边',
      'reading/pdf': 'PDF 阅读器 查看器',
      'data/cache': '缓存 清空 存储',
      'data/diagnostics': '日志 反馈 导出',
      'language/ui': 'language Interface 语言 界面',
    },
  },
```

In `src/locales/en.ts`, replace `nav: { services: 'Services', … },` with:

```ts
  sections: { translate: 'Translation', appearance: 'Appearance', reading: 'Reading', data: 'Data' },
  search: {
    placeholder: 'Search settings',
    clear: 'Clear search',
    found: n => (n === 1 ? '1 setting found' : `${n} settings found`),
    none: q => `No settings match “${q}”`,
    keywords: {
      'translate/services': 'service model LLM API key endpoint',
      'translate/fallback': 'expired quota offline backup',
      'translate/language': 'language into',
      'translate/prompts': 'prompt instructions message',
      'translate/glossary': 'terms glossary vocabulary',
      'appearance/theme': 'theme dark light night',
      'appearance/styles': 'colour color underline blur',
      'appearance/highlight': 'hover sentence band',
      'reading/way': 'preload usage demand whole',
      'reading/images': 'figure picture image',
      'reading/open-in': 'tab open',
      'reading/floating': 'floating button edge',
      'reading/pdf': 'PDF reader viewer',
      'data/cache': 'cache clear storage',
      'data/diagnostics': 'log report export',
      'language/ui': 'language interface',
    },
  },
```

- [ ] **Step 2: Write the failing tests**

`tests/options/frame.test.ts`:

```ts
// The settings page's frame (the redesign's design, §6.1, §6.7): the four sections and the current one, the search over
// every section (only what is drawn is found; its count said politely), deep links with the old hashes' aliases, and
// the settings that cannot be read drawing the data section alone. The sections are the test's own (App's `content`)
import { createElement as h } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const state = vi.hoisted(() => ({ data: null as unknown }))
vi.mock('@/entrypoints/options/data', () => ({ useOptionsData: () => state.data }))

import { App } from '@/entrypoints/options/App'
import { parseHash } from '@/entrypoints/options/hash'
import { Card } from '@/entrypoints/options/ui/Card'
import { Row } from '@/entrypoints/options/ui/Row'
import { applySearch } from '@/entrypoints/options/ui/search'
import { O, setLocale } from '@/ui/strings'

// happy-dom draws nothing: a scroll is nothing to it
Element.prototype.scrollIntoView ??= () => {}

function data(over: Partial<OptionsData> = {}): OptionsData {
  return {
    config: DEFAULT_CONFIG as Config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => fn(DEFAULT_CONFIG), pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false, ...over,
  }
}
const CONTENT = {
  translate: () => h(Card, null, h(Row, { row: 'translate/prompts', kind: 'button', label: 'Prompt', onPress: () => {} }), h(Row, { label: 'Target language' })),
  appearance: () => h(Card, null, h(Row, { label: 'Highlight', description: 'On hover' }), h('div', { inert: true }, h(Row, { label: 'Dim highlighted pages' }))),
  reading: () => h(Card, null, h(Row, { label: 'Sync scrolling' })),
  data: () => h(Card, null, h(Row, { label: 'Saved translations' })),
}
const nav = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>('nav button')]
const search = (c: HTMLElement) => c.querySelector<HTMLInputElement>('.o-search input')!
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const drawn = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('section[data-section]')].filter(s => !s.hasAttribute('data-miss')).map(s => s.dataset.section)

describe('parseHash (§6.1)', () => {
  it('reads a section and a row, leads the old hashes to their new places, and falls back to the translation section', () => {
    expect(parseHash('#translate/prompts')).toEqual({ section: 'translate', row: 'prompts' })
    expect(parseHash('#reading')).toEqual({ section: 'reading' })
    expect(parseHash('#services')).toEqual({ section: 'translate', row: 'services' })
    expect(parseHash('#prompts')).toEqual({ section: 'translate', row: 'prompts' })
    expect(parseHash('#pdf-reader')).toEqual({ section: 'reading', row: 'pdf' })
    expect(parseHash('#constructor')).toEqual({ section: 'translate' })
    expect(parseHash('')).toEqual({ section: 'translate' })
  })
})

describe('applySearch (§6.1)', () => {
  it('finds a row by its words unless it is not shown; a card and a section with nothing found miss too', () => {
    const root = document.createElement('div')
    root.innerHTML = `<section data-section="a"><div data-card><div data-srow data-search="highlight on hover"></div><div data-srow data-search="colour"></div></div>
      <div data-card><div inert><div data-srow data-search="dim highlighted pages"></div></div></div></section>
      <section data-section="b"><div data-card><div data-srow data-search="sync"></div></div></section>`
    expect(applySearch(root, 'high')).toBe(1)
    const rows = [...root.querySelectorAll('[data-srow]')]
    expect(rows.map(r => r.hasAttribute('data-miss'))).toEqual([false, true, true, true])
    expect(rows[0]!.hasAttribute('data-first')).toBe(true)
    expect([...root.querySelectorAll('[data-card]')].map(c => c.hasAttribute('data-miss'))).toEqual([false, true, true])
    expect([...root.querySelectorAll('section')].map(s => s.hasAttribute('data-miss'))).toEqual([false, true])
    expect(applySearch(root, '')).toBe(0)
    expect(root.querySelector('[data-miss], [data-first]')).toBeNull()
  })
})

describe('the frame (§6.1)', () => {
  beforeEach(() => {
    setLocale('en')
    history.replaceState(null, '', '#')
    state.data = data()
  })

  it('lists the four sections, the current one marked; a press shows another and keeps it in the hash', async () => {
    const replace = vi.spyOn(history, 'replaceState')
    const m = await mountElement(h(App, { content: CONTENT }))
    expect(nav(m.container).map(b => b.textContent)).toEqual([O.sections.translate, O.sections.appearance, O.sections.reading, O.sections.data])
    expect(nav(m.container).map(b => b.getAttribute('aria-current'))).toEqual(['page', null, null, null])
    expect(drawn(m.container)).toEqual(['translate'])
    nav(m.container)[2]!.click()
    await m.flush()
    expect(drawn(m.container)).toEqual(['reading'])
    expect(replace).toHaveBeenLastCalledWith(null, '', '#reading')
    replace.mockRestore()
    await m.unmount()
  })

  it('a search shows every section\'s matches under its name, no section current, and says the count', async () => {
    const m = await mountElement(h(App, { content: CONTENT }))
    type(search(m.container), 'High')
    await m.flush()
    expect(drawn(m.container)).toEqual(['appearance'])
    expect(nav(m.container).every(b => !b.hasAttribute('aria-current'))).toBe(true)
    expect(m.container.querySelector('[role="status"]')!.textContent).toBe(O.search.found(1))
    expect(m.container.querySelector('mark')!.textContent).toBe('High')
    type(search(m.container), 'zzz')
    await m.flush()
    expect(m.container.querySelector('.o-empty')!.textContent).toContain(O.search.none('zzz'))
    search(m.container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await m.flush()
    expect(search(m.container).value).toBe('')
    expect(drawn(m.container)).toEqual(['translate'])
    await m.unmount()
  })

  it('a deep link opens its section, lights its row once and gives it the focus; an old hash leads to its new place', async () => {
    history.replaceState(null, '', '#translate/prompts')
    const m = await mountElement(h(App, { content: CONTENT }))
    const row = m.container.querySelector<HTMLElement>('[data-row="translate/prompts"]')!
    expect(row.hasAttribute('data-flash')).toBe(true)
    expect(document.activeElement).toBe(row)
    await m.unmount()
    history.replaceState(null, '', '#pdf-reader')
    const again = await mountElement(h(App, { content: CONTENT }))
    expect(drawn(again.container)).toEqual(['reading'])
    await again.unmount()
  })

  it('settings that cannot be read (S-O-02): the notice with its reason and reset, and the data section alone', async () => {
    let reset = 0
    state.data = data({ fallbackReason: { kind: 'tooNew', stored: 99, supported: 1 }, reset: async () => { reset++; return DEFAULT_CONFIG } })
    history.replaceState(null, '', '#translate')
    const m = await mountElement(h(App, { content: CONTENT }))
    expect(nav(m.container).map(b => b.textContent)).toEqual([O.sections.data])
    expect(drawn(m.container)).toEqual(['data'])
    expect(m.container.textContent).toContain(O.fallbackNotice)
    const button = () => [...m.container.querySelectorAll('button')].find(b => b.textContent === O.fallbackReset || b.textContent === O.fallbackResetConfirm)!
    button().click()
    await m.flush()
    button().click()
    await m.flush()
    expect(reset).toBe(1)
    await m.unmount()
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run tests/options/frame.test.ts`
Expected: FAIL — `Failed to resolve import "@/entrypoints/options/hash"`.

- [ ] **Step 4: Write the places and the deep links**

`src/entrypoints/options/hash.ts`:

```ts
// Where the settings page is (the redesign's design, §6.1): `#<section>` keeps the place across a reload;
// `#<section>/<row>` opens a section at a row and lights it once — the popup's manage rows (#translate/services,
// #translate/prompts, #appearance/styles) and the reader's settings (#reading/pdf). The section hashes before the
// redesign lead to their new places, so that a link a reader kept still works
export const SECTIONS = ['translate', 'appearance', 'reading', 'data'] as const
export type Section = (typeof SECTIONS)[number]
export interface Place { section: Section; row?: string }

const ALIASES: Record<string, Place> = {
  services: { section: 'translate', row: 'services' },
  prompts: { section: 'translate', row: 'prompts' },
  'pdf-reader': { section: 'reading', row: 'pdf' },
}
const isSection = (v: string): v is Section => (SECTIONS as readonly string[]).includes(v)

export function parseHash(hash: string): Place {
  const [head = '', row] = hash.replace(/^#/, '').split('/')
  if (Object.hasOwn(ALIASES, head)) return ALIASES[head]!
  if (!isSection(head)) return { section: 'translate' }
  return row ? { section: head, row } : { section: head }
}

/**
 * A deep link's arrival: the row scrolled into view, lit once (§8: `ink` at 9 %, fading over 1.4 s) and given the
 * focus when it takes one. A row that is not drawn (the prompts, with no LLM service yet) leaves the section at its top
 */
export function reach(root: HTMLElement, place: Place): void {
  if (!place.row) return
  const el = root.querySelector<HTMLElement>(`[data-row="${place.section}/${place.row}"]`)
  if (!el) return
  el.scrollIntoView({ block: 'center' })
  el.setAttribute('data-flash', '')
  el.addEventListener('animationend', () => el.removeAttribute('data-flash'), { once: true })
  const target = el.matches('button, [tabindex]') ? el : el.querySelector<HTMLElement>('[role="radio"][tabindex="0"], button, [role="switch"]')
  target?.focus({ preventScroll: true })
}
```

- [ ] **Step 5: Write the search's pass**

Append to `src/entrypoints/options/ui/search.tsx`:

```tsx
/**
 * The search's pass over what is drawn (§6.1): a row is found when its words hold the query and it shows — a closed
 * reveal is inert, so a sub-row that does not apply is not found; a card and a section with no row found miss too,
 * and each card's first row found loses its top line. Attributes only, read and written in one pass, no layout.
 * Returns how many rows were found. With no query it clears what an earlier pass marked
 */
export function applySearch(root: HTMLElement, q: string): number {
  for (const el of root.querySelectorAll('[data-miss], [data-first]')) {
    el.removeAttribute('data-miss')
    el.removeAttribute('data-first')
  }
  if (!q) return 0
  let found = 0
  for (const row of root.querySelectorAll<HTMLElement>('[data-srow]')) {
    if (!row.closest('[inert]') && (row.dataset.search ?? '').includes(q)) found++
    else row.setAttribute('data-miss', '')
  }
  for (const box of root.querySelectorAll<HTMLElement>('[data-card], section[data-section]')) {
    const first = box.querySelector<HTMLElement>('[data-srow]:not([data-miss])')
    if (!first) box.setAttribute('data-miss', '')
    else if (box.hasAttribute('data-card') && first.closest('[data-card]') === box) first.setAttribute('data-first', '')
  }
  return found
}
```

- [ ] **Step 6: Write the frame**

`src/entrypoints/options/App.tsx` (the whole file):

```tsx
// The settings page (the redesign's design, §6.1): a sidebar — the mark, the search, the four sections, the interface
// language at its foot (Task 53) — and a column of up to 680 px holding one section, or every section's matches while a
// search runs. There is no save button: every control writes as it changes. `#<section>/<row>` opens a section at a
// row and lights it. Settings that cannot be read (S-O-02, §6.7) draw a card at the top and the data section alone: the other
// sections would show the defaults as if they were the reader's, and nothing they save is accepted
import { BookOpen, CircleAlert, Database, type IconNode, Languages, Palette, Search, X } from 'lucide'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BrandMark } from '@/ui/BrandMark'
import { Button } from '@/ui/controls/Button'
import { Icon } from '@/ui/controls/Icon'
import { O, fallbackText } from '@/ui/strings'
import { type OptionsData, useOptionsData } from './data'
import { type Place, SECTIONS, type Section, parseHash, reach } from './hash'
import { Data } from './sections/Data'
import { PdfReader } from './sections/PdfReader'
import { Prompts } from './sections/Prompts'
import { Reading } from './sections/Reading'
import { Services } from './sections/Services'
import { Card } from './ui/Card'
import { ConfirmButton } from './ui/ConfirmButton'
import { Row } from './ui/Row'
import { SearchQuery, applySearch } from './ui/search'

const ICONS: Record<Section, IconNode> = { translate: Languages, appearance: Palette, reading: BookOpen, data: Database }

export type Content = Record<Section, (data: OptionsData) => ReactNode>

/** What each section draws. Until its own task replaces it, a section draws the page's parts from before the redesign */
const CONTENT: Content = {
  translate: data => <><Services data={data} /><Prompts data={data} /></>,
  appearance: () => null,
  reading: data => <><Reading data={data} /><PdfReader data={data} /></>,
  data: data => <Data data={data} />,
}

export function App({ content = CONTENT }: { content?: Content }) {
  const data = useOptionsData()
  const [place, setPlace] = useState<Place>(() => parseHash(location.hash))
  const [query, setQuery] = useState('')
  const [found, setFound] = useState(0)
  const main = useRef<HTMLElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const q = query.trim().toLowerCase()
  const unreadable = data.fallbackReason !== null
  const sections: readonly Section[] = unreadable ? ['data'] : SECTIONS
  const current: Section = sections.includes(place.section) ? place.section : sections[0]!
  const ready = data.config !== null

  // a link followed while the page is open (the reader's settings, a note's settings button)
  useEffect(() => {
    const follow = () => { setQuery(''); setPlace(parseHash(location.hash)) }
    addEventListener('hashchange', follow)
    return () => removeEventListener('hashchange', follow)
  }, [])
  // the row a link asks for is reached once its section is drawn with the settings in it
  useEffect(() => { if (ready && main.current) reach(main.current, place) }, [place, ready])
  // the search's pass over what is drawn, after every render: a row can appear or go under a running search
  useLayoutEffect(() => { if (main.current) setFound(applySearch(main.current, q)) })

  const go = (section: Section) => {
    setQuery('')
    setPlace({ section })
    history.replaceState(null, '', `#${section}`)
  }
  const clear = () => {
    setQuery('')
    field.current?.focus()
  }
  const shown = q ? sections : [current]
  return (
    <div className="ui o-frame">
      <aside className="o-side">
        <div className="o-brand"><BrandMark size={20} />{O.title}</div>
        <label className="o-search">
          <Icon node={Search} size={14} />
          <input ref={field} value={query} placeholder={O.search.placeholder} aria-label={O.search.placeholder} autoComplete="off"
            onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery('') } }} />
          {query && <button type="button" className="o-search-clear" aria-label={O.search.clear} onClick={clear}><Icon node={X} size={14} /></button>}
        </label>
        <nav aria-label={O.title} className="o-nav">
          {sections.map(id => (
            <button key={id} type="button" className="o-nav-item" aria-current={!q && id === current ? 'page' : undefined} onClick={() => go(id)}>
              <Icon node={ICONS[id]} size={14} />
              {O.sections[id]}
            </button>
          ))}
        </nav>
      </aside>
      <main ref={main} className="o-main" data-searching={q ? '' : undefined}>
        <div className="o-column">
          {unreadable && <Unreadable data={data} />}
          <SearchQuery.Provider value={q}>
            {shown.map(id => (
              <section key={id} className="o-section" data-section={id}>
                <h1 className="o-title">{O.sections[id]}</h1>
                {content[id](data)}
              </section>
            ))}
          </SearchQuery.Provider>
          {q && found === 0 && (
            <p className="o-empty">{O.search.none(query.trim())} <Button type="button" kind="text" size="sm" onClick={clear}>{O.search.clear}</Button></p>
          )}
          <p className="o-sr" role="status" aria-live="polite">{q ? (found ? O.search.found(found) : O.search.none(query.trim())) : ''}</p>
        </div>
      </main>
    </div>
  )
}

/** S-O-02 (§6.7): what could not be read, why, and the way out, confirmed in place as a cache's clearing is */
function Unreadable({ data }: { data: OptionsData }) {
  return (
    <div className="o-unreadable">
      <Card>
        <Row lead={<Icon node={CircleAlert} className="o-danger" />} label={O.fallbackNotice}
          description={data.fallbackReason ? fallbackText(data.fallbackReason) : undefined}
          trailing={<ConfirmButton label={O.fallbackReset} confirmLabel={O.fallbackResetConfirm} onConfirm={() => void data.reset()} />} />
        {data.resetFailed && <Row quiet label={O.fallbackResetFailed} />}
      </Card>
    </div>
  )
}
```

The frame's root carries Part 3's base class `ui` (the font, the ink, the keyboard's rings; it paints no ground, the
page's is `body`'s, below; ruling 6). `trackModality()` already runs before the first paint, Part 3's (Task 50's
Step 1 saw it).

- [ ] **Step 7: The frame's rules**

Append to `src/entrypoints/options/ui/settings.css`:

```css
/* ---- Task 52: the frame (§6.1) ---- */
@layer components {
  body { margin: 0; background: var(--page); }
  .o-frame { display: grid; grid-template-columns: 232px minmax(0, 1fr); min-height: 100vh; color: var(--ink); font: 13px/1.4 var(--font); }
  /* the sidebar: 232 px on the page's ground; the mark, the search, the sections, the interface language at its foot */
  .o-side { position: sticky; top: 0; display: flex; flex-direction: column; gap: 2px; box-sizing: border-box; height: 100vh; padding: 18px 12px; overflow: auto; }
  .o-brand { display: flex; align-items: center; gap: 8px; height: 32px; margin-bottom: 10px; padding: 0 10px; font-weight: 600; }
  .o-search { display: flex; align-items: center; gap: 8px; height: 32px; margin: 0 0 12px; padding: 0 10px; border-radius: 8px; background: var(--chrome); box-shadow: inset 0 0 0 0.5px var(--chrome-line); color: var(--ink-3); }
  .o-search:focus-within { box-shadow: inset 0 0 0 1px var(--ink-3); color: var(--ink); }
  /* the ring is the keyboard's (§9); under the pointer the field's edge says where the focus is */
  html:not([data-axt-pointer]) .o-search:focus-within { outline: 2px solid var(--focus); outline-offset: 0; }
  .o-search input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; background: transparent; color: var(--ink); font: inherit; }
  .o-search input:focus, .o-search input:focus-visible { outline: none; }
  .o-search input::placeholder { color: var(--ink-2); }
  .o-search-clear { display: inline-flex; padding: 0; border: 0; background: none; color: var(--ink-3); cursor: pointer; }
  .o-nav { display: flex; flex-direction: column; gap: 2px; }
  .o-nav-item { display: flex; align-items: center; gap: 10px; box-sizing: border-box; width: 100%; height: 32px; padding: 0 10px; border: 0; border-radius: 8px; background: none; color: var(--ink-2); font: inherit; text-align: start; cursor: pointer; }
  .o-nav-item svg { flex: none; color: var(--ink-3); }
  /* the current section: a raised row */
  .o-nav-item[aria-current] { background: var(--chrome); box-shadow: var(--raised-shadow); color: var(--ink); }
  .o-nav-item[aria-current] svg { color: var(--ink); }
  @media (hover: hover) { .o-nav-item:not([aria-current]):hover { background: color-mix(in oklab, var(--ink) 5%, transparent); color: var(--ink); } }
  /* the column: up to 680 px, 30 px from the top, 48 px from the sidebar */
  .o-main { min-width: 0; padding: 30px 48px 40px; }
  .o-column { max-width: 680px; }
  .o-title { margin: 0 0 18px; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
  .o-unreadable { margin-bottom: 30px; }
  /* while searching: every section's matches under its name, its headings and what was not found hidden */
  [data-searching] .o-title { margin: 18px 0 8px; color: var(--ink-2); font-size: 13px; font-weight: 500; letter-spacing: 0; }
  [data-searching] [data-heading], [data-searching] [data-miss] { display: none; }
  .o-empty { display: flex; align-items: center; gap: 8px; padding: 40px 0; color: var(--ink-2); }
  /* a row reached by a deep link lights once (§8): ink at 9 %, held a moment, gone at 1.4 s */
  [data-flash]::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: color-mix(in oklab, var(--ink) 9%, transparent); opacity: 0; pointer-events: none; animation: o-flash 1400ms ease-out; }
  /* §9: below 640 px the sidebar folds above the column; the sections wrap into a row */
  @media (width < 640px) {
    .o-frame { grid-template-columns: minmax(0, 1fr); }
    .o-side { position: static; height: auto; padding: 16px 16px 4px; }
    .o-nav { flex-flow: row wrap; }
    .o-nav-item { width: auto; }
    .o-main { padding: 12px 16px 32px; }
  }
}
@keyframes o-flash { 0%, 30% { opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .o-nav-item { transition: none; } }
/* forced colours drop the raised ground: the current section is outlined in the system's Highlight (§9) */
@media (forced-colors: active) { .o-nav-item[aria-current] { outline: 1px solid Highlight; outline-offset: -1px; } }
```

- [ ] **Step 8: The reader's links go to the new places**

- `src/pdf-reader/ui/links.ts`: `'/options.html#pdf-reader'` becomes `'/options.html#reading/pdf'`.
- `src/pdf-reader/ui/Menus.tsx:77`: `return openOptions('services')` becomes `return openOptions('translate/services')`.
- `src/pdf-reader/ui/FailureCard.tsx:15`: `'/options.html#services'` becomes `'/options.html#translate/services'`.
- `tests/pdf-reader/ui/toolbar.test.ts:96`: `endsWith('/options.html#pdf-reader')` becomes `endsWith('/options.html#reading/pdf')`.
- `experiments/pdf-bilingual/spikes/entries.mjs:102`: `endsWith('/options.html#pdf-reader')` becomes
  `endsWith('/options.html#reading/pdf')`.

(The old hashes still lead to the same places; this only spares a reader the alias.)

- [ ] **Step 9: The browser checks find the new sections**

In `tests/e2e/options-page.mjs`, replace the `SECTIONS` constant and `openOptions`:

```js
/**
 * The sidebar's sections (the redesign's design, §6.1), and the names the suites used before it: the services and the
 * prompts are the translation section's now
 */
export const SECTIONS = { translate: '翻译', appearance: '外观', reading: '阅读', data: '数据', services: '翻译', prompts: '翻译' }

export async function openOptions(context, extId) {
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extId}/options.html`)
  await options.getByRole('button', { name: SECTIONS.translate, exact: true }).waitFor({ timeout: 10_000 })
  return options
}
```

Run: `node --check tests/e2e/options-page.mjs && node --check experiments/pdf-bilingual/spikes/entries.mjs`
Expected: exit 0. (The suites run in Task 57, once 外观 and 阅读 are in.)

- [ ] **Step 10: Run the tests**

Run: `pnpm vitest run tests/options tests/pdf-reader/ui/toolbar.test.ts`
Expected: PASS. The old sections' tests (`tests/options/{service-drawer,reading-section,prompts-section,prompt-manager,pdf-reader-section,data-section}.test.ts`) still pass: they mount the sections, not the frame.

- [ ] **Step 11: Check the reader is unchanged, run the gate, commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && node experiments/pdf-bilingual/spikes/reader-pixels.mjs`
Expected: exit 0, 24 lines of `ok`. Then `git add` the files and run `node scripts/check-english.mjs`: it passes with
the allowlist as it is — `tests/e2e/options-page.mjs` keeps its 13 lines (the new `SECTIONS` line takes the old one's
place), `experiments/pdf-bilingual/spikes/entries.mjs` its 14 (line 102 holds none); the new files hold none.

```bash
git add src/entrypoints/options/hash.ts src/entrypoints/options/ui/search.tsx src/entrypoints/options/App.tsx src/entrypoints/options/ui/settings.css src/locales/zh-CN.ts src/locales/en.ts src/pdf-reader/ui/links.ts src/pdf-reader/ui/Menus.tsx src/pdf-reader/ui/FailureCard.tsx tests/pdf-reader/ui/toolbar.test.ts tests/e2e/options-page.mjs experiments/pdf-bilingual/spikes/entries.mjs tests/options/frame.test.ts scripts/english-allowlist.txt
node scripts/check-english.mjs
git commit -m "feat(options): the settings page's frame, its search and deep links

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 53: the interface language

The sidebar's foot (§6.1): a row like the sections', a globe on the icons' edge, the value after it and a menu
opening upward, its languages in their own names with `lang`; its name adds 「Interface language」 where the interface
is not English. A search shows it as a row too, 「也在左下角」. Not drawn over settings that cannot be read (S-O-02).

**Files:**
- Create: `src/entrypoints/options/sections/Language.tsx`
- Modify: `src/entrypoints/options/App.tsx`
- Modify: `src/entrypoints/options/ui/settings.css` (append)
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`O.uiLanguageName`, `O.uiLanguageElsewhere`, en `O.uiLanguageAuto`)
- Modify: `tests/e2e/extension.mjs` (the interface language's checks)
- Check: `scripts/english-allowlist.txt` (the English gate: `extension.mjs` stays at 76)
- Test: `tests/options/language.test.ts`

**Interfaces:**
- Consumes: `Popover`, `usePopover` (Part 1), `MenuList` with items' `lang` (Part 3; ruling 1), `Row`, `Value`,
  `Card` (Task 50), `shut` (Task 51).
- Produces: `LanguageFoot({ data })`, `LanguageRow({ data })` in `@/entrypoints/options/sections/Language`; the popover
  modifiers `.pop.o-up` (opens upward) and `.pop.o-end` (under its row, on its trailing end) for the tasks after.

- [ ] **Step 1: The words**

In `src/locales/zh-CN.ts`, in `O`, after `uiLanguageAuto: '跟随浏览器',` add:

```ts
  /** §6.1: the foot row's name — a reader who cannot read this interface is the one looking for it */
  uiLanguageName: '界面语言 · Interface language',
  /** the row a search shows for it */
  uiLanguageElsewhere: '也在左下角',
```

In `src/locales/en.ts`, change `uiLanguageAuto: 'Follow the browser',` to `uiLanguageAuto: 'Browser language',` and
after it add:

```ts
  uiLanguageName: 'Interface language',
  uiLanguageElsewhere: 'Also at the foot of the sidebar',
```

- [ ] **Step 2: Write the failing tests**

`tests/options/language.test.ts`:

```ts
// The interface language (the redesign's design, §6.1): at the sidebar's foot, its name carrying the English words, its
// languages in their own names with `lang`; a pick writes it (the data layer reloads the page once it lands); a search
// shows it as a row of its own. happy-dom has no popover API: a pick shuts its popover, so the reader's stub stands in
import { createElement as h } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { LOCALE_NAMES } from '@/locales'
import { stubPopovers } from '../pdf-reader/ui/popover-stub'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const state = vi.hoisted(() => ({ data: null as unknown }))
vi.mock('@/entrypoints/options/data', () => ({ useOptionsData: () => state.data }))

import { App } from '@/entrypoints/options/App'
import { LanguageFoot } from '@/entrypoints/options/sections/Language'
import { O, setLocale } from '@/ui/strings'

function data(config: Config, patches: Config[]): OptionsData {
  return {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(config); patches.push(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
}
const options = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[role="option"]')]

describe('the interface language (§6.1)', () => {
  let restore = () => {}
  beforeEach(() => { setLocale('en'); restore = stubPopovers() })
  afterEach(() => restore())

  it('the foot row names itself with the value; the menu lists the browser\'s choice and each language in its own name, with lang', async () => {
    const m = await mountElement(h(LanguageFoot, { data: data({ ...DEFAULT_CONFIG, uiLanguage: 'auto' }, []) }))
    const button = m.container.querySelector<HTMLButtonElement>('button.o-lang')!
    expect(button.getAttribute('aria-label')).toBe(`${O.uiLanguageName}: ${O.uiLanguageAuto}`)
    expect(options(m.container).map(o => o.textContent)).toEqual([O.uiLanguageAuto, LOCALE_NAMES['zh-CN'], LOCALE_NAMES.en])
    expect(m.container.querySelector('[lang="zh-CN"]')?.textContent).toBe(LOCALE_NAMES['zh-CN'])
    expect(m.container.querySelector('[lang="en"]')).not.toBeNull()
    await m.unmount()
  })

  it('a pick writes the interface language; the current one writes nothing', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(LanguageFoot, { data: data({ ...DEFAULT_CONFIG, uiLanguage: 'en' }, patches) }))
    options(m.container)[2]!.click()
    options(m.container)[1]!.click()
    await m.flush()
    expect(patches.map(p => p.uiLanguage)).toEqual(['zh-CN'])
    await m.unmount()
  })

  it('a search for it shows the row that says where it lives', async () => {
    state.data = data(DEFAULT_CONFIG, [])
    history.replaceState(null, '', '#')
    const content = { translate: () => null, appearance: () => null, reading: () => null, data: () => null }
    const m = await mountElement(h(App, { content }))
    const input = m.container.querySelector<HTMLInputElement>('.o-search input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'language')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await m.flush()
    const section = m.container.querySelector<HTMLElement>('section[data-section="language"]')!
    expect(section.hasAttribute('data-miss')).toBe(false)
    expect(section.querySelector('[data-row="language/ui"]')!.textContent).toContain(O.uiLanguageElsewhere)
    await m.unmount()
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run tests/options/language.test.ts`
Expected: FAIL — `Failed to resolve import "@/entrypoints/options/sections/Language"`.

- [ ] **Step 4: Write the interface language**

`src/entrypoints/options/sections/Language.tsx`:

```tsx
// The interface language (the redesign's design, §6.1): at the sidebar's foot, a row like the sections' with a globe on
// the icons' edge — the cue that needs no reading, since a reader who cannot read this interface is the one looking for
// it — the value after it, and a menu opening upward whose languages are written in their own names, with `lang`. A
// search shows it as a row too. A change reloads the page in the new language once the write has landed and no draft
// is open (shared/surface-config.ts), so nothing is ever half translated and no draft is lost
import { ChevronDown, Globe } from 'lucide'
import type { CSSProperties } from 'react'
import { LOCALE_CODES, LOCALE_NAMES, type LocaleCode } from '@/locales'
import { Icon } from '@/ui/controls/Icon'
import { MenuList } from '@/ui/controls/MenuList'
import { Popover, usePopover } from '@/ui/controls/Popover'
import { O, localeInUse } from '@/ui/strings'
import type { OptionsData } from '../data'
import { Card } from '../ui/Card'
import { shut } from '../ui/lists'
import { Row, Value } from '../ui/Row'

const known = (code: string): code is LocaleCode => Object.hasOwn(LOCALE_NAMES, code)

function useLanguage(data: OptionsData) {
  const chosen = data.config?.uiLanguage ?? 'auto'
  const value = known(chosen) ? LOCALE_NAMES[chosen] : O.uiLanguageAuto
  const items = [
    { id: 'auto', name: O.uiLanguageAuto, checked: !known(chosen), lang: localeInUse() },
    ...LOCALE_CODES.map(code => ({ id: code, name: LOCALE_NAMES[code], checked: chosen === code, lang: code })),
  ]
  const choose = (code: string) => { if (code !== chosen) void data.patch(latest => ({ ...latest, uiLanguage: code })) }
  return { value, items, choose }
}

export function LanguageFoot({ data }: { data: OptionsData }) {
  const pop = usePopover('listbox')
  const { value, items, choose } = useLanguage(data)
  return (
    <>
      <button type="button" className="o-nav-item o-lang" aria-label={`${O.uiLanguageName}: ${value}`} {...pop.trigger} style={{ anchorName: pop.anchor } as CSSProperties}>
        <Icon node={Globe} size={14} />
        <span className="o-lang-value">{value}</span>
        <Icon node={ChevronDown} size={14} />
      </button>
      <Popover {...pop.popover} role="listbox" label={O.uiLanguageName} className="o-up">
        <MenuList key={pop.generation} kind="listbox" label={O.uiLanguageName} items={items} onClose={() => shut(pop.popover.id)} onPick={id => { shut(pop.popover.id); choose(id) }} />
      </Popover>
    </>
  )
}

/** The row only a search shows (§6.1): the interface language lives in the sidebar */
export function LanguageRow({ data }: { data: OptionsData }) {
  const pop = usePopover('listbox')
  const { value, items, choose } = useLanguage(data)
  return (
    <Card>
      <Row kind="button" row="language/ui" words={O.search.keywords['language/ui']} label={O.uiLanguage} description={O.uiLanguageElsewhere}
        trailing={<Value>{value}</Value>} buttonProps={{ ...pop.trigger, style: { anchorName: pop.anchor } as CSSProperties }} />
      <Popover {...pop.popover} role="listbox" label={O.uiLanguageName} className="o-end">
        <MenuList key={pop.generation} kind="listbox" label={O.uiLanguageName} items={items} onClose={() => shut(pop.popover.id)} onPick={id => { shut(pop.popover.id); choose(id) }} />
      </Popover>
    </Card>
  )
}
```

- [ ] **Step 5: The frame draws them**

In `src/entrypoints/options/App.tsx`:
- add `import { LanguageFoot, LanguageRow } from './sections/Language'`;
- after the closing `</nav>` add `{!unreadable && <LanguageFoot data={data} />}`;
- replace `const shown = q ? sections : [current]` with:

```tsx
  // while searching, every section — and, after the appearance section, the interface language's own row (settings-2's order)
  const shown: (Section | 'language')[] = !q ? [current] : unreadable ? ['data'] : ['translate', 'appearance', 'language', 'reading', 'data']
```

- in the sections' map, the title and the content become:

```tsx
                <h1 className="o-title">{id === 'language' ? O.uiLanguage : O.sections[id]}</h1>
                {id === 'language' ? <LanguageRow data={data} /> : content[id](data)}
```

- [ ] **Step 6: Its rules**

Append to `src/entrypoints/options/ui/settings.css`:

```css
/* ---- Task 53: the interface language at the sidebar's foot; popovers opening upward or at a row's end ---- */
@layer components {
  .o-lang { margin-top: auto; }
  .o-lang-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pop.o-up { margin: 0 0 6px; position-area: top span-right; position-try-fallbacks: top span-left, bottom span-right; transform-origin: bottom left; }
  .pop.o-end { position-area: bottom span-left; position-try-fallbacks: top span-left; transform-origin: top right; }
  @media (width < 640px) { .o-lang { margin-top: 8px; } }
}
```

- [ ] **Step 7: The browser checks read the new sections' names**

In `tests/e2e/extension.mjs`, in the block `// ── The interface language (UI.md §6)`, the English check becomes:

```js
  check('the settings page follows the interface language into English', /Translation/.test(nav) && !/翻译/.test(nav), nav.slice(0, 60))
```

and the check after switching back:

```js
  check('switched back to Chinese, the settings page follows back too', /翻译/.test(back), back.replace(/\n+/g, ' ').slice(0, 40))
```

(`chooseUiLanguage` finds the foot row by its name, 「界面语言 · Interface language: …」 or 「Interface language: …」, and
the language by its own name, as before.)

Run: `node --check tests/e2e/extension.mjs`
Expected: exit 0.

- [ ] **Step 8: Run the tests, the gate, and commit**

Run: `pnpm vitest run tests/options && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0. Then `git add` the files and run `node scripts/check-english.mjs`: it passes with the allowlist as it
is — the two checks of `tests/e2e/extension.mjs` each take an old line's place (76 stays); the new files hold none.

```bash
git add src/entrypoints/options/sections/Language.tsx src/entrypoints/options/App.tsx src/entrypoints/options/ui/settings.css src/locales/zh-CN.ts src/locales/en.ts tests/e2e/extension.mjs tests/options/language.test.ts scripts/english-allowlist.txt
node scripts/check-english.mjs
git commit -m "feat(options): the interface language at the sidebar's foot

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 54: 数据

§6.6: the two caches, each with a neutral 「清空…」 confirmed in place and 「已清空」 with the success icon once done; a
cache that cannot be read says so (S-O-71); the diagnostics log as today, with a neutral 导出.

**Files:**
- Rewrite: `src/entrypoints/options/sections/Data.tsx`
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`O.data`)
- Rewrite: `tests/options/data-section.test.ts`
- Modify: `tests/e2e/extension.mjs` (the cache check), `experiments/pdf-bilingual/spikes/entries.mjs` (the data part)
- Modify: `scripts/english-allowlist.txt` (the counts the English gate names)

**Interfaces:**
- Consumes: `Card`, `Row` (Task 50), `ConfirmButton` (Task 51), `usePdfTranslations` (`../pdf-translations`,
  unchanged), `OptionsData`'s `cache`, `cacheError`, `clearCache`, `cacheCleared` (unchanged).
- Produces: `Data({ data })` (the export `DIAGNOSTICS_FILE_NAME` kept); `O.data.cacheLine(entries: number, mb: string)`
  now carries the description, `O.data.clear` 「清空…」, `O.data.clearConfirm` 「确认清空」 / “Clear now”.

- [ ] **Step 1: The words**

In `src/locales/zh-CN.ts`, in `O.data`: `cacheLine` becomes

```ts
    cacheLine: (entries: number, mb: string) => `${entries.toLocaleString('zh-CN')} 段 · ${mb} MB · 换了服务、模型或提示词会自动分开存，通常不用清`,
```

`clear: '清空',` becomes `clear: '清空…',`; delete `cacheHint` (its words are in the line now). In `src/locales/en.ts`,
in `O.data`:

```ts
    cacheLine: (entries, mb) => `${entries.toLocaleString('en')} ${entries === 1 ? 'passage' : 'passages'} · ${mb} MB · Kept apart by service, model and prompt; there is usually no need to clear it`,
```

`clear: 'Clear',` becomes `clear: 'Clear…',`, `clearConfirm: 'Confirm clear',` becomes `clearConfirm: 'Clear now',`;
delete `cacheHint`.

- [ ] **Step 2: Write the failing tests**

`tests/options/data-section.test.ts` — keep the file's mocks, its imports and its `data()` helper, and replace every
`describe` with:

```ts
describe('the data section (the redesign\'s design, §6.6)', () => {
  beforeEach(() => {
    setLocale('en')
    wire.exported = null
    wire.downloads.length = 0
    Object.assign(pdfStore, { count: 2, bytes: 3.4 * 1024 * 1024, failing: false })
  })
  const byText = (c: HTMLElement, text: string) => [...c.querySelectorAll('button')].filter(b => b.textContent === text)

  it('three rows: the translations kept, the PDF translations kept, the diagnostics log, each saying what it holds', async () => {
    const m = await mountElement(createElement(Data, { data: { ...data(), cache: { entries: 1284, bytes: 12.4 * 1024 * 1024 } } }))
    await m.flush()
    expect([...m.container.querySelectorAll('[data-srow]')].map(r => r.getAttribute('data-row'))).toEqual(['data/cache', 'data/pdf', 'data/diagnostics'])
    expect(m.container.textContent).toContain(O.data.cacheLine(1284, '12.4'))
    expect(m.container.textContent).toContain(O.data.pdfLine(2, '3.4'))
    expect(m.container.textContent).toContain(O.data.diagnosticsHint)
    expect(byText(m.container, O.data.clear)).toHaveLength(2)
    await m.unmount()
  })

  it('a cache cleared in two presses in place, then O.data.cleared in the button\'s place', async () => {
    let cleared = 0
    const view = (done: boolean) => createElement(Data, { data: { ...data(), cache: { entries: 3, bytes: 0 }, cacheCleared: done, clearCache: async () => { cleared++ } } })
    const m = await mountElement(view(false))
    byText(m.container, O.data.clear)[0]!.click()
    await m.flush()
    expect(cleared).toBe(0)
    byText(m.container, O.data.clearConfirm)[0]!.click()
    await m.flush()
    expect(cleared).toBe(1)
    await m.rerender(view(true))
    expect(m.container.querySelector('[data-row="data/cache"] .o-status[data-tone="ok"]')!.textContent).toBe(O.data.cleared)
    await m.unmount()
  })

  it('the PDF translations cleared the same way; the store read again says so', async () => {
    const m = await mountElement(createElement(Data, { data: data() }))
    await m.flush()
    byText(m.container, O.data.clear)[1]!.click()
    await m.flush()
    byText(m.container, O.data.clearConfirm)[0]!.click()
    await m.flush()
    await m.flush()
    expect(pdfStore.count).toBe(0)
    expect(m.container.textContent).toContain(O.data.cleared)
    await m.unmount()
  })

  it('a cache that cannot be read says so, never as an empty one (S-O-71)', async () => {
    pdfStore.failing = true
    const m = await mountElement(createElement(Data, { data: { ...data(), cacheError: 'IndexedDB unavailable' } }))
    await m.flush()
    expect([...m.container.querySelectorAll('.o-desc')].filter(d => d.textContent === O.data.cacheError)).toHaveLength(2)
    expect(m.container.textContent).not.toContain(O.data.pdfLine(0, '0.0'))
    await m.unmount()
  })

  it('the diagnostics log is exported as a file, and a worker that does not answer says so in place of the hint', async () => {
    wire.exported = { entries: [], exportedAt: 1 } as unknown as DiagnosticsExport
    const m = await mountElement(createElement(Data, { data: data() }))
    byText(m.container, O.data.diagnosticsExport)[0]!.click()
    await m.flush()
    await m.flush()
    expect(wire.downloads.map(d => [d.name, d.type])).toEqual([[DIAGNOSTICS_FILE_NAME, 'application/json']])
    wire.exported = null
    byText(m.container, O.data.diagnosticsExport)[0]!.click()
    await m.flush()
    await m.flush()
    expect(m.container.textContent).toContain(O.data.diagnosticsError)
    await m.unmount()
  })
})
```

The file already imports `setLocale` and `O` from `@/ui/strings`, and its `data()` helper returns
`cacheCleared: false` and `clearCache: async () => undefined`; delete its `button` helper, which nothing uses now.

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run tests/options/data-section.test.ts`
Expected: FAIL — no `[data-srow]` rows; `O.data.cacheLine(1284, '12.4')` not found.

- [ ] **Step 4: Write 数据**

`src/entrypoints/options/sections/Data.tsx` (the whole file):

```tsx
// The data section (the redesign's design, §6.6): what the extension keeps on this machine — the translation cache, the PDF reader's
// translated papers (the reader's design, §9.3) — each cleared with a confirm in place, and the diagnostics log a
// reader can download to attach to an issue (issue #156). A store that cannot be read says so (S-O-71): shown as an
// empty one, a failure would make the reader think there is nothing there (Codex on #52)
import { useState } from 'react'
import { downloadTextFile } from '@/shared/download'
import { sendMessage } from '@/shared/messages'
import { Button } from '@/ui/controls/Button'
import { O } from '@/ui/strings'
import type { OptionsData } from '../data'
import { usePdfTranslations } from '../pdf-translations'
import { Card } from '../ui/Card'
import { ConfirmButton } from '../ui/ConfirmButton'
import { Row } from '../ui/Row'

export const DIAGNOSTICS_FILE_NAME = 'read-arxiv-diagnostics.json'

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)

export function Data({ data }: { data: OptionsData }) {
  const { cache, cacheError, clearCache, cacheCleared } = data
  const pdf = usePdfTranslations()
  const [exportFailed, setExportFailed] = useState(false)
  const k = O.search.keywords
  const exportDiagnostics = async () => {
    try {
      const payload = await sendMessage({ type: 'axt:diag-export' })
      downloadTextFile(DIAGNOSTICS_FILE_NAME, JSON.stringify(payload, null, 2), 'application/json')
      setExportFailed(false)
    } catch {
      setExportFailed(true)
    }
  }
  return (
    <Card>
      <Row row="data/cache" words={k['data/cache']} label={O.data.cache}
        description={cacheError ? O.data.cacheError : cache ? O.data.cacheLine(cache.entries, mb(cache.bytes)) : '…'}
        trailing={<ConfirmButton label={O.data.clear} confirmLabel={O.data.clearConfirm} doneLabel={O.data.cleared} done={cacheCleared} onConfirm={() => void clearCache()} />} />
      <Row row="data/pdf" words={k['data/cache']} label={O.data.pdf}
        description={pdf.failed ? O.data.cacheError : pdf.usage ? O.data.pdfLine(pdf.usage.count, mb(pdf.usage.bytes)) : '…'}
        trailing={<ConfirmButton label={O.data.clear} confirmLabel={O.data.clearConfirm} doneLabel={O.data.cleared} done={pdf.cleared} onConfirm={() => void pdf.clear()} />} />
      <Row row="data/diagnostics" words={k['data/diagnostics']} label={O.data.diagnostics} description={exportFailed ? O.data.diagnosticsError : O.data.diagnosticsHint}
        trailing={<Button type="button" kind="neutral" size="sm" onClick={() => void exportDiagnostics()}>{O.data.diagnosticsExport}</Button>} />
    </Card>
  )
}
```

- [ ] **Step 5: The browser checks read the new words**

In `tests/e2e/extension.mjs`, in the block `// ── The settings page: the style back to the default; cache statistics and clearing`:
- the `waitFor` on `/^[1-9]\d* 条 · /` becomes `/^[1-9][\d,]* 段 · /`; both `textContent` reads of `/^\d+ 条 · /`
  (`before` and `after`) become `/^[\d,]+ 段 · /`; the `waitFor` on `/^0 条 · /` becomes `/^0 段 · /`; the check's
  `/^0 条/` becomes `/^0 段/`;
- `cacheRow.getByRole('button', { name: '清空', exact: true }).click()` (extension.mjs:1084) becomes
  `cacheRow.getByRole('button', { name: '清空…', exact: true }).click()`.

In `experiments/pdf-bilingual/spikes/entries.mjs`, section 5's data part: `const clears = options.getByRole('button', { name: /^(清空|Clear)$/ })`
becomes `/^(清空…|Clear…)$/`, and `{ name: /确认清空|Confirm clear/ }` becomes `{ name: /确认清空|Clear now/ }`.
(`line()` reads `main span` — the row's description is a span — and still finds 「1 篇 · 1.0 MB」.)

Run: `node --check tests/e2e/extension.mjs && node --check experiments/pdf-bilingual/spikes/entries.mjs`
Expected: exit 0.

- [ ] **Step 6: Run the tests, the gate, and commit**

Run: `pnpm vitest run tests/options && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0. Then `git add` the files and run `node scripts/check-english.mjs`: every changed line of
`tests/e2e/extension.mjs` and `entries.mjs` takes an old line's place, so their entries stay at 76 and 14; the
rewritten `tests/options/data-section.test.ts` holds none. Where the gate names another count, set that entry to it,
with a one-line reason, in this commit.

```bash
git add src/entrypoints/options/sections/Data.tsx src/locales/zh-CN.ts src/locales/en.ts tests/options/data-section.test.ts tests/e2e/extension.mjs experiments/pdf-bilingual/spikes/entries.mjs scripts/english-allowlist.txt
node scripts/check-english.mjs
git commit -m "feat(options): the data section, each cache cleared with a confirm in place

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 55: 外观 — the appearance, the dimming, the highlight

§6.4's first and last rows: 外观 for the whole extension (§3), the reader's equal segmented control with its icons and
words; 深色时调暗 PDF 页面 as a sub-row for 跟随系统 and 深色; 对照高亮 and, while it is on, the 颜色 sub-row — the
highlight profiles as swatches, and last a swatch for a colour of one's own that holds one colour of the reader's. The
styles between them are Task 56's. The old PDF reader section still draws its two rows under 阅读 until Task 57.

**Files:**
- Create: `src/entrypoints/options/sections/Appearance.tsx`, `src/entrypoints/options/ui/ColourPick.tsx`
- Modify: `src/entrypoints/options/App.tsx` (`CONTENT.appearance`)
- Modify: `src/entrypoints/options/ui/settings.css` (append)
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`O.appearance`)
- Modify: `tests/e2e/extension.mjs` (the highlight's check opens 外观)
- Check: `scripts/english-allowlist.txt` (the English gate: `extension.mjs` stays at 76)
- Test: `tests/options/appearance-section.test.ts`

**Interfaces:**
- Consumes: Part 3's `Segmented`, `Reveal`; Part 1's `Switch`; `Card`, `Row` (Task 50); `profileName` (`@/ui/strings`),
  `BUILT_IN_HIGHLIGHTS`, `PALETTE` (`@/config/appearance`).
- Produces: `Appearance({ data })`; `OWN_HIGHLIGHT_ID = 'hl-own'`; `ColourPick({ label, value, pressed, onPick }: { label: string; value?: string; pressed: boolean; onPick: (hex: string) => void })`;
  `O.appearance: { theme; themes: { system; light; dark }; dim; dimHint; highlightHint; colour; pickColour }`.

- [ ] **Step 1: The words**

In `src/locales/zh-CN.ts`, in `O`, after `undo: …,` add:

```ts
  /** §6.4: 外观 */
  appearance: {
    theme: '外观',
    themes: { system: '跟随系统', light: '浅色', dark: '深色' },
    dim: '深色时调暗 PDF 页面',
    dimHint: '深色外观下把 PDF 页面调暗；高亮与图中译文保持原色',
    highlightHint: '悬停时高亮对应的句子；仅译文时停留可查看原文',
    colour: '颜色',
    pickColour: '自选颜色',
  },
```

In `src/locales/en.ts`:

```ts
  appearance: {
    theme: 'Appearance',
    themes: { system: 'System', light: 'Light', dark: 'Dark' },
    dim: 'Dim PDF pages in dark mode',
    dimHint: 'Highlights and figure text keep their colours',
    highlightHint: 'Highlights the matching sentence on hover; in translation only, rest on one to see the original',
    colour: 'Colour',
    pickColour: 'Pick a colour',
  },
```

- [ ] **Step 2: Write the failing tests**

`tests/options/appearance-section.test.ts`:

```ts
// The appearance section (the redesign's design, §6.4): the appearance for the whole extension, the dimming only where it can apply, the
// highlight's switch and its colours — the profiles as swatches, and one colour of the reader's own that is added once
// and changed after
import { createElement as h, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))

import { Appearance, OWN_HIGHLIGHT_ID } from '@/entrypoints/options/sections/Appearance'
import { O, S, setLocale } from '@/ui/strings'

/** The section over a configuration that follows its own writes, as the data layer's does */
function Harness({ start, patches }: { start: Config; patches: Config[] }) {
  const [config, setConfig] = useState(start)
  const data: OptionsData = {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(config); patches.push(next); setConfig(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
  return h(Appearance, { data })
}
const radios = (c: HTMLElement, label: string) => [...c.querySelectorAll<HTMLElement>(`[role="radiogroup"][aria-label="${label}"] [role="radio"]`)]
const rowOf = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-row="${id}"]`)!
const inert = (el: Element) => el.closest('[inert]') !== null
const pick = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('the appearance section (§6.4)', () => {
  beforeEach(() => { setLocale('en') })

  it('the appearance for the whole extension; dimming the PDF pages shows for System and Dark only', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, theme: 'system' }, patches }))
    expect(radios(m.container, O.appearance.theme).map(r => r.textContent)).toEqual([O.appearance.themes.system, O.appearance.themes.light, O.appearance.themes.dark])
    expect(inert(rowOf(m.container, 'appearance/dim'))).toBe(false)
    radios(m.container, O.appearance.theme)[1]!.click()
    await m.flush()
    expect(patches.at(-1)?.theme).toBe('light')
    expect(inert(rowOf(m.container, 'appearance/dim'))).toBe(true)
    radios(m.container, O.appearance.theme)[2]!.click()
    await m.flush()
    expect(inert(rowOf(m.container, 'appearance/dim'))).toBe(false)
    rowOf(m.container, 'appearance/dim').querySelector<HTMLElement>('[role="switch"]')!.click()
    await m.flush()
    expect(patches.at(-1)?.pdfReader.dimPages).toBe(false)
    await m.unmount()
  })

  it('the highlight\'s switch, and while it is on its colours: the profiles as swatches, the one in use pressed', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    const swatches = () => [...rowOf(m.container, 'appearance/highlight').querySelectorAll<HTMLButtonElement>('button.o-swatch')]
    expect(swatches().map(b => b.getAttribute('aria-label'))).toEqual(['Soft green', 'Sand', 'Sky'])
    expect(swatches().map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
    swatches()[1]!.click()
    await m.flush()
    expect(patches.at(-1)?.appearance.activeHighlight).toBe('sand')
    m.container.querySelector<HTMLElement>(`[role="switch"][aria-label="${S.rows.highlight}"]`)!.click()
    await m.flush()
    expect(patches.at(-1)?.reading.sentenceHighlight).toBe(false)
    expect(inert(swatches()[0]!)).toBe(true)
    await m.unmount()
  })

  it('a colour of one\'s own adds one profile the first time and changes that one after', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    const own = () => m.container.querySelector<HTMLInputElement>('input[type="color"]')!
    expect(own().getAttribute('aria-label')).toBe(O.appearance.pickColour)
    pick(own(), '#ff0000')
    await m.flush()
    pick(own(), '#00ff00')
    await m.flush()
    const highlights = patches.at(-1)!.appearance.highlights
    expect(highlights.filter(h => h.id === OWN_HIGHLIGHT_ID)).toEqual([{ id: OWN_HIGHLIGHT_ID, name: O.appearance.pickColour, color: '#00ff00', opacity: 0.25 }])
    expect(highlights).toHaveLength(DEFAULT_CONFIG.appearance.highlights.length + 1)
    expect(patches.at(-1)!.appearance.activeHighlight).toBe(OWN_HIGHLIGHT_ID)
    expect(own().hasAttribute('data-pressed')).toBe(true)
    await m.unmount()
  })

  it('a profile an earlier version let the reader add stays as a swatch', async () => {
    const mine = { id: 'hl-abcdefgh', name: 'Mine', color: 'oklch(0.7 0.1 30)', opacity: 0.3 }
    const start = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, highlights: [...DEFAULT_CONFIG.appearance.highlights, mine] } }
    const m = await mountElement(h(Harness, { start, patches: [] }))
    expect([...m.container.querySelectorAll('button.o-swatch')].map(b => b.getAttribute('aria-label'))).toContain('Mine')
    await m.unmount()
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run tests/options/appearance-section.test.ts`
Expected: FAIL — `Failed to resolve import "@/entrypoints/options/sections/Appearance"`.

- [ ] **Step 4: Write a colour of one's own**

`src/entrypoints/options/ui/ColourPick.tsx`:

```tsx
// A colour of one's own (the redesign's design, §6.4): the last swatch, the palette's hues round it, opening the
// browser's own picker, which always yields #rrggbb — a value the colour sanitiser accepts
import { PALETTE } from '@/config/appearance'

const WHEEL = `conic-gradient(${[...PALETTE, PALETTE[0]].join(', ')})`
/** the picker's starting value while nothing of the reader's is held: today's ColorField's; a value, not a colour drawn */
const START = '#1565c0'

export function ColourPick({ label, value, pressed, onPick }: { label: string; value?: string; pressed: boolean; onPick: (hex: string) => void }) {
  return (
    <input type="color" className="swatch o-swatch o-pick" aria-label={label} title={label} data-pressed={pressed ? '' : undefined}
      value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : START} style={{ background: WHEEL }} onChange={e => onPick(e.target.value)} />
  )
}
```

- [ ] **Step 5: Write 外观's first and last rows**

`src/entrypoints/options/sections/Appearance.tsx`:

```tsx
// The appearance section (the redesign's design, §6.4): the extension's appearance (§3) with the dark pages' dimming under it, the
// translation styles (Task 56), and the hover highlight with its colour. Every control writes at once
import { Monitor, Moon, Sun } from 'lucide'
import { BUILT_IN_HIGHLIGHTS, type HighlightProfile } from '@/config/appearance'
import type { Config } from '@/config/schema'
import { Icon } from '@/ui/controls/Icon'
import { Reveal } from '@/ui/controls/Reveal'
import { Segmented } from '@/ui/controls/Segmented'
import { Switch } from '@/ui/controls/Switch'
import { O, S, profileName } from '@/ui/strings'
import type { OptionsData } from '../data'
import { Card } from '../ui/Card'
import { ColourPick } from '../ui/ColourPick'
import { Row } from '../ui/Row'

/** the system's first (the maintainer, 2026-09-26), as in the reader's own options */
const THEMES = ['system', 'light', 'dark'] as const
const GLYPHS = { system: Monitor, light: Sun, dark: Moon }

/** The reader's colour of their own for the highlight (§6.4): one profile, added the first time and changed after */
export const OWN_HIGHLIGHT_ID = 'hl-own'
/** its band's strength: the built-ins' middle (soft-green 0.22, sky 0.25, sand 0.3) */
const OWN_STRENGTH = 0.25

/** a band's swatch as the band reads on a page: its colour at its strength over the ground */
const band = (h: HighlightProfile) => `color-mix(in oklab, ${h.color || BUILT_IN_HIGHLIGHTS[0]!.color} ${Math.round(h.opacity * 100)}%, var(--chrome))`

export function Appearance({ data }: { data: OptionsData }) {
  const { config, patch } = data
  if (!config) return null
  const k = O.search.keywords
  return (
    <>
      <Card>
        <Row row="appearance/theme" words={k['appearance/theme']} label={O.appearance.theme}
          trailing={<Segmented label={O.appearance.theme} value={config.theme} options={THEMES.map(t => ({ value: t, label: O.appearance.themes[t], icon: <Icon node={GLYPHS[t]} size={14} /> }))}
            onChange={theme => void patch(latest => ({ ...latest, theme }))} />} />
        <Reveal open={config.theme !== 'light'}>
          <Row level={1} toggles row="appearance/dim" label={O.appearance.dim} description={O.appearance.dimHint}
            trailing={<Switch label={O.appearance.dim} checked={config.pdfReader.dimPages} onChange={on => void patch(latest => ({ ...latest, pdfReader: { ...latest.pdfReader, dimPages: on } }))} />} />
        </Reveal>
      </Card>
      <Card gap row="appearance/highlight">
        <Row toggles words={k['appearance/highlight']} label={S.rows.highlight} description={O.appearance.highlightHint}
          trailing={<Switch label={S.rows.highlight} checked={config.reading.sentenceHighlight} onChange={on => void patch(latest => ({ ...latest, reading: { ...latest.reading, sentenceHighlight: on } }))} />} />
        <Reveal open={config.reading.sentenceHighlight}>
          <Row level={1} label={O.appearance.colour} trailing={<HighlightSwatches config={config} patch={patch} />} />
        </Reveal>
      </Card>
    </>
  )
}

/** The highlight's colours (§6.4): its profiles as swatches, as the reader's reading options show them, and one of one's own */
function HighlightSwatches({ config, patch }: { config: Config; patch: OptionsData['patch'] }) {
  const a = config.appearance
  const choose = (id: string) => void patch(latest => ({ ...latest, appearance: { ...latest.appearance, activeHighlight: id } }))
  const setOwn = (color: string) => void patch(latest => {
    const list = latest.appearance.highlights
    const highlights = list.some(h => h.id === OWN_HIGHLIGHT_ID)
      ? list.map(h => (h.id === OWN_HIGHLIGHT_ID ? { ...h, color } : h))
      : [...list, { id: OWN_HIGHLIGHT_ID, name: O.appearance.pickColour, color, opacity: OWN_STRENGTH }]
    return { ...latest, appearance: { ...latest.appearance, highlights, activeHighlight: OWN_HIGHLIGHT_ID } }
  })
  const own = a.highlights.find(h => h.id === OWN_HIGHLIGHT_ID)
  return (
    <span className="o-swatches">
      {a.highlights.filter(h => h.id !== OWN_HIGHLIGHT_ID).map(h => (
        <button key={h.id} type="button" className="swatch o-swatch" aria-label={profileName(h, 'highlights')} title={profileName(h, 'highlights')}
          aria-pressed={h.id === a.activeHighlight} style={{ background: band(h) }} onClick={() => choose(h.id)} />
      ))}
      <ColourPick label={O.appearance.pickColour} value={own?.color} pressed={a.activeHighlight === OWN_HIGHLIGHT_ID} onPick={setOwn} />
    </span>
  )
}
```

In `src/entrypoints/options/App.tsx`, add `import { Appearance } from './sections/Appearance'` and change
`appearance: () => null,` to `appearance: data => <Appearance data={data} />,`.

- [ ] **Step 6: Their rules**

Append to `src/entrypoints/options/ui/settings.css`:

```css
/* ---- Task 55: swatches (§6.4) ---- */
@layer components {
  .o-swatches { display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; }
  /* 20 px, the shared swatch's edge and chosen ring (1.5 px line-strong, 2 px out) */
  .o-swatch { flex: none; width: 20px; height: 20px; padding: 0; border: 0; cursor: pointer; transition: scale 150ms ease-out; }
  .o-swatch:active { scale: 0.96; }
  /* a colour of one's own: the browser's picker drawn as the last swatch, the palette's hues round it */
  .o-pick { appearance: none; border-radius: 999px; }
  .o-pick::-webkit-color-swatch-wrapper { padding: 0; }
  .o-pick::-webkit-color-swatch { border: 0; opacity: 0; }
  .o-pick[data-pressed]:not(:focus-visible) { outline: 1.5px solid var(--line-strong); outline-offset: 2px; }
}
@media (prefers-reduced-motion: reduce) { .o-swatch { transition: none; } .o-swatch:active { scale: 1; } }
```

- [ ] **Step 7: The browser check finds the highlight in 外观**

In `tests/e2e/extension.mjs`, in the block `// ── The settings page: the hover highlight switch really changes`, both
`await openSection(options, 'reading')` become `await openSection(options, 'appearance')`.

Run: `node --check tests/e2e/extension.mjs`
Expected: exit 0.

- [ ] **Step 8: Run the tests, the gate, and commit**

Run: `pnpm vitest run tests/options && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0. Then `git add` the files and run `node scripts/check-english.mjs`: it passes with the allowlist as it
is (`extension.mjs` stays at 76: the two changed lines hold none; the new files hold none).

```bash
git add src/entrypoints/options/sections/Appearance.tsx src/entrypoints/options/ui/ColourPick.tsx src/entrypoints/options/App.tsx src/entrypoints/options/ui/settings.css src/locales/zh-CN.ts src/locales/en.ts tests/e2e/extension.mjs tests/options/appearance-section.test.ts scripts/english-allowlist.txt
node scripts/check-english.mjs
git commit -m "feat(options): the appearance section — the theme, the dimming and the highlight's colours

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 56: 外观 — the translation styles and their editor

§6.4's middle: 译文样式, one card and one radio group, a row a style — its name over the sample sentence written in
that style, a pencil at its end —, 「＋ 新建样式…」 last, 「恢复内置样式」 on the heading. The editor opens under its row
for a built-in as for one's own: 名称; the preview; 颜色; 浓淡 1 · 0.7 · 0.5; 下划线 with 线宽 as a sub-line once a line
is chosen; 更多, folded: 悬停前模糊 and the custom declarations; then 完成, 复制一份 and 删除样式 with the undo row.

**Files:**
- Create: `src/entrypoints/options/sections/StyleEditor.tsx`
- Modify: `src/entrypoints/options/sections/Appearance.tsx` (the styles group)
- Modify: `src/entrypoints/options/ui/settings.css` (append)
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`O.appearance` styles words, `O.more`, `O.reading.blurHint`)
- Modify: `tests/e2e/options-page.mjs` (`chooseStyle`), `tests/e2e/extension.mjs` (the dashed style's flow)
- Check: `scripts/english-allowlist.txt` (the English gate: `options-page.mjs` stays at 13, `extension.mjs` at 76)
- Test: `tests/options/styles.test.ts`

**Interfaces:**
- Consumes: `styleTile` (`@/ui/appearance/tiles`; Part 7 moves it, ruling 23), `resetBuiltIns`, `duplicateStyle`, `newProfileId`,
  `BUILT_IN_STYLES`, `UNDERLINES`, `NAME_MAX` (`@/config/appearance`), `copyName` (`@/ui/strings`),
  `sanitizeCustomCss` (`@/core/renderer`); Part 3's `Segmented`, `Field`, `TextInput`, `Button`, `Reveal`;
  `UndoRow`, `withUndo`, `insertAt`, `useLinger`, `withItem`, `segmentWidth` (Task 51); `ColourPick` (Task 55).
- Produces: `StyleEditor({ value, onChange, onDone, onDuplicate, onDelete })`, `STRENGTHS = [1, 0.7, 0.5]`; the words
  `O.appearance.{styles, restore, edit(name), create, newStyle, editor: { name, colour, follow, pick, strength, strengths, css, done, delete }}`, `O.more`.

- [ ] **Step 1: The words**

In `src/locales/zh-CN.ts`, in `O`: add `more: '更多',` after `title: '设置',`; inside `appearance`, after `pickColour`:

```ts
    styles: '译文样式',
    restore: '恢复内置样式',
    edit: (name: string) => `编辑「${name}」`,
    create: '新建样式…',
    newStyle: '新样式',
    editor: {
      name: '名称',
      colour: '颜色',
      follow: '跟随原文',
      pick: '自选颜色',
      strength: '浓淡',
      /** §6.4: 1 · 0.7 · 0.5 (0.7 is the built-in 淡一档's) */
      strengths: ['原样', '淡一些', '更淡'],
      css: '自定义 CSS（只写声明，例如 letter-spacing: 0.02em）',
      done: '完成',
      delete: '删除样式',
    },
```

and in `reading`, `blurHint` becomes `'译文先糊着，鼠标停上去才清晰'`. In `src/locales/en.ts`: `more: 'More',`; in
`appearance`:

```ts
    styles: 'Translation style',
    restore: 'Restore built-in styles',
    edit: name => `Edit “${name}”`,
    create: 'New style…',
    newStyle: 'New style',
    editor: {
      name: 'Name',
      colour: 'Colour',
      follow: 'Same as the original',
      pick: 'Pick a colour',
      strength: 'Strength',
      strengths: ['Full', 'Lighter', 'Lightest'],
      css: 'Custom CSS (declarations only, such as letter-spacing: 0.02em)',
      done: 'Done',
      delete: 'Delete style',
    },
```

and `reading.blurHint` becomes `'The translation stays blurred until the pointer rests on it'`.

- [ ] **Step 2: Write the failing tests**

`tests/options/styles.test.ts`:

```ts
// The translation styles (the redesign's design, §6.4): a radio row a style, its sample written in it, a pencil that
// opens the editor under its row for a built-in as for one's own; every control of the editor writes at once; the
// strength's three steps and a value between them; new, duplicate, delete with its undo, and the built-ins restored
import { createElement as h, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILT_IN_STYLES } from '@/config/appearance'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))

import { Appearance } from '@/entrypoints/options/sections/Appearance'
import { UNDO_MS } from '@/entrypoints/options/ui/UndoRow'
import { O, setLocale } from '@/ui/strings'

function Harness({ start, patches }: { start: Config; patches: Config[] }) {
  const [config, setConfig] = useState(start)
  const data: OptionsData = {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(config); patches.push(next); setConfig(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
  return h(Appearance, { data })
}
const card = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-row="appearance/styles"]')!
const styleRadios = (c: HTMLElement) => [...card(c).querySelectorAll<HTMLElement>(':scope > [data-srow] [role="radio"]')]
const names = (c: HTMLElement) => styleRadios(c).map(r => document.getElementById(r.getAttribute('aria-labelledby')!)!.textContent)
const button = (c: HTMLElement, name: string) => [...c.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === name || b.getAttribute('aria-label') === name)!
const segment = (c: HTMLElement, group: string, name: string) => [...c.querySelectorAll<HTMLElement>(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`)].find(r => r.textContent === name)!
const editor = (c: HTMLElement) => c.querySelector<HTMLElement>('.o-editor')
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('the translation styles (§6.4)', () => {
  beforeEach(() => { setLocale('en'); vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })

  it('a radio row a style, its sample written in it; a press chooses it; the heading restores the built-ins', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    expect(names(m.container)).toEqual(['Same as the original', 'Green', 'Blue', 'Amber', 'Muted', 'Blurred'])
    const sample = card(m.container).querySelectorAll<HTMLElement>('.o-desc[data-sample]')[1]!
    expect(sample.textContent).toBe(O.reading.previewTarget)
    // the muted style's sample, drawn at its strength (happy-dom keeps a number and drops an oklch() colour)
    expect(card(m.container).querySelectorAll<HTMLElement>('.o-desc[data-sample]')[4]!.style.opacity).toBe('0.7')
    styleRadios(m.container)[2]!.click()
    await m.flush()
    expect(patches.at(-1)?.appearance.activeStyle).toBe('blue')
    await m.unmount()
  })

  it('the pencil opens the editor under its row and chooses the style; each control writes at once', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    button(m.container, O.appearance.edit('Green')).click()
    await m.flush()
    expect(patches.at(-1)?.appearance.activeStyle).toBe('green')
    const e = editor(m.container)!
    expect(document.activeElement).toBe(e.querySelector('input'))
    button(e, 'oklch(0.62 0.15 250)').click()
    await m.flush()
    segment(e, O.appearance.editor.strength, 'Lighter').click()
    await m.flush()
    segment(e, O.reading.underline, 'Dashed').click()
    await m.flush()
    const green = patches.at(-1)!.appearance.styles.find(s => s.id === 'green')!
    expect([green.color, green.opacity, green.underline]).toEqual(['oklch(0.62 0.15 250)', 0.7, 'dashed'])
    expect(segment(editor(m.container)!, O.reading.thickness, '2px').closest('[inert]')).toBeNull()
    button(editor(m.container)!, O.appearance.editor.done).click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(200)
    expect(editor(m.container)).toBeNull()
    await m.unmount()
  })

  it('a strength between the steps (an earlier slider\'s 0.85) chooses no step, and opening the editor writes nothing of it', async () => {
    const patches: Config[] = []
    const start = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, styles: DEFAULT_CONFIG.appearance.styles.map(s => (s.id === 'amber' ? { ...s, opacity: 0.85 } : s)) } }
    const m = await mountElement(h(Harness, { start, patches }))
    button(m.container, O.appearance.edit('Amber')).click()
    await m.flush()
    const steps = [...editor(m.container)!.querySelectorAll(`[role="radiogroup"][aria-label="${O.appearance.editor.strength}"] [role="radio"]`)]
    expect(steps.map(s => s.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false'])
    expect(patches.every(p => p.appearance.styles.find(s => s.id === 'amber')!.opacity === 0.85)).toBe(true)
    segment(editor(m.container)!, O.appearance.editor.strength, 'Full').click()
    await m.flush()
    expect(patches.at(-1)!.appearance.styles.find(s => s.id === 'amber')!.opacity).toBe(1)
    await m.unmount()
  })

  it('More (O.more) holds the blur and the declarations, the declarations checked in place and written only when they hold', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    button(m.container, O.appearance.edit('Blue')).click()
    await m.flush()
    const more = button(editor(m.container)!, O.more)
    expect(more.getAttribute('aria-expanded')).toBe('false')
    more.click()
    await m.flush()
    const css = [...editor(m.container)!.querySelectorAll<HTMLInputElement>('input')].at(-1)!
    type(css, 'color: red }')
    await m.flush()
    expect(editor(m.container)!.textContent).toContain(O.reading.advancedRejected.closeBrace)
    expect(patches.at(-1)!.appearance.styles.find(s => s.id === 'blue')!.css).toBe('')
    type(css, 'letter-spacing: 0.02em')
    await m.flush()
    expect(patches.at(-1)!.appearance.styles.find(s => s.id === 'blue')!.css).toBe('letter-spacing: 0.02em')
    await m.unmount()
  })

  it('a new style is added at the end, chosen, its editor open; a duplicate the same, named as a copy', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    button(m.container, O.appearance.create).click()
    await m.flush()
    expect(names(m.container).at(-1)).toBe(O.appearance.newStyle)
    expect(patches.at(-1)!.appearance.activeStyle).toBe(patches.at(-1)!.appearance.styles.at(-1)!.id)
    expect(editor(m.container)).not.toBeNull()
    button(editor(m.container)!, O.reading.duplicate).click()
    await m.flush()
    expect(names(m.container).at(-1)).toBe(`${O.appearance.newStyle} ${O.reading.copySuffix}`)
    await m.unmount()
  })

  it('deleting is undone: the undo row stands in its place for 5 s, and undoing puts the style back, chosen', async () => {
    const patches: Config[] = []
    const start = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, activeStyle: 'green' } }
    const m = await mountElement(h(Harness, { start, patches }))
    button(m.container, O.appearance.edit('Green')).click()
    await m.flush()
    button(editor(m.container)!, O.appearance.editor.delete).click()
    await m.flush()
    expect(names(m.container)).not.toContain('Green')
    expect(patches.at(-1)!.appearance.activeStyle).toBe('follow')
    const undoRow = card(m.container).querySelector<HTMLElement>('[data-undo]')!
    expect(undoRow.textContent).toContain(O.undo.deleted('Green'))
    expect([...card(m.container).querySelectorAll(':scope > [data-srow]')].indexOf(undoRow)).toBe(1)
    button(undoRow, O.undo.undo).click()
    await m.flush()
    expect(names(m.container)[1]).toBe('Green')
    expect(patches.at(-1)!.appearance.activeStyle).toBe('green')
    button(m.container, O.appearance.edit('Green')).click()
    await m.flush()
    button(editor(m.container)!, O.appearance.editor.delete).click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(card(m.container).querySelector('[data-undo]')).toBeNull()
    await m.unmount()
  })

  it('restoring the built-ins puts them back as shipped and keeps one\'s own', async () => {
    const patches: Config[] = []
    const mine = { ...BUILT_IN_STYLES[0]!, id: 'style-mine0000', name: 'Mine' }
    const start = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, styles: [...DEFAULT_CONFIG.appearance.styles.map(s => (s.id === 'green' ? { ...s, color: '#000000' } : s)), mine] } }
    const m = await mountElement(h(Harness, { start, patches }))
    button(m.container, O.appearance.restore).click()
    await m.flush()
    const styles = patches.at(-1)!.appearance.styles
    expect(styles.find(s => s.id === 'green')!.color).toBe(BUILT_IN_STYLES[1]!.color)
    expect(styles.at(-1)).toEqual(mine)
    await m.unmount()
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run tests/options/styles.test.ts`
Expected: FAIL — no `[data-row="appearance/styles"]`.

- [ ] **Step 4: Write the editor**

`src/entrypoints/options/sections/StyleEditor.tsx`:

```tsx
// A translation style's editor (the redesign's design, §6.4), opened under its row for a built-in as for one of the
// reader's own: the name, the preview (the original over the translation, in the style), the colour, the strength, the
// underline with the line's thickness once a line is chosen, and folded under More the blur and the custom
// declarations; then Done, Duplicate (S-O-48, kept: §11 does not list it) and Delete style. Every control writes at once; the name only when it is not empty (the schema's), and the
// declarations only when they will survive the sanitiser, the rest staying in the field with its reason
import { ChevronRight } from 'lucide'
import { useEffect, useRef, useState } from 'react'
import { NAME_MAX, PALETTE, type StyleProfile, UNDERLINES } from '@/config/appearance'
import { sanitizeCustomCss } from '@/core/renderer'
import { styleTile } from '@/ui/appearance/tiles'
import { Button } from '@/ui/controls/Button'
import { Field, TextInput } from '@/ui/controls/Field'
import { Icon } from '@/ui/controls/Icon'
import { Reveal } from '@/ui/controls/Reveal'
import { Segmented } from '@/ui/controls/Segmented'
import { Switch } from '@/ui/controls/Switch'
import { O, profileName } from '@/ui/strings'
import { ColourPick } from '../ui/ColourPick'
import { segmentWidth } from '../ui/lists'

/** The strength's steps (§6.4): as it is, a step lighter (the built-in muted style's 0.7), lighter still */
export const STRENGTHS = [1, 0.7, 0.5] as const

export function StyleEditor({ value, onChange, onDone, onDuplicate, onDelete }: {
  value: StyleProfile
  /** answers with the write: the declarations' field waits for its own (CustomCss) */
  onChange: (next: StyleProfile) => Promise<unknown>
  onDone: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const e = O.appearance.editor
  const [name, setName] = useState(() => profileName(value, 'styles'))
  const [more, setMore] = useState(value.blur || value.css !== '')
  const nameField = useRef<HTMLInputElement>(null)
  // an opened editor puts the focus on its first field (§9)
  useEffect(() => { nameField.current?.focus({ preventScroll: true }) }, [])
  const set = (over: Partial<StyleProfile>) => void onChange({ ...value, ...over })
  return (
    <div className="o-editor">
      <Field label={e.name}>
        <TextInput ref={nameField} value={name} maxLength={NAME_MAX} autoComplete="off"
          onChange={ev => { setName(ev.target.value); if (ev.target.value.trim()) set({ name: ev.target.value.trim() }) }} />
      </Field>
      <div className="o-preview">
        <div className="o-preview-source">{O.reading.previewSource}</div>
        <div className="o-preview-target" data-blur={value.blur || undefined} style={styleTile(value)}>{O.reading.previewTarget}</div>
      </div>
      <div className="o-line">
        <span>{e.colour}</span>
        <span className="o-swatches">
          <button type="button" className="swatch o-swatch o-follow" aria-label={e.follow} title={e.follow} aria-pressed={value.color === ''} onClick={() => set({ color: '' })} />
          {PALETTE.map(c => (
            <button key={c} type="button" className="swatch o-swatch" aria-label={c} aria-pressed={value.color === c} style={{ background: c }} onClick={() => set({ color: c })} />
          ))}
          <ColourPick label={e.pick} value={value.color} pressed={value.color !== '' && !PALETTE.includes(value.color)} onPick={color => set({ color })} />
        </span>
      </div>
      <div className="o-line">
        <span>{e.strength}</span>
        <div className="o-seg" style={segmentWidth(210)}>
          {/* a value between the steps matches none: no step is chosen until one is (§6.4; Part 3's Segmented) */}
          <Segmented size="sm" label={e.strength} value={String(value.opacity)} options={STRENGTHS.map((v, i) => ({ value: String(v), label: e.strengths[i]! }))}
            onChange={v => set({ opacity: Number(v) })} />
        </div>
      </div>
      <div className="o-line">
        <span>{O.reading.underline}</span>
        <div className="o-seg" style={segmentWidth(300)}>
          <Segmented size="sm" label={O.reading.underline} value={value.underline} options={UNDERLINES.map(u => ({ value: u, label: O.reading.underlines[u] }))}
            onChange={underline => set({ underline })} />
        </div>
      </div>
      <Reveal open={value.underline !== 'none'}>
        <div className="o-line" data-sub="">
          <span>{O.reading.thickness}</span>
          <div className="o-seg" style={segmentWidth(120)}>
            <Segmented size="sm" label={O.reading.thickness} value={String(value.thickness)} options={[{ value: '1', label: '1px' }, { value: '2', label: '2px' }]}
              onChange={t => set({ thickness: t === '2' ? 2 : 1 })} />
          </div>
        </div>
      </Reveal>
      <div>
        <button type="button" className="o-disclose" aria-expanded={more} onClick={() => setMore(m => !m)}>
          <Icon node={ChevronRight} size={14} />{O.more}
        </button>
      </div>
      <Reveal open={more}>
        <div className="o-more">
          <div className="o-line">
            <span className="o-line-words"><span>{O.reading.blur}</span><small>{O.reading.blurHint}</small></span>
            <Switch label={O.reading.blur} checked={value.blur} onChange={blur => set({ blur })} />
          </div>
          <CustomCss value={value.css} onChange={css => onChange({ ...value, css })} />
        </div>
      </Reveal>
      <div className="o-formbar">
        <Button type="button" kind="brand" size="md" onClick={onDone}>{e.done}</Button>
        <Button type="button" kind="text" size="md" onClick={onDuplicate}>{O.reading.duplicate}</Button>
        <Button type="button" kind="text" size="md" onClick={onDelete}>{e.delete}</Button>
      </div>
    </div>
  )
}

/**
 * The custom declarations (S-O-47), a draft of their own: a refused block never reaches the stored profile, so a value
 * fed straight back would snap the text away before its reason could be read (Codex on #157). The draft follows the
 * profile when it changes elsewhere, never while a write of its own is out; a refused write leaves it the reader's to
 * finish (the reasoning of the drawer's AdvancedCss, which this replaces)
 */
function CustomCss({ value, onChange }: { value: string; onChange: (css: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState(value)
  const committed = useRef(value)
  const pending = useRef(0)
  const failed = useRef(false)
  if (committed.current !== value) {
    committed.current = value
    if (pending.current === 0 && !failed.current && draft !== value && sanitizeCustomCss(draft).ok) setDraft(value)
  }
  const check = sanitizeCustomCss(draft)
  return (
    <Field label={O.appearance.editor.css} error={check.ok ? undefined : O.reading.advancedRejected[check.reason]}>
      <TextInput value={draft} spellCheck={false} autoComplete="off" onChange={e => {
        const next = e.target.value
        setDraft(next)
        if (!sanitizeCustomCss(next).ok) return
        pending.current++
        onChange(next).then(() => { failed.current = false }, () => { failed.current = true }).finally(() => { pending.current-- })
      }} />
    </Field>
  )
}
```

- [ ] **Step 5: The styles group**

In `src/entrypoints/options/sections/Appearance.tsx`, add the imports

```tsx
import { Pencil, Plus } from 'lucide'
import { Fragment, useRef, useState } from 'react'
import { type Appearance as Looks, BUILT_IN_STYLES, type StyleProfile, duplicateStyle, newProfileId, resetBuiltIns } from '@/config/appearance'
import { styleTile } from '@/ui/appearance/tiles'
import { Button } from '@/ui/controls/Button'
import { radioKeys } from '@/ui/controls/radio'
import { copyName } from '@/ui/strings'
import { GroupHeading } from '../ui/Card'
import { insertAt, useLinger, withItem, withUndo } from '../ui/lists'
import { IconButton } from '../ui/Row'
import { UndoRow } from '../ui/UndoRow'
import { StyleEditor } from './StyleEditor'
```

(merging them into the file's existing import lines) and insert, right before `<Card gap row="appearance/highlight">`:

```tsx
      <GroupHeading title={O.appearance.styles}
        action={<Button type="button" kind="text" size="md" onClick={() => void patch(latest => ({ ...latest, appearance: resetBuiltIns(latest.appearance, 'styles') }))}>{O.appearance.restore}</Button>} />
      <Styles data={data} />
```

(the highlight's card keeps its `gap`: it follows the styles' card now). Append to the file:

```tsx
interface GoneStyle { profile: StyleProfile; index: number; active: boolean; focus: boolean }

/** The translation styles (§6.4): one card, one radio group; a row a style, its editor under it; the new-style row last */
function Styles({ data }: { data: OptionsData }) {
  const { patch } = data
  const a = data.config!.appearance
  const [editing, setEditing] = useState<string | null>(null)
  const drawn = useLinger(editing)
  const [gone, setGone] = useState<GoneStyle[]>([])
  /** a style just made or duplicated: its row comes in with §8's row motion */
  const [fresh, setFresh] = useState<string | null>(null)
  const radios = useRef(new Map<string, HTMLElement>())
  const k = O.search.keywords
  const setLooks = (fn: (c: Looks) => Looks) => patch(latest => ({ ...latest, appearance: fn(latest.appearance) }))
  const choose = (id: string) => void setLooks(c => ({ ...c, activeStyle: id }))
  const open = (id: string) => { choose(id); setEditing(id) }
  const close = (id: string) => { setEditing(null); radios.current.get(id)?.focus() }
  const add = (next: StyleProfile) => {
    void setLooks(c => ({ ...c, styles: [...c.styles, next], activeStyle: next.id }))
    setFresh(next.id)
    setEditing(next.id)
  }
  const remove = (p: StyleProfile) => {
    const index = a.styles.findIndex(s => s.id === p.id)
    setGone(g => [...g, { profile: p, index, active: a.activeStyle === p.id, focus: !document.documentElement.hasAttribute('data-axt-pointer') }])
    setEditing(null)
    // the chosen one deleted: the first of the list takes over, never nothing
    void setLooks(c => {
      const styles = c.styles.filter(s => s.id !== p.id)
      return { ...c, styles, activeStyle: c.activeStyle === p.id ? styles[0]?.id ?? BUILT_IN_STYLES[0]!.id : c.activeStyle }
    })
  }
  const undo = (g: GoneStyle) => {
    setGone(x => x.filter(y => y !== g))
    void setLooks(c => (c.styles.some(s => s.id === g.profile.id) ? c : { ...c, styles: insertAt(c.styles, g.index, g.profile), activeStyle: g.active ? g.profile.id : c.activeStyle }))
    requestAnimationFrame(() => radios.current.get(g.profile.id)?.focus())
  }
  const ids = a.styles.map(s => s.id)
  const keys = radioKeys(ids, a.activeStyle, () => true, choose, i => radios.current.get(ids[i]!)?.focus())
  return (
    <Card role="radiogroup" label={O.appearance.styles} row="appearance/styles" onKeyDown={keys}>
      {withUndo(a.styles, gone).map(entry => {
        if ('gone' in entry) {
          const g = entry.gone
          return <UndoRow key={`gone-${g.profile.id}`} name={profileName(g.profile, 'styles')} focus={g.focus} onUndo={() => undo(g)} onExpire={() => setGone(x => x.filter(y => y !== g))} />
        }
        const s = entry.item
        const name = profileName(s, 'styles')
        return (
          <Fragment key={s.id}>
            <Row kind="radio" checked={s.id === a.activeStyle} onChoose={() => choose(s.id)} label={name} words={k['appearance/styles']} arriving={fresh === s.id}
              description={O.reading.previewTarget} sample={styleTile(s)}
              radioRef={el => { if (el) radios.current.set(s.id, el); else radios.current.delete(s.id) }}
              trailing={<IconButton icon={Pencil} label={O.appearance.edit(name)} hover aria-expanded={editing === s.id} onClick={() => open(s.id)} />} />
            <Reveal open={editing === s.id}>
              {drawn === s.id && (
                <StyleEditor value={s} onChange={next => setLooks(c => ({ ...c, styles: withItem(c.styles, next) }))} onDone={() => close(s.id)}
                  onDuplicate={() => add(duplicateStyle(s, copyName(s, 'styles')))} onDelete={() => remove(s)} />
              )}
            </Reveal>
          </Fragment>
        )
      })}
      <Row kind="button" quiet lead={<Icon node={Plus} size={14} />} label={O.appearance.create}
        onPress={() => add({ ...BUILT_IN_STYLES[0]!, id: newProfileId('style'), name: O.appearance.newStyle })} />
    </Card>
  )
}
```

- [ ] **Step 6: The editor's rules**

Append to `src/entrypoints/options/ui/settings.css`:

```css
/* ---- Task 56: the style editor, a form's bar (§6.4) ---- */
@layer components {
  /* opened under its row: from the words' edge (42) to the trailing edge (14), its lines 14 px apart */
  .o-editor { display: flex; flex-direction: column; gap: 14px; padding: 8px 10px 14px 38px; }
  .o-preview { padding: 12px 14px; border-radius: 8px; background: var(--field); line-height: 1.7; }
  .o-preview-source { color: var(--ink-2); font-size: 12.5px; }
  /* the blur until hovered, as on the page: the sample's blur is inline (styleTile), so the hover's must outrank it */
  .o-preview-target[data-blur]:hover { filter: none !important; }
  .o-line { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 26px; }
  /* the line's thickness, a sub-line of the underline: one step in */
  .o-line[data-sub] { padding-inline-start: 28px; }
  .o-line-words { display: flex; flex-direction: column; gap: 2px; }
  .o-line-words small { color: var(--ink-2); font-size: 12px; line-height: 1.4; }
  /* a segmented control at its agreed width (segmentWidth), never wider than its line: the width is the wrapper's, so
     that it holds inside a trail that takes its content's width */
  .o-seg { width: var(--w); max-width: 100%; }
  .o-seg > [role="radiogroup"] { width: 100%; }
  .o-disclose { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: 0; background: none; color: var(--ink-2); font: inherit; font-size: 12.5px; cursor: pointer; }
  .o-disclose svg { transition: rotate 150ms ease-out; }
  .o-disclose[aria-expanded="true"] svg { rotate: 90deg; }
  .o-more { display: flex; flex-direction: column; gap: 12px; padding-top: 2px; }
  /* the swatch that follows the original's colour: half the ink, half the ground */
  .o-follow { background: conic-gradient(var(--ink) 0 50%, var(--chrome) 0); }
  /* a form's bar: its primary, its text buttons, a note beside them */
  .o-formbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .o-note { display: inline-flex; align-items: center; gap: 5px; color: var(--ink-2); font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) { .o-disclose svg { transition: none; } }
```

- [ ] **Step 7: The browser checks choose and make a style in 外观**

In `tests/e2e/options-page.mjs`, `chooseStyle` becomes:

```js
/** Choose a translation style by its name: a radio row of the appearance section's styles (the redesign's design, §6.4) */
export async function chooseStyle(options, name) {
  await openSection(options, 'appearance')
  await pick(options.getByRole('radio', { name, exact: true }))
  await sleep(200)
}
```

In `tests/e2e/extension.mjs`, the dashed style's flow (after `// Since v12 the line style is a field of the configuration`):

```js
  await options.bringToFront()
  await openSection(options, 'appearance')
  await options.getByRole('button', { name: '新建样式…', exact: true }).click()
  const editor = options.locator('.o-editor')
  await editor.waitFor({ timeout: 5_000 })
  await editor.getByRole('radio', { name: '虚线', exact: true }).click()
  await editor.getByRole('button', { name: '完成', exact: true }).click()
```

Run: `node --check tests/e2e/options-page.mjs && node --check tests/e2e/extension.mjs`
Expected: exit 0.

- [ ] **Step 8: Run the tests, the gate, and commit**

Run: `pnpm vitest run tests/options && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0. (Part 3's `Segmented` draws a value that matches no option as nothing chosen; if the in-between test
fails on its `aria-checked` line, report it rather than working around it here.) Then `git add` the files and run
`node scripts/check-english.mjs`: it passes with the allowlist as it is — `chooseStyle` holds no CJK line
(`options-page.mjs` stays at 13), the dashed style's seven lines replace seven holding as many (`extension.mjs` stays
at 76), and the new files hold none.

```bash
git add src/entrypoints/options/sections/StyleEditor.tsx src/entrypoints/options/sections/Appearance.tsx src/entrypoints/options/ui/settings.css src/locales/zh-CN.ts src/locales/en.ts tests/e2e/options-page.mjs tests/e2e/extension.mjs tests/options/styles.test.ts scripts/english-allowlist.txt
node scripts/check-english.mjs
git commit -m "feat(options): the translation styles as rows, edited in place

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 57: 阅读

§6.5: 翻译方式 (按需翻译 · 整篇翻译) with its description following the choice; 图片翻译; 译文在哪里打开 as a small
segmented control; 显示悬浮按钮; and the PDF group — the reader's switch, with 同步滚动 as its sub-row while it is on.
The old reading and PDF reader sections go: their styles and highlights are 外观's since Tasks 55–56.

**Files:**
- Rewrite: `src/entrypoints/options/sections/Reading.tsx`
- Delete: `src/entrypoints/options/sections/PdfReader.tsx`, `tests/options/pdf-reader-section.test.ts`
- Modify: `src/entrypoints/options/App.tsx` (`CONTENT.reading`; the `PdfReader` import goes)
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`O.reading`; `O.pdfReader` goes)
- Rewrite: `tests/options/reading-section.test.ts`
- Modify: `tests/e2e/options-page.mjs` (`setPreload`, `setSwitch`), `tests/e2e/extension.mjs` (the preload's read-back),
  `experiments/pdf-bilingual/spikes/entries.mjs` (section 5's switches)
- Modify: `tests/ui/locales.test.ts` (the heading 「PDF」 allowed ASCII), `scripts/english-allowlist.txt` (the counts the English gate names)

**Interfaces:**
- Consumes: `useFloatingEntry` (`../floating-entry`, unchanged); Part 3's `Segmented`, `Reveal`; `Row`, `Card`,
  `GroupHeading` (Task 50); `segmentWidth` (Task 51); `R.sync`, `S.rows.images`.
- Produces: `Reading({ data })` (the new one); `O.reading.{imagesHint, pdf, pdfEnabled, pdfEnabledHint, syncHint}` and the
  new words of `openInHint`, `floatingEntryHint`.

- [ ] **Step 1: The words**

In `src/locales/zh-CN.ts`, in `O.reading`:
- delete `newProfile`, `styles`, `stylesHint`, `highlights`, `highlightsHint` (only the old section read them);
- `openInHint` becomes `'从摘要页或 PDF 页打开译文时'`;
- `floatingEntryHint` becomes `'在 arXiv 的摘要页、PDF 和全文页贴在窗口边缘'`;
- after `floatingEntryHint` add:

```ts
    imagesHint: '图里的文字也翻，译文叠在图上，悬停查看原文',
    /** §6.5: the PDF group */
    pdf: 'PDF',
    pdfEnabled: '在 arXiv 的 PDF 上使用对照阅读器',
    pdfEnabledHint: '关掉后，PDF 用浏览器自带的查看器打开',
    syncHint: '原文和译文一起滚',
```

and delete `pdfReader: { enabled: … },` from `O`. In `src/locales/en.ts`, the same keys:

```ts
    openInHint: 'When opened from an abstract or a PDF page',
    floatingEntryHint: 'Docked to the window\'s edge on arXiv\'s abstract, PDF and full-text pages',
    imagesHint: 'Text in figures is translated too, laid over the figure; hover to see the original',
    pdf: 'PDF',
    pdfEnabled: 'Use the bilingual reader for arXiv PDFs',
    pdfEnabledHint: 'Off, PDFs open in the browser\'s own viewer',
    syncHint: 'The original and the translation scroll together',
```

with the same deletions. In `tests/ui/locales.test.ts`, the Chinese pack's pattern of entries allowed to be ASCII
gains the group heading: in the `allowed` regular expression, after `O\.reading\.previewSource` insert `|O\.reading\.pdf$`
(ruling 20: the controller joins this alternative with Part 4's at the second merge).

- [ ] **Step 2: Write the failing tests**

`tests/options/reading-section.test.ts` (the whole file):

```ts
// The reading section (the redesign's design, §6.5): the way to translate with its description following the choice, figure text, where
// translations open, the floating button (asked of the background, its state's only writer), and the PDF group with
// its sub-row while the reader is on. Every control writes at once
import { createElement as h, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const floating = vi.hoisted(() => ({ enabled: true as boolean | null, asked: [] as boolean[] }))
vi.mock('@/entrypoints/options/floating-entry', () => ({
  useFloatingEntry: () => ({ enabled: floating.enabled, setEnabled: (next: boolean) => { floating.asked.push(next) } }),
}))

import { Reading } from '@/entrypoints/options/sections/Reading'
import { O, R, S, setLocale } from '@/ui/strings'

function Harness({ start, patches }: { start: Config; patches: Config[] }) {
  const [config, setConfig] = useState(start)
  const data: OptionsData = {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(config); patches.push(next); setConfig(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
  return h(Reading, { data })
}
const rowOf = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-row="${id}"]`)!
const segments = (c: HTMLElement, label: string) => [...c.querySelectorAll<HTMLElement>(`[role="radiogroup"][aria-label="${label}"] [role="radio"]`)]
const switchOf = (c: HTMLElement, label: string) => c.querySelector<HTMLElement>(`[role="switch"][aria-label="${label}"]`)!

describe('the reading section (§6.5)', () => {
  beforeEach(() => { setLocale('en'); floating.asked.length = 0 })

  it('the way to translate: two choices, the description following the choice and coming in anew as it changes', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, preload: 'on-demand' }, patches }))
    expect(segments(m.container, O.reading.translateWay).map(s => s.textContent)).toEqual(['As you read', 'Whole paper'])
    const description = () => rowOf(m.container, 'reading/way').querySelector('.o-desc')!
    expect(description().textContent).toBe(O.reading.translateWayHints[0])
    expect(description().classList.contains('o-swap')).toBe(false)
    segments(m.container, O.reading.translateWay)[1]!.click()
    await m.flush()
    expect(patches.at(-1)?.preload).toBe('whole')
    expect(description().textContent).toBe(O.reading.translateWayHints[1])
    expect(description().classList.contains('o-swap')).toBe(true)
    await m.unmount()
  })

  it('figure text, where translations open and the floating button, each written at once', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    rowOf(m.container, 'reading/images').querySelector<HTMLElement>('.o-label')!.click()
    await m.flush()
    expect(patches.at(-1)?.image.enabled).toBe(false)
    segments(m.container, O.reading.openIn)[1]!.click()
    await m.flush()
    expect(patches.at(-1)?.reading.openIn).toBe('same-tab')
    switchOf(m.container, O.reading.floatingEntry).click()
    expect(floating.asked).toEqual([false])
    expect(rowOf(m.container, 'reading/images').textContent).toContain(O.reading.imagesHint)
    expect(switchOf(m.container, S.rows.images)).not.toBeNull()
    await m.unmount()
  })

  it('the PDF group: the reader\'s switch, and syncing only while the reader is on', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    const sync = () => switchOf(m.container, R.sync)
    expect(sync().closest('[inert]')).toBeNull()
    sync().click()
    await m.flush()
    expect(patches.at(-1)?.pdfReader.sync).toBe(false)
    switchOf(m.container, O.reading.pdfEnabled).click()
    await m.flush()
    expect(patches.at(-1)?.pdfReader.enabled).toBe(false)
    expect(sync().closest('[inert]')).not.toBeNull()
    expect(rowOf(m.container, 'reading/pdf').querySelectorAll('[role="switch"]')).toHaveLength(2)
    await m.unmount()
  })
})
```

Delete `tests/options/pdf-reader-section.test.ts` (its rows are 阅读's and 外观's, tested above and in Task 55).

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run tests/options/reading-section.test.ts`
Expected: FAIL — no `[data-row="reading/way"]`.

- [ ] **Step 4: Write 阅读**

`src/entrypoints/options/sections/Reading.tsx` (the whole file):

```tsx
// The reading section (the redesign's design, §6.5): how a paper is translated, figure text, where a translation opens
// from an abstract or a PDF page, the floating button, and the PDF group. Every control writes at once; the whole-paper
// way reaches an open paper at
// once (the session releases what waits, Part 2). The floating button's state is not in the configuration: the
// background, its only writer, is asked (floating-entry.ts)
import { Reveal } from '@/ui/controls/Reveal'
import { Segmented } from '@/ui/controls/Segmented'
import { Switch } from '@/ui/controls/Switch'
import { O, R, S } from '@/ui/strings'
import type { OptionsData } from '../data'
import { useFloatingEntry } from '../floating-entry'
import { Card, GroupHeading } from '../ui/Card'
import { segmentWidth } from '../ui/lists'
import { Row } from '../ui/Row'

const WAYS = ['on-demand', 'whole'] as const
const OPEN_IN = ['new-tab', 'same-tab'] as const

export function Reading({ data }: { data: OptionsData }) {
  const { config, patch } = data
  const floating = useFloatingEntry()
  if (!config) return null
  const k = O.search.keywords
  const setReader = (change: Partial<typeof config.pdfReader>) => void patch(latest => ({ ...latest, pdfReader: { ...latest.pdfReader, ...change } }))
  return (
    <>
      <Card>
        <Row row="reading/way" words={k['reading/way']} label={O.reading.translateWay} description={O.reading.translateWayHints[config.preload === 'whole' ? 1 : 0]} swap
          trailing={<div className="o-seg" style={segmentWidth(220)}><Segmented size="sm" label={O.reading.translateWay} value={config.preload}
            options={WAYS.map((value, i) => ({ value, label: O.reading.translateWays[i]! }))} onChange={preload => void patch(latest => ({ ...latest, preload }))} /></div>} />
        <Row toggles row="reading/images" words={k['reading/images']} label={S.rows.images} description={O.reading.imagesHint}
          trailing={<Switch label={S.rows.images} checked={config.image.enabled} onChange={on => void patch(latest => ({ ...latest, image: { enabled: on } }))} />} />
        <Row row="reading/open-in" words={k['reading/open-in']} label={O.reading.openIn} description={O.reading.openInHint}
          trailing={<div className="o-seg" style={segmentWidth(200)}><Segmented size="sm" label={O.reading.openIn} value={config.reading.openIn}
            options={OPEN_IN.map((value, i) => ({ value, label: O.reading.openInStops[i]! }))} onChange={openIn => void patch(latest => ({ ...latest, reading: { ...latest.reading, openIn } }))} /></div>} />
        <Row toggles row="reading/floating" words={k['reading/floating']} label={O.reading.floatingEntry} description={O.reading.floatingEntryHint}
          trailing={<Switch label={O.reading.floatingEntry} checked={floating.enabled ?? true} onChange={floating.setEnabled} />} />
      </Card>
      <GroupHeading title={O.reading.pdf} />
      <Card row="reading/pdf">
        <Row toggles words={k['reading/pdf']} label={O.reading.pdfEnabled} description={O.reading.pdfEnabledHint}
          trailing={<Switch label={O.reading.pdfEnabled} checked={config.pdfReader.enabled} onChange={enabled => setReader({ enabled })} />} />
        <Reveal open={config.pdfReader.enabled}>
          <Row level={1} toggles label={R.sync} description={O.reading.syncHint}
            trailing={<Switch label={R.sync} checked={config.pdfReader.sync} onChange={sync => setReader({ sync })} />} />
        </Reveal>
      </Card>
    </>
  )
}
```

Delete `src/entrypoints/options/sections/PdfReader.tsx`. In `src/entrypoints/options/App.tsx`, delete the `PdfReader`
import and change `reading: data => <><Reading data={data} /><PdfReader data={data} /></>,` to
`reading: data => <Reading data={data} />,`.

- [ ] **Step 5: The browser checks**

In `tests/e2e/options-page.mjs`, `setPreload` and `setSwitch` become:

```js
/** The way to translate is a named choice of a segmented control (as you read / whole paper), not a number */
export async function setPreload(options, { range }) {
  await openSection(options, 'reading')
  if (range) await options.getByRole('radio', { name: range, exact: true }).click()
  await sleep(150)
}

/** Where each switch lives since the redesign (its design, §6): a switch not in the section on screen is looked for there */
const SWITCH_SECTIONS = {
  '图片翻译': 'reading', '显示悬浮按钮': 'reading', '在 arXiv 的 PDF 上使用对照阅读器': 'reading', '同步滚动': 'reading',
  '对照高亮': 'appearance', '深色时调暗 PDF 页面': 'appearance', '出问题时自动改用免费服务': 'translate',
}

/** A switch by its accessible name, in its section */
export async function setSwitch(options, name, on) {
  const control = options.getByRole('switch', { name, exact: true })
  if (!(await control.isVisible().catch(() => false)) && SWITCH_SECTIONS[name]) await openSection(options, SWITCH_SECTIONS[name])
  for (let i = 0; i < 20; i++) {
    if (await control.getAttribute('aria-checked') === String(on)) return
    await control.click()
    await sleep(150)
  }
  throw new Error(`switch ${name} never became ${on}`)
}
```

In `tests/e2e/extension.mjs`, the read-back after the reload
`options.getByRole('button', { name: '整篇翻译', exact: true }).getAttribute('aria-pressed')` becomes
`options.getByRole('radio', { name: '整篇翻译', exact: true }).getAttribute('aria-checked')`.

In `experiments/pdf-bilingual/spikes/entries.mjs`, section 5: `options.goto(…/options.html#pdf-reader)` stays (the alias
leads to 阅读's PDF group); `document.querySelectorAll('main [role="switch"]')` becomes
`document.querySelectorAll('main [data-row="reading/pdf"] [role="switch"]')`, and the check's `rows.length === 3`
becomes `rows.length === 2` (the reader's switch and 同步滚动; the appearance and the dimming are 外观's now).

Run: `node --check tests/e2e/options-page.mjs && node --check tests/e2e/extension.mjs && node --check experiments/pdf-bilingual/spikes/entries.mjs`
Expected: exit 0.

- [ ] **Step 6: Run the tests and the gate**

Run: `pnpm vitest run tests/options tests/ui/locales.test.ts && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0. A type error names a reader of a deleted `O.reading` or `O.pdfReader` key: it can only be one of the
two deleted files' tests; nothing else reads them ("Kept for Part 7", under the rulings, lists the keys that stay).

- [ ] **Step 7: The browser suites, halfway**

外观, 阅读 and 数据 are the new ones now; 翻译 is still the old sections'. Run:

```bash
pnpm build && pnpm e2e && pnpm e2e:floating && node experiments/pdf-bilingual/spikes/entries.mjs && node experiments/pdf-bilingual/spikes/reader-pixels.mjs
```

Expected: each exits 0; `reader-pixels` 24 lines of `ok`. A failure in a settings check is this part's to fix before
committing; a failure elsewhere is reported with its line.

- [ ] **Step 8: Commit**

`git add` the files (after the `git rm`) and run `node scripts/check-english.mjs`. `SWITCH_SECTIONS` adds two lines that
find switches by their Chinese names, so in `scripts/english-allowlist.txt` the entry `tests/e2e/options-page.mjs 13`
becomes `tests/e2e/options-page.mjs 15  # +2, 2026-09-27: the switches the suites set, each found by its Chinese name in
its section (Part 5, Task 57)`; `extension.mjs` stays at 76, `entries.mjs` at 14, `tests/ui/locales.test.ts` at 3, and
the rewritten `reading-section.test.ts` holds none. The gate must then pass; where it names another count, set that one.

```bash
git rm src/entrypoints/options/sections/PdfReader.tsx tests/options/pdf-reader-section.test.ts
git add src/entrypoints/options/sections/Reading.tsx src/entrypoints/options/App.tsx src/locales/zh-CN.ts src/locales/en.ts tests/options/reading-section.test.ts tests/ui/locales.test.ts tests/e2e/options-page.mjs tests/e2e/extension.mjs experiments/pdf-bilingual/spikes/entries.mjs scripts/english-allowlist.txt
node scripts/check-english.mjs
git commit -m "feat(options): the reading section, with the PDF group

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 58: the connection test of a service not saved yet

§6.3: "连接 checks the fields, asks for the endpoint's origin, translates one sentence through it, and only then adds
it"; the refused key's form: 「连接成功后才会保存」. Today's test runs on a service already stored. A call now carries the
service as it would be saved (`candidate`), the background asks that endpoint alone through the same path page
translation takes (issue #42's lesson). The background answers the record for it (ruling 16, as the controller
settled it): a success clears the mark only when the candidate carries the stored key and address; a failure touches
nothing. The page never writes the record (ruling 17): once a new key or address is saved, the background's
configuration watcher clears the mark (`idsToClear`). The model list is asked of the endpoint from the page, for an
origin already granted.

**Files:**
- Modify: `src/providers/translate-service.ts` (`TranslateMessageRequest.candidate`)
- Modify: `src/providers/transport.ts` (`route`)
- Modify: `src/entrypoints/background/health-guard.ts` (`testsStoredKey`), `src/entrypoints/background/handlers.ts`
  (a candidate's answer to the record)
- Modify: `src/entrypoints/options/permissions.ts` (`hasHostPermission`)
- Create: `src/entrypoints/options/connect.ts`, `src/entrypoints/options/models.ts`
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`O.services.failed`)
- Test: `tests/providers/transport.test.ts`, `tests/background/health-guard.test.ts`, `tests/background/handlers.test.ts`,
  `tests/options/connect.test.ts`
- Check: `scripts/english-allowlist.txt` (the English gate: `transport.test.ts` stays at 5)

**Interfaces:**
- Consumes: `Service`, `serviceOf` (`@/config/services`); `isRefusal`, `shouldMarkRefusal`, `idsToClear`
  (`src/entrypoints/background/health-guard.ts`, the fix wave's, e0901916); `ensureHostPermission`, `releaseHostPermission`,
  `PermissionError` (`./permissions`), `reasonText` (`@/ui/strings`).
- Produces:
  - `TranslateMessageRequest.candidate?: Service` — "a service as the settings page would save it: asked as the call
    carries it, off the chain; its id is the call's `providerId`".
  - `hasHostPermission(baseURL: string): Promise<boolean>`.
  - `testsStoredKey(candidate: Service, storedConfig: Config): boolean` in `src/entrypoints/background/health-guard.ts`.
  - `type ServiceField = 'baseURL' | 'apiKey' | 'model'`; `type ConnectResult = { ok: true; ms: number } | { ok: false; field: ServiceField | null; reason: string }`;
    `connectService(candidate: Service, target: LangCode): Promise<ConnectResult>` in `@/entrypoints/options/connect`.
  - `interface ModelOption { id: string; name?: string }`; `listModels(baseURL: string, apiKey: string, signal: AbortSignal): Promise<ModelOption[]>`
    in `@/entrypoints/options/models`.
  - `O.services.failed(reason: string)`: 「连接失败：{原因}」 / “Couldn't connect: {reason}”.

- [ ] **Step 1: The transport asks a candidate, test first**

In `tests/providers/transport.test.ts`, after the test `'naming an engine that is not on the chain: says so, no quiet swap for another'`, add:

```ts
  describe('a candidate: the settings page\'s test of a service as it would save it (the redesign\'s design, §6.3)', () => {
    it('a service not stored yet is asked as the call carries it', async () => {
      const t = await withChain([{ ...mockProvider(async r => ({ segments: r.segments, provider: SVC.id })), id: SVC.id }])
      const fresh = { ...SVC, id: 'svc-fresh000', apiKey: '' }
      expect(await t.translate({ request: req, providerId: fresh.id, candidate: fresh })).toEqual({ ok: false, error: { kind: 'no-key', message: 'no API key configured', isolatable: false } })
    })

    it('a stored service carried with another key is asked with that key, never through the chain\'s step', async () => {
      const t = await withChain([{ ...mockProvider(async r => ({ segments: r.segments, provider: SVC.id })), id: SVC.id }])
      expect((await t.translate({ request: req, providerId: SVC.id })).ok).toBe(true)
      expect(await t.translate({ request: req, providerId: SVC.id, candidate: { ...SVC, apiKey: '' } })).toMatchObject({ ok: false, error: { kind: 'no-key' } })
    })

    it('a candidate that is not the service named is refused', async () => {
      const t = await withChain([mockProvider(async r => ({ segments: r.segments, provider: 'mock' }))])
      expect(await t.translate({ request: req, providerId: 'svc-other000', candidate: SVC })).toEqual({ ok: false, error: { kind: 'unknown', message: 'the candidate is not the service named', isolatable: false } })
    })
  })
```

Run: `pnpm vitest run tests/providers/transport.test.ts`
Expected: FAIL — the first two go through the chain's step or report "not on the current chain".

In `src/providers/translate-service.ts`, add `import type { Service } from '@/config/services'` with the other imports,
and in `TranslateMessageRequest`, after `providerId?: string`, add:

```ts
  /**
   * A service as the settings page would save it — one not stored yet, or stored with another key (the redesign's
   * design, §6.3: a service is added, or a key saved, only once it connects). Asked as the call carries it, off the
   * chain, whatever the chain holds under that id; its id is `providerId`. Carries a key across runtime messaging, as
   * the stored configuration does across storage: never logged (hard rule 5)
   */
  candidate?: Service
```

In `src/providers/transport.ts`: add `type Service` to the import from `@/config/services`; replace `offChain` and
`route` with:

```ts
  /**
   * A service of the reader's that this chain is not built around: the connection test has to answer for the endpoint
   * named, and editing a service does not make it the chosen one, so the one tested is usually not on the chain (Codex
   * on #157) — or it is not stored at all yet (a candidate). It gets a provider of its own, with no cache behind it:
   * the question is whether the endpoint answers, and a cached sample would report success for one that no longer does
   */
  const offChainFor = (own: Service) => {
    const engine = createOpenAICompatProvider(own, { prompts: config.prompts })
    return createTranslateService({ getProvider: async () => engine, getModel: async () => own.model, cancelled: deps.cancelled, retired: isRetired, ...(deps.warn ? { warn: deps.warn } : {}) })
  }
  /** Off-chain services with a call inside: built per named call, they are drained and retired with the chain */
  const offChainLive = new Set<TranslateService>()
  const askOffChain = async (own: Service, call: TranslateCall): Promise<TranslateMessageResponse> => {
    const off = offChainFor(own)
    offChainLive.add(off)
    try {
      return await off.translate(call)
    } finally {
      offChainLive.delete(off)
    }
  }

  /**
   * A call naming an engine **takes no fallback chain**: the settings page's “test connection” asks “does the endpoint
   * I configured work”, and a free fallback on the chain showing as success would be issue #42's “two inconsistent
   * paths” committed the other way round — the reader would think the endpoint fine while the whole page translated through Google
   */
  const route = async (call: TranslateCall): Promise<TranslateMessageResponse> => {
    if (call.providerId === undefined) return service.translate(call)
    if (call.candidate) {
      if (call.candidate.id !== call.providerId) return { ok: false, error: { kind: 'unknown', message: 'the candidate is not the service named', isolatable: false } }
      return askOffChain(call.candidate, call)
    }
    const step = steps.find(s => s.provider.id === call.providerId)
    if (step) return step.service.translate(call)
    const own = serviceOf(config, call.providerId)
    // This one has nothing to do with the segments; split smaller, the engine is still not on the chain
    if (!own) return { ok: false, error: { kind: 'unknown', message: `engine ${call.providerId} is not on the current chain`, isolatable: false } }
    return askOffChain(own, call)
  }
```

(The two comments above `offChainLive` and `route` in today's file — "Off-chain services with a call inside…" and "A
call naming an engine **takes no fallback chain**…" — are the ones kept here; `cancel` and `retire` read `offChainLive`
as before.)

Run: `pnpm vitest run tests/providers/transport.test.ts`
Expected: PASS.

- [ ] **Step 2: The background's answer to a candidate's test, test first**

A candidate's test clears a mark only when it tested the key and the address the service has stored — then it is the
stored key that answered, and §4's "a successful connection clears it" holds. A candidate with another key (or
address) is not cleared on its success: the save that follows changes the key, and the configuration watcher clears the
mark then (`idsToClear`). A candidate's failure touches nothing: it says nothing of the stored key. The decision is a
pure helper beside the guard's others, in `src/entrypoints/background/health-guard.ts` (the fix wave's `isRefusal`,
`shouldMarkRefusal`, `idsToClear` live there; e0901916).

In `tests/background/health-guard.test.ts`, add `testsStoredKey` to the import from
`@/entrypoints/background/health-guard`, and after `describe('idsToClear', …)` add:

```ts
describe('testsStoredKey', () => {
  it('is true for a candidate whose key and address are the service\'s stored ones: the stored key answered', () => {
    expect(testsStoredKey({ ...SVC, name: 'Renamed', model: 'other/model' }, configWith())).toBe(true)
  })

  it('is false for another key or another address, and for a service not stored yet', () => {
    expect(testsStoredKey({ ...SVC, apiKey: 'sk-new' }, configWith())).toBe(false)
    expect(testsStoredKey({ ...SVC, baseURL: 'https://api.example.com/v1' }, configWith())).toBe(false)
    expect(testsStoredKey({ ...SVC, id: 'svc-new00000' }, configWith())).toBe(false)
  })
})
```

In `tests/background/handlers.test.ts`, inside `describe('axt:translate', …)`, after the test
`'a named call marks only a 401 …'`, add:

```ts
    it('a candidate\'s test (a service as the settings page would save it): a success clears the mark only when it tested the stored key and address; a failure touches nothing (the redesign\'s design, §4; ruling 16)', async () => {
      const answering = (answer: unknown) => ({ router: { forCall: vi.fn(async () => ({ translate: vi.fn(async () => answer) })) } as unknown as HandlerDeps['router'] })
      const health = () => ({ reject: vi.fn(async () => undefined), clear: vi.fn(async () => true) })
      const stored = vi.fn(async () => ({ ...DEFAULT_CONFIG, services: [SVC] }))
      const tested = (candidate: typeof SVC) => ({ ...CALL, type: 'axt:translate' as const, providerId: SVC.id, candidate })
      const good = { ok: true, result: { segments: [], provider: SVC.id }, cached: 0 }

      // the stored key and address, another model: the stored key answered
      const same = health()
      await harness({ ...answering(good), health: same, getConfig: stored }).send(tested({ ...SVC, model: 'other/model' }))
      expect(same.clear).toHaveBeenCalledWith(SVC.id)

      // a new key: not cleared here — the save that follows changes the key, and the watcher clears the mark then
      const renewed = health()
      await harness({ ...answering(good), health: renewed, getConfig: stored }).send(tested({ ...SVC, apiKey: 'sk-new' }))
      expect(renewed.clear).not.toHaveBeenCalled()

      // a refusal, of the stored key or another: nothing marked, nothing cleared, the answer as it came
      for (const candidate of [SVC, { ...SVC, apiKey: 'sk-new' }]) {
        const failed = health()
        const error = { kind: 'auth', message: 'bad key', isolatable: false, status: 401 }
        const answer = await harness({ ...answering({ ok: false, error }), health: failed, getConfig: stored }).send(tested(candidate))
        expect([failed.reject.mock.calls.length, failed.clear.mock.calls.length]).toEqual([0, 0])
        expect(answer).toEqual({ ok: false, error })
      }
    })
```

Run: `pnpm vitest run tests/background/health-guard.test.ts tests/background/handlers.test.ts`
Expected: FAIL — `testsStoredKey` is not exported, and the new key's success calls `clear` (the handler treats the
candidate as a named call).

In `src/entrypoints/background/health-guard.ts`, add `type Service` to the import from `@/config/services`, and after
`idsToClear`:

```ts
/**
 * Whether a candidate — a service as the settings page would save it, tested before it is (the redesign's design,
 * §6.3) — carries the key and the address the service has stored: then its success is the stored key answering, and
 * clears the mark (§4). Another key or address is not the stored one: its success says nothing of the key stored, and
 * the save that follows voids the mark through `idsToClear`. Compared in memory only, never logged (hard rule 5)
 */
export function testsStoredKey(candidate: Service, storedConfig: Config): boolean {
  const now = serviceOf(storedConfig, candidate.id)
  return now !== undefined && now.apiKey === candidate.apiKey && now.baseURL === candidate.baseURL
}
```

In `src/entrypoints/background/handlers.ts`, add `testsStoredKey` to the import from `./health-guard`, and in the
`'axt:translate'` entry make the record's branch answer a candidate first — written against the handler e0901916 left
(`const id = message.providerId`, then `if (id && SERVICE_ID_RE.test(id))`); if it reads otherwise when this task runs,
keep its branch for a named call as it is and put the candidate's case before it:

```ts
        const id = message.providerId
        if (id && SERVICE_ID_RE.test(id)) {
          if (message.candidate) {
            // A candidate: a service as the settings page would save it, tested before it is (ruling 16). Its success
            // clears the mark only when it tested the stored key and address; another key is cleared by the watcher once
            // the save lands (idsToClear). Its failure touches nothing: it says nothing of the key stored. The page itself
            // never writes the record (ruling 17)
            if (response.ok) {
              const stored = await deps.getConfig().catch(() => null)
              if (stored && testsStoredKey(message.candidate, stored)) await deps.health.clear(id)
            }
          } else if (response.ok) await deps.health.clear(id)
          else if (isRefusal({ id, ...response.error })) {
            const stored = await deps.getConfig().catch(() => null)
            if (stored && shouldMarkRefusal({ id, ...response.error }, stored, stored)) await deps.health.reject(id)
          }
        }
```

(The transport has already refused a candidate whose id is not the call's `providerId`, Step 1, so a success names
the candidate's own service.)

Run: `pnpm vitest run tests/background/health-guard.test.ts tests/background/handlers.test.ts`
Expected: PASS.

- [ ] **Step 3: The page's side, test first**

In `src/locales/zh-CN.ts`, in `O.services`, after `connected: …,` add `failed: (reason: string) => \`连接失败：${reason}\`,`;
in `src/locales/en.ts`, `failed: reason => \`Couldn't connect: ${reason}\`,`.

`tests/options/connect.test.ts`:

```ts
// The settings page's connection test (the redesign's design, §6.3): the origin asked for, one sample translated through
// that endpoint alone with the service carried whole, the time it took; a failure names its reason and the field at
// fault, and gives back an origin this attempt granted. And the endpoint's list of models
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Service } from '@/config/services'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const wire = vi.hoisted(() => {
  class PermissionError extends Error {
    constructor(readonly kind: 'badURL' | 'denied', readonly origin?: string) { super(kind) }
  }
  return { sent: [] as unknown[], answer: null as unknown, granted: false, denied: false, released: [] as string[], PermissionError }
})
vi.mock('@/shared/messages', () => ({ sendMessage: vi.fn(async (message: unknown) => { wire.sent.push(message); return wire.answer }) }))
vi.mock('@/config/storage', () => ({ getConfig: async () => ({ services: [] }) }))
vi.mock('@/entrypoints/options/permissions', () => ({
  PermissionError: wire.PermissionError,
  ensureHostPermission: vi.fn(async () => {
    if (wire.denied) throw new wire.PermissionError('denied', 'https://api.example.com/*')
    return wire.granted
  }),
  releaseHostPermission: vi.fn(async (url: string) => { wire.released.push(url) }),
}))

import { connectService } from '@/entrypoints/options/connect'
import { listModels } from '@/entrypoints/options/models'
import { O, reasonText, setLocale } from '@/ui/strings'

const SVC: Service = { id: 'svc-abcd1234', kind: 'openai-compat', name: 'Mine', baseURL: 'https://api.example.com/v1', apiKey: 'sk-new', model: 'x/y', thinking: 'disabled' }

describe('connectService (§6.3)', () => {
  beforeEach(() => {
    setLocale('en')
    Object.assign(wire, { sent: [], answer: null, granted: false, denied: false, released: [] })
  })

  it('carries the service whole, named, and answers with the time it took', async () => {
    wire.answer = { ok: true, result: { segments: [], provider: SVC.id }, cached: 0 }
    const res = await connectService(SVC, 'cmn')
    expect(res.ok).toBe(true)
    expect(wire.sent).toEqual([expect.objectContaining({ type: 'axt:translate', providerId: SVC.id, candidate: SVC })])
    expect((wire.sent[0] as { cache?: unknown }).cache).toBeUndefined()
  })

  it('a refused key names its reason and the key field, and gives back the origin this attempt granted', async () => {
    wire.granted = true
    wire.answer = { ok: false, error: { kind: 'auth', message: '401', isolatable: false } }
    expect(await connectService(SVC, 'cmn')).toEqual({ ok: false, field: 'apiKey', reason: O.services.failed(reasonText('auth')) })
    expect(wire.released).toEqual([SVC.baseURL])
  })

  it('a permission refused says so at the address, in today\'s words, and asks nothing of the endpoint', async () => {
    wire.denied = true
    expect(await connectService(SVC, 'cmn')).toEqual({ ok: false, field: 'baseURL', reason: O.services.permission.denied('https://api.example.com/*') })
    expect(wire.sent).toEqual([])
  })
})

describe('listModels (§6.3)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('asks the endpoint\'s /models with the key, and reads the OpenAI shape: ids, names beside them, no repeats', async () => {
    const seen: [string, RequestInit | undefined][] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      seen.push([url, init])
      return new Response(JSON.stringify({ data: [{ id: 'a/b', name: 'A B' }, { id: 'c' }, { id: 'a/b' }, { name: 'no id' }] }))
    }))
    expect(await listModels('https://openrouter.ai/api/v1/', 'sk-x', new AbortController().signal)).toEqual([{ id: 'a/b', name: 'A B' }, { id: 'c' }])
    expect(seen[0]![0]).toBe('https://openrouter.ai/api/v1/models')
    expect((seen[0]![1]!.headers as Record<string, string>).Authorization).toBe('Bearer sk-x')
  })

  it('asks a local endpoint without a key, and fails on an answer that is not a list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"no"}', { status: 404 })))
    await expect(listModels('http://localhost:11434/v1', '', new AbortController().signal)).rejects.toThrow()
  })
})
```

Run: `pnpm vitest run tests/options/connect.test.ts`
Expected: FAIL — `Failed to resolve import "@/entrypoints/options/connect"`.

- [ ] **Step 4: Write the page's side**

In `src/entrypoints/options/permissions.ts`, after `ensureHostPermission`, add:

```ts
/** Whether the origin is granted already: the model list loads by itself only then (the redesign's design, §6.3) */
export async function hasHostPermission(baseURL: string): Promise<boolean> {
  const origin = originPattern(baseURL)
  return origin ? browser.permissions.contains({ origins: [origin] }) : false
}
```

`src/entrypoints/options/connect.ts`:

```ts
// The connection test of a service the settings page would save (the redesign's design, §6.3): the endpoint's origin
// asked for — from the gesture that pressed Connect —, then one sample sentence translated through that endpoint alone:
// named, so that the chain's free fallback cannot answer for it (Codex on #59), and carried whole (`candidate`), so that
// a service not stored yet, or stored with another key, is the one asked. Nothing is stored here: the caller saves on
// success. An origin this attempt granted is given back when it fails — nothing was stored that uses it
import type { LangCode } from '@/config/languages'
import type { Service } from '@/config/services'
import { getConfig } from '@/config/storage'
import type { ProviderErrorKind } from '@/providers/types'
import { wireFormatOfProvider } from '@/providers/wire-formats'
import { sendMessage } from '@/shared/messages'
import { O, reasonText } from '@/ui/strings'
import { PermissionError, ensureHostPermission, releaseHostPermission } from './permissions'

/** The sample says whether the endpoint keeps our placeholders, so it is written in this service's wire format */
const SAMPLE_TAGS = 'Let <x id="1"/> be a <t id="2">connected</t> graph; see <x id="3"/>.'
const SAMPLE_MARKERS = 'Let @a# be a connected graph; see @b#.'

export type ServiceField = 'baseURL' | 'apiKey' | 'model'
export type ConnectResult = { ok: true; ms: number } | { ok: false; field: ServiceField | null; reason: string }

/** The field a failure points at: it takes the focus (§9) */
const FIELD_OF: Partial<Record<ProviderErrorKind, ServiceField>> = { auth: 'apiKey', 'no-key': 'apiKey', network: 'baseURL', timeout: 'baseURL', 'bad-request': 'model' }

export async function connectService(candidate: Service, target: LangCode): Promise<ConnectResult> {
  let granted: boolean
  try {
    granted = await ensureHostPermission(candidate.baseURL)
  } catch (e) {
    // the permission request only says which kind; the sentence is the pack's (Codex on #161)
    return { ok: false, field: 'baseURL', reason: e instanceof PermissionError && e.kind === 'denied' ? O.services.permission.denied(e.origin ?? '') : O.services.permission.badURL }
  }
  const t0 = performance.now()
  const res = await sendMessage({
    type: 'axt:translate',
    providerId: candidate.id,
    candidate,
    request: { segments: [{ id: 'sample', text: wireFormatOfProvider(candidate.id) === 'markers' ? SAMPLE_MARKERS : SAMPLE_TAGS }], source: 'en', target, context: { sectionTitle: O.services.connect } },
  }).catch((e: unknown) => ({ ok: false as const, error: { kind: 'unknown' as const, message: e instanceof Error ? e.message : String(e), isolatable: false } }))
  if (res.ok) return { ok: true, ms: Math.round(performance.now() - t0) }
  if (granted) await releaseHostPermission(candidate.baseURL, (await getConfig()).services.map(s => s.baseURL)).catch(() => undefined)
  return { ok: false, field: FIELD_OF[res.error.kind] ?? null, reason: O.services.failed(reasonText(res.error.kind) || res.error.message) }
}
```

`src/entrypoints/options/models.ts`:

```ts
// The endpoint's models, for the model field's list (the redesign's design, §6.3): the OpenAI-compatible `GET /models`,
// asked from this page — an extension page with the endpoint's origin granted is not held to CORS. Only for an origin
// already granted: asking for one takes a gesture (permissions.request), which the form's own presses give
export interface ModelOption { id: string; name?: string }

export async function listModels(baseURL: string, apiKey: string, signal: AbortSignal): Promise<ModelOption[]> {
  const res = await fetch(`${baseURL.replace(/\/+$/, '')}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal })
  if (!res.ok) throw new Error(`the model list answered ${res.status}`)
  const body = (await res.json()) as { data?: unknown }
  if (!Array.isArray(body.data)) throw new Error('the model list holds no list')
  const seen = new Set<string>()
  const out: ModelOption[] = []
  for (const entry of body.data as { id?: unknown; name?: unknown }[]) {
    if (typeof entry?.id !== 'string' || !entry.id || seen.has(entry.id)) continue
    seen.add(entry.id)
    out.push(typeof entry.name === 'string' && entry.name && entry.name !== entry.id ? { id: entry.id, name: entry.name } : { id: entry.id })
  }
  return out
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run tests/options/connect.test.ts tests/providers/transport.test.ts tests/background/health-guard.test.ts tests/background/handlers.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0. Then `git add` the files and run `node scripts/check-english.mjs`: it passes with the allowlist as it
is (`tests/providers/transport.test.ts` keeps its 5 lines, the new cases holding none; the new files hold none).

```bash
git add src/providers/translate-service.ts src/providers/transport.ts src/entrypoints/background/health-guard.ts src/entrypoints/background/handlers.ts src/entrypoints/options/permissions.ts src/entrypoints/options/connect.ts src/entrypoints/options/models.ts src/locales/zh-CN.ts src/locales/en.ts tests/providers/transport.test.ts tests/background/health-guard.test.ts tests/background/handlers.test.ts tests/options/connect.test.ts scripts/english-allowlist.txt
node scripts/check-english.mjs
git commit -m "feat(options): test a service as it would be saved, before saving it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 59: the service form and the key form

§6.3's forms, standalone (Task 60 mounts them): adding a service in place — 接口地址 with three suggestions, API Key,
模型 as a combobox over the endpoint's list, 名称（选填）, 更多 ▸ 深度思考, 连接 · 取消 with 「连接成功后才会添加」 —, the same
form for editing (the key field empty, 「已保存 · 留空则不改」, 「清除」 to let the saved key go), and the refused key's
form. Nothing is saved here: a successful connection hands the service to the caller.

**Files:**
- Create: `src/entrypoints/options/sections/ServiceForm.tsx`
- Modify: `src/entrypoints/options/ui/settings.css` (append)
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`O.services`)
- Test: `tests/options/service-form.test.ts`

**Interfaces:**
- Consumes: `connectService`, `ServiceField` (Task 58), `listModels`, `ModelOption` (Task 58), `hasHostPermission`,
  `ensureHostPermission`, `releaseHostPermission`, `PermissionError` (`../permissions`), `Combobox` (Task 51), `Status`
  (Task 50); Part 3's `Field`, `TextInput`, `Button` (its `busy` for 连接中…), `Reveal`; `drafts` (`@/ui/drafts`).
- Produces:
  - `ServiceForm({ service, target, stored, onConnected, onCancel }: { service?: Service; target: LangCode; stored: readonly string[]; onConnected: (saved: Service, ms: number) => Promise<void>; onCancel: () => void })`
    — `form[data-form="service"]`.
  - `KeyForm({ service, refused, target, focus, onConnected }: { service: Service; refused: boolean; target: LangCode; focus?: boolean; onConnected: (saved: Service, ms: number) => Promise<void> })`
    — `form[data-form="key"]`.
  - `STILL_MS = 300`.

- [ ] **Step 1: The words**

In `src/locales/zh-CN.ts`, in `O.services`: `name: '名称',` becomes `name: '名称（选填）',`; `namePlaceholder` becomes
`'默认使用模型名'`; after `apiKeyLocalHint` add:

```ts
    /** §6.3: the address suggestions fill an address, nothing else (T4); the other two are product names, in the form */
    localOllama: '本机 Ollama',
    modelEmpty: '填好接口地址和 API Key 后列出',
    modelLoading: '正在获取模型…',
    modelSearch: (n: number) => `搜索 ${n} 个模型`,
    modelNoMatch: '没有匹配的模型，可以直接填写',
    modelNoList: '没能列出模型，可以直接填写',
    addedOnConnect: '连接成功后才会添加',
    savedOnConnect: '连接成功后才会保存',
    /** A form is checked when it is submitted (§9); each reason at its field */
    checks: { baseURL: '填写接口地址，例如 https://openrouter.ai/api/v1', apiKey: '填写 API Key', model: '选择或填写一个模型' },
    /** Editing: the key field empty, the saved key kept unless one is typed */
    keySaved: '已保存 · 留空则不改',
    /** A key the endpoint refused (§4's record), or a service an earlier version stored without one */
    keyForm: { refused: '服务拒绝了这个 API Key，它可能无效或已过期。换一个新的，其他设置不变。', label: '新的 API Key', submit: '更新并连接' },
```

In `src/locales/en.ts`, in `O.services`: `name: 'Name (optional)',`, `namePlaceholder: 'The model\'s name by default',`,
and:

```ts
    localOllama: 'Local Ollama',
    modelEmpty: 'Listed once the address and key are in',
    modelLoading: 'Loading models…',
    modelSearch: n => `Search ${n} models`,
    modelNoMatch: 'No model matches; type its name',
    modelNoList: 'Couldn\'t list the models; type the name',
    addedOnConnect: 'Added once it connects',
    savedOnConnect: 'Saved once it connects',
    checks: { baseURL: 'Enter an API address, such as https://openrouter.ai/api/v1', apiKey: 'Enter the API key', model: 'Choose or type a model' },
    keySaved: 'Saved · leave empty to keep it',
    keyForm: { refused: 'The service refused this API key; it may be invalid or expired. Enter a new one; nothing else changes.', label: 'New API key', submit: 'Update and connect' },
```

- [ ] **Step 2: Write the failing tests**

`tests/options/service-form.test.ts`:

```ts
// The service forms (the redesign's design, §6.3): a suggestion fills the address alone and asks for its origin at once;
// the model list loads by itself only for an origin already granted, and a press on the field asks for one that is
// not; checked when submitted, the first field at fault taking the focus; connected before anything is handed over,
// with a stable id; editing keeps the saved key unless one is typed or it is cleared; the refused key's form
import { createElement as h } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Service } from '@/config/services'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const wire = vi.hoisted(() => ({
  granted: new Set<string>(), asked: [] as string[], released: [] as string[], listed: [] as string[], candidates: [] as Service[],
  connect: { ok: true, ms: 42 } as { ok: true; ms: number } | { ok: false; field: 'apiKey' | null; reason: string },
}))
vi.mock('@/entrypoints/options/permissions', () => ({
  PermissionError: class extends Error {},
  hasHostPermission: vi.fn(async (url: string) => wire.granted.has(new URL(url).origin)),
  ensureHostPermission: vi.fn(async (url: string) => {
    wire.asked.push(url)
    const origin = new URL(url).origin
    if (wire.granted.has(origin)) return false
    wire.granted.add(origin)
    return true
  }),
  releaseHostPermission: vi.fn(async (url: string) => { wire.released.push(url) }),
}))
vi.mock('@/entrypoints/options/models', () => ({
  listModels: vi.fn(async (url: string) => { wire.listed.push(url); return [{ id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash' }, { id: 'qwen/qwen3' }] }),
}))
vi.mock('@/entrypoints/options/connect', () => ({ connectService: vi.fn(async (candidate: Service) => { wire.candidates.push(candidate); return wire.connect }) }))

import { type ConnectResult, connectService } from '@/entrypoints/options/connect'
import { KeyForm, STILL_MS, ServiceForm } from '@/entrypoints/options/sections/ServiceForm'
import { O, setLocale } from '@/ui/strings'

const SVC: Service = { id: 'svc-abcd1234', kind: 'openai-compat', name: 'Mine', baseURL: 'https://api.example.com/v1', apiKey: 'sk-saved', model: 'm-1', thinking: 'disabled' }
const inputs = (c: HTMLElement) => [...c.querySelectorAll<HTMLInputElement>('form input')]
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const submit = (c: HTMLElement) => c.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
const button = (c: HTMLElement, name: string) => [...c.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === name)!

describe('ServiceForm (§6.3)', () => {
  beforeEach(() => {
    setLocale('en')
    vi.useFakeTimers({ shouldAdvanceTime: true })
    Object.assign(wire, { granted: new Set(['https://openrouter.ai']), asked: [], released: [], listed: [], candidates: [], connect: { ok: true, ms: 42 } })
  })
  afterEach(() => { vi.useRealTimers() })
  const form = (over: Partial<Parameters<typeof ServiceForm>[0]> = {}) => {
    const done: [Service, number][] = []
    const props = { target: 'cmn' as const, stored: [], onConnected: async (s: Service, ms: number) => { done.push([s, ms]) }, onCancel: () => {}, ...over }
    return { done, element: h(ServiceForm, props) }
  }

  it('opens with the focus on the address; a suggestion fills the address alone and asks for its origin at once', async () => {
    const { element } = form()
    const m = await mountElement(element)
    const [address, key, model, name] = inputs(m.container)
    expect(document.activeElement).toBe(address)
    button(m.container, 'DeepSeek').click()
    await m.flush()
    expect(address!.value).toBe('https://api.deepseek.com/v1')
    expect([key!.value, model!.value, name!.value]).toEqual(['', '', ''])
    expect(wire.asked).toEqual(['https://api.deepseek.com/v1'])
    expect(document.activeElement).toBe(key)
    await m.unmount()
  })

  it('the list loads by itself for an origin already granted, once the address and the key have been still', async () => {
    const { element } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://openrouter.ai/api/v1')
    type(key!, 'sk-or-1')
    await m.flush()
    expect(model!.getAttribute('placeholder')).toBe(O.services.modelEmpty)
    await vi.advanceTimersByTimeAsync(STILL_MS)
    await m.flush()
    expect(wire.listed).toEqual(['https://openrouter.ai/api/v1'])
    expect(model!.getAttribute('placeholder')).toBe(O.services.modelSearch(2))
    expect(wire.asked).toEqual([])
    await m.unmount()
  })

  it('not for an origin that is not granted: no permission asked outside a gesture; a press on the model field asks, then lists', async () => {
    const { element } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://api.deepseek.com/v1')
    type(key!, 'sk-1')
    await vi.advanceTimersByTimeAsync(STILL_MS * 2)
    await m.flush()
    expect([wire.listed, wire.asked]).toEqual([[], []])
    model!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await m.flush()
    await m.flush()
    expect(wire.asked).toEqual(['https://api.deepseek.com/v1'])
    expect(wire.listed).toEqual(['https://api.deepseek.com/v1'])
    await m.unmount()
  })

  it('a local address needs no key: its label says so, and the list may load without one', async () => {
    wire.granted.add('http://localhost:11434')
    const { element } = form()
    const m = await mountElement(element)
    type(inputs(m.container)[0]!, 'http://localhost:11434/v1')
    await vi.advanceTimersByTimeAsync(STILL_MS)
    await m.flush()
    expect(m.container.textContent).toContain(O.services.apiKeyLocalHint)
    expect(wire.listed).toEqual(['http://localhost:11434/v1'])
    await m.unmount()
  })

  it('checked when submitted: each field at fault carries its reason, and the first takes the focus', async () => {
    const { element } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    submit(m.container)
    await m.flush()
    expect(address!.getAttribute('aria-invalid')).toBe('true')
    expect(m.container.textContent).toContain(O.services.checks.baseURL)
    expect(m.container.textContent).toContain(O.services.checks.model)
    expect(document.activeElement).toBe(address)
    type(address!, 'https://api.example.com/v1')
    submit(m.container)
    await m.flush()
    expect(key!.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(key)
    expect(wire.candidates).toEqual([])
    type(key!, 'sk-1')
    type(model!, 'm-2')
    submit(m.container)
    await m.flush()
    expect(wire.candidates).toHaveLength(1)
    await m.unmount()
  })

  it('connects before anything is handed over: a failure says why beside the button and keeps the form, the id stays the same', async () => {
    const { element, done } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://openrouter.ai/api/v1')
    type(key!, 'sk-or-bad')
    await vi.advanceTimersByTimeAsync(STILL_MS)
    await m.flush()
    model!.focus()
    await m.flush()
    ;[...m.container.querySelectorAll('[role="option"]')].find(o => o.textContent?.startsWith('DeepSeek V4 Flash'))!.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }))
    await m.flush()
    wire.connect = { ok: false, field: 'apiKey', reason: 'Couldn\'t connect: bad key' }
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(done).toEqual([])
    expect(m.container.querySelector('.o-note')!.textContent).toBe('Couldn\'t connect: bad key')
    expect(document.activeElement).toBe(key)
    wire.connect = { ok: true, ms: 42 }
    type(key!, 'sk-or-good')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(done).toHaveLength(1)
    const [saved, ms] = done[0]!
    expect(ms).toBe(42)
    expect(saved).toMatchObject({ kind: 'openai-compat', name: 'DeepSeek V4 Flash', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-good', model: 'deepseek/deepseek-v4-flash', thinking: 'disabled' })
    expect(saved.id).toMatch(/^svc-[a-z0-9]{8}$/)
    expect(wire.candidates[0]!.id).toBe(saved.id)
    await m.unmount()
  })

  it('while it connects, Connect waits busy (Part 3\'s busy): O.services.connecting, aria-busy, and a second submission asks nothing more', async () => {
    const { element, done } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://api.example.com/v1')
    type(key!, 'sk-1')
    type(model!, 'm-2')
    let answer: (r: ConnectResult) => void = () => {}
    vi.mocked(connectService).mockImplementationOnce((candidate: Service) => {
      wire.candidates.push(candidate)
      return new Promise<ConnectResult>(resolve => { answer = resolve })
    })
    submit(m.container)
    await m.flush()
    expect(button(m.container, O.services.connecting).getAttribute('aria-busy')).toBe('true')
    submit(m.container)
    await m.flush()
    expect(wire.candidates).toHaveLength(1)
    answer({ ok: true, ms: 42 })
    await m.flush()
    await m.flush()
    expect(done).toHaveLength(1)
    expect(button(m.container, O.services.connect).getAttribute('aria-busy')).not.toBe('true')
    await m.unmount()
  })

  it('extended thinking lives under More, folded, and goes with the service', async () => {
    const { element, done } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    const more = button(m.container, O.more)
    expect(more.getAttribute('aria-expanded')).toBe('false')
    more.click()
    await m.flush()
    m.container.querySelector<HTMLElement>(`[role="switch"][aria-label="${O.services.thinking}"]`)!.click()
    type(address!, 'https://api.example.com/v1')
    type(key!, 'sk-1')
    type(model!, 'm-2')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(done[0]![0].thinking).toBe('enabled')
    await m.unmount()
  })

  it('editing: filled in, the key field empty saying it is saved; left empty the saved key goes with it, Clear lets it go', async () => {
    const { element, done } = form({ service: SVC })
    const m = await mountElement(element)
    const [address, key, model, name] = inputs(m.container)
    expect([address!.value, model!.value, name!.value]).toEqual([SVC.baseURL, SVC.model, SVC.name])
    expect([key!.value, key!.getAttribute('placeholder')]).toEqual(['', O.services.keySaved])
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(done[0]![0]).toEqual(SVC)
    button(m.container, O.services.apiKeyClear).click()
    await m.flush()
    submit(m.container)
    await m.flush()
    expect(key!.getAttribute('aria-invalid')).toBe('true')
    expect(done).toHaveLength(1)
    await m.unmount()
  })

  it('closed with nothing saved, it gives back the origins it asked for', async () => {
    const { element } = form()
    const m = await mountElement(element)
    button(m.container, 'DeepSeek').click()
    await m.flush()
    await m.unmount()
    await vi.advanceTimersByTimeAsync(0)
    expect(wire.released).toEqual(['https://api.deepseek.com/v1'])
  })
})

describe('KeyForm (§6.3)', () => {
  beforeEach(() => {
    setLocale('en')
    Object.assign(wire, { candidates: [], connect: { ok: true, ms: 7 } })
  })

  it('a refused key: the sentence, a new key, Update and connect; checked when submitted; connected, the service handed back with the key', async () => {
    const done: Service[] = []
    const m = await mountElement(h(KeyForm, { service: SVC, refused: true, target: 'cmn', onConnected: async s => { done.push(s) } }))
    expect(m.container.textContent).toContain(O.services.keyForm.refused)
    expect(m.container.textContent).toContain(O.services.savedOnConnect)
    submit(m.container)
    await m.flush()
    expect(inputs(m.container)[0]!.getAttribute('aria-invalid')).toBe('true')
    type(inputs(m.container)[0]!, 'sk-new')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(done).toEqual([{ ...SVC, apiKey: 'sk-new' }])
    await m.unmount()
  })

  it('a service stored without a key: the same form, without the first sentence; a failure said beside the button', async () => {
    wire.connect = { ok: false, field: 'apiKey', reason: 'Couldn\'t connect: no' }
    const m = await mountElement(h(KeyForm, { service: { ...SVC, apiKey: '' }, refused: false, target: 'cmn', onConnected: async () => {} }))
    expect(m.container.textContent).not.toContain(O.services.keyForm.refused)
    type(inputs(m.container)[0]!, 'sk-new')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(m.container.querySelector('.o-note')!.textContent).toBe('Couldn\'t connect: no')
    await m.unmount()
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run tests/options/service-form.test.ts`
Expected: FAIL — `Failed to resolve import "@/entrypoints/options/sections/ServiceForm"`.

- [ ] **Step 4: Write the forms**

`src/entrypoints/options/sections/ServiceForm.tsx`:

```tsx
// Adding a service, editing one, giving one a new key — in place (the redesign's design, §6.3). The address first,
// three suggestions filling it (an address, nothing else: no vendor template, T4); the key; the model from the endpoint's
// own list; a name, the model's by default; extended thinking folded under More; then Connect · Cancel. Nothing is stored here: a
// successful connection hands the service to the caller, which saves it (§11: no service without a connection). The
// endpoint's origin is asked for on a gesture — a suggestion's press, a press on the model field, Connect — and the list
// loads by itself only for an origin already granted. Checked when submitted: the fields at fault say why, the first
// takes the focus (§9). Open, the form is a draft the page does not reload under (ui/drafts.ts)
import { ChevronRight } from 'lucide'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import type { LangCode } from '@/config/languages'
import { NAME_MAX, type Service, defaultServiceName, isLoopback, newServiceId } from '@/config/services'
import { Button } from '@/ui/controls/Button'
import { Field, TextInput } from '@/ui/controls/Field'
import { Icon } from '@/ui/controls/Icon'
import { Reveal } from '@/ui/controls/Reveal'
import { Switch } from '@/ui/controls/Switch'
import { drafts } from '@/ui/drafts'
import { O } from '@/ui/strings'
import { type ServiceField, connectService } from '../connect'
import { type ModelOption, listModels } from '../models'
import { PermissionError, ensureHostPermission, hasHostPermission, releaseHostPermission } from '../permissions'
import { Combobox } from '../ui/Combobox'
import { Status } from '../ui/Row'

/** What the suggestions fill in: OpenRouter and DeepSeek are product names, written as they are; the local one is words */
const SUGGESTIONS = [
  { name: () => 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { name: () => 'DeepSeek', url: 'https://api.deepseek.com/v1' },
  { name: () => O.services.localOllama, url: 'http://localhost:11434/v1' },
]
/** The list waits until the address and the key have been still this long, as the popup's search does (§5.4) */
export const STILL_MS = 300

const isAddress = (s: string) => {
  try {
    const u = new URL(s.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}
const deniedWords = (e: unknown) => (e instanceof PermissionError && e.kind === 'denied' ? O.services.permission.denied(e.origin ?? '') : O.services.permission.badURL)

type ListState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; models: ModelOption[] } | { kind: 'failed' }

/** The endpoint's models: by itself once the address and the key are in and still, for an origin already granted */
function useModels(url: string, key: string, ready: boolean) {
  const [list, setList] = useState<ListState>({ kind: 'idle' })
  const current = useRef<AbortController | null>(null)
  const load = useCallback(() => {
    current.current?.abort()
    const abort = new AbortController()
    current.current = abort
    setList({ kind: 'loading' })
    listModels(url, key, abort.signal).then(
      models => { if (!abort.signal.aborted) setList({ kind: 'ready', models }) },
      () => { if (!abort.signal.aborted) setList({ kind: 'failed' }) },
    )
  }, [url, key])
  useEffect(() => {
    current.current?.abort()
    setList({ kind: 'idle' })
    if (!ready) return
    let gone = false
    const timer = setTimeout(() => void hasHostPermission(url).then(yes => { if (yes && !gone) load() }), STILL_MS)
    return () => { gone = true; clearTimeout(timer) }
  }, [url, ready, load])
  useEffect(() => () => current.current?.abort(), [])
  return { list, load }
}

export function ServiceForm({ service, target, stored, onConnected, onCancel }: {
  /** the service edited; absent, a new one */
  service?: Service
  target: LangCode
  /** the stored services' addresses: an origin one of them uses is not given back */
  stored: readonly string[]
  onConnected: (saved: Service, ms: number) => Promise<void>
  onCancel: () => void
}) {
  /** one id per form: a second Connect after a failure is the same service, never another (Codex on #157) */
  const [id] = useState(() => service?.id ?? newServiceId())
  const [url, setUrl] = useState(service?.baseURL ?? '')
  const [key, setKey] = useState('')
  /** editing: the saved key goes with the service while the field is empty; Clear lets it go */
  const [keepKey, setKeepKey] = useState(Boolean(service?.apiKey))
  const [model, setModel] = useState(service?.model ?? '')
  /** the endpoint's own name for the model chosen from its list: the service's name by default */
  const [modelName, setModelName] = useState<string | undefined>()
  const [name, setName] = useState(service?.name ?? '')
  const [thinking, setThinking] = useState(service?.thinking === 'enabled')
  const [more, setMore] = useState(service?.thinking === 'enabled')
  const [errors, setErrors] = useState<Partial<Record<ServiceField, string>>>({})
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const address = useRef<HTMLInputElement>(null)
  const keyField = useRef<HTMLInputElement>(null)
  const modelField = useRef<HTMLInputElement>(null)
  const fields: Record<ServiceField, RefObject<HTMLInputElement | null>> = { baseURL: address, apiKey: keyField, model: modelField }
  /** origins this form asked for: given back if it closes with nothing saved (permissions.ts: the granted list must not grow with every try) */
  const granted = useRef(new Set<string>())
  const handedOver = useRef(false)
  const storedNow = useRef(stored)
  storedNow.current = stored
  const keyInEffect = key.trim() || (keepKey ? service?.apiKey ?? '' : '')
  const local = isLoopback(url)
  const ready = isAddress(url) && (local || keyInEffect !== '')
  const { list, load } = useModels(url.trim(), keyInEffect, ready)

  useEffect(() => drafts.hold(), [])
  // an opened form puts the focus on its first field (§9)
  useEffect(() => { address.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => () => {
    if (!handedOver.current) for (const u of granted.current) void releaseHostPermission(u, storedNow.current).catch(() => undefined)
  }, [])

  const clearError = (field: ServiceField) => setErrors(x => ({ ...x, [field]: undefined }))
  /** the endpoint's origin, asked for from the gesture that called this */
  const ask = async (to: string): Promise<boolean> => {
    try {
      if (await ensureHostPermission(to)) granted.current.add(to)
      return true
    } catch (e) {
      setErrors(x => ({ ...x, baseURL: deniedWords(e) }))
      return false
    }
  }
  const suggest = (to: string) => {
    setUrl(to)
    clearError('baseURL')
    void ask(to)
    ;(isLoopback(to) ? modelField : keyField).current?.focus()
  }
  const openList = () => {
    if (!ready || list.kind === 'loading' || list.kind === 'ready') return
    void ask(url.trim()).then(ok => { if (ok) load() })
  }
  const connect = async () => {
    const found: Partial<Record<ServiceField, string>> = {}
    if (!isAddress(url)) found.baseURL = O.services.checks.baseURL
    else if (!local && !keyInEffect) found.apiKey = O.services.checks.apiKey
    if (!model.trim()) found.model = O.services.checks.model
    setErrors(found)
    setResult('')
    const first = (['baseURL', 'apiKey', 'model'] as const).find(f => found[f])
    if (first) {
      fields[first].current?.focus()
      return
    }
    const candidate: Service = {
      id, kind: 'openai-compat', baseURL: url.trim(), apiKey: keyInEffect, model: model.trim(), thinking: thinking ? 'enabled' : 'disabled',
      name: (name.trim() || modelName || defaultServiceName(model.trim())).slice(0, NAME_MAX),
    }
    setBusy(true)
    const res = await connectService(candidate, target)
    if (!res.ok) {
      setBusy(false)
      setResult(res.reason)
      if (res.field) fields[res.field].current?.focus()
      return
    }
    handedOver.current = true
    try {
      await onConnected(candidate, res.ms)
    } catch (e) {
      // the save itself refused (the schema's limit of services, storage): nothing stored, the form stays
      handedOver.current = false
      setResult(O.services.failed(e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  const keyLabel = local ? `${O.services.apiKey} · ${O.services.apiKeyLocalHint}` : O.services.apiKey
  const modelPlaceholder = list.kind === 'loading' ? O.services.modelLoading : list.kind === 'ready' ? O.services.modelSearch(list.models.length) : O.services.modelEmpty
  return (
    <form className="o-form" data-form="service" noValidate onSubmit={e => { e.preventDefault(); if (!busy) void connect() }}>
      <div className="o-stack">
        <Field label={O.services.baseURL} error={errors.baseURL}>
          <TextInput ref={address} value={url} inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://…/v1"
            onChange={e => { setUrl(e.target.value); clearError('baseURL') }} />
        </Field>
        <span className="o-chips">
          {SUGGESTIONS.map(s => <button key={s.url} type="button" className="o-chip" onClick={() => suggest(s.url)}>{s.name()}</button>)}
        </span>
      </div>
      <Field label={keyLabel} error={errors.apiKey}>
        <TextInput ref={keyField} type="password" value={key} autoComplete="off" spellCheck={false} placeholder={keepKey ? O.services.keySaved : 'sk-…'}
          onChange={e => { setKey(e.target.value); clearError('apiKey') }} />
      </Field>
      {keepKey && <Button type="button" kind="text" size="sm" className="o-clear-key" onClick={() => setKeepKey(false)}>{O.services.apiKeyClear}</Button>}
      <Field label={O.services.model} error={errors.model} hint={list.kind === 'failed' ? O.services.modelNoList : undefined}>
        <Combobox ref={modelField} value={model} options={list.kind === 'ready' ? list.models : null} busy={list.kind === 'loading'} noMatch={O.services.modelNoMatch}
          placeholder={modelPlaceholder} disabled={!ready && !model} onOpen={openList}
          onValue={(text, option) => { setModel(text); setModelName(option?.name); clearError('model') }} />
      </Field>
      <Field label={O.services.name}>
        <TextInput value={name} maxLength={NAME_MAX} autoComplete="off" placeholder={O.services.namePlaceholder} onChange={e => setName(e.target.value)} />
      </Field>
      <div>
        <button type="button" className="o-disclose" aria-expanded={more} onClick={() => setMore(m => !m)}><Icon node={ChevronRight} size={14} />{O.more}</button>
        <Reveal open={more}>
          <div className="o-more">
            <div className="o-line">
              <span className="o-line-words"><span>{O.services.thinking}</span><small>{O.services.thinkingHint}</small></span>
              <Switch label={O.services.thinking} checked={thinking} onChange={setThinking} />
            </div>
          </div>
        </Reveal>
      </div>
      <div className="o-formbar">
        {/* Part 3's busy: the loader in the icon's place, the words kept, a click refused; the submit guard above stays for
            Enter in a field */}
        <Button type="submit" kind="brand" size="md" busy={busy}>{busy ? O.services.connecting : O.services.connect}</Button>
        <Button type="button" kind="text" size="md" onClick={onCancel}>{O.services.cancel}</Button>
        <span className="o-note" role="status">{result ? <Status tone="alert">{result}</Status> : service ? O.services.savedOnConnect : O.services.addedOnConnect}</span>
      </div>
    </form>
  )
}

/**
 * A key the endpoint refused (§4's record), or a service an earlier version stored without one (without the first
 * sentence): a new key, Update and connect; saved only once it connects. Nothing here writes the record: once the caller has
 * stored the new key, the background clears the mark (ruling 17)
 */
export function KeyForm({ service, refused, target, focus = false, onConnected }: {
  service: Service
  refused: boolean
  target: LangCode
  /** opened by the pointer's choice of the service: the focus goes to the field (§9) */
  focus?: boolean
  onConnected: (saved: Service, ms: number) => Promise<void>
}) {
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const typed = key !== ''
  useEffect(() => (typed ? drafts.hold() : undefined), [typed])
  useEffect(() => { if (focus) field.current?.focus({ preventScroll: true }) }, [focus])
  const submit = async () => {
    setResult('')
    if (!key.trim()) {
      setError(O.services.checks.apiKey)
      field.current?.focus()
      return
    }
    setError(undefined)
    setBusy(true)
    const candidate = { ...service, apiKey: key.trim() }
    const res = await connectService(candidate, target)
    if (res.ok) {
      await onConnected(candidate, res.ms).finally(() => setBusy(false))
      return
    }
    setBusy(false)
    setResult(res.reason)
    field.current?.focus()
  }
  return (
    <form className="o-form" data-form="key" noValidate onSubmit={e => { e.preventDefault(); if (!busy) void submit() }}>
      {refused && <p className="o-muted">{O.services.keyForm.refused}</p>}
      <Field label={O.services.keyForm.label} error={error}>
        <TextInput ref={field} type="password" value={key} autoComplete="off" spellCheck={false} onChange={e => { setKey(e.target.value); setError(undefined) }} />
      </Field>
      <div className="o-formbar">
        <Button type="submit" kind="brand" size="md" busy={busy}>{busy ? O.services.connecting : O.services.keyForm.submit}</Button>
        <span className="o-note" role="status">{result ? <Status tone="alert">{result}</Status> : O.services.savedOnConnect}</span>
      </div>
    </form>
  )
}
```

(`placeholder="https://…/v1"` and `'sk-…'` are the shapes of an address and a key, as today's drawer shows them, not words.)

- [ ] **Step 5: The forms' rules**

Append to `src/entrypoints/options/ui/settings.css`:

```css
/* ---- Task 59: a form in place (§6.3) ---- */
@layer components {
  /* under its row: from the words' edge (42) to the trailing edge (14), 12 px above and 14 below, fields 14 px apart */
  .o-form { display: flex; flex-direction: column; gap: 14px; padding: 12px 10px 14px 38px; }
  .o-stack { display: flex; flex-direction: column; gap: 6px; }
  /* the address suggestions: 24 px chips, 6 px apart */
  .o-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .o-chip { height: 24px; padding: 0 9px; border: 0; border-radius: 999px; background: var(--button); color: var(--ink-2); font: inherit; font-size: 12px; cursor: pointer; transition: background-color 150ms ease-out, color 150ms ease-out, scale 150ms ease-out; }
  @media (hover: hover) { .o-chip:hover { background: var(--fill); color: var(--ink); } }
  .o-chip:active { scale: 0.96; }
  /* Clear (O.services.apiKeyClear), under the key field it clears */
  .o-clear-key { align-self: flex-start; margin-top: -8px; }
  .o-muted { margin: 0; color: var(--ink-2); font-size: 12px; line-height: 1.4; }
  .o-form input:disabled { opacity: 0.55; }
}
@media (prefers-reduced-motion: reduce) { .o-chip { transition: none; } .o-chip:active { scale: 1; } }
```

- [ ] **Step 6: Run the tests, the gate, and commit**

Run: `pnpm vitest run tests/options/service-form.test.ts && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0.

```bash
git add src/entrypoints/options/sections/ServiceForm.tsx src/entrypoints/options/ui/settings.css src/locales/zh-CN.ts src/locales/en.ts tests/options/service-form.test.ts
node scripts/check-english.mjs
git commit -m "feat(options): the service form and the key form, connected before saved

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 60: 翻译 — the services, the fallback, the target language

§6.3's first half: 翻译服务, one card and one radio group — Microsoft 翻译 and Google 翻译 「免费」; Chrome 翻译 with its
pack; the reader's own services, 「{名称}」 over 「{模型} · {主机}」, their status and 「…」 (编辑… · 删除); 添加服务… last —
with the forms of Task 59 in place; a refused key's form under its row when chosen; 出问题时自动改用免费服务 as a card
under it while an LLM service is chosen; 目标语言 with the popup's searchable menu. A deletion is undone, not
confirmed, and what it cannot take back waits for its undo to pass. The page never writes the refused-key record: it
reads it (`useRejected`), and the background clears it when a saved key or address changes and when a service is
deleted (ruling 17). The old services section and its drawer go.

**Files:**
- Create: `src/entrypoints/options/sections/Translate.tsx`
- Delete: `src/entrypoints/options/sections/Services.tsx`, `src/entrypoints/options/sections/ServiceDrawer.tsx`,
  `tests/options/service-drawer.test.ts`
- Modify: `src/entrypoints/options/App.tsx` (`CONTENT.translate`)
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`O.services`)
- Modify: `tests/ui/strings.test.ts` (the `O.services.issue` expectations go with the key)
- Modify: `scripts/english-allowlist.txt` (the counts the English gate names)
- Test: `tests/options/translate-section.test.ts`

**Interfaces:**
- Consumes: `ServiceForm`, `KeyForm` (Task 59); `Row`, `Status`, `Value`, `IconButton`, `Card`, `GroupHeading`
  (Task 50); `UndoRow`, `withUndo`, `insertAt`, `useLinger`, `shut` (Task 51); Part 3's `useRejected` (`@/ui/use-rejected`:
  the record's ids, followed — read only, nothing here marks or clears); `releaseHostPermission` (`../permissions`);
  Part 3's `MenuList`, `Reveal`, `Button`; Part 1's `Popover`, `usePopover`, `radioKeys`, `Switch`.
- Produces: `Translate({ data })`; the words
  `O.services.{title, packNeeded, moreFor(name), rejected}` and the new values of `add`, `edit`.

- [ ] **Step 1: The words**

In `src/locales/zh-CN.ts`, in `O.services`: delete `issue`, `issueSeparator`, `builtIn`, `mine`, `empty`, `imagesHint`,
`newTitle`, `editTitle` (the drawer's and the old section's; §10 lists their words as going; `baseURLHint` and `more`
stay: the controls sheet's `specimens/forms.tsx` reads them, "Kept for Part 7");
`add: '添加服务',` becomes `add: '添加服务…',`; `edit: '编辑',` becomes `edit: '编辑…',`; and add at the top of
`services`:

```ts
    /** §6.3: the group and its rows */
    title: '翻译服务',
    packNeeded: ' · 需要先下载语言包',
    moreFor: (name: string) => `「${name}」的更多操作`,
    rejected: 'API Key 已失效',
```

In `src/locales/en.ts`, the same deletions; `add: 'Add a service…',`, `edit: 'Edit…',`, and:

```ts
    title: 'Translation service',
    packNeeded: ' · needs its language pack first',
    moreFor: name => `More for “${name}”`,
    rejected: 'API key no longer valid',
```

In `tests/ui/strings.test.ts`, delete the whole `describe('the settings drawer issue sentence', …)` block: the key goes
with the drawer. (Its two CJK lines, 80 and 81 — the full-width colon counts — leave the file: its entry in
`scripts/english-allowlist.txt` goes from 13 to 11, Step 5.)

- [ ] **Step 2: Write the failing tests**

`tests/options/translate-section.test.ts`:

```ts
// The translation section's services (the redesign's design, §6.3): one radio group in the agreed order; Chrome's pack; the reader's own with
// their status — a refused key, none stored, connected —; a refused key's form, saved once it connects; a service added
// only once it connects, chosen, no session moved; an edit saved in place; a deletion undone within 5 s with nothing
// irreversible done, and its clean-up after in today's order; the fallback while an LLM is chosen; the target
// language's menu. The page writes no refused-key record (ruling 17): the background's configuration watcher does
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { Service } from '@/config/services'
import type { PackState } from '@/shared/pack'
import type { OptionsData } from '@/entrypoints/options/data'
import { stubPopovers } from '../pdf-reader/ui/popover-stub'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const wire = vi.hoisted(() => ({
  log: [] as string[], rejected: [] as string[], stored: null as unknown,
  connect: { ok: true, ms: 42 } as { ok: true; ms: number } | { ok: false; field: null; reason: string },
}))
vi.mock('@/shared/messages', () => ({ sendMessage: vi.fn(async (m: { type: string; id?: string; rebindAll?: boolean }) => { wire.log.push(`send ${m.type} ${m.id}${m.rebindAll ? ' all' : ''}`); return { reset: true } }) }))
vi.mock('@/config/storage', () => ({ getConfig: async () => wire.stored }))
vi.mock('@/entrypoints/options/permissions', () => ({
  PermissionError: class extends Error {}, ensureHostPermission: async () => false, hasHostPermission: async () => false,
  releaseHostPermission: vi.fn(async (url: string) => { wire.log.push(`release ${url}`) }),
}))
vi.mock('@/entrypoints/options/connect', () => ({ connectService: vi.fn(async (c: Service) => { wire.log.push(`connect ${c.id}`); return wire.connect }) }))
vi.mock('@/entrypoints/options/models', () => ({ listModels: async () => [] }))
vi.mock('@/ui/use-rejected', () => ({ useRejected: () => wire.rejected }))

import { Translate } from '@/entrypoints/options/sections/Translate'
import { UNDO_MS } from '@/entrypoints/options/ui/UndoRow'
import { O, S, setLocale } from '@/ui/strings'

const MINE: Service = { id: 'svc-mine0000', kind: 'openai-compat', name: 'Mine', baseURL: 'https://api.example.com/v1', apiKey: 'sk-old', model: 'm-1', thinking: 'disabled' }
const OTHER: Service = { ...MINE, id: 'svc-othr0000', name: 'Other', baseURL: 'https://other.example.com/v1' }

function Harness({ start, pack = null, checks = [] }: { start: Config; pack?: PackState | null; checks?: string[] }) {
  const [config, setConfig] = useState(start)
  wire.stored = config
  const data: OptionsData = {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(wire.stored as Config); wire.stored = next; wire.log.push('patch'); setConfig(next); return next },
    pack, checkPack: async target => { checks.push(target); return 'unsupported' }, fetchPack: async () => { wire.log.push('fetch pack') },
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
  return h(Translate, { data })
}
const card = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-row="translate/services"]')!
const radios = (c: HTMLElement) => [...card(c).querySelectorAll<HTMLElement>('[role="radio"]')]
const nameOf = (r: HTMLElement) => document.getElementById(r.getAttribute('aria-labelledby')!)!.textContent
const rowNamed = (c: HTMLElement, name: string) => radios(c).find(r => nameOf(r) === name)!.closest<HTMLElement>('[data-srow]')!
const stored = () => wire.stored as Config
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const submit = (form: HTMLFormElement) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
const menuItem = (row: HTMLElement, name: string) => [...row.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(i => i.textContent === name)!
const OPTIONS = join(import.meta.dirname, '../../src/entrypoints/options')

describe('the translation services (§6.3)', () => {
  // happy-dom has no popover API: a menu's pick shuts its popover, so the reader's stub stands in
  let restore = () => {}
  beforeEach(() => {
    setLocale('en')
    vi.useFakeTimers({ shouldAdvanceTime: true })
    Object.assign(wire, { log: [], rejected: [], connect: { ok: true, ms: 42 } })
    restore = stubPopovers()
  })
  afterEach(() => { vi.useRealTimers(); restore() })

  it('one radio group: the two free services, Chrome, the reader\'s own, the add row last; the arrows move the choice past what cannot be chosen', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE], provider: 'microsoft' } }))
    expect(radios(m.container).map(nameOf)).toEqual([S.service.microsoft, S.service.google, S.service.chrome, 'Mine'])
    expect(rowNamed(m.container, 'Mine').textContent).toContain('m-1 · api.example.com')
    expect([...card(m.container).querySelectorAll(':scope > button[data-srow]')].at(-1)!.textContent).toBe(O.services.add)
    radios(m.container)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await m.flush()
    expect(stored().provider).toBe('google-web')
    radios(m.container)[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await m.flush()
    expect(stored().provider).toBe(MINE.id)
    await m.unmount()
  })

  it('Chrome with a pack to fetch: its words say so, Download fetches it; while it comes, the row says so', async () => {
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, pack: 'downloadable' }))
    const chrome = rowNamed(m.container, S.service.chrome)
    expect(chrome.textContent).toContain(`${S.service.chrome_ready}${O.services.packNeeded}`)
    expect(chrome.querySelector('[role="radio"]')!.getAttribute('aria-disabled')).toBe('true')
    ;[...chrome.querySelectorAll('button')].find(b => b.textContent === S.service.chrome_download)!.click()
    expect(wire.log).toContain('fetch pack')
    await m.rerender(h(Harness, { start: DEFAULT_CONFIG, pack: 'downloading' }))
    expect(rowNamed(m.container, S.service.chrome).querySelector('.o-status[data-tone="busy"]')!.textContent).toBe(S.service.chrome_downloading)
    await m.unmount()
  })

  it('a refused key says so on its row; chosen, its form opens under it; the key is saved once it connects, no record written, no session moved', async () => {
    wire.rejected = [MINE.id]
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE], provider: MINE.id } }))
    const row = rowNamed(m.container, 'Mine')
    expect(row.querySelector('.o-status[data-tone="alert"]')!.textContent).toBe(O.services.rejected)
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="key"]')!
    expect(form.textContent).toContain(O.services.keyForm.refused)
    type(form.querySelector('input')!, 'sk-new')
    submit(form)
    await m.flush()
    await m.flush()
    // the save is all: the stored key changed, the background's watcher clears the mark (ruling 17)
    expect(wire.log).toEqual([`connect ${MINE.id}`, 'patch'])
    expect(stored().services[0]!.apiKey).toBe('sk-new')
    wire.rejected = []
    await m.rerender(h(Harness, { start: stored() }))
    expect(rowNamed(m.container, 'Mine').querySelector('.o-status[data-tone="ok"]')!.textContent).toBe(O.services.connected(42))
    await m.unmount()
  })

  it('a service stored without a key by an earlier version says so, and its form has no first sentence', async () => {
    const keyless = { ...MINE, apiKey: '' }
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [keyless], provider: keyless.id } }))
    expect(rowNamed(m.container, 'Mine').querySelector('.o-status')!.textContent).toBe(S.service.llm_noKey)
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="key"]')!
    expect(form.textContent).not.toContain(O.services.keyForm.refused)
    await m.unmount()
  })

  it('a service is added only once it connects, and chosen; the page translating keeps its chain', async () => {
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG }))
    ;[...card(m.container).querySelectorAll<HTMLButtonElement>('button[data-srow]')].find(b => b.textContent === O.services.add)!.click()
    await m.flush()
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="service"]')!
    const [address, , model] = [...form.querySelectorAll<HTMLInputElement>('input')]
    type(address!, 'http://127.0.0.1:9/v1')
    type(model!, 'echo')
    wire.connect = { ok: false, field: null, reason: 'Couldn\'t connect: offline' }
    submit(form)
    await m.flush()
    await m.flush()
    expect(stored().services).toEqual([])
    wire.connect = { ok: true, ms: 42 }
    submit(form)
    await m.flush()
    await m.flush()
    expect(stored().services).toHaveLength(1)
    expect(stored().provider).toBe(stored().services[0]!.id)
    expect(wire.log.some(l => l.startsWith('send'))).toBe(false)
    expect(rowNamed(m.container, 'echo').querySelector('.o-status[data-tone="ok"]')!.textContent).toBe(O.services.connected(42))
    await m.unmount()
  })

  it('Edit… opens the same form under its row; connected, the service is saved in place, not chosen', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: MINE.id } }))
    menuItem(rowNamed(m.container, 'Other'), O.services.edit).click()
    await m.flush()
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="service"]')!
    const name = [...form.querySelectorAll<HTMLInputElement>('input')][3]!
    type(name, 'Renamed')
    submit(form)
    await m.flush()
    await m.flush()
    expect(stored().services.map(s => s.name)).toEqual(['Mine', 'Renamed'])
    expect(stored().provider).toBe(MINE.id)
    expect(wire.log).toEqual([`connect ${OTHER.id}`, 'patch'])
    await m.unmount()
  })

  it('deleting the chosen one: Microsoft takes over, the undo row stands in its place, nothing irreversible is done; undone, it comes back chosen', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: MINE.id } }))
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    expect(stored().services.map(s => s.id)).toEqual([OTHER.id])
    expect(stored().provider).toBe('microsoft')
    const undoRow = card(m.container).querySelector<HTMLElement>('[data-undo]')!
    expect(undoRow.textContent).toContain(O.undo.deleted('Mine'))
    expect(wire.log).toEqual(['patch'])
    ;[...undoRow.querySelectorAll('button')].find(b => b.textContent === O.undo.undo)!.click()
    await m.flush()
    expect(stored().services.map(s => s.id)).toEqual([MINE.id, OTHER.id])
    expect(stored().provider).toBe(MINE.id)
    expect(wire.log).toEqual(['patch', 'patch'])
    await m.unmount()
  })

  it('once the undo is past, the deletion\'s clean-up runs in today\'s order: every session moved off, then the origin given back', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: OTHER.id } }))
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    expect(stored().provider).toBe(OTHER.id)
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    await m.flush()
    await m.flush()
    // the record is not the page's: the deletion stored at once, the background's watcher cleared the mark then
    expect(wire.log).toEqual(['patch', `send axt:engine-ready ${MINE.id} all`, `release ${MINE.baseURL}`])
    expect(card(m.container).querySelector('[data-undo]')).toBeNull()
    await m.unmount()
  })

  it('the fallback shows only while an LLM service is chosen; the target language\'s menu writes it and looks the pack up again', async () => {
    const checks: string[] = []
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE], provider: 'microsoft' }, checks }))
    const fallback = () => m.container.querySelector<HTMLElement>('[data-row="translate/fallback"]')!
    expect(fallback().closest('[inert]')).not.toBeNull()
    radios(m.container)[3]!.click()
    await m.flush()
    expect(fallback().closest('[inert]')).toBeNull()
    const japanese = [...m.container.querySelectorAll<HTMLElement>('[role="option"]')].find(o => /Japanese/.test(o.textContent ?? ''))!
    japanese.click()
    await m.flush()
    expect(stored().targetLanguage).toBe('jpn')
    expect(checks).toEqual(['jpn'])
    await m.unmount()
  })

  it('nothing on the page writes the refused-key record: it is read here, written by the background alone (ruling 17)', () => {
    const files = (readdirSync(OPTIONS, { recursive: true }) as string[]).filter(f => /\.tsx?$/.test(f))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) expect(readFileSync(join(OPTIONS, f), 'utf8'), f).not.toMatch(/\b(markRejected|clearRejected\w*)\b/)
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run tests/options/translate-section.test.ts`
Expected: FAIL — `Failed to resolve import "@/entrypoints/options/sections/Translate"`.

- [ ] **Step 4: Write 翻译's first half**

`src/entrypoints/options/sections/Translate.tsx`:

```tsx
// The translation section (the redesign's design, §6.3): the translation services — one card, one radio group: the
// free services, Chrome's, the reader's own, the add row last —; under it the fallback switch while an LLM service is
// chosen, then the target language, then the LLM group (Task 63). A service is added, edited or given a new key only once it connects (§11): the forms test first, and this
// section saves on their success. No page translating is moved by any of it — each keeps the chain it started on, the
// configuration's watcher rebuilding the chain for the sessions after — but a deletion, once its undo is past, moves
// every session off the service: it has to stop serving everywhere (Codex on #157)
import { Ellipsis, Plus } from 'lucide'
import { type CSSProperties, Fragment, useEffect, useRef, useState } from 'react'
import { LANG_CODES, LANG_CODE_TO_EN_NAME, LANG_CODE_TO_LOCALE_NAME, LANG_CODE_TO_ZH_NAME, type LangCode } from '@/config/languages'
import { type Service, isLlmChosen, serviceRuns } from '@/config/services'
import { getConfig } from '@/config/storage'
import { supportsTarget } from '@/providers/microsoft'
import { sendMessage } from '@/shared/messages'
import type { PackState } from '@/shared/pack'
import { Button } from '@/ui/controls/Button'
import { Icon } from '@/ui/controls/Icon'
import { MenuList } from '@/ui/controls/MenuList'
import { Popover, usePopover } from '@/ui/controls/Popover'
import { radioKeys } from '@/ui/controls/radio'
import { Reveal } from '@/ui/controls/Reveal'
import { Switch } from '@/ui/controls/Switch'
import { O, S, languageLabel, languageName } from '@/ui/strings'
import { useRejected } from '@/ui/use-rejected'
import type { OptionsData } from '../data'
import { releaseHostPermission } from '../permissions'
import { Card, GroupHeading } from '../ui/Card'
import { insertAt, shut, useLinger, withUndo } from '../ui/lists'
import { IconButton, Row, Status, Value } from '../ui/Row'
import { UndoRow } from '../ui/UndoRow'
import { KeyForm, ServiceForm } from './ServiceForm'

const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Chrome's row by its pack (UI.md S-P-40…43): not choosable until the pack is there */
function chromeRow(pack: PackState | null): { hint: string; disabled: boolean; action: 'download' | 'busy' | null } {
  switch (pack) {
    case 'available': return { hint: S.service.chrome_ready, disabled: false, action: null }
    case 'downloadable': return { hint: `${S.service.chrome_ready}${O.services.packNeeded}`, disabled: true, action: 'download' }
    case 'downloading': return { hint: S.service.chrome_ready, disabled: true, action: 'busy' }
    case null: return { hint: S.service.chrome_ready, disabled: true, action: null }
    default: return { hint: S.service.chrome_unavailable, disabled: true, action: null }
  }
}

export function Translate({ data }: { data: OptionsData }) {
  const { config, patch } = data
  if (!config) return null
  const k = O.search.keywords
  return (
    <>
      <GroupHeading title={O.services.title} />
      <Services data={data} />
      <Reveal open={isLlmChosen(config)}>
        <Card gap row="translate/fallback">
          <Row toggles words={k['translate/fallback']} label={O.services.autoFallback} description={O.services.autoFallbackHint}
            trailing={<Switch label={O.services.autoFallback} checked={config.fallback.enabled} onChange={on => void patch(latest => ({ ...latest, fallback: { enabled: on } }))} />} />
        </Card>
      </Reveal>
      <TargetLanguage data={data} />
    </>
  )
}

interface Gone { service: Service; index: number; chosen: boolean; focus: boolean }
type Form = { kind: 'add' } | { kind: 'edit'; id: string }

function Services({ data }: { data: OptionsData }) {
  const { patch, pack, fetchPack } = data
  const config = data.config!
  const rejected = useRejected()
  const [form, setForm] = useState<Form | null>(null)
  const drawnForm = useLinger(form)
  /** the connected status (O.services.connected) for as long as the page stays open (§6.3) */
  const [connected, setConnected] = useState<Record<string, number>>({})
  /** the service the pointer chose: its key form takes the focus (the arrows' choice leaves it on the radios) */
  const [pointed, setPointed] = useState<string | null>(null)
  /** the service just added: its row comes in with §8's row motion */
  const [fresh, setFresh] = useState<string | null>(null)
  const deletions = useDeletions(data)
  const radios = useRef(new Map<string, HTMLElement>())
  const addRow = useRef<HTMLButtonElement>(null)
  const words = O.search.keywords['translate/services']
  const chrome = chromeRow(pack)
  const microsoftOk = supportsTarget(config.targetLanguage)
  const builtIns = [
    { id: 'microsoft', name: S.service.microsoft, hint: microsoftOk ? S.service.free : S.service.microsoft_unsupported, disabled: !microsoftOk, action: null },
    { id: 'google-web', name: S.service.google, hint: S.service.free, disabled: false, action: null },
    { id: 'chrome-builtin', name: S.service.chrome, ...chrome },
  ]
  const ids = [...builtIns.map(b => b.id), ...config.services.map(s => s.id)]
  const can = (id: string) => !builtIns.some(b => b.id === id && b.disabled)
  const choose = (id: string, how: 'pointer' | 'key') => {
    void patch(latest => ({ ...latest, provider: id }))
    setPointed(how === 'pointer' ? id : null)
  }
  const keys = radioKeys(ids, config.provider, can, id => choose(id, 'key'), i => radios.current.get(ids[i]!)?.focus())
  const radioRef = (id: string) => (el: HTMLElement | null) => { if (el) radios.current.set(id, el); else radios.current.delete(id) }
  const focusRow = (id: string) => requestAnimationFrame(() => radios.current.get(id)?.focus())
  const stored = config.services.map(s => s.baseURL)

  /** a new service, stored now that it answered, and chosen (§6.3) */
  const added = async (s: Service, ms: number) => {
    await patch(latest => ({ ...latest, services: latest.services.some(x => x.id === s.id) ? latest.services : [...latest.services, s], provider: s.id }))
    setConnected(c => ({ ...c, [s.id]: ms }))
    setFresh(s.id)
    setForm(null)
    focusRow(s.id)
  }
  /**
   * An edit or a new key, saved now that it answered — in place, the choice left as it is. Nothing more: a key or an
   * address that changed clears the service's mark in the background, which alone writes the record (ruling 17)
   */
  const saved = async (s: Service, ms: number) => {
    await patch(latest => ({ ...latest, services: latest.services.map(x => (x.id === s.id ? s : x)) }))
    setConnected(c => ({ ...c, [s.id]: ms }))
    setForm(null)
    focusRow(s.id)
  }

  const chosenOwn = config.services.find(s => s.id === config.provider)
  const editingId = form?.kind === 'edit' ? form.id : null
  /** the chosen service's key form: a refused key, or none stored (§6.3), unless its edit form is open */
  const keyFor = chosenOwn && (rejected.includes(chosenOwn.id) || !serviceRuns(chosenOwn)) && editingId !== chosenOwn.id ? chosenOwn.id : null
  const drawnKey = useLinger(keyFor)

  const own = (s: Service) => {
    const refused = rejected.includes(s.id)
    const status = refused ? <Status tone="alert">{O.services.rejected}</Status>
      : !serviceRuns(s) ? <Status tone="alert">{S.service.llm_noKey}</Status>
        : connected[s.id] !== undefined ? <Status tone="ok" arriving>{O.services.connected(connected[s.id]!)}</Status> : null
    return (
      <Fragment key={s.id}>
        <Row kind="radio" checked={config.provider === s.id} onChoose={how => choose(s.id, how)} radioRef={radioRef(s.id)}
          label={s.name} description={`${s.model} · ${hostOf(s.baseURL)}`} words={words} arriving={fresh === s.id}
          trailing={<>{status}<ServiceMenu service={s} onEdit={() => setForm({ kind: 'edit', id: s.id })} onDelete={focus => { setForm(null); deletions.remove(s, focus) }} /></>} />
        <Reveal open={keyFor === s.id}>
          {drawnKey === s.id && <KeyForm service={s} refused={refused} target={config.targetLanguage} focus={pointed === s.id} onConnected={saved} />}
        </Reveal>
        <Reveal open={editingId === s.id}>
          {drawnForm?.kind === 'edit' && drawnForm.id === s.id && (
            <ServiceForm service={s} target={config.targetLanguage} stored={stored} onConnected={saved} onCancel={() => { setForm(null); focusRow(s.id) }} />
          )}
        </Reveal>
      </Fragment>
    )
  }

  return (
    <Card role="radiogroup" label={O.services.title} row="translate/services" onKeyDown={keys}>
      {builtIns.map(b => (
        <Row key={b.id} kind="radio" checked={config.provider === b.id} disabled={b.disabled} muted={b.disabled} onChoose={how => choose(b.id, how)} radioRef={radioRef(b.id)}
          label={b.name} description={b.hint} words={words}
          trailing={b.action === 'download'
            ? <Button type="button" kind="neutral" size="sm" onClick={() => void fetchPack()}>{S.service.chrome_download}</Button>
            : b.action === 'busy' ? <Status tone="busy">{S.service.chrome_downloading}</Status> : undefined} />
      ))}
      {withUndo(config.services, deletions.gone).map(entry => {
        if (!('gone' in entry)) return own(entry.item)
        const g = entry.gone
        return (
          <UndoRow key={`gone-${g.service.id}`} name={g.service.name} focus={g.focus}
            onUndo={() => { deletions.undo(g); focusRow(g.service.id) }}
            onExpire={() => { if (document.activeElement?.closest('[data-undo]')) addRow.current?.focus(); deletions.expire(g) }} />
        )
      })}
      <Row kind="button" quiet lead={<Icon node={Plus} size={14} />} label={O.services.add} expanded={form?.kind === 'add'} buttonProps={{ ref: addRow }}
        onPress={() => setForm(f => (f?.kind === 'add' ? null : { kind: 'add' }))} />
      <Reveal open={form?.kind === 'add'}>
        {drawnForm?.kind === 'add' && <ServiceForm target={config.targetLanguage} stored={stored} onConnected={added} onCancel={() => { setForm(null); addRow.current?.focus() }} />}
      </Reveal>
    </Card>
  )
}

/** A service of one's own carries its actions behind its more button (§6.2): Edit… · Delete */
function ServiceMenu({ service, onEdit, onDelete }: { service: Service; onEdit: () => void; onDelete: (keyboard: boolean) => void }) {
  const pop = usePopover('menu')
  const label = O.services.moreFor(service.name)
  return (
    <>
      <IconButton icon={Ellipsis} label={label} hover {...pop.trigger} style={{ anchorName: pop.anchor } as CSSProperties} />
      <Popover {...pop.popover} role="menu" label={label} className="o-end">
        <MenuList key={pop.generation} kind="items" label={label} items={[{ id: 'edit', name: O.services.edit }, { id: 'delete', name: O.services.delete }]}
          onClose={() => shut(pop.popover.id)}
          onPick={id => {
            shut(pop.popover.id)
            if (id === 'edit') onEdit()
            // the keyboard's deletion puts the focus on the undo row's button (trackModality marks the pointer's turn)
            else onDelete(!document.documentElement.hasAttribute('data-axt-pointer'))
          }} />
      </Popover>
    </>
  )
}

/**
 * Deleting is undone, not confirmed (§6.2): the service leaves the list — and the choice, which falls back to the Microsoft
 * service (S-O-21) — at once, and what cannot be taken back waits for the undo to pass: every session moved off the
 * service, and only then its origin given back (a request still in flight would break) — the old drawer's order. Its
 * mark in the refused-key record is the background's to clear, on the deletion being stored (ruling 17). Undone, it
 * comes back at its place, chosen again if it was and nothing else was chosen since. Leaving the page ends every undo
 * (best effort: the tab may close before the clean-up lands, as it could before)
 */
function useDeletions(data: OptionsData) {
  const [gone, setGone] = useState<Gone[]>([])
  const pending = useRef(new Set<Gone>())
  const commit = useRef(async (g: Gone) => {
    if (!pending.current.delete(g)) return
    await sendMessage({ type: 'axt:engine-ready', id: g.service.id, rebindAll: true }).catch(() => undefined)
    await releaseHostPermission(g.service.baseURL, (await getConfig()).services.map(s => s.baseURL)).catch(() => undefined)
  }).current
  useEffect(() => {
    const flush = () => { for (const g of [...pending.current]) void commit(g) }
    addEventListener('pagehide', flush)
    return () => {
      removeEventListener('pagehide', flush)
      flush()
    }
  }, [commit])
  const remove = (service: Service, focus: boolean) => {
    const config = data.config!
    const g: Gone = { service, index: config.services.findIndex(s => s.id === service.id), chosen: config.provider === service.id, focus }
    pending.current.add(g)
    setGone(x => [...x, g])
    void data.patch(latest => ({ ...latest, services: latest.services.filter(s => s.id !== service.id), provider: latest.provider === service.id ? 'microsoft' : latest.provider }))
  }
  const undo = (g: Gone) => {
    pending.current.delete(g)
    setGone(x => x.filter(y => y !== g))
    void data.patch(latest => (latest.services.some(s => s.id === g.service.id) ? latest
      : { ...latest, services: insertAt(latest.services, g.index, g.service), provider: g.chosen && latest.provider === 'microsoft' ? g.service.id : latest.provider }))
  }
  const expire = (g: Gone) => {
    setGone(x => x.filter(y => y !== g))
    void commit(g)
  }
  return { gone, remove, undo, expire }
}

/** The target language (S-O-23): a row and the popup's searchable menu; a choice re-checks Chrome's pack for the new language */
function TargetLanguage({ data }: { data: OptionsData }) {
  const { patch, checkPack } = data
  const config = data.config!
  const pop = usePopover('listbox')
  const items = LANG_CODES.map(code => ({
    id: code,
    name: languageLabel(code),
    keywords: `${LANG_CODE_TO_EN_NAME[code]} ${LANG_CODE_TO_LOCALE_NAME[code]} ${LANG_CODE_TO_ZH_NAME[code]} ${code}`,
    checked: code === config.targetLanguage,
  }))
  return (
    <Card gap>
      <Row kind="button" row="translate/language" words={O.search.keywords['translate/language']} label={S.rows.language}
        trailing={<Value>{languageName(config.targetLanguage)}</Value>} buttonProps={{ ...pop.trigger, style: { anchorName: pop.anchor } as CSSProperties }} />
      <Popover {...pop.popover} role="listbox" label={S.rows.language} className="o-end">
        <MenuList key={pop.generation} kind="listbox" label={S.rows.language} search={S.menu.searchLanguages} noMatch={S.menu.noMatch} items={items}
          onClose={() => shut(pop.popover.id)}
          onPick={code => { shut(pop.popover.id); void patch(latest => ({ ...latest, targetLanguage: code as LangCode })).then(() => checkPack(code)) }} />
      </Popover>
    </Card>
  )
}
```

In `src/entrypoints/options/App.tsx`, replace the `Services` import with `import { Translate } from './sections/Translate'`
and `translate: data => <><Services data={data} /><Prompts data={data} /></>,` with
`translate: data => <><Translate data={data} /><Prompts data={data} /></>,`. Delete
`src/entrypoints/options/sections/Services.tsx`, `src/entrypoints/options/sections/ServiceDrawer.tsx` and
`tests/options/service-drawer.test.ts`.

- [ ] **Step 5: Run the tests, the gate, and commit**

Run: `pnpm vitest run tests/options tests/ui && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0. A type error names a reader of a deleted `O.services` key: it can only be in the two deleted files
(the controls sheet's two keys are kept). Then `git rm` the three files, `git add` the rest and run
`node scripts/check-english.mjs`: in `scripts/english-allowlist.txt` the entry for `tests/ui/strings.test.ts` goes from
13 to 11 (its reason gains `; −2, 2026-09-27: the drawer's issue sentence left with its key (Part 5, Task 60)`); the
new files hold none.

```bash
git rm src/entrypoints/options/sections/Services.tsx src/entrypoints/options/sections/ServiceDrawer.tsx tests/options/service-drawer.test.ts
git add src/entrypoints/options/sections/Translate.tsx src/entrypoints/options/App.tsx src/locales/zh-CN.ts src/locales/en.ts tests/ui/strings.test.ts tests/options/translate-section.test.ts scripts/english-allowlist.txt
node scripts/check-english.mjs
git commit -m "feat(options): the services as one list, added and re-keyed only once connected

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 61: 翻译服务 in the browser checks

The suites drive the new services list: adding through the form in place (added only once it connects), editing
through 「…」, the key cleared; a service whose key the endpoint refuses, which the page will no longer add, is put in
the configuration directly where a suite tests what the chain does with one; the local endpoint answers the model list.

**Files:**
- Modify: `tests/e2e/options-page.mjs` (`addService`, `clearKeyAndReconnect`, `seedService`)
- Modify: `tests/e2e/extension.mjs` (the wrong key's blocks, the cleared key's check, the S-O-02 block's waits)
- Modify: `tests/e2e/local-endpoint.mjs` (`GET /v1/models`, the list's check)
- Modify: `experiments/pdf-bilingual/spikes/cache-faults.mjs`, `experiments/pdf-bilingual/spikes/cache-revisit.mjs`,
  `experiments/pdf-bilingual/spikes/viewer-faults.mjs`
- Modify: `scripts/english-allowlist.txt` (the counts the gate names)

**Interfaces:**
- Produces, in `tests/e2e/options-page.mjs`: `addService(options, { name, baseURL, model, apiKey })` → the row's status
  or the form's failure; `clearKeyAndReconnect(options, name = 'bogus key')` → the form's words; `seedService(worker, service, { choose = true })`
  → the id.

- [ ] **Step 1: The helpers**

In `tests/e2e/options-page.mjs`, replace `addService` and `clearKeyAndReconnect` with, and add `seedService` after them:

```js
/**
 * Add one of the reader's services in place (the redesign's design, §6.3). It is added only once it connects, so this
 * returns what the page said: the new row's connected status, or the form's failure line, the form then cancelled
 */
export async function addService(options, { name, baseURL, model, apiKey = '' }) {
  await openSection(options, 'translate')
  await options.getByRole('button', { name: '添加服务…', exact: true }).click()
  const form = options.locator('form[data-form="service"]')
  await form.waitFor({ timeout: 5_000 })
  await form.getByLabel('接口地址').fill(baseURL)
  if (apiKey) await form.getByLabel('API Key').fill(apiKey)
  const field = form.getByRole('combobox')
  await field.fill(model)
  await field.press('Escape')
  if (name) await form.getByLabel('名称（选填）').fill(name)
  await form.getByRole('button', { name: '连接', exact: true }).click()
  // the request's own budget: the form closes on a success, and says why beside the button on a failure
  for (let i = 0; i < 90; i++) {
    if (await form.count() === 0) break
    if (/连接失败/.test((await form.locator('.o-note').textContent().catch(() => '')) ?? '')) break
    // the form's own check refused it (a remote address without a key): it says so at the field, not beside the button
    if (await form.locator('[aria-invalid="true"]').count()) break
    await sleep(500)
  }
  if (await form.count() > 0) {
    const failed = (await form.locator('.o-note').textContent()) ?? ''
    await form.getByRole('button', { name: '取消', exact: true }).click()
    await sleep(300)
    return failed
  }
  return (await options.locator('[data-srow]', { hasText: name || model }).locator('.o-status').textContent().catch(() => '')) ?? ''
}

/**
 * Edit one of the reader's services, let its saved key go (the Clear button under the key field), connect again. A remote endpoint cannot be asked
 * without a key, so the form says one is needed and nothing is saved: the stored key is neither written back nor lost
 * (the defect this guards: a form that reads the key it opened with writes it back). Returns the form's words
 */
export async function clearKeyAndReconnect(options, name = 'bogus key') {
  await openSection(options, 'translate')
  const row = options.locator('[data-srow]', { has: options.getByRole('radio', { name, exact: true }) })
  await row.hover()
  await row.getByRole('button', { name: `「${name}」的更多操作`, exact: true }).click()
  await options.getByRole('menuitem', { name: '编辑…', exact: true }).click()
  const form = options.locator('form[data-form="service"]')
  await form.waitFor({ timeout: 5_000 })
  await form.getByRole('button', { name: '清除', exact: true }).click()
  await form.getByRole('button', { name: '连接', exact: true }).click()
  await sleep(300)
  const said = ((await form.innerText()) ?? '').replace(/\n+/g, ' ')
  await form.getByRole('button', { name: '取消', exact: true }).click()
  await sleep(300)
  return said
}

/**
 * A service written into the stored configuration through the extension's worker: one the settings page would not
 * add, since it does not connect (§6.3) — a suite testing what the chain does with a refused or a silent endpoint
 * seeds it, as an earlier version would have left it. The id must be `svc-` and eight of [a-z0-9]
 */
export async function seedService(worker, service, { choose = true } = {}) {
  const full = { kind: 'openai-compat', thinking: 'disabled', apiKey: '', ...service }
  await worker.evaluate(async ({ full, choose }) => {
    const { config } = await chrome.storage.local.get('config')
    await chrome.storage.local.set({ config: { ...config, services: [...config.services.filter(s => s.id !== full.id), full], ...(choose ? { provider: full.id } : {}) } })
  }, { full, choose })
  await sleep(300)
  return full.id
}
```

- [ ] **Step 2: The suite**

In `tests/e2e/extension.mjs`:
- add `seedService` to the import from `./options-page.mjs`;
- in the block `// ── A wrong key met for the first time, with the fallback chain on (§8.5): …`, replace the
  `const bogusTest = await addService(…)` line and the `check(…)` after it with:

```js
  // A service is added only once it connects (§6.3, §11): with a wrong key the form says so truthfully — not masked by
  // the free service on the chain (issue #42) — and nothing is added
  const marks = async () => Object.keys((await options.evaluate(() => chrome.storage.local.get('serviceHealth'))).serviceHealth ?? {}).sort()
  const marksBefore = await marks()
  const bogusTest = await addService(options, { name: 'bogus key', baseURL: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v4-flash', apiKey: 'sk-or-v1-bogus-key-for-auth-test' })
  const kept = await extensionWorker().evaluate(async () => (await chrome.storage.local.get('config')).config.services.map(s => s.name))
  check('with a wrong key the settings page\'s connection reports the failure truthfully and adds nothing', /连接失败/.test(bogusTest) && /API Key/.test(bogusTest) && !kept.includes('bogus key'), `${bogusTest}; stored ${JSON.stringify(kept)}`)
  // What the chain does with a key refused later: a service stored before its key went bad, as an earlier version left it
  await seedService(extensionWorker(), { id: 'svc-e2ebogus', name: 'bogus key', baseURL: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v4-flash', apiKey: 'sk-or-v1-bogus-key-for-auth-test' })
```

- in the same block, the three-line comment `// The connection test just now already marked this service refused …` and
  the `await options.evaluate(() => chrome.storage.local.remove('serviceHealth'))` under it go: the test of a service
  not stored writes no record (ruling 16), so nothing is there to remove. (The file's second such removal, in the block
  `// ── The same wrong key met for the first time, with the fallback chain off …`, stays: the page of the first block
  met the seeded service's real 401 and marked it.) In their place:

```js
  // The connection test of a service not stored writes no record (the redesign's design §4; ruling 16), so the page
  // below meets the wrong key for the first time
  const marksAfter = await marks()
  check('a refused connection test of a service not added marks nothing', JSON.stringify(marksAfter) === JSON.stringify(marksBefore), `${JSON.stringify(marksBefore)} → ${JSON.stringify(marksAfter)}`)
```

- in the block `// ── The settings page: “Clear” on the API key must really clear it`, replace the two comment lines under its
  header (`// The drawer opens with the stored key in its form, …` and `// With no key the endpoint reports …`) with
  `// The edit form opens with the stored key kept; a form that read that key back would write it again after the key is cleared.
  // With the key cleared a remote endpoint cannot be asked: the form says a key is needed and saves nothing.` and the
  `check(…)` with:

```js
  const key = await extensionWorker().evaluate(async () => (await chrome.storage.local.get('config')).config.services.find(s => s.id === 'svc-e2ebogus')?.apiKey)
  check('the settings page: with the saved key cleared the form asks for a key and saves nothing — the old key neither written back nor lost',
    /填写 API Key/.test(cleared) && key === 'sk-or-v1-bogus-key-for-auth-test', `${cleared.slice(0, 80)}; the stored key ${key === 'sk-or-v1-bogus-key-for-auth-test' ? 'kept' : 'changed'}`)
```

- in the block `// ── Saved settings this build cannot read are never written over`, the two
  `getByRole('button', { name: '添加服务', exact: true })` become `getByRole('button', { name: '添加服务…', exact: true })`
  (the check's `!/添加服务/.test(shown)` stays: it matches the new words too).

- [ ] **Step 3: The local endpoint lists its model**

In `tests/e2e/local-endpoint.mjs`: add `openSection` to the import from `./options-page.mjs` and a `sleep` is already
there; in the server's handler, after the `OPTIONS` branch, add:

```js
  // the model list (the redesign's design, §6.3): the settings page's form lists this endpoint's one model
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ object: 'list', data: [{ id: 'local-echo', object: 'model' }] }))
    return
  }
```

and before `// ── The settings page: add a service pointing at the local endpoint`'s `addService`, after
`const options = await openOptions(context, extId)`, add:

```js
// ── The model list (§6.3): for an origin already granted, the form lists the endpoint's models once its address is in ──
{
  await openSection(options, 'translate')
  await options.getByRole('button', { name: '添加服务…', exact: true }).click()
  const form = options.locator('form[data-form="service"]')
  await form.getByLabel('接口地址').fill(BASE_URL)
  const field = form.getByRole('combobox')
  await options.waitForFunction(() => document.querySelector('form[data-form="service"] [role="combobox"]')?.getAttribute('placeholder') === '搜索 1 个模型', null, { timeout: 5_000 }).catch(() => undefined)
  const placeholder = await field.getAttribute('placeholder')
  check('the settings page lists an endpoint\'s models once its address is in, its origin granted', placeholder === '搜索 1 个模型', placeholder)
  await form.getByRole('button', { name: '取消', exact: true }).click()
  await sleep(300)
}
```

- [ ] **Step 4: The spikes that used a failed connection to store a service**

- `experiments/pdf-bilingual/spikes/cache-faults.mjs`: add `seedService` to its import from
  `'../../../tests/e2e/options-page.mjs'`; line 48's
  `console.log('unanswering service:', await addService(options, { name: 'silent', baseURL: 'http://127.0.0.1:9/v1', model: 'x' }))`
  becomes
  `console.log('unanswering service:', await seedService(context.serviceWorkers()[0], { id: 'svc-spksilnt', name: 'silent', baseURL: 'http://127.0.0.1:9/v1', model: 'x' }))`;
  and lines 57–58 swap, so that the fallback's switch is turned back on while the LLM service is still chosen (its row
  shows only then, §6.3): `await setSwitch(options, '出问题时自动改用免费服务', true)` first, then
  `await chooseBuiltIn(options, 'Google 翻译')`. Drop `addService` from the import if nothing else there uses it.
- `experiments/pdf-bilingual/spikes/cache-revisit.mjs`: add `seedService` to the import; line 182's
  `addService(options, { name: 'keyless', baseURL: 'https://example.invalid/v1', model: 'x' })` becomes
  `seedService(context.serviceWorkers()[0], { id: 'svc-spkkeyls', name: 'keyless', baseURL: 'https://example.invalid/v1', model: 'x' })`.
  The `echo` and `refused` services (lines 194, 215) connect when they are added (the endpoint refuses only after
  `refuse = true`) and keep `addService`.
- `experiments/pdf-bilingual/spikes/viewer-faults.mjs`: its import from `'../../../tests/e2e/options-page.mjs'` becomes
  `import { openOptions, seedService, setSwitch } from '../../../tests/e2e/options-page.mjs'` (`addService` has no other
  use there); line 100's
  `console.log('keyless service:', await addService(options, { name: 'keyless', baseURL: 'https://example.invalid/v1', model: 'x' }))`
  becomes
  `console.log('keyless service:', await seedService(context.serviceWorkers()[0], { id: 'svc-spkkeyl2', name: 'keyless', baseURL: 'https://example.invalid/v1', model: 'x' }))`
  (a keyless remote service is one the form will not add).

Run: `for f in tests/e2e/options-page.mjs tests/e2e/extension.mjs tests/e2e/local-endpoint.mjs experiments/pdf-bilingual/spikes/cache-faults.mjs experiments/pdf-bilingual/spikes/cache-revisit.mjs experiments/pdf-bilingual/spikes/viewer-faults.mjs; do node --check $f || exit 1; done`
Expected: exit 0.

- [ ] **Step 5: Run the suites**

```bash
pnpm build && pnpm e2e && pnpm e2e:local-endpoint && pnpm e2e:a11y && pnpm e2e:image && pnpm e2e:layout && pnpm e2e:floating
```

Expected: each exits 0. (`e2e:a11y`, `e2e:image` and `e2e:layout` reach the page through `chooseBuiltIn` and
`setSwitch` only; `setSwitch` finds 图片翻译 in 阅读 by itself, Task 57.)

- [ ] **Step 6: The gate and the commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0. Then `git add` the files and run `node scripts/check-english.mjs`, and set, in
`scripts/english-allowlist.txt`:
- `tests/e2e/options-page.mjs 15` → `tests/e2e/options-page.mjs 16  # …; +1, 2026-09-27: the new services list's controls
  found by their Chinese names — 11 lines in place of the drawer's 10 (Part 5, Task 61)`;
- `tests/e2e/local-endpoint.mjs 2` → `tests/e2e/local-endpoint.mjs 7  # +5, 2026-09-27: the model list's check finds the
  form's controls and its placeholder by their Chinese words (Part 5, Task 61)`.

`extension.mjs` stays at 76 (each replaced block holds as many CJK lines as the one it replaces), `cache-faults.mjs` at 3,
`cache-revisit.mjs` at 1, `viewer-faults.mjs` at 1 (the swapped pair in `cache-faults.mjs` only moves; the other
changed lines hold none). The gate must then pass; where it
names another count, set that one.

```bash
git add tests/e2e/options-page.mjs tests/e2e/extension.mjs tests/e2e/local-endpoint.mjs experiments/pdf-bilingual/spikes/cache-faults.mjs experiments/pdf-bilingual/spikes/cache-revisit.mjs experiments/pdf-bilingual/spikes/viewer-faults.mjs scripts/english-allowlist.txt
node scripts/check-english.mjs
git commit -m "test(e2e): the services list in the browser checks, added only once connected

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 62: the glossary as a table

§6.3 and §11 (T8): 原文 · 译文, one pair a row; a row's remove button shown on its hover or focus; an empty row at the
end to add to (Enter goes on to it); pasting lines of 「原文, 译文」 splits them into rows; a row with a problem says so
at that row (today's reasons without their line numbers); the table saves what is whole, within `GLOSSARY_LIMITS`.
Standalone here; Task 63 mounts it under the 术语表 row.

**Files:**
- Create: `src/entrypoints/options/sections/Glossary.tsx`
- Modify: `src/providers/glossary.ts` (its separator exported)
- Modify: `src/entrypoints/options/ui/settings.css` (append)
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`O.glossary`)
- Modify: `scripts/english-allowlist.txt` (the counts the English gate names)
- Test: `tests/options/glossary.test.ts`

**Interfaces:**
- Consumes: `GLOSSARY_LIMITS`, `configSchema` (`@/config/schema`), `GlossaryEntry` (`@/providers/glossary`), `Status`
  (Task 50), `drafts` (`@/ui/drafts`).
- Produces: `GlossaryTable({ data })`; `entriesOf(lines: readonly { term: string; translation: string }[]): GlossaryEntry[]`;
  `GLOSSARY_SEPARATOR` (`@/providers/glossary`); `O.glossary: { title; hint; count(n); source; target; remove(n); paste; issue: { emptySource; emptyTarget }; tooBig }`.

- [ ] **Step 1: The words, and the separator shared**

In `src/locales/zh-CN.ts`, in `O`, after `appearance: {…},` add:

```ts
  /** §6.3: the glossary, a table (T8) */
  glossary: {
    title: '术语表',
    hint: '让同一篇里的译法一致',
    count: (n: number) => `${n} 条`,
    source: '原文',
    target: '译文',
    remove: (n: number) => `删除第 ${n} 行`,
    paste: '可以直接粘贴多行「原文, 译文」，会自动拆成多行',
    /** today's reasons without their line numbers: the row itself says it */
    issue: { emptySource: '原文为空', emptyTarget: '译文为空' },
    tooBig: '术语表太长，超出上限后没有保存；请减少条目或缩短内容',
  },
```

In `src/locales/en.ts`:

```ts
  glossary: {
    title: 'Glossary',
    hint: 'Keeps a term\'s translation the same throughout',
    count: n => (n === 1 ? '1 term' : `${n} terms`),
    source: 'Source',
    target: 'Translation',
    remove: n => `Remove row ${n}`,
    paste: 'Paste lines of “source, translation” to add several at once',
    issue: { emptySource: 'The source is empty', emptyTarget: 'The translation is empty' },
    tooBig: 'The glossary is too long and was not saved. Remove some entries or shorten them',
  },
```

(`tooBig` is today's `O.prompts.glossaryTooBig`, kept word for word; Task 63 deletes the old key.)

In `src/providers/glossary.ts`, `const SEPARATOR = /[,，\t]/` becomes
`export const GLOSSARY_SEPARATOR = /[,，\t]/` (its comment kept, with "the settings page's table splits a pasted line by
it too" added), and its one use `SEPARATOR.exec(line)` becomes `GLOSSARY_SEPARATOR.exec(line)`.

- [ ] **Step 2: Write the failing tests**

`tests/options/glossary.test.ts`:

```ts
// The glossary's table (the redesign's design, §6.3): the stored pairs and one empty row to add to; a row saved once it
// is whole, a row missing a side saying so once the focus leaves it, a draft held meanwhile; removing; pasting lines;
// the limits; a glossary saved elsewhere followed unless a row of the reader's is unfinished
import { createElement as h } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))

import { GlossaryTable, entriesOf } from '@/entrypoints/options/sections/Glossary'
import { drafts } from '@/ui/drafts'
import { O, setLocale } from '@/ui/strings'

function data(config: Config, patches: Config[] = []): OptionsData {
  return {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(config); patches.push(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
}
const WITH = (glossary: Config['glossary']): Config => ({ ...DEFAULT_CONFIG, glossary })
const cells = (c: HTMLElement) => [...c.querySelectorAll<HTMLInputElement>('.o-gloss input')]
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const paste = (input: HTMLInputElement, text: string) => {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } })
  input.dispatchEvent(event)
}

describe('the glossary\'s table (§6.3)', () => {
  beforeEach(() => { setLocale('en') })

  it('draws the stored pairs, one a row, and an empty row at the end; each row\'s remove button is named by its number', async () => {
    const m = await mountElement(h(GlossaryTable, { data: data(WITH([{ term: 'token', translation: '词元' }, { term: 'embedding', translation: '嵌入' }])) }))
    expect(cells(m.container).map(i => i.value)).toEqual(['token', '词元', 'embedding', '嵌入', '', ''])
    expect([...m.container.querySelectorAll('.o-gloss-remove')].map(b => b.getAttribute('aria-label'))).toEqual([O.glossary.remove(1), O.glossary.remove(2)])
    await m.unmount()
  })

  it('typing in the empty row makes a row, keeps the caret there, and draws a new empty row; whole, it is saved', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(GlossaryTable, { data: data(WITH([]), patches) }))
    type(cells(m.container)[0]!, 'a')
    await m.flush()
    expect(cells(m.container).map(i => i.value)).toEqual(['a', '', '', ''])
    expect(document.activeElement).toBe(cells(m.container)[0])
    expect(patches).toEqual([])
    expect(drafts.any()).toBe(true)
    type(cells(m.container)[1]!, 'b')
    await m.flush()
    expect(patches.at(-1)!.glossary).toEqual([{ term: 'a', translation: 'b' }])
    expect(drafts.any()).toBe(false)
    await m.unmount()
  })

  it('a row missing a side says so once the focus has left it, and Enter goes on to the empty row', async () => {
    const m = await mountElement(h(GlossaryTable, { data: data(WITH([])) }))
    type(cells(m.container)[0]!, 'token')
    await m.flush()
    expect(m.container.querySelector('.o-gloss-issue')).toBeNull()
    cells(m.container)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await m.flush()
    expect(document.activeElement).toBe(cells(m.container)[2])
    cells(m.container)[0]!.closest('.o-gloss-line')!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: cells(m.container)[2]! }))
    await m.flush()
    expect(m.container.querySelector('.o-gloss-issue')!.textContent).toBe(O.glossary.issue.emptyTarget)
    await m.unmount()
  })

  it('a row removed is saved without it', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(GlossaryTable, { data: data(WITH([{ term: 'a', translation: '1' }, { term: 'b', translation: '2' }]), patches) }))
    m.container.querySelector<HTMLButtonElement>('.o-gloss-remove')!.click()
    await m.flush()
    expect(patches.at(-1)!.glossary).toEqual([{ term: 'b', translation: '2' }])
    await m.unmount()
  })

  it('pasting lines of "source, translation" pairs splits them into rows; a line without its other side says so at once', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(GlossaryTable, { data: data(WITH([]), patches) }))
    paste(cells(m.container)[0]!, 'token, 词元\n# a comment\nembedding，嵌入\nattention\n')
    await m.flush()
    expect(cells(m.container).map(i => i.value)).toEqual(['token', '词元', 'embedding', '嵌入', 'attention', '', '', ''])
    expect(patches.at(-1)!.glossary).toEqual([{ term: 'token', translation: '词元' }, { term: 'embedding', translation: '嵌入' }])
    expect([...m.container.querySelectorAll('.o-gloss-issue')].map(e => e.textContent)).toEqual([O.glossary.issue.emptyTarget])
    await m.unmount()
  })

  it('a table over the limits saves nothing and says so', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(GlossaryTable, { data: data(WITH([]), patches) }))
    paste(cells(m.container)[0]!, Array.from({ length: 201 }, (_, i) => `t${i}, r${i}`).join('\n'))
    await m.flush()
    expect(patches).toEqual([])
    expect(m.container.textContent).toContain(O.glossary.tooBig)
    await m.unmount()
  })

  it('follows a glossary saved elsewhere — not while a row of the reader\'s is unfinished', async () => {
    const m = await mountElement(h(GlossaryTable, { data: data(WITH([{ term: 'a', translation: '1' }])) }))
    await m.rerender(h(GlossaryTable, { data: data(WITH([{ term: 'a', translation: '1' }, { term: 'b', translation: '2' }])) }))
    expect(cells(m.container).map(i => i.value)).toEqual(['a', '1', 'b', '2', '', ''])
    type(cells(m.container)[4]!, 'c')
    await m.flush()
    await m.rerender(h(GlossaryTable, { data: data(WITH([{ term: 'z', translation: '9' }])) }))
    expect(cells(m.container)[0]!.value).toBe('a')
    await m.unmount()
  })

  it('keeps a later row of the same term, in the first one\'s place', () => {
    expect(entriesOf([{ term: 'a', translation: '1' }, { term: 'b', translation: '2' }, { term: ' a ', translation: '3' }, { term: 'c', translation: '' }]))
      .toEqual([{ term: 'a', translation: '3' }, { term: 'b', translation: '2' }])
  })
})
```

(The test file's Chinese is data typed into the table, as the old glossary tests' was — five lines, the two stored pairs
and their read-back, the pasted batch and its two read-backs: give the file its entry in `scripts/english-allowlist.txt`,
`tests/options/glossary.test.ts 5  # 2026-09-27: the glossary's pairs, typed and pasted in the reader's language (Part 5,
Task 62)`.)

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run tests/options/glossary.test.ts`
Expected: FAIL — `Failed to resolve import "@/entrypoints/options/sections/Glossary"`.

- [ ] **Step 4: Write the table**

`src/entrypoints/options/sections/Glossary.tsx`:

```tsx
// The glossary (the redesign's design, §6.3; T8): a table in place, source · translation, one pair a row, and one empty
// row at the end to add to — typing in it makes it a row and draws a new empty one; Enter goes on to it. Pasting lines
// of source-and-translation pairs splits them into rows. A row missing a side says so at the row once the focus has left it (today's
// reasons, without their line numbers). The table saves the rows that are whole, and only when they fit GLOSSARY_LIMITS
// (the schema refuses the rest, and a refused write would leave the reader looking at a glossary that is not stored,
// Codex on #157); over the limits it says so. It follows a glossary saved elsewhere unless a row of the reader's is
// unfinished (Codex on #185), and holds a draft while one is, while it is over the limits, or after a refused write
import { X } from 'lucide'
import { type ClipboardEvent, type FocusEvent, type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { GLOSSARY_LIMITS, configSchema } from '@/config/schema'
import { GLOSSARY_SEPARATOR, type GlossaryEntry } from '@/providers/glossary'
import { Icon } from '@/ui/controls/Icon'
import { drafts } from '@/ui/drafts'
import { O } from '@/ui/strings'
import type { OptionsData } from '../data'
import { Status } from '../ui/Row'

interface Line { key: number; term: string; translation: string; left: boolean }
type Side = 'term' | 'translation'
/** the empty row's cells, in the map of cells */
const EMPTY = -1

/** The whole rows, trimmed; a later row of a term wins, in the first one's place (providers/glossary.ts's rule) */
export function entriesOf(lines: readonly { term: string; translation: string }[]): GlossaryEntry[] {
  const out: GlossaryEntry[] = []
  const at = new Map<string, number>()
  for (const line of lines) {
    const term = line.term.trim()
    const translation = line.translation.trim()
    if (!term || !translation) continue
    const i = at.get(term)
    if (i === undefined) {
      at.set(term, out.length)
      out.push({ term, translation })
    } else out[i] = { term, translation }
  }
  return out
}
const same = (a: readonly GlossaryEntry[], b: readonly GlossaryEntry[]) => a.length === b.length && a.every((e, i) => e.term === b[i]!.term && e.translation === b[i]!.translation)
const fits = (entries: readonly GlossaryEntry[]) => configSchema.shape.glossary.safeParse(entries).success
const issueOf = (line: Line): 'emptySource' | 'emptyTarget' | null => {
  const term = line.term.trim()
  const translation = line.translation.trim()
  if (!term && !translation) return null
  return !term ? 'emptySource' : !translation ? 'emptyTarget' : null
}

export function GlossaryTable({ data }: { data: OptionsData }) {
  const { config, patch } = data
  const ids = useId()
  const nextKey = useRef(0)
  const toLines = (entries: readonly GlossaryEntry[]): Line[] => entries.map(e => ({ key: nextKey.current++, term: e.term, translation: e.translation, left: false }))
  const [lines, setLines] = useState<Line[]>(() => toLines(config?.glossary ?? []))
  /** the glossary this table last wrote or last took: a stored value equal to it is not news */
  const own = useRef<readonly GlossaryEntry[]>(config?.glossary ?? [])
  /** writes not landed yet: while one is out, the store is behind the reader */
  const pending = useRef(0)
  const [failed, setFailed] = useState(false)
  const cells = useRef(new Map<string, HTMLInputElement>())
  /** the cell a new row's first letter went into: it takes the focus once drawn */
  const focusNext = useRef<string | null>(null)
  const entries = entriesOf(lines)
  const over = !fits(entries)
  const unfinished = lines.some(line => issueOf(line) !== null)
  const held = unfinished || over || failed
  useEffect(() => (held ? drafts.hold() : undefined), [held])

  const stored = config?.glossary
  // the stored glossary, when it is news: never the reader's own writes coming back, never over their unfinished rows
  const quiet = useRef({ held, pending })
  quiet.current = { held, pending }
  // biome-ignore lint/correctness/useExhaustiveDependencies: followed as the stored glossary changes; the rest is read as of then
  useEffect(() => {
    if (!stored || same(stored, own.current) || quiet.current.pending.current > 0 || quiet.current.held) return
    own.current = stored
    setLines(toLines(stored))
  }, [stored])
  useLayoutEffect(() => {
    const id = focusNext.current
    if (!id) return
    focusNext.current = null
    const cell = cells.current.get(id)
    cell?.focus()
    cell?.setSelectionRange(cell.value.length, cell.value.length)
  })

  const change = (after: Line[]) => {
    setLines(after)
    const next = entriesOf(after)
    if (same(next, own.current) || !fits(next)) return
    own.current = next
    pending.current++
    patch(latest => ({ ...latest, glossary: next })).then(() => setFailed(false), () => setFailed(true)).finally(() => { pending.current-- })
  }
  const set = (key: number, side: Side, value: string) => change(lines.map(line => (line.key === key ? { ...line, [side]: value } : line)))
  const begin = (side: Side, value: string) => {
    const line: Line = { key: nextKey.current++, term: '', translation: '', left: false, [side]: value }
    focusNext.current = `${line.key}:${side}`
    change([...lines, line])
  }
  const remove = (key: number) => {
    const at = lines.findIndex(line => line.key === key)
    const neighbour = lines[at + 1] ?? lines[at - 1]
    cells.current.get(neighbour ? `${neighbour.key}:term` : `${EMPTY}:term`)?.focus()
    change(lines.filter(line => line.key !== key))
  }
  const leave = (key: number, e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setLines(ls => ls.map(line => (line.key === key && !line.left ? { ...line, left: true } : line)))
  }
  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!/\r?\n/.test(text.trim())) return
    e.preventDefault()
    const pasted = text.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')).map(s => {
      const at = s.search(GLOSSARY_SEPARATOR)
      return { key: nextKey.current++, term: at < 0 ? s : s.slice(0, at).trim(), translation: at < 0 ? '' : s.slice(at + 1).trim(), left: true }
    })
    change([...lines, ...pasted])
  }
  const enter = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    cells.current.get(`${EMPTY}:term`)?.focus()
  }
  const cellRef = (key: number, side: Side) => (el: HTMLInputElement | null) => {
    if (el) cells.current.set(`${key}:${side}`, el)
    else cells.current.delete(`${key}:${side}`)
  }
  const max = { term: GLOSSARY_LIMITS.term, translation: GLOSSARY_LIMITS.translation }

  return (
    <div className="o-gloss">
      <div className="o-gloss-row o-gloss-head" aria-hidden="true"><span>{O.glossary.source}</span><span>{O.glossary.target}</span><span /></div>
      {lines.map((line, i) => {
        const issue = line.left ? issueOf(line) : null
        const issueId = `${ids}-${line.key}`
        return (
          <div key={line.key} className="o-gloss-line" onBlur={e => leave(line.key, e)}>
            <div className="o-gloss-row">
              {(['term', 'translation'] as const).map(side => (
                <input key={side} ref={cellRef(line.key, side)} value={line[side]} maxLength={max[side]} autoComplete="off" spellCheck={false}
                  aria-label={`${side === 'term' ? O.glossary.source : O.glossary.target} ${i + 1}`}
                  aria-invalid={issue === (side === 'term' ? 'emptySource' : 'emptyTarget') || undefined} aria-describedby={issue ? issueId : undefined}
                  onChange={e => set(line.key, side, e.target.value)} onPaste={paste} onKeyDown={enter} />
              ))}
              <button type="button" className="o-gloss-remove" aria-label={O.glossary.remove(i + 1)} onClick={() => remove(line.key)}><Icon node={X} size={14} /></button>
            </div>
            {issue && <div id={issueId} className="o-gloss-issue"><Status tone="alert">{O.glossary.issue[issue]}</Status></div>}
          </div>
        )
      })}
      <div className="o-gloss-line">
        <div className="o-gloss-row">
          {(['term', 'translation'] as const).map(side => (
            <input key={side} ref={cellRef(EMPTY, side)} value="" maxLength={max[side]} autoComplete="off" spellCheck={false}
              placeholder={side === 'term' ? O.glossary.source : O.glossary.target} aria-label={side === 'term' ? O.glossary.source : O.glossary.target}
              onChange={e => begin(side, e.target.value)} onPaste={paste} />
          ))}
          <span />
        </div>
      </div>
      {over && <p className="o-gloss-note"><Status tone="alert">{O.glossary.tooBig}</Status></p>}
    </div>
  )
}
```

- [ ] **Step 5: The table's rules**

Append to `src/entrypoints/options/ui/settings.css`:

```css
/* ---- Task 62: the glossary's table (§6.3) ---- */
@layer components {
  /* from the words' edge (42) to the trailing edge (14), in the card: its 4 px and 38 / 10 of its own */
  .o-gloss { margin: 2px 10px 12px 38px; border-radius: 8px; box-shadow: inset 0 0 0 0.5px var(--field-edge); overflow: hidden; }
  .o-gloss-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 32px; align-items: center; }
  .o-gloss-line + .o-gloss-line, .o-gloss-head + .o-gloss-line { box-shadow: inset 0 0.5px 0 var(--chrome-line); }
  .o-gloss-head { height: 28px; background: var(--field); color: var(--ink-2); font-size: 11.5px; }
  .o-gloss-head span { padding: 0 10px; }
  .o-gloss input { box-sizing: border-box; height: 32px; min-width: 0; padding: 0 10px; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 13px; }
  .o-gloss input:focus { outline: none; background: color-mix(in oklab, var(--ink) 4%, transparent); }
  html:not([data-axt-pointer]) .o-gloss input:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
  .o-gloss input::placeholder { color: var(--ink-2); }
  /* a row's remove button, on its hover or its focus, always on a touch screen */
  .o-gloss-remove { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--ink-3); cursor: pointer; opacity: 0; transition: opacity 150ms ease-out; }
  .o-gloss-line:hover .o-gloss-remove, .o-gloss-line:focus-within .o-gloss-remove { opacity: 1; }
  @media (hover: none) { .o-gloss-remove { opacity: 1; } }
  .o-gloss-issue { padding: 0 10px 8px; }
  .o-gloss-note { margin: 0; padding: 8px 10px; box-shadow: inset 0 0.5px 0 var(--chrome-line); }
  .o-gloss-hint { margin: -4px 10px 12px 38px; color: var(--ink-2); font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) { .o-gloss-remove { transition: none; } }
```

- [ ] **Step 6: Run the tests, the gate, and commit**

Run: `pnpm vitest run tests/options/glossary.test.ts tests/providers && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0. Then `git add` the files and run `node scripts/check-english.mjs`: with the new entry
`tests/options/glossary.test.ts 5` (Step 2) it passes; `src/providers/glossary.ts` keeps its 3 (the separator's line
holds its full-width comma before and after).

```bash
git add src/entrypoints/options/sections/Glossary.tsx src/providers/glossary.ts src/entrypoints/options/ui/settings.css src/locales/zh-CN.ts src/locales/en.ts tests/options/glossary.test.ts scripts/english-allowlist.txt
node scripts/check-english.mjs
git commit -m "feat(options): the glossary as a table, pasting splits lines

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 63: the LLM group — the prompts, the glossary's row

§6.3's last group: 「LLM」 with the aside 「提示词与术语表只对 LLM 服务生效」, or, with no LLM service, one line. 提示词: its
value the prompt in use, its description the prompt's; opened, a radio list in place, each prompt with its description
(one's own 「我的」 and the start of its instructions); the chosen prompt's text under it read as words — the variables
as small labels, in 指令 and 消息 —; a built-in copied to be changed (「{名称}（副本）」, opened); one's own written in
place, the variables inserted from a row of labels, 完成 closing the list, 删除 with the undo row; the list ends with
「＋ 新建提示词…」, 导入… and 导出…. 术语表 「让同一篇里的译法一致」, its value the count, opening Task 62's table. The old
prompts section and its manager go.

**Files:**
- Create: `src/entrypoints/options/sections/PromptText.tsx`, `src/entrypoints/options/sections/Llm.tsx`
- Rewrite: `src/entrypoints/options/sections/Prompts.tsx`
- Delete: `src/entrypoints/options/PromptManager.tsx`, `tests/options/prompt-manager.test.ts`
- Modify: `src/entrypoints/options/sections/Translate.tsx` (the group at its end), `src/entrypoints/options/App.tsx`
- Modify: `src/entrypoints/options/ui/settings.css` (append)
- Modify: `src/locales/zh-CN.ts`, `src/locales/en.ts` (`O.prompts` rewritten, `O.llm`)
- Rewrite: `tests/options/prompts-section.test.ts`
- Modify: `tests/ui/locales.test.ts` (the per-line glossary sentence's case goes with the text box)
- Modify: `tests/e2e/extension.mjs` (the prompt's check)
- Modify: `scripts/english-allowlist.txt` (the counts the English gate names)

**Interfaces:**
- Consumes: `BUILT_IN_PROMPTS`, `DEFAULT_PROMPT_ID`, `PROMPT_TOKENS`, `getTokenCellText`, `promptExists`, `selectPrompt`
  (`@/providers/prompt-library`), `readPromptFile`, `downloadPromptFile`, `PromptFileFormatError` (`@/providers/prompt-file`),
  `GlossaryTable` (Task 62), `UndoRow`, `withUndo`, `insertAt`, `withItem` (Task 51), `Row`, `Value`, `Status`, `Card`,
  `GroupHeading` (Task 50); Part 3's `Reveal`, `Field`, `TextInput`, `Button`.
- Produces: `Llm({ data })`; `PromptsRow({ data })`; `PromptText({ text, editable, label, onText, onFocus, ref })`,
  `promptParts(text)`, `readPrompt(el)`, `insertToken(el, token)`, `plainWords(text)`; the words `O.prompts` (below),
  `O.llm: { aside; empty }`.

- [ ] **Step 1: The words**

In `src/locales/zh-CN.ts`, replace the whole `prompts: { … },` of `O` (the manager's words, the glossary's text box's —
§10's list of words that go) with:

```ts
  /** §6.3: the prompts, read as words */
  prompts: {
    title: '提示词',
    mine: '我的',
    copy: '复制后修改',
    locked: '内置提示词不能直接改',
    done: '完成',
    delete: '删除',
    create: '新建提示词…',
    import: '导入…',
    export: '导出…',
    newName: '新提示词',
    name: '名称',
    /** a prompt's two parts, named for what they do; nothing names the protocol the extension appends after them */
    parts: { system: ['指令', '翻译时始终遵守的要求'], user: ['消息', '每次随原文一起发送'] },
    /** its variables, drawn as labels, never {{…}} */
    tokens: { targetLanguage: '目标语言', input: '原文', paperTitle: '论文标题', abstract: '摘要', sectionTitle: '章节标题', glossary: '术语表' },
    /** What a copy of a built-in prompt is called */
    copyOf: (name: string) => `${name}（副本）`,
    /** The descriptions of the two prompts shipped with the extension, by id */
    builtIn: {
      default: '通用学术翻译：术语用既定译法，人名、期刊名、代码与链接保留原文',
      'precision-rewrite': '"翻译即改写"：摆脱原文句法、消除翻译腔，按目标语言的表达习惯重写，术语与格式照旧',
    },
    imported: (n: number) => `已导入 ${n} 条`,
    importFailed: { cantRead: '无法读取这个文件', noPrompts: '这个文件里没有可用的提示词' },
    nameEmpty: '名称不能为空',
    messageEmpty: '消息不能为空',
  },
  /** §6.3: the LLM group */
  llm: { aside: '提示词与术语表只对 LLM 服务生效', empty: '添加 LLM 服务后可设置提示词与术语表' },
```

In `src/locales/en.ts`, the same:

```ts
  prompts: {
    title: 'Prompts',
    mine: 'Mine',
    copy: 'Copy to edit',
    locked: 'Built-in prompts can\'t be changed',
    done: 'Done',
    delete: 'Delete',
    create: 'New prompt…',
    import: 'Import…',
    export: 'Export…',
    newName: 'New prompt',
    name: 'Name',
    parts: { system: ['Instructions', 'Followed in every translation'], user: ['Message', 'Sent with each passage'] },
    tokens: { targetLanguage: 'Target language', input: 'Source text', paperTitle: 'Paper title', abstract: 'Abstract', sectionTitle: 'Section title', glossary: 'Glossary' },
    copyOf: name => `${name} copy`,
    builtIn: {
      default: 'General academic translation: settled terms, and names, journals, code and links left as they are',
      'precision-rewrite': 'Translation as rewriting: leaves the source syntax behind and writes the sentence the way the target language would, with terms and formatting unchanged',
    },
    imported: n => (n === 1 ? 'Imported 1' : `Imported ${n}`),
    importFailed: { cantRead: 'This file can\'t be read', noPrompts: 'This file holds no prompts' },
    nameEmpty: 'A name is needed',
    messageEmpty: 'The message can\'t be empty',
  },
  llm: { aside: 'Prompts and the glossary apply to LLM services only', empty: 'Add an LLM service to set prompts and a glossary' },
```

In `tests/ui/locales.test.ts`, delete the case `it('the per-line glossary problem sentence is assembled by the pack, …')`
inside `describe('copy names', …)`: the table's reasons carry no line number (§6.3), and `O.prompts.glossaryIssue` goes.

- [ ] **Step 2: Write the failing tests**

`tests/options/prompts-section.test.ts` (the whole file):

```ts
// The LLM group (the redesign's design, §6.3): one line with no LLM service; the prompts row and its list in place; a
// prompt read as words — variables as labels, in two named parts — and its {{token}} form kept through reading and
// writing; a built-in copied to be changed; one's own written in place when whole, a draft held when not; a variable
// inserted at the caret; new, delete with its undo; import and export
import { createElement as h, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { BUILT_IN_PROMPTS, getTokenCellText } from '@/providers/prompt-library'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const wire = vi.hoisted(() => ({ downloads: [] as { name: string; text: string }[] }))
vi.mock('@/shared/download', () => ({ downloadTextFile: (name: string, text: string) => { wire.downloads.push({ name, text }) } }))

import { Llm } from '@/entrypoints/options/sections/Llm'
import { PromptText, promptParts, readPrompt } from '@/entrypoints/options/sections/PromptText'
import { UNDO_MS } from '@/entrypoints/options/ui/UndoRow'
import { drafts } from '@/ui/drafts'
import { O, S, setLocale } from '@/ui/strings'

const SVC = { id: 'svc-mine0000', kind: 'openai-compat' as const, name: 'Mine', baseURL: 'https://api.example.com/v1', apiKey: 'k', model: 'm', thinking: 'disabled' as const }
const MINE = { id: 'p-mine', name: 'My prompt', systemPrompt: `Translate into ${getTokenCellText('targetLanguage')} carefully.`, prompt: getTokenCellText('input') }
const LLM: Config = { ...DEFAULT_CONFIG, services: [SVC], provider: SVC.id }

function Harness({ start, patches }: { start: Config; patches: Config[] }) {
  const [config, setConfig] = useState(start)
  const data: OptionsData = {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(config); patches.push(next); setConfig(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
  return h(Llm, { data })
}
const promptsRow = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('[data-row="translate/prompts"]')!
const radios = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(`[role="radiogroup"][aria-label="${O.prompts.title}"] [role="radio"]`)]
const nameOf = (r: HTMLElement) => document.getElementById(r.getAttribute('aria-labelledby')!)!.textContent
const button = (c: HTMLElement, name: string) => [...c.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === name)!
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const write = (el: HTMLElement, text: string) => {
  el.textContent = text
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('the LLM group (§6.3)', () => {
  beforeEach(() => { setLocale('en'); vi.useFakeTimers({ shouldAdvanceTime: true }); wire.downloads.length = 0 })
  afterEach(() => { vi.useRealTimers() })

  it('with no LLM service it is one line', async () => {
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches: [] }))
    expect(m.container.querySelector('[data-heading] h2')!.textContent).toBe(S.service.llm)
    expect(m.container.textContent).toContain(O.llm.empty)
    expect(m.container.querySelector('[data-row="translate/prompts"]')).toBeNull()
    await m.unmount()
  })

  it('the prompts row says the prompt in use; opened, a radio list — the built-ins, then one\'s own with O.prompts.mine', async () => {
    const start = { ...LLM, prompts: { promptId: 'default', patterns: [MINE] } }
    const m = await mountElement(h(Harness, { start, patches: [] }))
    expect(m.container.querySelector('.o-aside')!.textContent).toBe(O.llm.aside)
    expect(promptsRow(m.container).textContent).toContain('Default')
    expect(promptsRow(m.container).textContent).toContain(O.prompts.builtIn.default)
    promptsRow(m.container).click()
    await m.flush()
    expect(promptsRow(m.container).getAttribute('aria-expanded')).toBe('true')
    expect(radios(m.container).map(nameOf)).toEqual(['Default', 'Precision rewrite', `My prompt${O.prompts.mine}`])
    expect(m.container.textContent).toContain('Translate into Target language carefully.')
    await m.unmount()
  })

  it('the chosen built-in reads as words: variables as labels in the instructions and the message, never {{…}}; it is copied to be changed', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: LLM, patches }))
    promptsRow(m.container).click()
    await m.flush()
    const panel = m.container.querySelector<HTMLElement>('.o-prompt')!
    expect(panel.textContent).not.toContain('{{')
    expect([...panel.querySelectorAll('.o-var')].map(v => v.textContent)).toContain(O.prompts.tokens.targetLanguage)
    expect([...panel.querySelectorAll('.o-part-title b')].map(b => b.textContent)).toEqual([O.prompts.parts.system[0], O.prompts.parts.user[0]])
    expect(panel.textContent).toContain(O.prompts.locked)
    button(panel, O.prompts.copy).click()
    await m.flush()
    const prompts = patches.at(-1)!.prompts
    expect(prompts.patterns.at(-1)).toMatchObject({ name: O.prompts.copyOf('Default'), systemPrompt: BUILT_IN_PROMPTS.default!.systemPrompt, prompt: BUILT_IN_PROMPTS.default!.prompt })
    expect(prompts.promptId).toBe(prompts.patterns.at(-1)!.id)
    expect(document.activeElement).toBe(m.container.querySelector('.o-prompt input'))
    await m.unmount()
  })

  it('one\'s own is written in place when whole; an empty message is not written, holds a draft, and Done says why', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: MINE.id, patterns: [MINE] } }, patches }))
    promptsRow(m.container).click()
    await m.flush()
    const [system, message] = [...m.container.querySelectorAll<HTMLElement>('.o-prompt-text[data-editable]')]
    type(m.container.querySelector<HTMLInputElement>('.o-prompt input')!, 'Renamed')
    await m.flush()
    expect(patches.at(-1)!.prompts.patterns[0]!.name).toBe('Renamed')
    write(system!, 'Be brief.')
    await m.flush()
    expect(patches.at(-1)!.prompts.patterns[0]!.systemPrompt).toBe('Be brief.')
    const before = patches.length
    write(message!, '   ')
    await m.flush()
    expect(patches).toHaveLength(before)
    expect(drafts.any()).toBe(true)
    button(m.container, O.prompts.done).click()
    await m.flush()
    expect(m.container.textContent).toContain(O.prompts.messageEmpty)
    expect(promptsRow(m.container).getAttribute('aria-expanded')).toBe('true')
    await m.unmount()
  })

  it('a variable is inserted from the labels where the caret was, and written in its {{token}} form', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: MINE.id, patterns: [MINE] } }, patches }))
    promptsRow(m.container).click()
    await m.flush()
    const message = m.container.querySelectorAll<HTMLElement>('.o-prompt-text[data-editable]')[1]!
    message.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    const range = document.createRange()
    range.setStart(message, 0)
    range.collapse(true)
    getSelection()!.removeAllRanges()
    getSelection()!.addRange(range)
    ;[...m.container.querySelectorAll<HTMLButtonElement>('.o-vars button')].find(b => b.textContent === O.prompts.tokens.glossary)!.click()
    await m.flush()
    expect(patches.at(-1)!.prompts.patterns[0]!.prompt).toBe(`${getTokenCellText('glossary')}${getTokenCellText('input')}`)
    await m.unmount()
  })

  it('New prompt… makes a new prompt (O.prompts.newName), chosen and open; deleting one\'s own is undone within 5 s, and it comes back chosen', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: LLM, patches }))
    promptsRow(m.container).click()
    await m.flush()
    button(m.container, O.prompts.create).click()
    await m.flush()
    const made = patches.at(-1)!.prompts
    expect(made.patterns.at(-1)!.name).toBe(O.prompts.newName)
    expect(made.promptId).toBe(made.patterns.at(-1)!.id)
    button(m.container, O.prompts.delete).click()
    await m.flush()
    expect(patches.at(-1)!.prompts).toEqual({ promptId: 'default', patterns: [] })
    const undo = m.container.querySelector<HTMLElement>('[data-undo]')!
    expect(undo.textContent).toContain(O.undo.deleted(O.prompts.newName))
    button(undo, O.undo.undo).click()
    await m.flush()
    expect(patches.at(-1)!.prompts.promptId).toBe(made.promptId)
    button(m.container, O.prompts.delete).click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(m.container.querySelector('[data-undo]')).toBeNull()
    await m.unmount()
  })

  it('import adds the file\'s prompts and says how many; a file that is not JSON cannot be read; export shows once there is one of one\'s own', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: LLM, patches }))
    promptsRow(m.container).click()
    await m.flush()
    expect(button(m.container, O.prompts.export)).toBeUndefined()
    const input = m.container.querySelector<HTMLInputElement>('input[type="file"]')!
    const give = async (text: string) => {
      Object.defineProperty(input, 'files', { configurable: true, value: [new File([text], 'p.json', { type: 'application/json' })] })
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await m.flush()
      await m.flush()
    }
    await give('not json')
    expect(m.container.textContent).toContain(O.prompts.importFailed.cantRead)
    await give('[]')
    expect(m.container.textContent).toContain(O.prompts.importFailed.noPrompts)
    await give(JSON.stringify([{ name: 'Imported', prompt: '{{input}}' }]))
    expect(m.container.textContent).toContain(O.prompts.imported(1))
    expect(patches.at(-1)!.prompts.patterns.map(p => p.name)).toEqual(['Imported'])
    button(m.container, O.prompts.export).click()
    expect(JSON.parse(wire.downloads[0]!.text)).toEqual([{ name: 'Imported', systemPrompt: '', prompt: '{{input}}' }])
    await m.unmount()
  })
})

describe('a prompt read as words (§6.3)', () => {
  beforeEach(() => { setLocale('en') })

  it('keeps its {{token}} form through reading and writing: each built-in drawn and read back is itself', async () => {
    for (const p of Object.values(BUILT_IN_PROMPTS)) {
      for (const text of [p.systemPrompt, p.prompt]) {
        const m = await mountElement(h(PromptText, { text, label: 'x' }))
        expect(readPrompt(m.container.querySelector('.o-prompt-text')!)).toBe(text)
        await m.unmount()
      }
    }
    expect(promptParts(`a ${getTokenCellText('input')} b`)).toEqual([{ text: 'a ' }, { token: 'input' }, { text: ' b' }])
  })

  it('reads a line the browser broke with an element as one line', () => {
    const el = document.createElement('div')
    el.innerHTML = 'one<br>two<div>three</div><span data-token="input">Source text</span>'
    expect(readPrompt(el)).toBe(`one\ntwo\nthree${getTokenCellText('input')}`)
  })
})
```

Delete `tests/options/prompt-manager.test.ts` (its `withSaved` cases are this file's "written in place" and Task 51's
`withItem`).

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run tests/options/prompts-section.test.ts`
Expected: FAIL — `Failed to resolve import "@/entrypoints/options/sections/Llm"`.

- [ ] **Step 4: Write a prompt read as words**

`src/entrypoints/options/sections/PromptText.tsx`:

```tsx
// A prompt's text read as words (the redesign's design, §6.3): its variables drawn as small labels, never {{…}}. One's
// own is written here too — plain text (a paste stays plain), its labels atoms a caret passes over whole — and read back
// into its {{token}} form as it changes. The editable text is drawn once, from the text it opened with, and then left to
// the reader: React leaves alone the children it drew the same way
import { Fragment, type Ref, useState } from 'react'
import { PROMPT_TOKENS, type PromptToken, getTokenCellText } from '@/providers/prompt-library'
import { O } from '@/ui/strings'

const TOKEN = new RegExp(`\\{\\{(${PROMPT_TOKENS.join('|')})\\}\\}`, 'g')

export type PromptPart = { text: string } | { token: PromptToken }

/** The text as runs of words and variables */
export function promptParts(text: string): PromptPart[] {
  const out: PromptPart[] = []
  let at = 0
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) })
    out.push({ token: m[1] as PromptToken })
    at = m.index + m[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

/** What a text says with its variables by their labels, on one line: one's own prompt is described by its start */
export function plainWords(text: string): string {
  return text.replace(TOKEN, (_, token: PromptToken) => O.prompts.tokens[token]).replace(/\s+/g, ' ').trim()
}

/** The text a field holds, its labels back in their {{token}} form; a line the browser broke with an element counts once */
export function readPrompt(el: Node): string {
  let out = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? ''
    else if (node instanceof HTMLElement) {
      if (node.dataset.token) out += getTokenCellText(node.dataset.token as PromptToken)
      else if (node.tagName === 'BR') out += '\n'
      else out += (out && !out.endsWith('\n') ? '\n' : '') + readPrompt(node)
    }
  }
  return out
}

const labelOf = (token: PromptToken, key: number) => <span key={key} className="o-var" data-token={token} contentEditable={false}>{O.prompts.tokens[token]}</span>
const draw = (parts: PromptPart[]) => parts.map((p, i) => ('token' in p ? labelOf(p.token, i) : <Fragment key={i}>{p.text}</Fragment>))

/** A variable put where the caret is in `el` (at its end when the caret is elsewhere), the caret after it */
export function insertToken(el: HTMLElement, token: PromptToken): void {
  const doc = el.ownerDocument
  const chip = doc.createElement('span')
  chip.className = 'o-var'
  chip.dataset.token = token
  chip.contentEditable = 'false'
  chip.textContent = O.prompts.tokens[token]
  const selection = doc.getSelection()
  const range = selection && selection.rangeCount > 0 && el.contains(selection.getRangeAt(0).startContainer) ? selection.getRangeAt(0) : null
  if (range) {
    range.deleteContents()
    range.insertNode(chip)
  } else el.append(chip)
  el.focus()
  const after = doc.createRange()
  after.setStartAfter(chip)
  after.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(after)
}

export function PromptText({ text, editable = false, label, onText, onFocus, ref }: {
  text: string
  editable?: boolean
  label: string
  onText?: (text: string) => void
  onFocus?: () => void
  ref?: Ref<HTMLDivElement>
}) {
  const [drawn] = useState(() => draw(promptParts(text)))
  if (!editable) return <div className="o-prompt-text">{draw(promptParts(text))}</div>
  return (
    <div ref={ref} className="o-prompt-text" data-editable="" role="textbox" aria-multiline="true" aria-label={label} tabIndex={0}
      contentEditable="plaintext-only" suppressContentEditableWarning onFocus={onFocus} onInput={e => onText?.(readPrompt(e.currentTarget))}>
      {drawn}
    </div>
  )
}
```

- [ ] **Step 5: Write the prompts**

`src/entrypoints/options/sections/Prompts.tsx` (the whole file):

```tsx
// The prompts (the redesign's design, §6.3): the row's value is the prompt in use, its description the prompt's.
// Opened, a radio list in place: each prompt with its description, one's own carrying its tag (O.prompts.mine) and the
// start of its instructions. The chosen prompt shows its text under it, read as words, in two parts named for what
// they do — the instructions and the message —; nothing names the protocol the extension appends. A built-in cannot be
// changed: Copy to edit makes one's own copy and opens it. One's own is written in place — its name, its two parts, the
// variables inserted from a row of labels — each change stored at once when it holds a name and a message; Done closes
// the list; Delete is undone. The list ends with the new-prompt row and, at the same row's end, Import… and Export…
// (the maintainer: in the list, not in a menu)
import { Plus } from 'lucide'
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react'
import { PromptFileFormatError, downloadPromptFile, readPromptFile } from '@/providers/prompt-file'
import {
  BUILT_IN_PROMPTS, DEFAULT_PROMPT_ID, PROMPT_TOKENS, type PromptToken, type PromptTemplate, type PromptsConfig,
  getTokenCellText, promptExists, selectPrompt,
} from '@/providers/prompt-library'
import { getRandomUUID as uuid } from '@/shared/uuid'
import { Button } from '@/ui/controls/Button'
import { Field, TextInput } from '@/ui/controls/Field'
import { Icon } from '@/ui/controls/Icon'
import { radioKeys } from '@/ui/controls/radio'
import { Reveal } from '@/ui/controls/Reveal'
import { drafts } from '@/ui/drafts'
import { O } from '@/ui/strings'
import type { OptionsData } from '../data'
import { insertAt, withItem, withUndo } from '../ui/lists'
import { Row, Status, Value } from '../ui/Row'
import { UndoRow } from '../ui/UndoRow'
import { PromptText, insertToken, plainWords, readPrompt } from './PromptText'

/** A new prompt's start: it names the target language and carries the source text, so a name alone makes it work (Codex on #39) */
const NEW_SYSTEM_PROMPT = `You are a professional ${getTokenCellText('targetLanguage')} translator of academic papers.`
const NEW_USER_PROMPT = `Translate the following into ${getTokenCellText('targetLanguage')}:\n\n${getTokenCellText('input')}`

const isBuiltIn = (p: PromptTemplate) => Object.hasOwn(BUILT_IN_PROMPTS, p.id)
const describe = (p: PromptTemplate) => (isBuiltIn(p) ? (O.prompts.builtIn as Record<string, string>)[p.id] ?? '' : plainWords(p.systemPrompt).slice(0, 120))

export function PromptsRow({ data }: { data: OptionsData }) {
  const [open, setOpen] = useState(false)
  const row = useRef<HTMLButtonElement>(null)
  const chosen = selectPrompt(data.config!.prompts)
  return (
    <>
      <Row kind="button" row="translate/prompts" words={O.search.keywords['translate/prompts']} label={O.prompts.title}
        // the row's own description steps aside while the list under it says the same (settings-2)
        description={open ? undefined : describe(chosen)} trailing={<Value>{chosen.name}</Value>} expanded={open} buttonProps={{ ref: row }}
        onPress={() => setOpen(o => !o)} />
      <Reveal open={open}>
        <PromptList data={data} onDone={() => { setOpen(false); row.current?.focus() }} />
      </Reveal>
    </>
  )
}

interface GonePrompt { prompt: PromptTemplate; index: number; chosen: boolean; focus: boolean }

function PromptList({ data, onDone }: { data: OptionsData; onDone: () => void }) {
  const { patch } = data
  const prompts = data.config!.prompts
  const [gone, setGone] = useState<GonePrompt[]>([])
  /** a prompt just made or copied: its name field takes the focus (§9) */
  const [fresh, setFresh] = useState<string | null>(null)
  const [note, setNote] = useState<{ alert: boolean; words: string } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const radios = useRef(new Map<string, HTMLElement>())
  const setPrompts = (fn: (c: PromptsConfig) => PromptsConfig) => patch(latest => ({ ...latest, prompts: fn(latest.prompts) }))
  // a choice from a list another tab has since changed must not store an id that names nothing (promptExists)
  const choose = (id: string) => void setPrompts(c => (promptExists(c, id) ? { ...c, promptId: id } : c))
  const add = (p: PromptTemplate) => {
    setFresh(p.id)
    void setPrompts(c => ({ patterns: [...c.patterns, p], promptId: p.id }))
  }
  const remove = (p: PromptTemplate) => {
    setGone(g => [...g, { prompt: p, index: prompts.patterns.findIndex(x => x.id === p.id), chosen: prompts.promptId === p.id, focus: !document.documentElement.hasAttribute('data-axt-pointer') }])
    void setPrompts(c => ({ patterns: c.patterns.filter(x => x.id !== p.id), promptId: c.promptId === p.id ? DEFAULT_PROMPT_ID : c.promptId }))
  }
  const undo = (g: GonePrompt) => {
    setGone(x => x.filter(y => y !== g))
    void setPrompts(c => (c.patterns.some(x => x.id === g.prompt.id) ? c : { patterns: insertAt(c.patterns, g.index, g.prompt), promptId: g.chosen && c.promptId === DEFAULT_PROMPT_ID ? g.prompt.id : c.promptId }))
  }
  const importFile = async (f: File | undefined) => {
    if (!f) return
    try {
      const entries = await readPromptFile(f)
      if (entries.length === 0) {
        setNote({ alert: true, words: O.prompts.importFailed.noPrompts })
        return
      }
      const added = entries.map(entry => ({ ...entry, id: uuid() }))
      void setPrompts(c => ({ ...c, patterns: [...c.patterns, ...added] }))
      setNote({ alert: false, words: O.prompts.imported(entries.length) })
    } catch (e) {
      // the parser says which kind; the sentence is the pack's (Codex on #161)
      setNote({ alert: true, words: e instanceof PromptFileFormatError && e.kind === 'badShape' ? O.prompts.importFailed.noPrompts : O.prompts.importFailed.cantRead })
    } finally {
      if (file.current) file.current.value = ''
    }
  }
  const builtIns = Object.values(BUILT_IN_PROMPTS)
  const chosenId = selectPrompt(prompts).id
  const ids = [...builtIns, ...prompts.patterns].map(p => p.id)
  const keys = radioKeys(ids, chosenId, () => true, choose, i => radios.current.get(ids[i]!)?.focus())
  const rowOf = (p: PromptTemplate, mine: boolean) => (
    <Fragment key={p.id}>
      <Row kind="radio" level={1} checked={p.id === chosenId} onChoose={() => choose(p.id)} label={p.name} tag={mine ? O.prompts.mine : undefined} description={describe(p)} arriving={fresh === p.id}
        radioRef={el => { if (el) radios.current.set(p.id, el); else radios.current.delete(p.id) }} />
      {p.id === chosenId && (mine
        ? <OwnPrompt key={p.id} prompt={p} focus={fresh === p.id} onChange={next => setPrompts(c => ({ ...c, patterns: withItem(c.patterns, next) }))} onDone={onDone} onDelete={() => remove(p)} />
        : <BuiltInPrompt prompt={p} onCopy={() => add({ ...p, id: uuid(), name: O.prompts.copyOf(p.name) })} />)}
    </Fragment>
  )
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a radio group's arrows (§9)
    <div role="radiogroup" aria-label={O.prompts.title} onKeyDown={keys}>
      {builtIns.map(p => rowOf(p, false))}
      {withUndo(prompts.patterns, gone).map(entry => ('gone' in entry
        ? <UndoRow key={`gone-${entry.gone.prompt.id}`} level={1} name={entry.gone.prompt.name} focus={entry.gone.focus} onUndo={() => undo(entry.gone)} onExpire={() => setGone(x => x.filter(y => y !== entry.gone))} />
        : rowOf(entry.item, true)))}
      <div className="o-row" data-srow="" data-level="1" data-lead="" data-search={O.prompts.create.toLowerCase()}>
        <button type="button" className="o-add" onClick={() => add({ id: uuid(), name: O.prompts.newName, systemPrompt: NEW_SYSTEM_PROMPT, prompt: NEW_USER_PROMPT })}>
          <span data-part="lead" className="o-lead"><Icon node={Plus} size={14} /></span>
          <span data-part="words" className="o-words"><span className="o-label">{O.prompts.create}</span></span>
        </button>
        <span data-part="trail" className="o-trail">
          <Button type="button" kind="text" size="md" onClick={() => file.current?.click()}>{O.prompts.import}</Button>
          {prompts.patterns.length > 0 && <Button type="button" kind="text" size="md" onClick={() => downloadPromptFile(prompts.patterns)}>{O.prompts.export}</Button>}
        </span>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => void importFile(e.target.files?.[0])} />
      </div>
      {note && <p className="o-prompt-note" role="status">{note.alert ? <Status tone="alert">{note.words}</Status> : note.words}</p>}
    </div>
  )
}

/** A part of a prompt, named for what it does */
function Part({ name, error, children }: { name: readonly [string, string]; error?: string; children: ReactNode }) {
  return (
    <div className="o-part">
      <div className="o-part-title"><b>{name[0]}</b><span>{name[1]}</span></div>
      {children}
      {error && <Status tone="alert">{error}</Status>}
    </div>
  )
}

function BuiltInPrompt({ prompt, onCopy }: { prompt: PromptTemplate; onCopy: () => void }) {
  return (
    <div className="o-prompt">
      <Part name={O.prompts.parts.system}><PromptText text={prompt.systemPrompt} label={O.prompts.parts.system[0]} /></Part>
      <Part name={O.prompts.parts.user}><PromptText text={prompt.prompt} label={O.prompts.parts.user[0]} /></Part>
      <div className="o-formbar">
        <Button type="button" kind="neutral" size="sm" onClick={onCopy}>{O.prompts.copy}</Button>
        <span className="o-note">{O.prompts.locked}</span>
      </div>
    </div>
  )
}

/** One's own, written in place: stored at each change while it holds a name and a message; a draft while it does not */
function OwnPrompt({ prompt, focus, onChange, onDone, onDelete }: { prompt: PromptTemplate; focus: boolean; onChange: (next: PromptTemplate) => unknown; onDone: () => void; onDelete: () => void }) {
  const [name, setName] = useState(prompt.name)
  const [system, setSystem] = useState(prompt.systemPrompt)
  const [message, setMessage] = useState(prompt.prompt)
  const [errors, setErrors] = useState<{ name?: string; message?: string }>({})
  const nameField = useRef<HTMLInputElement>(null)
  const systemText = useRef<HTMLDivElement>(null)
  const messageText = useRef<HTMLDivElement>(null)
  /** the part the caret was last in: a variable goes there */
  const last = useRef<'system' | 'message'>('message')
  const whole = name.trim() !== '' && message.trim() !== ''
  useEffect(() => (whole ? undefined : drafts.hold()), [whole])
  useEffect(() => { if (focus) nameField.current?.focus({ preventScroll: true }) }, [focus])
  const write = (next: { name: string; systemPrompt: string; prompt: string }) => {
    if (next.name.trim() && next.prompt.trim()) onChange({ id: prompt.id, ...next, name: next.name.trim() })
  }
  const insert = (token: PromptToken) => {
    const el = (last.current === 'system' ? systemText : messageText).current
    if (!el) return
    insertToken(el, token)
    const text = readPrompt(el)
    if (last.current === 'system') {
      setSystem(text)
      write({ name, systemPrompt: text, prompt: message })
    } else {
      setMessage(text)
      write({ name, systemPrompt: system, prompt: text })
    }
  }
  const done = () => {
    const found = { name: name.trim() ? undefined : O.prompts.nameEmpty, message: message.trim() ? undefined : O.prompts.messageEmpty }
    setErrors(found)
    if (found.name) nameField.current?.focus()
    else if (found.message) messageText.current?.focus()
    else onDone()
  }
  return (
    <div className="o-prompt">
      <Field label={O.prompts.name} error={errors.name}>
        <TextInput ref={nameField} value={name} autoComplete="off" onChange={e => { setName(e.target.value); write({ name: e.target.value, systemPrompt: system, prompt: message }) }} />
      </Field>
      <Part name={O.prompts.parts.system}>
        <PromptText ref={systemText} editable text={prompt.systemPrompt} label={O.prompts.parts.system[0]} onFocus={() => { last.current = 'system' }}
          onText={t => { setSystem(t); write({ name, systemPrompt: t, prompt: message }) }} />
      </Part>
      <Part name={O.prompts.parts.user} error={errors.message}>
        <PromptText ref={messageText} editable text={prompt.prompt} label={O.prompts.parts.user[0]} onFocus={() => { last.current = 'message' }}
          onText={t => { setMessage(t); write({ name, systemPrompt: system, prompt: t }) }} />
      </Part>
      <div className="o-vars">
        {/* a press keeps the caret where it was: the variable goes there */}
        {PROMPT_TOKENS.map(t => <button key={t} type="button" className="o-var o-var-button" onPointerDown={e => e.preventDefault()} onClick={() => insert(t)}>{O.prompts.tokens[t]}</button>)}
      </div>
      <div className="o-formbar">
        <Button type="button" kind="brand" size="md" onClick={done}>{O.prompts.done}</Button>
        <Button type="button" kind="text" size="md" onClick={onDelete}>{O.prompts.delete}</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: The group, and 翻译 drawing it**

`src/entrypoints/options/sections/Llm.tsx`:

```tsx
// The LLM group (the redesign's design, §6.3): headed LLM (S.service.llm) with the aside that says what it reaches, holding the
// prompts and the glossary; with no LLM service, one line that says how to have them. The prompts and the glossary
// stay the reader's while a free service is chosen: only an LLM reads them
import { useState } from 'react'
import { Reveal } from '@/ui/controls/Reveal'
import { O, S } from '@/ui/strings'
import type { OptionsData } from '../data'
import { Card, GroupHeading } from '../ui/Card'
import { Row, Value } from '../ui/Row'
import { GlossaryTable } from './Glossary'
import { PromptsRow } from './Prompts'

export function Llm({ data }: { data: OptionsData }) {
  const config = data.config
  if (!config) return null
  if (config.services.length === 0) {
    return (
      <>
        <GroupHeading title={S.service.llm} />
        <Card><Row quiet label={O.llm.empty} /></Card>
      </>
    )
  }
  return (
    <>
      <GroupHeading title={S.service.llm} aside={O.llm.aside} />
      <Card>
        <PromptsRow data={data} />
        <GlossaryRow data={data} />
      </Card>
    </>
  )
}

function GlossaryRow({ data }: { data: OptionsData }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Row kind="button" row="translate/glossary" words={O.search.keywords['translate/glossary']} label={O.glossary.title} description={O.glossary.hint}
        trailing={<Value>{O.glossary.count(data.config!.glossary.length)}</Value>} expanded={open} onPress={() => setOpen(o => !o)} />
      <Reveal open={open}>
        <GlossaryTable data={data} />
        <p className="o-gloss-hint">{O.glossary.paste}</p>
      </Reveal>
    </>
  )
}
```

In `src/entrypoints/options/sections/Translate.tsx`, add `import { Llm } from './Llm'` and, after `<TargetLanguage data={data} />`,
`<Llm data={data} />`. In `src/entrypoints/options/App.tsx`, delete the `Prompts` import and change
`translate: data => <><Translate data={data} /><Prompts data={data} /></>,` to `translate: data => <Translate data={data} />,`.
Delete `src/entrypoints/options/PromptManager.tsx`.

- [ ] **Step 7: Their rules**

Append to `src/entrypoints/options/ui/settings.css`:

```css
/* ---- Task 63: the prompts (§6.3) ---- */
@layer components {
  /* under the chosen prompt: from 70 (its words' edge) to the trailing edge */
  .o-prompt { display: flex; flex-direction: column; gap: 10px; margin: 2px 10px 10px 66px; }
  .o-part { display: flex; flex-direction: column; gap: 6px; }
  .o-part-title { display: flex; align-items: baseline; gap: 6px; font-size: 12px; }
  .o-part-title b { font-weight: 600; }
  .o-part-title span { color: var(--ink-2); }
  .o-prompt-text { padding: 12px 14px; border-radius: 8px; background: var(--field); color: var(--ink); font-size: 12.5px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
  /* one's own, being written: a field's edge, 1 px ink-3 on focus, the keyboard's ring (§9) */
  .o-prompt-text[data-editable] { box-shadow: inset 0 0 0 0.5px var(--field-edge); outline: none; cursor: text; transition: box-shadow 150ms ease-out; }
  .o-prompt-text[data-editable]:focus { box-shadow: inset 0 0 0 1px var(--ink-3); }
  html:not([data-axt-pointer]) .o-prompt-text[data-editable]:focus-visible { outline: 2px solid var(--focus); outline-offset: 0; }
  .o-vars { display: flex; flex-wrap: wrap; gap: 6px; }
  .o-var-button { border: 0; font: inherit; font-size: 11.5px; cursor: pointer; transition: color 150ms ease-out, scale 150ms ease-out; }
  @media (hover: hover) { .o-var-button:hover { color: var(--ink); } }
  .o-var-button:active { scale: 0.96; }
  /* the new-prompt row (O.prompts.create): a button inside the row, which also holds Import… and Export… */
  .o-add { display: flex; flex: 1; align-items: center; gap: 12px; min-width: 0; padding: 0; border: 0; background: none; color: var(--ink-2); font: inherit; text-align: start; cursor: pointer; }
  .o-prompt-note { margin: -4px 10px 10px 66px; color: var(--ink-2); font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) { .o-prompt-text[data-editable], .o-var-button { transition: none; } .o-var-button:active { scale: 1; } }
```

- [ ] **Step 8: The browser check of a prompt of one's own**

In `tests/e2e/extension.mjs`, replace the block from `// ── The settings page: the target language (the ISO 639-3 code of configuration v4) and a custom prompt …`
through the `check('the settings page: after deleting the custom prompt the default is chosen again', …)` line with:

```js
// ── The settings page: the target language (the ISO 639-3 code of configuration v4) and a prompt of one's own apply at once and survive a reload ──────
// The LLM group shows once there is an LLM service (§6.3: with none it is one line): one is put in the configuration, not chosen
await seedService(extensionWorker(), { id: 'svc-e2eprmpt', name: 'e2e prompts', baseURL: 'https://openrouter.ai/api/v1', model: 'x', apiKey: 'sk-unused' }, { choose: false })
await openSection(options, 'translate')
const promptsRow = () => options.locator('[data-row="translate/prompts"]')
await promptsRow().click()
await options.getByRole('button', { name: '新建提示词…', exact: true }).click()
await options.getByLabel('名称', { exact: true }).fill('e2e 提示词')
await options.getByRole('button', { name: '完成', exact: true }).click()
await options.reload({ waitUntil: 'domcontentloaded' })
await openSection(options, 'translate')
const langBack = await options.getByRole('button', { name: '目标语言' }).textContent()
await promptsRow().click()
// the radio is named by its label, its tag (O.prompts.mine) included: the name starts with the prompt's
const promptRadio = options.getByRole('radio', { name: /^e2e 提示词/ })
await promptRadio.waitFor({ timeout: 5_000 }).catch(() => undefined)
const promptBack = (await promptRadio.count()) === 1 && (await promptRadio.isChecked())
check('the settings page: the target language and the custom prompt survive a reload and stay selected', /日语/.test(langBack ?? '') && promptBack, `language ${langBack}, prompt ${promptBack}`)
// Delete it, and the default is chosen again: the wrong-key part later goes through the default prompt. Deleting is
// undone, not confirmed (§6.2): the undo row stands for 5 s, and is left alone here
await options.getByRole('button', { name: '删除', exact: true }).click()
await options.getByText('已删除「e2e 提示词」').waitFor({ timeout: 5_000 }).catch(() => undefined)
await chooseLanguage(options, '简体中文', '简体中文')
await openSection(options, 'translate')
const promptGone = (await options.getByRole('radio', { name: /^e2e 提示词/ }).count()) === 0
check('the settings page: after deleting the custom prompt the default is chosen again', promptGone, `left over ${promptGone ? 0 : 1}`)
```

Run: `node --check tests/e2e/extension.mjs`
Expected: exit 0.

- [ ] **Step 9: Run the tests, the gate, and commit**

Run: `pnpm vitest run tests/options && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0. A type error names a reader of a deleted `O.prompts` key: only the deleted files read them. Then
`git rm` the two files, `git add` the rest and run `node scripts/check-english.mjs`, and set, in
`scripts/english-allowlist.txt`: `tests/e2e/extension.mjs` from 76 to 75 (the prompt's block: 10 lines finding controls
by their Chinese names in place of the old block's 11; its reason gains `; −1, 2026-09-27: the prompt's check in the
LLM group (Part 5, Task 63)`); `tests/ui/locales.test.ts 3` → `tests/ui/locales.test.ts 2` (the glossary sentence's
case, and its quoted Chinese, left); and drop the line `tests/options/prompts-section.test.ts 13` — the rewritten file
holds no CJK line. The gate must then pass; where it names another count, set that one.

```bash
git rm src/entrypoints/options/PromptManager.tsx tests/options/prompt-manager.test.ts
git add src/entrypoints/options/sections/PromptText.tsx src/entrypoints/options/sections/Prompts.tsx src/entrypoints/options/sections/Llm.tsx src/entrypoints/options/sections/Translate.tsx src/entrypoints/options/App.tsx src/entrypoints/options/ui/settings.css src/locales/zh-CN.ts src/locales/en.ts tests/options/prompts-section.test.ts tests/ui/locales.test.ts tests/e2e/extension.mjs scripts/english-allowlist.txt
node scripts/check-english.mjs
git commit -m "feat(options): the LLM group — prompts read as words, the glossary's table

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 64: the alignment probe and the screenshots

§12 and the brief's standard: "before a surface is called done, a script measures each row's items' centre lines
(within 0.5 px) and edges (only the agreed lines: 14 / 42 / 70 from the card and 14 trailing)", and the surface is
looked at at 200 % zoom and 320 px, in both themes and both languages. settings-2's `tools/align-probe.mjs` and
`tools/shoot.mjs`, ported onto the built page.

**Files:**
- Create: `tests/e2e/probes/settings-align.mjs`
- Modify: `scripts/english-allowlist.txt` (the probe's entry: its one line of glossary pairs)

**Interfaces:**
- Consumes: the build (`.output/chrome-mv3`), `copyWithGrants` (`tests/e2e/ext-copy.mjs`); the page's attributes
  (`[data-card]`, `[data-srow]`, `[data-part]`, `[data-icon-button]`, `[data-heading]`, `[data-row]`, `.o-seg` with its `--w`).
- Produces: `node tests/e2e/probes/settings-align.mjs` → the items off their lines and the segmented controls off their
  agreed widths, exit 1 when any;
  `experiments/pdf-bilingual/out/settings/<lang>-<theme>-<state>.png` (not committed: `out/` is ignored).

- [ ] **Step 1: Write the probe**

`tests/e2e/probes/settings-align.mjs`:

```js
// Probe: the settings page's alignment and looks (the redesign's design, §6.2, §12), ported from settings-2's
// tools/align-probe.mjs and tools/shoot.mjs. On the build, in a real browser, in both themes and both languages, each
// state of each section — at rest, a row hovered, a form open, a list open, an editor open, a confirm armed, a search, a
// deep link — is measured: every item's centre within 0.5 px of its row's; the words' leading edge at 14, 42 or 70 px
// from the card, a leading control at 14 or 42; the trailing edge at 14 (an icon button's glyph box); a group heading at
// 14; a hovered row's fill on the card's inner edge, the separators on either side stepped aside; each small segmented
// control at its agreed width (220, 200, 210, 300, 120 px, settings-2). Each state is shot at
// 2x into experiments/pdf-bilingual/out/settings/, and the page at 320 px and at 200 % zoom: no horizontal scroll, and
// the sidebar above the column below 640 px. Prints what is off; exits 1 when anything is.
//   pnpm build && node tests/e2e/probes/settings-align.mjs
import { createServer } from 'node:http'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { copyWithGrants } from '../ext-copy.mjs'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const SRC = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const EXT = `${E2E}.ext-settings-align`
const PROFILE = `${E2E}.profile-settings-align`
const OUT = fileURLToPath(new URL('../../../experiments/pdf-bilingual/out/settings/', import.meta.url))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** The user message carries JSON.stringify(segments) (src/providers/prompt.ts): the longest valid array from the end (local-endpoint.mjs) */
function segmentsFrom(prompt) {
  const start = prompt.indexOf('[{"id":')
  if (start < 0) return []
  const ends = []
  for (let i = prompt.indexOf(']', start); i >= 0; i = prompt.indexOf(']', i + 1)) ends.push(i + 1)
  for (const end of ends.reverse()) {
    try {
      const parsed = JSON.parse(prompt.slice(start, end))
      if (Array.isArray(parsed)) return parsed
    } catch {
      // a closing bracket inside a string: a shorter one
    }
  }
  return []
}
// An OpenAI-compatible endpoint on this machine: its models listed, the sample given back as it came, so the form connects
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ object: 'list', data: [{ id: 'echo-1', name: 'Echo One' }, { id: 'echo-2' }] }))
    return
  }
  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    const user = [...(JSON.parse(body || '{}').messages ?? [])].reverse().find(m => m.role === 'user')?.content ?? ''
    const content = JSON.stringify({ segments: segmentsFrom(typeof user === 'string' ? user : '') })
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'echo-1', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }))
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const BASE = `http://127.0.0.1:${server.address().port}/v1`

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
copyWithGrants(SRC, EXT, { hostPermissions: ['http://127.0.0.1/*'] })
const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !process.env.AXT_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1300, height: 1100 },
  deviceScaleFactor: 2,
})
let [worker] = context.serviceWorkers()
if (!worker) worker = await context.waitForEvent('serviceworker')
const extId = worker.url().split('/')[2]
for (let i = 0; i < 50 && !(await worker.evaluate(async () => 'config' in await chrome.storage.local.get('config'))); i++) await sleep(200)

// the reader's own: a key the endpoint refused, one an earlier version stored without a key; a prompt of one's own; a glossary
const SERVICES = [
  { id: 'svc-proberef', kind: 'openai-compat', name: 'DeepSeek V4 Flash', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-v1-probe', model: 'deepseek/deepseek-v4-flash', thinking: 'disabled' },
  { id: 'svc-probekey', kind: 'openai-compat', name: 'Older', baseURL: 'https://api.example.com/v1', apiKey: '', model: 'model-a', thinking: 'disabled' },
]
const PROMPTS = { promptId: 'default', patterns: [{ id: 'p-probe', name: 'Mine', systemPrompt: 'Translate into {{targetLanguage}}, briefly.', prompt: '{{input}}' }] }
const GLOSSARY = [{ term: 'token', translation: '词元' }, { term: 'embedding', translation: '嵌入' }, { term: 'attention', translation: '注意力' }]
// the configuration first, then the record: written in one set, the background's watcher would clear the mark of a
// service it had not seen before (health-guard.ts, idsToClear)
const seed = over => worker.evaluate(async over => {
  const { config } = await chrome.storage.local.get('config')
  await chrome.storage.local.set({ config: { ...config, ...over } })
  await new Promise(resolve => setTimeout(resolve, 300))
  await chrome.storage.local.set({ serviceHealth: { 'svc-proberef': { rejected: Date.now() } } })
}, over)

/** every row of every card shown: centres, the three leading edges and the trailing one; the headings */
const measure = page => page.evaluate(() => {
  const out = []
  const r = el => el.getBoundingClientRect()
  const shown = el => { const b = r(el); return b.width > 0 && b.height > 0 && !el.closest('[inert]') }
  for (const card of document.querySelectorAll('main [data-card]')) {
    if (!shown(card)) continue
    const c = r(card)
    for (const row of card.querySelectorAll('[data-srow]')) {
      if (!shown(row) || row.closest('[data-card]') !== card) continue
      const b = r(row)
      const mid = b.top + b.height / 2
      const name = (row.querySelector('.o-label')?.textContent ?? row.textContent ?? '').trim().slice(0, 16)
      const parts = [...row.querySelectorAll('[data-part]')].filter(el => el.closest('[data-srow]') === row && shown(el)).map(el => ({ kind: el.dataset.part, el }))
      // a radio row's lead is its mark, the radio's direct child (Part 3's Radio)
      const mark = [...row.querySelectorAll('[role="radio"] > .radio')].find(el => el.closest('[data-srow]') === row)
      if (mark) parts.push({ kind: 'lead', el: mark })
      const part = kind => parts.find(p => p.kind === kind)?.el
      for (const { kind, el } of parts) {
        for (const item of kind === 'trail' ? [...el.children].filter(shown) : [el]) {
          const d = r(item).top + r(item).height / 2 - mid
          if (Math.abs(d) > 0.5) out.push(`${name} · ${kind} centre ${d > 0 ? '+' : ''}${d.toFixed(1)} px`)
        }
      }
      const words = part('words')
      if (words) { const x = Math.round(r(words).left - c.left); if (![14, 42, 70].includes(x)) out.push(`${name} · words at ${x} px`) }
      const lead = part('lead')
      if (lead) { const x = Math.round(r(lead).left - c.left); if (![14, 42].includes(x)) out.push(`${name} · lead at ${x} px`) }
      const last = part('trail') && [...part('trail').children].filter(shown).pop()
      if (last) {
        const edge = last.matches('[data-icon-button]') ? r(last.querySelector('svg')) : r(last)
        const x = Math.round(c.right - edge.right)
        if (x !== 14) out.push(`${name} · trailing at ${x} px`)
      }
    }
  }
  const column = r(document.querySelector('.o-column'))
  for (const heading of document.querySelectorAll('main [data-heading]')) {
    if (!shown(heading)) continue
    const x = Math.round(r(heading.querySelector('h2')).left - column.left)
    if (x !== 14) out.push(`heading ${heading.querySelector('h2').textContent} at ${x} px`)
  }
  // a small segmented control at its agreed width, the `--w` its wrapper carries (segmentWidth)
  for (const seg of document.querySelectorAll('main .o-seg')) {
    if (!shown(seg)) continue
    const want = Number.parseFloat(seg.style.getPropertyValue('--w'))
    const got = r(seg.querySelector('[role="radiogroup"]')).width
    if (Math.abs(got - want) > 0.5) out.push(`a segmented control ${got.toFixed(1)} px wide, agreed ${want}`)
  }
  return out
})

/** a hovered row: its fill on the card's inner edge; the separator on its top edge and the next shown row's stepped aside */
const hovered = (page, selector) => page.evaluate(selector => {
  const row = document.querySelector(selector)
  const card = row.closest('[data-card]')
  const b = row.getBoundingClientRect()
  const c = card.getBoundingClientRect()
  const out = []
  if (Math.abs(b.left - (c.left + 4)) > 0.5 || Math.abs(b.right - (c.right - 4)) > 0.5) out.push('the hovered fill is off the card\'s inner edge')
  if (getComputedStyle(row).backgroundColor === 'rgba(0, 0, 0, 0)') out.push('the hovered row does not light')
  const rows = [...card.querySelectorAll('[data-srow]')].filter(x => x.getBoundingClientRect().height && !x.closest('[inert]'))
  const next = rows[rows.indexOf(row) + 1]
  for (const [which, el] of [['its own', row], ['the next row\'s', next]]) if (el && getComputedStyle(el, '::before').opacity !== '0') out.push(`${which} separator shows`)
  return out
}, selector)

const off = []
for (const lang of ['zh-CN', 'en']) {
  for (const theme of ['light', 'dark']) {
    const tag = `${lang}-${theme}`
    await seed({ theme, uiLanguage: lang, services: SERVICES, provider: 'microsoft', prompts: PROMPTS, glossary: GLOSSARY, pdfReader: { enabled: true, original: false, sync: true, swapped: false, dimPages: true } })
    const page = await context.newPage()
    await page.setViewportSize({ width: 1300, height: 1100 })
    const open = async hash => {
      await page.goto(`chrome-extension://${extId}/options.html#${hash}`)
      await page.waitForSelector('main [data-card]')
      await page.mouse.move(1290, 1090)
      await sleep(400)
    }
    const state = async (name, act) => {
      if (act) await act()
      await sleep(400)
      off.push(...(await measure(page)).map(o => `${tag} ${name}: ${o}`))
      await page.screenshot({ path: `${OUT}${tag}-${name}.png`, fullPage: true })
    }
    const services = '[data-row="translate/services"] > [data-srow]'

    await open('translate')
    await state('translate')
    await state('translate-hover', async () => {
      await page.hover(`${services}:nth-child(2)`)
      await sleep(250)
      off.push(...(await hovered(page, `${services}:nth-child(2)`)).map(o => `${tag} translate-hover: ${o}`))
    })
    await state('translate-refused', () => page.locator(services).nth(3).click())
    await state('translate-keyless', () => page.locator(services).nth(4).click())
    await state('translate-menu', async () => { await page.locator(services).nth(3).hover(); await page.locator(`${services}:nth-child(4) [data-icon-button]`).click() })
    await page.keyboard.press('Escape')
    await state('translate-add', async () => {
      await page.locator('[data-row="translate/services"] > button[data-srow]').last().click()
      await page.locator('form[data-form="service"] input').first().fill(BASE)
      await page.waitForFunction(() => document.querySelector('form[data-form="service"] [role="combobox"]')?.getAttribute('aria-busy') === null && !!document.querySelector('form[data-form="service"] [role="combobox"]')?.getAttribute('placeholder')?.match(/2/), null, { timeout: 5000 }).catch(() => undefined)
      await page.locator('form[data-form="service"] [role="combobox"]').focus()
    })
    await state('translate-connected', async () => {
      await page.locator('.o-combo-item').first().dispatchEvent('pointerdown')
      await page.locator('form[data-form="service"] button[type="submit"]').click()
      await page.waitForSelector('form[data-form="service"]', { state: 'detached', timeout: 10000 }).catch(() => undefined)
    })
    await state('translate-prompts', () => page.locator('[data-row="translate/prompts"]').click())
    await state('translate-own-prompt', () => page.locator('[role="radiogroup"] [role="radio"]').filter({ hasText: 'Mine' }).last().click())
    await state('translate-glossary', () => page.locator('[data-row="translate/glossary"]').click())

    await open('appearance')
    await state('appearance')
    await state('appearance-editor', async () => {
      const row = page.locator('[data-row="appearance/styles"] > [data-srow]').nth(4)
      await row.hover()
      await row.locator('[data-icon-button]').click()
      await page.locator('.o-editor .o-disclose').click()
      await page.locator('.o-editor [role="radiogroup"]').nth(1).locator('[role="radio"]').nth(1).click()
    })
    await open('reading')
    await state('reading')
    await state('reading-pdf-off', () => page.locator('[data-row="reading/pdf"] [role="switch"]').first().click())
    await open('data')
    await state('data')
    await state('data-confirm', () => page.locator('[data-row="data/cache"] button').click())
    await state('search', () => page.locator('.o-search input').fill('PDF'))
    await state('search-none', () => page.locator('.o-search input').fill('zzzz'))
    await open('translate/prompts')
    await state('deeplink')
    await state('language-menu', () => page.locator('.o-lang').click())
    await page.keyboard.press('Escape')
    // S-O-02 (§6.7): settings this build cannot read — the card at the top, the data section alone; then the settings put back
    const kept = await worker.evaluate(() => chrome.storage.local.get(['config', 'config$']))
    await worker.evaluate(s => chrome.storage.local.set({ config: { ...s.config, version: s.config.version + 1 }, config$: { ...s.config$, v: s.config.version + 1 } }), kept)
    await open('data')
    await state('unreadable')
    await worker.evaluate(s => chrome.storage.local.set(s), kept)

    // §9: 320 px and 200 % zoom (a 1280 px window at 2x): nothing scrolls sideways; below 640 px the sidebar is above the column
    for (const [name, width, height] of [['narrow', 320, 900], ['zoom', 640, 550]]) {
      await page.setViewportSize({ width, height })
      await open('translate')
      const fold = await page.evaluate(() => ({
        sideways: document.documentElement.scrollWidth > innerWidth,
        above: document.querySelector('.o-side').getBoundingClientRect().bottom <= document.querySelector('.o-main').getBoundingClientRect().top + 0.5,
      }))
      if (fold.sideways) off.push(`${tag} ${name}: the page scrolls sideways`)
      if (width < 640 && !fold.above) off.push(`${tag} ${name}: the sidebar is not above the column`)
      await page.screenshot({ path: `${OUT}${tag}-${name}.png`, fullPage: true })
      await open('appearance')
      await page.screenshot({ path: `${OUT}${tag}-${name}-appearance.png`, fullPage: true })
    }
    await page.close()
  }
}
await context.close()
server.close()
console.log(off.length ? off.join('\n') : 'every row on its lines, in both themes and both languages')
console.log(`screenshots in ${OUT}`)
process.exit(off.length ? 1 : 0)
```

- [ ] **Step 2: Run it**

Run: `pnpm build && node tests/e2e/probes/settings-align.mjs`
Expected: `every row on its lines, in both themes and both languages`, exit 0. An item off its line is fixed in the
sheet (never in the probe's numbers): a centre off by the Row's own padding is `align-items` or a line-height; a leading
edge off 14 / 42 / 70 is a level or a lead; a trailing edge at 8 is an icon button whose glyph is not 16 px; a
segmented control off its agreed width is `.o-seg`'s rule (Task 56).

- [ ] **Step 3: Look at the shots**

Read every `experiments/pdf-bilingual/out/settings/*.png` at full size, beside settings-2's `png/` shots of the same
states (01 ↔ `translate`, 02 ↔ `translate-refused`, 03 ↔ `translate-add`, 05 ↔ `translate-connected`, 07 ↔
`translate-prompts` / `translate-glossary`, 08–09 ↔ `appearance` / `appearance-editor`, 10–11 ↔ `reading` /
`reading-pdf-off`, 12 ↔ `data-confirm`, 14–16 ↔ `search`, `search-none`, `deeplink`, 17 ↔ `translate-menu`, 24–25 ↔
`language-menu`; `unreadable`, `translate-keyless`, `narrow*` and `zoom*` have no counterpart and are judged by the
design alone). Note each difference: nothing clipped, nothing overlapping, the words in both languages fitting
their rows, the dark theme's edges visible. A difference the design explains (the list under "Where the design and
the prototype disagree") is expected; any other is a defect to fix before the commit.

- [ ] **Step 4: The gate and the commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: exit 0. Then `git add` the probe and run `node scripts/check-english.mjs`: it names the probe's one CJK line
(the glossary pairs it seeds); add `tests/e2e/probes/settings-align.mjs 1  # 2026-09-27: the glossary pairs the probe
seeds, in the reader's language (Part 5, Task 64)` to `scripts/english-allowlist.txt`, and the gate passes.

```bash
git add tests/e2e/probes/settings-align.mjs scripts/english-allowlist.txt
node scripts/check-english.mjs
git commit -m "test(options): the settings page's alignment probe and screenshots

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 65: Part 5's record

- [ ] **Step 1: Every check**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
node tests/e2e/probes/settings-align.mjs
pnpm e2e && pnpm e2e:local-endpoint && pnpm e2e:a11y && pnpm e2e:floating && pnpm e2e:pdf && pnpm e2e:image && pnpm e2e:layout
node experiments/pdf-bilingual/spikes/reader-pixels.mjs && node experiments/pdf-bilingual/spikes/reader-ui.mjs && node experiments/pdf-bilingual/spikes/entries.mjs
```

Expected: each exits 0; the probe prints no line off; `reader-pixels` 24 lines of `ok`.

- [ ] **Step 2: What the part must not have left**

Run:

```bash
grep -n ':has(' src/entrypoints/options/ui/settings.css
grep -rnE 'className="[^"]*\b(text|bg|px|py|mb|mt|rounded|border)-' src/entrypoints/options --include=*.tsx
grep -rnE '#[0-9a-fA-F]{6}\b|oklch\(' src/entrypoints/options --include=*.tsx | grep -v 'START\|1565c0'
grep -rn "sections/Services\|ServiceDrawer\|PromptManager\|sections/PdfReader" src tests
grep -rnE 'markRejected|clearRejected' src/entrypoints/options
grep -rnE '@keyframes (words-in|turn|o-spin|o-words-in)|\.o-busy' src/entrypoints/options/ui/settings.css
git diff --name-only <Part 3's last commit> -- src/shared/tokens.ts src/styles/tokens.css src/styles/controls.css src/ui/controls
```

Expected: nothing (the colour picker's starting value `#1565c0` in `ColourPick.tsx` is the one allowed hit): no record
written by the page (ruling 17), no motion of Part 3's defined again, no token and no shared control changed (ruling 9).
Then compare `git diff --name-only <Part 3's last commit>` with "Files outside the settings page": a file outside
`src/entrypoints/options/**`, `tests/options/**` and the packs' `O` section that the list does not name is reported to
the controller. And check the capability table at the top once more against the page: every row of it reachable in
the built page, by hand.

- [ ] **Step 3: A local review of the part**

Ask for a local Codex review of Part 5's commits (`/codex:adversarial-review --base <Part 3's last commit>`: the
connection test and the deletion's clean-up are contracts). Check each point against the code, a test or the probe
before adopting it; write down what was declined and why in the commit that adopts the rest.

- [ ] **Step 4: Note what Part 5 left**

Append to the end of this plan, under `## Part 5: done`, one paragraph: the commits; what the probe measured; what the controller settled after the rulings; any name that changed from this plan; and for Part 7, what
is left to remove once both pages have left them — `src/ui/appearance/*` (the new page uses only `tiles.ts`'s
`styleTile`, to be moved), the `O.reading` and `O.services` keys only those components read ("Kept for Part 7"), and
`O.close` — and for Part 7's documents, UI.md §3.2's ids that §10.2 renames or retires.

- [ ] **Step 5: Commit the record**

The record appended to this plan (and any plan-side fix the review brought) is Part 5's last commit. The plan holds
Chinese quoted as copy, so its entry in `scripts/english-allowlist.txt` follows the lines the record adds or removes:

```bash
git add experiments/pdf-bilingual/plans/2026-09-26-extension-ui-redesign-part5-settings.md
node scripts/check-english.mjs
```

Where the gate names another count for the plan, set its entry to that count (the reason gains `; 2026-09-27: Part 5's
record`), then:

```bash
git add scripts/english-allowlist.txt
node scripts/check-english.mjs
git commit -m "docs(ui): Part 5's record

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Part 5: done

**Commits** (on `exp/ui-settings`, from `56d02f2d`): Tasks 50–64 and their fix rounds, `f6223fa0` … `04d88e78`; the
batch of parked minors `9a4bf905`; the local Codex review's fix `768c6fce` and its rounds `d94d48fd`, `7f17c894`, `772062dd`, `ba101468`, `a9e97a3f`; the floating button's switch `a24ff50b`; this record. Every task was reviewed, every
fix round re-reviewed; the ledger (`.superpowers/sdd/2026-09-26-extension-ui-redesign-part5-settings/progress.md`) holds
each ruling with its reason.

**What the probe measured** (`tests/e2e/probes/settings-align.mjs`, on the build, both themes, both languages, 26 states
each): every item's centre within 0.5 px of its row's; the words at 14 / 42 / 70 px from the card, a leading control at
14 / 42, the trailing edge at 14 (an icon button's glyph box); every group heading at 14; a hovered row's fill on the
card's inner edge with both separators stepped aside; the small segmented controls at exactly their agreed widths as a
set per state (阅读: 220, 200; the style editor: 210, 300, 120); a search keyword found only in `O.search.keywords`
finding its row; at 320 px and at 200 % zoom nothing past its card, no sideways scroll, the sidebar above the column
below 640 px. It fails on a state that draws nothing. Final run: `every row on its lines, in both themes and both
languages`. What it found and the sheet now does: a row's end moves under its words wherever they would have less than
12em (a query on the window could not tell a 200 % column from a wide one); a card too narrow for the theme control
drops its icons and keeps its words (a container query in the page's sheet, not the shared control).

**Settled after the rulings** (the ledger has each): the connection test refuses a candidate whose id is not the one
named, before the chain; a deletion's side effects (the sessions' rebind, the origin's release) wait for its write, which
counts as landed only when the write resolves with its own change's value (so the unreadable-value refusal, which
resolves with the defaults, counts as refused); the release keeps every origin a pending deletion or undo can come back
to, and gives back none while the stored value cannot be read — known from the read's own verdict (`readConfig()`,
new in `src/config/storage.ts`, which `surface-config.ts` now reads through too); a refused undo comes back with a fresh
timer, and one refused after the section unmounted still commits; the forms stay live through StrictMode's double run
(a ref a cleanup sets is reset by its setup); the floating button's switch is held out of sight until the background
says its state (it used to say on, then flip — the old page did too, and `e2e:floating` caught it once); a refused deletion leaves the row with a failed-save line in all three lists, the focus on the row; a permission granted after its form is gone
is given back; a failed save is one sentence for the page (`O.saveFailed`); the glossary's refused write can be retried;
the prompts' editor is drawn only while their list is open and writes only the field that changed; closing the prompts
keeps a pending undo; the sample's language is `zh-CN`; the address chips' group is named 常用地址; the dimming row has
its keywords; the probe checks agreed widths as sets and fails on an empty state.

**Names that came out otherwise than this plan says**: `O.services.saveFailed` is top-level `O.saveFailed`; new words
`O.glossary.retry` (重试 / Try again), `O.glossary.addSource` (添加原文 / Add a term), `O.services.baseURLSuggestions`
(常用地址 / Common addresses), `O.search.keywords['appearance/dim']`; `O.prompts.builtIn['precision-rewrite']` reads
「翻译即改写：…」 without quotes, as settings-2 draws it; the diagnostics line says 「API Key」, the pack's one term.

**For the maintainer's look** (Part 7): the deep link's focus ring beside its flash (a programmatic focus on a load with
no pointer yet); the pencil choosing the style it opens, and a deletion falling back to `styles[0]`; the new words above.

**For Part 7 to remove once both pages have left them**: `src/ui/appearance/*` except `tiles.ts`, whose `styleTile`
moves (the settings page, the popup's view model and the controls sheet's `specimens/menus.tsx` import it), with their
tests (`tests/ui/advanced-css.test.ts`, `tests/ui/profile-editor.test.ts`) and the two comments that still name them
(`ui/ColourPick.tsx:6` "today's ColorField's", `sections/StyleEditor.tsx:115` "the drawer's AdvancedCss"); the `O.reading`
and `O.services` keys only those components read ("Kept for Part 7", under the rulings), `O.close`, and
`O.services.baseURLHint` / `O.services.more` once the controls sheet's `specimens/forms.tsx` reads live words;
`withItem` in `ui/lists.ts` (no production caller since Task 63's fix round); `configFallbackReason()` in
`src/config/storage.ts` (no caller in `src` since `a9e97a3f`). For Part 7's documents: UI.md §3.2's ids
that the design's §10.2 renames or retires (its list is the authority), the stale wording of UI.md S-O-49b / S-O-55 /
S-O-71 … 73 the task reviews named, and DESIGN §9's line that an undone deletion loses its refused mark. For Part 7's
verification: the reader spikes this part edited but could not run without the TeX server (`cache-faults.mjs`,
`cache-revisit.mjs`, `viewer-faults.mjs`, `reader-a11y.mjs`, `reader-ui-live.mjs`); `e2e:pdf` failed 4 checks once
(the popup's page state on hep-th/9711200's PDF and on the abstract page) and passed 26/26 on the rerun — watch it.
Carried to #299: a variable inserted in a prompt is outside the browser's undo stack; a tab closed in the moment between
a service's deletion and its write leaves open pages on that service until they reload; a service deleted while the
stored value cannot be read keeps its origin granted. For the merges: every test mocking `@/config/storage` must
provide `readConfig` (Part 4's popup tests above all), and `tests/popup/data.test.ts` is changed on both sides.
