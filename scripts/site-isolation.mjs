// Which content scripts of a built manifest can run on a host's pages (DESIGN §4.0d, run by scripts/check-output.mjs).
// The website's mark is meant to be the only script of the extension that runs on the website, and "only" has to hold
// against patterns that cover the website without naming it: `https://*.readarxiv.org/*`, `*://*/*`, `<all_urls>`. An
// earlier check asked whether a pattern contained the host's name and missed all three (Codex on #315).
//
// Matching is WXT's own library (`@webext-core/match-patterns`, MIT, behind `wxt/utils/match-patterns`), which WXT
// uses for the same patterns; a pattern it refuses is one Chrome refuses, and it throws, so the check stops there
// rather than reading a pattern it cannot parse as one that does not cover.
import { MatchPattern } from 'wxt/utils/match-patterns'

/** `https://host/<anything>` and `<all_urls>`: the path a pattern asks for is left out */
const withAnyPath = pattern => (pattern === '<all_urls>' ? pattern : pattern.replace(/^(.*?:\/\/[^/]*)\/.*$/s, '$1/*'))

/** The pattern matches every path of the hosts it names, not some of them */
const asksForEveryPath = pattern => pattern === '<all_urls>' || /^.*?:\/\/[^/]*\/\*$/s.test(pattern)

/**
 * Whether a match pattern covers some page of the host over https. The path is no help to a script that wants to stay
 * off the website: a path pattern still matches the pages it names, so only the scheme and the host are asked
 * (`https://host/library` covers the website as `https://host/*` does)
 */
export function patternCoversHost(pattern, host) {
  new MatchPattern(pattern) // refuses what Chrome refuses, with the pattern as it was written
  return new MatchPattern(withAnyPath(pattern)).includes(`https://${host}/`)
}

/**
 * The content scripts of a manifest that can run on the host's pages over https: one of its `matches` covers the host
 * and none of its `exclude_matches` excludes the host's every page. `include_globs` and `exclude_globs` only narrow
 * what the matches allow, and a narrower script is still a script on the website, so they are left out of the question
 */
export function contentScriptsRunningOn(contentScripts, host) {
  return contentScripts.filter(entry => {
    const covered = (entry.matches ?? []).some(pattern => patternCoversHost(pattern, host))
    const excluded = (entry.exclude_matches ?? []).some(pattern => asksForEveryPath(pattern) && patternCoversHost(pattern, host))
    return covered && !excluded
  })
}
