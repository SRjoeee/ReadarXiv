# The extension's interface, redesigned: design

2026-09-26. Agreed with the maintainer over six rounds of popup prototypes, an adversarial review of the settings page
and two rounds of settings prototypes, all on 2026-09-26. The prototypes are local and never committed
(`design/extension-ui/round-1` … `round-6`, `settings-1`, `settings-2`, with `popup-decisions.md` and
`settings-review.md` beside them); the maintainer's words are quoted where a decision rests on them. This document is
what the implementation plan argues from. Where it and a prototype disagree, this document wins; where it is silent,
`round-6` (the popup) and `settings-2` (the settings page) show the agreed look.

A snapshot of the extension before this work is tagged `snapshot/pre-ui-redesign-2026-09-26` (d52c9017).

## 1. Goal, scope, principles

Every surface of the extension other than the PDF reader gets a new interface, drawn from the reader's design system:
the popup (in the toolbar and in the floating button's panel), the settings page, the floating button, and the
controls the extension puts on arXiv's pages (the figure viewer's). The reader is the reference and does not change:
its tokens and controls become the shared ones, and it must render **pixel for pixel as it does today** (§2.4).

- **A family, not a copy** (the maintainer: 「不要求跟这个PDF reader一模一样……要求设计系统尽量靠近风格……能让人感觉出来是一套设计风格下面的两个产品的不同页面」).
  The other surfaces share the reader's neutral ramp, type, radii, controls and motion, and add what the reader has no
  use for: the brand red for the one primary action, a success green, a search highlight.
- **The best taste we can reach** (「顶尖的审美和taste」). Less is more; what the reader need not decide is not an
  option; what matters only sometimes appears only then, with a visible cue and a small motion (「渐进式微交互」).
- **Details are measured, not eyeballed** (the maintainer, 2026-09-26: 「整个设计系统的设计非常混乱凌乱」 of a first pass
  that had not been measured). Every row is checked by script for its centre line and its edges before it ships (§12).
- **Simplifying never removes a capability silently.** Every capability that goes is listed in §11 with the
  maintainer's approval; the translation styles' add, edit and delete were taken out once by mistake and put back.
- **Unchanged rules**: settings apply at once, with no save button; one kind of control and one popover per kind of
  choice; no technical path is ever shown to a reader (UI.md §1; the reader's design, §1).

Not in this document: the reader's remaining items of the same stage (#299's interface minors, #300's jump back, the
service-change capsule of the reader's design §16), which keep their own documents; the web app (a separate, closed
repository); any change to how translation works, beyond the settings §4 removes.

## 2. The system: one token source, shared controls

The approach the maintainer chose (A): one source of tokens generating the style sheets, the reader's controls promoted
to shared components, the reader's pixels unchanged.

### 2.1 The token source

`src/shared/tokens.ts` holds every token as data: the neutral ramp, the roles, the brand and status colours, radii,
shadows and motion, in light and dark. It lives in `src/shared` because the floating button and the figure viewer are
in `src/core` (hard rule 8: the core may not import `src/ui`). Nothing else in the tree writes a colour: a surface
names a role.

The ramp is the reader's, unchanged (the reader's design, §4.1): one cool neutral at hue 255, `n-0` … `n-10`.

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
| `brand` | oklch(0.474 0.18 20.5) | oklch(0.56 0.19 20.5) | the fill of the one primary action; the logo's red, #AA142D |
| `on-brand` | white | white | words and icons on `brand` |
| `brand-chip` | white 18 % | white 8 % | a shortcut label on `brand` (⌥T, ↵) |
| `success` | oklch(0.62 0.14 150) | oklch(0.72 0.14 150) | the connected icon, the floating button's tick |
| `mark` | oklch(0.85 0.12 95) at 70 % | oklch(0.55 0.1 95 / 0.55) | a search hit behind the words |
| `tip-bg` / `tip-ink` / `tip-ink-2` | oklch(0.22 0.01 255) / oklch(0.96 0 0) / oklch(0.74 0.01 255) | the same | tooltips, dark in both themes |
| `float-bg` | n-0 at 90 % | n-0 at 90 % | a floating pill or capsule |
| shadows | `page-shadow`, `float-shadow`, `pop-shadow`, `card-shadow` | their dark values | as the reader's, plus the settings card's |

The reader's `--danger`, `--focus`, `--well`, `--lift`, `--fill` and shadows keep their current values exactly.

- **Brand and danger read as one hue** (20.5° and 28°, within the 15° the better-colors skill treats as the same colour).
  So danger is never a fill: a destructive confirmation is a neutral button with danger words and a trash icon
  (§6.6), and brand is never used for an alert.
- **The brand fills one action per view** (better-colors). Switches, chosen states, radios and the focus ring stay ink,
  as in the reader.
- **Placeholders are `ink-2`, as the reader's search field's are**: `ink-3` on a field reads 3.49:1 (settings
  prototype), under the 4.5:1 text needs.

### 2.2 The sheets it generates

- **Extension pages** (popup, settings, reader, gallery): `src/styles/tokens.css`, generated from the source and
  committed, unprefixed as the reader's are today (`--ink`, `--n-3`): the pages are the extension's own documents,
  not injected. Light on `:root` and `[data-theme="light"]`; dark under `prefers-color-scheme` for `:root:not([data-theme="light"])`
  and on `[data-theme="dark"]`, the reader's pattern. A test regenerates the sheet in memory and fails when the
  committed file differs; `pnpm tokens` rewrites it.
- **Shadow roots on arXiv's pages** (the floating button, its panel frame and menus, the figure viewer): the same
  roles as `--axt-` variables (hard rule 2), written into each shadow sheet by one function of the source at run time
  (a few hundred bytes), scoped to `:host`. No generated file: the content script already builds these sheets as strings.
