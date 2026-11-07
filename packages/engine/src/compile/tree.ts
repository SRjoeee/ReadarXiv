// The TeX tree a paper is compiled with, decided in one place (design §4.3 "Two TeX trees stay, decided once"; contract
// stage 1b, deliverable 5): the paper's own declaration — arXiv's 00README.json `texlive_version`, written on submission —
// else the TeX Live year in the banner of arXiv's own PDF (`PTEX.Fullbanner` of its Info dictionary: "This is pdfTeX, …
// (TeX Live 2023) kpathsea …"), else the default tree. A declared year no tree serves is not overridden by the banner: the
// paper said which tree it wants, and the default stands for it (today's rule: lab/marks/today.mjs treeOf, the baseline's).
// The box calls it with what it received and, where the answer is not its own tree, says which one is right; the Worker's
// copy of this decision is not touched here.

/** what the decision read the tree from */
export type TreeWhy = 'readme' | 'banner' | 'default'

/** a 00README.json's `texlive_version`, as a year's string; null where the file says none or is not JSON */
export function declaredTree(readme: Uint8Array | string | null | undefined): string | null {
  if (readme == null) return null
  try {
    const r = JSON.parse(typeof readme === 'string' ? readme : new TextDecoder().decode(readme)) as {
      texlive_version?: unknown
    }
    const v = r?.texlive_version
    return typeof v === 'number' || typeof v === 'string' ? String(v).trim() || null : null
  } catch {
    return null
  }
}

/** the TeX Live year a PDF's banner names (its Info dictionary's `PTEX.Fullbanner`), else null; no other field counts */
export const bannerTree = (banner: string | null | undefined): string | null =>
  typeof banner === 'string' ? (/TeX Live (\d{4})/.exec(banner)?.[1] ?? null) : null

/**
 * The tree to compile a paper on: `readme` the package's 00README.json bytes (null where it holds none), `banner` arXiv's PDF's
 * `PTEX.Fullbanner` (null where it has none), `served` the trees the boxes run (their years), `fallback` the default one
 */
export function treeOf(o: {
  readme?: Uint8Array | string | null
  banner?: string | null
  served: readonly string[]
  fallback: string
}): { tree: string; why: TreeWhy; declared: string | null } {
  const declared = declaredTree(o.readme)
  if (declared !== null && o.served.includes(declared)) return { tree: declared, why: 'readme', declared }
  const banner = bannerTree(o.banner)
  if (declared === null && banner !== null && o.served.includes(banner))
    return { tree: banner, why: 'banner', declared }
  return { tree: o.fallback, why: 'default', declared }
}
