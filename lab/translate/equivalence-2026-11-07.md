# Equivalence with today on recorded material (lane L6)

Input: 14150 records from today's tests (6379 distinct). A verdict is compared only where the adapter writes today's wire, byte for byte or but for the DOM's white space (the rows "white space apart").

**PASS: 6228 compared, 6225 agree, 3 of the accepted class "a `#` of its own" (stated 3), 0 disagreements of no class.**

| source | wire | outcome | records |
|---|---|---|---|
| html | markers | agree | 2121 |
| html | tags | agree | 1631 |
| html | markers | agree, white space apart | 1198 |
| html | tags | agree, white space apart | 1162 |
| html | markers | wire | 128 |
| pdf | markers | agree | 82 |
| pdf | tags | agree | 21 |
| html | tags | wire | 15 |
| web | markers | agree | 10 |
| pdf | markers | wire | 3 |
| html | markers | accepted | 3 |

## Accepted differences (the package's on purpose), each with its cause and count

| class | cause | stated | found |
|---|---|---|---|
| a `#` of its own | a block whose text holds a `#` of its own, a reply with a `#` right after a marker: refused here, taken today. Microsoft's doubled closer (`@a##`) and the text's own `#` moved beside the marker cannot be told apart, and either way a reader would see one `#` too many or too few; the reply goes to the next translator (stage 4b, lanes/L6-translate.md "Stage 4b, checks", check 1; packages/translate/src/wire/markers.ts readMarkers) | 3 | 3 |

- a `#` of its own: html/markers: today takes, here refuses: refused here (unread). Wire `@@a @a##`, reply `@@a @a##` (tests/protector/markers.test.ts › the unforgeability of the escaping > a text node ending in @ right before a protected node: the placeholder must not be swallowed (Codex on #107))
- a `#` of its own: html/markers: today takes, here refuses: refused here (unread). Wire `written in F# @a# holds`, reply `F# 如图 @a## 所示` (tests/protector/markers.test.ts › a marker's `#` set twice is the marker's (#320) > a block whose text holds a `#` of its own keeps the reading it had: the second `#` may be the paper's)
- a `#` of its own: html/markers: today takes, here refuses: refused here (unread). Wire `case @a##3 holds`, reply `case @a##3 holds` (tests/protector/markers.test.ts › a marker's `#` set twice is the marker's (#320) > a block whose text holds a `#` of its own keeps the reading it had: the second `#` may be the paper's)

## Disagreements (the same wire, or one but for white space; different verdicts) of no accepted class, each with its cause


## Records whose wire differs, by cause

- 128 × html/markers: side-by-side elements one marker here (the PDF wire's rule, now the one Microsoft adapter's), one each on the HTML page; fewer markers here
- 15 × html/tags: a span holding no text one void here, a pair around its elements on the HTML page; fewer markers here
- 1 × pdf/markers: today same-style neighbour pairs one span; one span each here (a limit of this conversion: the source reader types the span); a placeholder that sets no ink: no piece; TeX's space (a tie) a marker today, text here; more markers here
- 1 × pdf/markers: a lone end: a marker where it stands today, no piece here (typed pieces nest); a placeholder that sets no ink: no piece; fewer markers here
- 1 × pdf/markers: TeX's space (a tie) a marker today, text here; fewer markers here