- **Tailwind**: `ui.css` and `reader.css` map the roles into `@theme inline` as the reader does; the old `--axt-bg`,
  `--axt-card`, `--axt-fg` … tokens of `ui.css` and UI.md §5 go.

### 2.3 Shared controls

The reader's controls move from `src/pdf-reader/ui/` to `src/ui/controls/`, and their CSS from `reader.css` to
`src/styles/controls.css`, which both `ui.css` and `reader.css` import:

- as they are: `Switch`, `Popover` / `usePopover`, `useTip`, `radioKeys`, `trackModality`, `withoutTransitions` /
  `applyAppearance`, `Icon`; the classes `.seg`, `.pop` (with `.item`, `.search`, `.sep`, `.row`), `.tip`, `.switch`,
  `.swatch`, `.menu-btn`, and the base focus rules;
- new, from the prototypes: `Radio` (16 px, a 1.5 px ring in `ink-3`, `ink` when chosen, its dot growing from the
  centre), `Reveal` (§8), `Row` and its parts (§6.2), `Button` in three kinds (brand, neutral, text) with `Kbd`,
  `Field`, `Combobox`, `UndoRow`, `ConfirmButton`, and `.seg.fit`, a segmented control whose segments take their
  words' widths and whose thumb follows the chosen one by anchor positioning (`anchor-name` on the chosen segment,
  `anchor-scope` on the control; Chrome 131, the floor). The reader keeps its equal segments.

What stays the reader's own: the toolbar button, the contents, the page pill, the scroll indicator, the progress line,
the capsule and the card.

The settings page's and the popup's current components are retired: `Menu`, `MenuField`, `Segmented`, `Switch`,
`Button`, `Field`, `Confirm`, `Drawer`, and `src/ui/appearance/*` (the grid of tiles and its drawer).

### 2.4 The reader stays pixel-identical

The reader's rendering is the contract of this change's first step. A probe screenshots the reader in light and dark —
the toolbar at rest, each popover open, the reading options, a tooltip, the capsule and the card — before the tokens
and controls move and after, and the two sets must be identical pixel for pixel. Moving the code is not allowed to
move a pixel; any change to the reader's look is a separate decision.

## 3. One appearance for the whole extension

The maintainer approved one appearance setting for everything (2026-09-26): 跟随系统 / 浅色 / 深色, today the reader's
alone (`pdfReader.appearance`), becomes the extension's (`theme`, §4).

- **Where it is set**: the settings page's 外观 section, first row; the reader's reading options, as today. Both write
  the same value, so choosing dark in the reader turns the popup and the settings page dark too.
- **How it is applied**: one function, `applyTheme(root, theme)`, sets `data-theme` on the document's root (absent for
  the system's); each extension page calls it before its first paint and again when the value changes. A change
  switches colours at once with every colour transition held off (`withoutTransitions`); only a thumb's slide runs.
  The reader keeps its crossfade of the whole page (its design, §4.3).
- **Which surfaces follow it, and which follow the page**:
  - the extension's own controls follow `theme`: the popup (in the toolbar and in the floating panel's frame), the
    settings page, the reader, and the floating button with its menus (its shadow host carries `data-theme`);
  - controls that sit **on the paper** follow the paper's own colours, as they do today: the figure viewer's button
    and bar, and the failed block's retry. They take the token values (§7) but light or dark by the page.
- `pdfReader.dimPages` stays the reader's own setting; on the settings page it is a sub-row of the appearance (§6.4).

## 4. Configuration v20, and the service health record

`CONFIG_VERSION` 19 → 20, with its migration (hard rule 7). What the redesign removes as a choice is removed from the
configuration too, so no value the reader cannot see keeps changing behaviour.

| Change | Migration | Why |
|---|---|---|
| `theme: 'system' \| 'light' \| 'dark'` added | from `pdfReader.appearance`, which goes | §3 |
| `preload` becomes `'on-demand' \| 'whole'` | `margin: 'all'` → `'whole'`; any number → `'on-demand'`; `threshold` goes | §6.5: two choices, the timing fixed |
| `image.modes` goes | dropped | §6.5: figure text shows in every display |

- **On demand** is today's default: a margin of 1000 px below the window and a threshold of 0 (a paragraph counts as
  entered as it first shows). The scheduler keeps its numbers as constants (`ON_DEMAND_MARGIN = 1000`,
  `ENTER_THRESHOLD = 0`); **whole** is today's `all`. What two and three screens did, and a later start, is gone
  (§11).
- **Figure text in every display**: the overlays' display gate goes with the field — `setImageModes`, its style rule
  and the session's and the reader's `modes.includes(...)` checks. `image.enabled` stays the one switch.
- **Highlights** keep their data (`appearance.highlights`, `activeHighlight`): the settings page shows them as
  swatches, as the reader already does (§6.4).
- **Services** keep their data. A service can no longer be added without a successful connection (§6.3), but a
  service stored without a key by an earlier version stays, and is shown as needing one.

**The service health record** (new, not configuration): `local:serviceHealth`, a map from a service's id to
`{ rejected: <time> }`. The background writes it when a request to that service ends in `auth` (the key refused); a
successful connection, a key update or the service's deletion clears it. It carries no key and nothing of the
request. The settings row reads it (API Key 已失效, §6.3), and so does the popup: a rejected service counts as one that
cannot run (UI.md §4's `runnable`), its reason is the rejection's (§5.2), and the background's chain passes over it
as the popup says it will, until a connection from the settings page clears the mark. It lives outside the configuration
because it is a fact the extension observed, not a choice the reader made, and a configuration that fails to parse
must never take it with it.

## 5. The popup

### 5.1 Structure and measures (round 6)

320 px wide, on `chrome`. From the top (round 1, the original order the maintainer asked to keep):

1. **The brand row**, 44 px: the mark and 「Read arXiv」 at the leading edge, the settings gear at the trailing edge.
2. **The group** (`group`, radius 10, 4 px in, 12 px from the popup's edges): 翻译服务, 目标语言 and, for an LLM service,
   提示词 — each a row of 36 px, its label leading in `ink`, its value trailing in `ink-2` with a chevron in `ink-3`,
   both 13 px; rows inset 4 px with a radius of 6, separated by a hairline inset 8 px. A value cut short shows whole in
   its tooltip; a label never shrinks. Two left edges only: controls at 12 px, words at 24 px.
3. **A note**, when there is one (§5.2).
4. **The primary button**: full width, 36 px, radius 9, `brand` with `on-brand` words at 13 px / 500, pressed to 0.96.
   Its shortcut label follows the words: `brand-chip` behind `on-brand` 11 px / 500 (the maintainer, 2026-09-26: round
   2's light label, 「更顺眼」; its 85 % words read 4.35:1 and 3.26:1, so they are white: 5.41:1 light, 4.59:1 dark).
5. **The display control**: `.seg.fit`, 30 px, 左右 · 上下 · 仅译文 with the reader's family of icons, its thumb
   following the chosen segment.
6. **The foot**, one row: the switches 对照高亮 and 图片翻译 with their words, and the 译文样式 menu button at the trailing
   edge.

Groups sit 16 px apart and rows within a group 8 px (better-layout: between groups at least twice the gap within one).

### 5.2 States

UI.md §4's state table stands, with these changes:

- **Notes (round 4, and A of round 6)**: a note is a row on `group`, radius 10: an icon at its leading edge, one or two
  lines of `ink` words, and a raised button at its trailing edge (设置 or 重试). A note about something blocked or
  stopped carries the alert icon in `danger`; one about something that goes on (a service switched, a limit) the
  information icon in `ink-2`. **The words stay ink: never red words, never a red ground.**
- **Paused (P9) and a page behind its settings (P13)** (round 6): 重新翻译 (brand) and 显示原文 (neutral, `fill`) side
  by side, equal widths, the brand first; the shortcut label only on the brand one. A disabled button is neutral grey
  and carries no shortcut.
- **A rejected key**: where UI.md says 「LLM 尚未配置 API Key」 (S-P-32a, S-P-45), a service whose key was refused says
  「API Key 已失效」, and P7 / P8 follow as for any service that cannot run (§4's health record). A service stored with no
  key keeps S-P-32a's words.
- **The reader open (S-P-03c)**: 上下 greyed with S-P-75's tooltip; no 译文样式; the display and the two switches stay,
  and the reader follows them.

### 5.3 Menus

The popover of §2.3, opened under its row, the popup tall enough to hold it (the popup's body takes a minimum height
while a menu is open, cleared before it is measured again: round 4's lesson, where a flip of theme had cut the English
service menu short).

- **Services**: an item of two lines, the name and its hint; a Chrome pack to fetch shows a neutral 下载 in the item.
- **Styles**: opens upward (the foot is the popup's last row); one line per style, its name leading and the sample
  sentence trailing, drawn in that style.
- **Every menu whose list the reader can change ends with 「管理…」** (round 5): 管理翻译服务… · 管理提示词… ·
  管理译文样式…, each opening the settings page at that row (§6.1). The language menu has none.

### 5.4 Not on a paper (P0): search and open

Round 6; the maintainer: 「支持一个最基础的搜索功能就够了」.

- **What shows**: under the brand row, 「打开 arXiv 论文（HTML 或 PDF）即可翻译」, then a search field
  (「按标题、作者、摘要或链接搜索论文」) and under it 「按回车搜索 · 高级搜索」, 高级搜索 a link to arXiv's advanced search.
- **What the field takes, decided as it is typed; nothing happens until Enter**:
  - an arXiv **PDF or HTML address** (`arxiv.org/pdf/…`, `arxiv.org/html/…`, any version): one brand row under the
    field, 「PDF 翻译 · arXiv {id} ↵」 or 「HTML 翻译 · arXiv {id} ↵」; Enter opens that page with `#readarxiv`;
  - an **abstract address, a bare id** (`2501.07202`, `2501.07202v1`, `arXiv:2501.07202`, an old-style
    `hep-th/9901001`) **or an arXiv DOI** (`10.48550/arXiv.2501.07202`): the two entries of P17 (§5.5), greyed as P17's
    are by the same two checks (the reader's design, §2), run once per id when the field has been still for 300 ms;
    the entries appear when both have answered;
  - **anything else that is not a link**: a neutral row 「在 arXiv 搜索「{q}」 ↵」; Enter opens
    `arxiv.org/search/?query={q}&searchtype=all&source=header` in a new tab. The popup lists no results;
  - **a link elsewhere**: 「只能打开 arXiv 的论文链接。也可以输入标题或作者搜索。」 under the field, and Enter does nothing.
- Everything P0 opens, opens in a new tab, whatever S-O-49b says: that setting is about leaving a paper's page, and the
  page under this popup is not a paper. The popup closes once it has opened the tab. Pasting never navigates by itself.
- **An arXiv page still loading** is not P0: it says 「页面加载中」 and shows no field (the view model tells the two
  apart).

On the brand row, the id after the entry's words is 85 % white in light (5.65:1) and white in dark (85 % read
4.10:1), told apart by weight: the words 500, the id 400.

### 5.5 Entry pages (P17)

Round 6, on the abstract page and on a PDF page with the reader closed:

- the two entries are brand buttons with icons, side by side, equal widths: HTML 翻译 with a globe, PDF 翻译 with a
  document (Lucide `globe`, `file-text`); the one that cannot be used is greyed, as S-P-50b says;
- the page shows only 翻译服务, 目标语言 (and 提示词) and the two entries: the display, the two switches and the
  style belong to a translated page, and are hidden here.

## 6. The settings page

### 6.1 Frame

- **Sidebar** (232 px, on `page`): the mark and 设置; the search field; the four sections **翻译 · 外观 · 阅读 · 数据**,
  each with its icon (Lucide `languages`, `palette`, `book-open`, `database`); at its foot, the interface language.
  The current section is a raised row (`chrome`, hairline); the others `ink-2`, lit on hover.
- **The interface language at the sidebar's foot** (the maintainer: 「藏的感觉有点深」): a row like the sections', a
  globe on the icons' edge, the value after it, a menu opening upward whose languages are written in their own names
  with `lang`. The globe is the cue that needs no reading: a reader who cannot read the interface is the one looking
  for it. For the same reason its name adds 「Interface language」 to the interface's own word where that is not English
  (「界面语言 · Interface language」).
- **Main column**: up to 680 px, 30 px from the top, 48 px from the sidebar; the section's title (20 px / 600) and then
  its groups, no introduction under the title.
- **Search** (「搜索设置」): as it is typed, rows are filtered by their label, their description and a few keywords of
  their own (界面语言 answers to 「language」 too); every section shows its matches under its name, the matched words
  on `mark`; the sidebar shows no current section meanwhile. The count is said to screen readers (「找到 {n} 项设置」, a
  polite status). Nothing found: 「没有与「{q}」匹配的设置」 and 清空搜索. Escape clears it. The interface language, which
  lives in the sidebar, has a row that only a search shows.
- **Deep links**: `options.html#<section>/<row>` opens the section, scrolls the row into view and lights it once
  (`ink` at 9 %, fading over 1.4 s). The popup's 管理… rows use `#translate/services`, `#translate/prompts`,
  `#appearance/styles`; the reader's settings link `#reading/pdf`. The old section hashes lead to their new places
  (`#services`, `#prompts`, `#pdf-reader`).

### 6.2 The row grammar

One way of writing a list on the whole page (the lesson of 2026-09-26: tiles beside rows had read as two designs).

- **A card**: `chrome`, radius 10, 4 px in, a hairline and a 1 px shadow in light, a hairline of white 6 % in dark.
  Group headings (13 px / 600) sit on the words' edge, 22 px after the card before them and 8 px above their own; a
  heading may carry an aside at its trailing end (12 px, `ink-3`) or a text button.
- **A row**: at least 48 px, 8 px by 10 px in, radius 6; a label (13 px, `ink`) over a description (12 px / 1.4,
  `ink-2`); a value, a switch, a status or a button at its trailing edge. Rows are separated by a hairline inset 10 px.
- **Three leading edges and one trailing edge, 14 px from the card's**: controls at 14; words at 42 after a leading
  control (a radio, a plus); one step of 28 px per level of sub-row (14 / 42 / 70). A trailing icon button is a 28 px
  square pulled 6 px outward, so that its glyph ends on the trailing edge the switches keep (better-ui: optical
  alignment).
- **Every item of a row sits on the row's centre line**, within 0.5 px (§12).
- **Hover**: a row lights with `ink` at 4 % to the card's inner edge, radius 6 (concentric: the card's 10 less its 4);
  the separators on either side of it step aside.
- **A sub-row** appears only when it applies (§8's reveal), indented one step.
- **A list the reader can change ends with 「＋ 新建…」**, in `ink-2`, its plus on the controls' edge.
- **A row of one's own carries its actions behind 「…」**, shown on the row's hover or the keyboard's focus (always on
  a touch screen).
- **Deleting is undone, not confirmed**: the row is replaced by 「已删除「{名称}」 · 撤销」 for 5 s. Clearing a cache,
  which cannot be undone, is confirmed in place (§6.6).

### 6.3 翻译

**翻译服务**, one card, one radio group (the arrows move the choice):

- **Microsoft 翻译 · Google 翻译** 「免费」; **Chrome 翻译** 「浏览器内置，无需联网」, with 「 · 需要先下载语言包」 and a
  neutral 下载 while its pack can be fetched (not choosable until it is there; 「语言包下载中」 while it comes;
  「当前不可用」 greyed when Chrome has none);
- **the reader's own services**, each 「{名称}」 over 「{模型} · {主机}」; nothing at the trailing edge while it works, the
  status and 「…」 otherwise;
- **添加服务…**, the last row.

**Adding a service** opens under that row, in place (no drawer):

1. **接口地址**, with three suggestions under it that fill it in: OpenRouter, DeepSeek, 本机 Ollama. They fill an
   address, nothing else: they are not vendor templates, which the maintainer ruled out (2026-09-10), and the
   maintainer approved the suggestions (T4, 2026-09-26);
2. **API Key**; a local address says 「· 本机地址可以不填」;
3. **模型**: a combobox that lists the endpoint's models once the address and the key are in, searchable
   (「搜索 {n} 个模型」); a name can be typed when the list cannot be had;
4. **名称（选填）**, the model's name by default;
5. **更多**: 深度思考 (today's switch under 更多选项, S-O-30), folded;
6. **连接** (brand) · 取消, and 「连接成功后才会添加」 beside them.

- **A service is added only when it connects** (the maintainer: 「如果不输入正确的KEY，联通不能测试，用户应该就不能添加才对」):
  连接 checks the fields (an address, a key for an address that is not local, a model), asks for the endpoint's
  origin, translates one sentence through it, and only then adds it, chooses it, closes the form and shows
  「已连接 · {ms} ms」 on its row with the icon's arrival (§8), for as long as the page stays open. A failure keeps the form, says why beside the button
  (「连接失败：{S-E 原因}」), and puts the focus on the field at fault.
- **The origin permission is asked on a gesture** (`permissions.request` needs one). A suggestion's click asks for its
  origin at once; an address typed by hand is asked for when the model list is opened (a click) or at 连接. The model
  list loads by itself only for an origin already granted (OpenRouter is in the manifest). A permission refused says
  so beside the field, in today's words (`services.permission.denied`).

**A key refused later** (§4's health record): the row says 「API Key 已失效」 with the alert icon; choosing it opens
under it 「服务拒绝了这个 API Key，它可能无效或已过期。换一个新的，其他设置不变。」, a field 「新的 API Key」 and
「更新并连接」, with 「连接成功后才会保存」. A service stored without a key by an earlier version shows 「尚未配置 API Key」
and the same form, without the first sentence.

**A service's 「…」**: 编辑… opens the same form under its row, filled in, the key field empty with 「已保存 · 留空则不改」;
删除 removes it with the undo row (a deleted service that was chosen falls back to Microsoft 翻译, as S-O-21 says, and
comes back chosen if the deletion is undone).

**Under the card**:

- **出问题时自动改用免费服务** (S-O-22) as a sub-row card, only while an LLM service is chosen (a free one has nothing to
  fall back from);
- **目标语言**, a row with the popup's searchable menu (S-P-22 / 23).

**LLM**, a group headed 「LLM」 with the aside 「提示词与术语表只对 LLM 服务生效」; with no LLM service it is one line,
「添加 LLM 服务后可设置提示词与术语表」.

- **提示词**: the row's value is the prompt in use and its description the prompt's. It opens a list in place (a radio
  group), each prompt with its description; the reader's own carry 「我的」, and a description made of the start of
  their instructions.
  - The chosen prompt shows its text under it, read as words: the variables drawn as small labels (目标语言 · 原文 ·
    论文标题 · 摘要 · 章节标题 · 术语表), never `{{…}}`, in two parts named for what they do — **指令** (the system prompt:
    「翻译时始终遵守的要求」) and **消息** (the user prompt: 「每次随原文一起发送」). Nothing names the protocol the
    extension appends.
  - A built-in prompt cannot be changed: 「复制后修改」 makes the reader's own copy, 「{名称}（副本）」, and opens it.
  - The reader's own is edited in place: its name and its two parts, the variables inserted from a row of labels; 完成
    closes it; 删除 with the undo row.
  - The list ends with 「＋ 新建提示词…」 and, at the same row's trailing end, 导入… and 导出… (the maintainer: in the
    list, not in a menu). 导出… shows once there is a prompt of one's own to export.
- **术语表** 「让同一篇里的译法一致」, its value the count (「{n} 条」). It opens a table in place, 原文 · 译文, one pair a
  row, a row's remove button shown on its hover or focus, an empty row at the end to add one (Enter adds the next);
  pasting lines of 「原文, 译文」 splits them into rows. A row with a problem says it at that row (today's reasons, without
  their line numbers); the table saves what parses, as today, within the limits of `GLOSSARY_LIMITS`.

### 6.4 外观

- **外观** 跟随系统 · 浅色 · 深色 (§3): the reader's equal `.seg`, with its icons (a monitor, a sun, a moon) and the
  words. Equal segments slide their thumb by `translate`, the one transition a change of theme lets run (§3).
- **深色时调暗 PDF 页面** 「深色外观下把 PDF 页面调暗；高亮与图中译文保持原色」, a sub-row shown for 跟随系统 and 深色.
- **译文样式**, a group whose heading carries 「恢复内置样式」 (the built-ins back as shipped, the reader's own kept, as
  `resetBuiltIns` does). One card, one radio group: a row a style, its name over the sample sentence written in that
  style, a pencil at the trailing edge (「编辑「{名称}」」). The last row is 「＋ 新建样式…」.
  - **The editor** opens under the row, in place, for built-ins as for the reader's own: 名称; the preview (the
    original sentence over the translation, in the style); **颜色** (swatches: 跟随原文, the palette, a colour of one's
    own); **浓淡** 原样 · 淡一些 · 更淡 (opacity 1 · 0.7 · 0.5; 0.7 is the built-in 淡一档's, and a value between the
    steps shows no step chosen until one is); **下划线** 无 · 实线 · 点线 · 虚线 · 波浪, with **线宽** 1px · 2px as a
    sub-line once a line is chosen; **更多**, folded: 悬停前模糊 「译文先糊着，鼠标停上去才清晰」 and the custom
    declarations (「自定义 CSS（只写声明，例如 letter-spacing: 0.02em）」, validated in place as today); then 完成 and
    删除样式 (with the undo row).
- **对照高亮** (S-P-80) 「悬停时高亮对应的句子；仅译文时停留可查看原文」, a switch; while it is on, the sub-row **颜色**:
  the highlight profiles as swatches, as in the reader's reading options, and last a swatch for a colour of one's own,
  which holds one colour of the reader's (it adds a profile the first time and changes it after). Profiles an earlier
  version let the reader add stay as swatches.

### 6.5 阅读

- **翻译方式** 按需翻译 · 整篇翻译 (§4), its description following the choice: 「只翻译正在阅读和即将读到的段落，用量最少」 /
  「打开论文时就请求整篇译文，滚到哪里都已翻好，用量较多」. 整篇翻译 reaches an open paper at once, as 整篇 does today.
- **图片翻译** 「图里的文字也翻，译文叠在图上，悬停查看原文」, a switch.
- **译文在哪里打开** 「从摘要页或 PDF 页打开译文时」, a small `.seg` 新标签页 · 当前标签页 (S-O-49b).
- **显示悬浮按钮** 「在 arXiv 的摘要页、PDF 和全文页贴在窗口边缘」 (S-O-49c).
- **PDF**, a group: **在 arXiv 的 PDF 上使用对照阅读器** 「关掉后，PDF 用浏览器自带的查看器打开」, and while it is on, the
  sub-row **同步滚动** 「原文和译文一起滚」.

### 6.6 数据

- **已缓存的译文** 「{n} 段 · {size} MB · 换了服务、模型或提示词会自动分开存，通常不用清」 and **已缓存的 PDF 译文**
  「{n} 篇 · {size} MB」, each with a neutral 「清空…」. A press turns it into 「确认清空」 with a trash icon, its words in
  `danger` (4.83:1 on `button-danger` in light, 5.01:1 in dark); it returns after 3 s untouched, and does not while the
  pointer rests on it. Done, the row says 「已清空」 with the success icon. A cache that cannot be read says so (S-O-71).
- **诊断日志**, as today (issue #156), with a neutral 导出.

### 6.7 Settings that cannot be read

S-O-02 stays as it is, drawn as a card at the top of the main column with its reset (the confirm pattern of §6.6): the
sections that would show defaults as the reader's are not drawn, 数据 stays, and search finds only what is drawn.

## 7. The floating button and the controls on arXiv's pages

The floating button keeps its shape, its place and its behaviour (Read Frog's frame with Immersive Translate's feel,
the maintainer, 2026-09-18). What changes is its material, to the family's roles, following `theme` (§3):

- its surfaces `chrome` with a hairline, its shadows `float-shadow`, the menu (本次隐藏 · 不再显示) the shared `.pop` and
  `.item`, its tooltips the shared `.tip`, dark in both themes;
- the tick on a translated page `success`, its focus ring 2 px `focus`;
- the panel's frame radius 12 with `pop-shadow`; the popup inside it is the popup (§5);
- its timings stay: they are the feel the maintainer chose.

The figure viewer's button and bar take `float-bg`, `float-shadow`, radius 8 and the `focus` ring, light or dark
by the page, as today (§3). The failed block's retry takes `danger`, by the page. The abstract page's line keeps
arXiv's own look: it is one of arXiv's links.

Before and after screenshots of the button (at rest, lit, the menu open, the panel open) and of the viewer, in both
themes, are shown to the maintainer before this part merges.

## 8. Motion

Each value is exact (better-ui); each has a static cue beside it; under reduced motion each is a fade or nothing.

| What | How |
|---|---|
| A sub-row, a form, an editor or a list appearing | `grid-template-rows` 0fr → 1fr 220 ms on `cubic-bezier(0.2, 0, 0, 1)` with opacity 180 ms ease-out after 40 ms; closing 180 ms ease-out and opacity 120 ms. Closed, it is `inert` |
| A radio chosen | its dot scales from the centre, 150 ms |
| A segmented control | the thumb slides to the chosen segment, 220 ms, as the reader's; `.seg.fit` animates its left edge and width |
| A press | scale 0.96, 150 ms, on every button and chip |
| An icon arriving (connected, cleared) | scale 0.25 → 1, opacity 0 → 1, blur 4 px → 0, 300 ms on `cubic-bezier(0.2, 0, 0, 1)` |
| A row arriving (undo, a new row) | opacity and 4 px down, 260 ms |
| A menu | the reader's `pop-in`, 150 ms |
| A row reached by a deep link | its fill at `ink` 9 %, fading over 1.4 s |
| A description swapped (翻译方式) | the reader's `words-in`, 180 ms |
| A change of theme | colours switch at once; transitions held off for the flip |

## 9. Accessibility

- Radio groups (services, prompts, styles, the segmented controls) move with the arrows on a roving tab stop.
- A closed reveal is `inert`; an opened form puts the focus on its first field, and a closed one gives it back to the
  row that opened it.
- A form is checked when it is submitted: the fields at fault carry `aria-invalid` and their reason by
  `aria-describedby`, and the first takes the focus. The model combobox is `aria-busy` while it loads.
- The search's count and a connection's result are polite status messages; nothing is `assertive`.
- Rings are the keyboard's (the reader's modality): a field clicked shows its edge, not a ring.
- A switch's whole row is its label; icon-only buttons are named (「{名称}」的更多操作, 编辑「{名称}」, 删除第 {n} 行).
- Forced colours as in the reader: chosen states take `Highlight`.
- Every surface reflows at 200 % zoom and at 320 px of width: the settings sidebar folds above the column below 640 px.

## 10. Copy

The words below are new or changed; the rest keep their UI.md ids. The build moves them into UI.md (§13), where the
elements that persist keep their ids and new ones are numbered. Tone as UI.md §1: nouns for states, verbs for buttons,
no 请, a single sentence without a full stop.

### 10.1 Popup

| Where | zh-CN | en |
|---|---|---|
| P0, the sentence | 打开 arXiv 论文（HTML 或 PDF）即可翻译 | Open an arXiv paper, HTML or PDF, to translate it |
| P0, the field | 按标题、作者、摘要或链接搜索论文 | Search by title, author, abstract or link |
| P0, under the field | 按回车搜索 · 高级搜索 | Press Enter to search · Advanced search |
| P0, the search row | 在 arXiv 搜索「{q}」 | Search arXiv for “{q}” |
| P0, a link elsewhere | 只能打开 arXiv 的论文链接。也可以输入标题或作者搜索。 | Only arXiv paper links open here. You can search by title or author instead. |
| An arXiv page loading | 页面加载中 | Loading the page |
| The prompt menu's last row | 管理提示词… | Manage prompts… |
| A rejected key, the service menu and notes | API Key 已失效 | API key no longer valid |

### 10.2 Settings

| Where | zh-CN | en |
|---|---|---|
| Sidebar | 设置 · 搜索设置 · 清空搜索 | Settings · Search settings · Clear search |
| Sections | 翻译 · 外观 · 阅读 · 数据 | Translation · Appearance · Reading · Data |
| Interface language, its name / its value | 界面语言 · Interface language / 跟随浏览器 | Interface language / Browser language |
| Interface language, the row a search shows | 也在左下角 | Also at the foot of the sidebar |
| Search, the count / nothing found | 找到 {n} 项设置 / 没有与「{q}」匹配的设置 | {n} settings found (1 setting found) / No settings match “{q}” |
| Services, the group | 翻译服务 | Translation service |
| Chrome's pack to fetch | · 需要先下载语言包 | · needs its language pack first |
| An own service's hint | {模型} · {主机} | {model} · {host} |
| Its more button / menu | 「{名称}」的更多操作 / 编辑… · 删除 | More for “{name}” / Edit… · Delete |
| The undo row | 已删除「{名称}」 · 撤销 | Deleted “{name}” · Undo |
| Add | 添加服务… | Add a service… |
| Address suggestions | OpenRouter · DeepSeek · 本机 Ollama | OpenRouter · DeepSeek · Local Ollama |
| Model, empty / loading / search | 填好接口地址和 API Key 后列出 / 正在获取模型… / 搜索 {n} 个模型 | Listed once the address and key are in / Loading models… / Search {n} models |
| Model, no match / no list | 没有匹配的模型，可以直接填写 / 没能列出模型，可以直接填写 | No model matches; type its name / Couldn't list the models; type the name |
| Name | 名称（选填） · 默认使用模型名 | Name (optional) · The model's name by default |
| Beside 连接 | 连接成功后才会添加 | Added once it connects |
| Checks | 填写接口地址，例如 https://openrouter.ai/api/v1 · 填写 API Key · 选择或填写一个模型 | Enter an API address, such as https://openrouter.ai/api/v1 · Enter the API key · Choose or type a model |
| A connection that failed | 连接失败：{原因} | Couldn't connect: {reason} |
| A rejected key, the row | API Key 已失效 | API key no longer valid |
| A rejected key, the form | 服务拒绝了这个 API Key，它可能无效或已过期。换一个新的，其他设置不变。 · 新的 API Key · 更新并连接 · 连接成功后才会保存 | The service refused this API key; it may be invalid or expired. Enter a new one; nothing else changes. · New API key · Update and connect · Saved once it connects |
| Editing, the key field | 已保存 · 留空则不改 | Saved · leave empty to keep it |
| The LLM group | 提示词与术语表只对 LLM 服务生效 / 添加 LLM 服务后可设置提示词与术语表 | Prompts and the glossary apply to LLM services only / Add an LLM service to set prompts and a glossary |
| Prompts | 我的 · 复制后修改 · 内置提示词不能直接改 · 完成 · 删除 · 新建提示词… · 导入… · 导出… | Mine · Copy to edit · Built-in prompts can't be changed · Done · Delete · New prompt… · Import… · Export… |
| A prompt's two parts | 指令 「翻译时始终遵守的要求」 · 消息 「每次随原文一起发送」 | Instructions “Followed in every translation” · Message “Sent with each passage” |
| Its variables | 目标语言 · 原文 · 论文标题 · 摘要 · 章节标题 · 术语表 | Target language · Source text · Paper title · Abstract · Section title · Glossary |
| A new prompt | 新提示词 | New prompt |
| An import that failed | 无法读取这个文件 · 这个文件里没有可用的提示词 | This file can't be read · This file holds no prompts |
| Glossary | 术语表 「让同一篇里的译法一致」 · {n} 条 · 原文 · 译文 · 删除第 {n} 行 | Glossary “Keeps a term's translation the same throughout” · {n} terms · Source · Translation · Remove row {n} |
| Glossary, under the table | 可以直接粘贴多行「原文, 译文」，会自动拆成多行 | Paste lines of “source, translation” to add several at once |
| Appearance | 外观 · 跟随系统 · 浅色 · 深色 | Appearance · System · Light · Dark |
| Dimming | 深色时调暗 PDF 页面 「深色外观下把 PDF 页面调暗；高亮与图中译文保持原色」 | Dim PDF pages in dark mode “Highlights and figure text keep their colours” |
| Styles | 译文样式 · 恢复内置样式 · 编辑「{名称}」 · 新建样式… · 新样式 | Translation style · Restore built-in styles · Edit “{name}” · New style… · New style |
| The style editor | 名称 · 颜色 · 跟随原文 · 自选颜色 · 浓淡 · 原样 · 淡一些 · 更淡 · 下划线 · 线宽 · 更多 · 悬停前模糊 · 完成 · 删除样式 | Name · Colour · Same as the original · Pick a colour · Strength · Full · Lighter · Lightest · Underline · Thickness · More · Blur until hovered · Done · Delete style |
| Blur, its description | 译文先糊着，鼠标停上去才清晰 | The translation stays blurred until the pointer rests on it |
| Custom declarations | 自定义 CSS（只写声明，例如 letter-spacing: 0.02em） | Custom CSS (declarations only, such as letter-spacing: 0.02em) |
| Highlight | 悬停时高亮对应的句子；仅译文时停留可查看原文 · 颜色 | Highlights the matching sentence on hover; in translation only, rest on one to see the original · Colour |
| How to translate | 翻译方式 · 按需翻译 · 整篇翻译 | Translate · As you read · Whole paper |
| Its descriptions | 只翻译正在阅读和即将读到的段落，用量最少 / 打开论文时就请求整篇译文，滚到哪里都已翻好，用量较多 | Only what you are reading and what comes next; uses the least / The whole paper is requested as it opens, so every part is ready; uses more |
| Figure text | 图里的文字也翻，译文叠在图上，悬停查看原文 | Text in figures is translated too, laid over the figure; hover to see the original |
| Where translations open | 从摘要页或 PDF 页打开译文时 | When opened from an abstract or a PDF page |
| The floating button | 在 arXiv 的摘要页、PDF 和全文页贴在窗口边缘 | Docked to the window's edge on arXiv's abstract, PDF and full-text pages |
| PDF | 在 arXiv 的 PDF 上使用对照阅读器 「关掉后，PDF 用浏览器自带的查看器打开」 · 同步滚动 「原文和译文一起滚」 | Use the bilingual reader for arXiv PDFs “Off, PDFs open in the browser's own viewer” · Sync scrolling “The original and the translation scroll together” |
| Caches | 清空… · 确认清空 · 已清空 | Clear… · Clear now · Cleared |

Words that go with what they named: the five section names of S-O-01; 内置服务 and 我的服务, the empty line and the
drawer's titles (S-O-10 … 15); the address hint's list (S-O-16); the image modes (S-O-26); 添加配置, 重置, 编辑配置, the
blur's 「适合自测」 (S-O-40 … 46); 背景高亮 (S-O-49); the preload's words (S-O-50, 51, and UI.md §2's two rows); the prompt
manager's 查看, 复制并自定义, System prompt …, 用户提示词, 插入变量 and 导出自定义; the glossary's text-box hint (S-O-62);
S-P-03's sentence.

## 11. What goes, and who agreed

Each item was listed for the maintainer with its reason (`settings-review.md`, marked 〔要你定〕) and approved on
2026-09-26, or was the maintainer's own request.

| Goes | Instead | Agreed |
|---|---|---|
| Two and three screens of preload; the start at half or whole | 按需翻译 (today's default) and 整篇翻译 | R2, R3; no 「更多」 for fine-tuning (the maintainer: 「设置先这样吧」) |
| Showing figure text only in chosen displays | every display | R1 |
| The highlight's cards, editor, names and opacity | swatches, a colour of one's own | A5 |
| The glossary as a text box | a table, pasting splits lines | T8 |
| Adding a service without a connection | connect, then add | the maintainer's own (「理论上来说，缺KEY的服务应该是不太存在的」) |
| Drawers | forms in place | T3, A4 |
| The styles' grid of tiles | rows, as every other list | the detail pass, 2026-09-26 |

What stays that a simpler page might have dropped: the styles' add, edit, delete and restore (the maintainer:
「理论上它可以增删，我们也可以恢复默认这些设置」); the prompts' import and export; 深度思考; the custom declarations; the
underline's thickness; the diagnostics log.

## 12. Verification

- **Alignment**, by script on the built pages in both themes and both languages (the prototypes' `align-probe.mjs`
  made a probe under `tests/e2e/probes/`): every item's centre within 0.5 px of its row's; the settings page's leading
  edges only at 14 / 42 / 70 px from the card and its trailing edge at 14; the popup's at 12 and 24. Hover, open,
  editing and chosen states are measured, not only rest.
- **200 % zoom and 320 px**: every surface, screenshots read at full size, nothing clipped or overlapping.
- **Contrast from the tokens**: a unit test computes each pair from `src/shared/tokens.ts` as the browser composites
  it, and holds each to its floor:

  | Pair | Light | Dark | Floor |
  |---|---|---|---|
  | `on-brand` on `brand` | 7.38 | 5.14 | 4.5 |
  | `on-brand` on `brand-chip` over `brand` | 5.41 | 4.59 | 4.5 |
  | the P0 id on `brand` (85 % light, 100 % dark) | 5.65 | 5.14 | 4.5 |
  | `ink-2` on `group` (values) | 5.25 | 7.25 | 4.5 |
  | `ink-3` on `group` (chevrons) | 3.26 | 4.01 | 3 |
  | `ink-2` on `field` (placeholders) | 5.62 | 7.25 | 4.5 |
  | `danger` on `button-danger` | 4.83 | 5.01 | 4.5 |
  | `danger` on `group` (a note's icon) | 4.83 | 6.29 | 3 |
  | `success` on `chrome` (icons) | 3.43 | 6.72 | 3 |
  | `ink` on `mark` | 12.16 | 6.92 | 4.5 |
  | `ink` on `fill` (the neutral primary) | 13.77 | 10.87 | 4.5 |
  | `line-strong` on `chrome` | 3.64 | 3.39 | 3 |

  The values were measured on the prototypes (`tools/brand.py`, WCAG's formula over sRGB compositing); the test
  measures the tokens themselves.
- **The reader, pixel for pixel** (§2.4), before and after the move.
- **The gates**: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; the e2e suites the surfaces touch
  (`pnpm e2e`, `e2e:floating`, `e2e:pdf`, `e2e:a11y`), updated for the new controls; the reader's `reader-ui` and
  `entries` spikes; `tests/styles/no-has.test.ts` over the injected sheets.
- **The popup opens as fast as it does now**: first paint measured before and after, in the toolbar and in the panel.
- **The migration**: v19 → v20 for each preload value, both appearances, image modes present and absent, and a
  configuration the migration cannot read (hard rule 7).

## 13. Documents that change with the build

- `docs/UI.md`: §2 (the preload's two rows, the image modes), §3.1–3.3 (§10's copy, ids kept where the element
  persists), §4 (P0's search, P9 / P13's buttons, P17, the rejected key), §5 rewritten as the roles of §2.1 with a
  pointer to `src/shared/tokens.ts`, §8's feature rows.
- `docs/DESIGN.md`: §9 (configuration v20 and the health record), §10 (preload as two choices), §15 (figure text in
  every display), §4.0c (the floating button's material), and the platform note on `src/shared/tokens.ts`.
- The reader's design, §4.1: its tokens are the shared ones now, the values unchanged.
- `CHANGELOG.md`, in the reader's words.

## 14. Order of work

Each step is a local commit reviewed by a local Codex pass; the pull request opens once every surface is done and the
gates pass (the maintainer's rule: a pull request is a whole stage).

1. The token source, the generated sheets and the shared controls; the reader moved onto them, pixel-identical.
2. The theme and configuration v20, with the health record and its writer in the background.
3. The popup.
4. The settings page.
5. The floating button and the viewer, with the screenshots of §7 shown to the maintainer.
6. The documents of §13.

## 15. Open points

- **Where injected controls take their light or dark from** (§3): the extension's own controls follow the extension's
  appearance, and the controls that sit on the paper follow the paper. Recommended as written; the maintainer may
  prefer the floating button to follow the paper too.
- **The rejected-key record's scope** (§4): only an `auth` answer marks a key; a spent quota or a network failure does
  not, since those pass by themselves.
