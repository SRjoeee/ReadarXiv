import { join } from 'node:path'

// Where the real-paper tests find their data on a machine that has it. Nothing here is in the repository; without the switches
// the tests skip and the plain gate is unchanged.
//   AXT_LAB   a lab/pdf directory (see lab/pdf/README.md): `data/layout/<paper>/source.gz`, each paper's LaTeX source (its units)
//   AXT_PACK  a gate pack of the restored LAYOUT 6 (layout schema 4): `fixtures/<paper>-zh/layout.json` and
//             `geometry/<paper>-<target>-geometry.json`, read only
// Run: AXT_LAB=<lab/pdf> AXT_PACK=<.../out/gate-pack-lost> pnpm exec vitest run tests/pdf-reader/layer-format.test.ts \
//   tests/pdf-reader/layer-cut.test.ts tests/pdf-reader/layer-proto-parts.test.ts (layer-units-lab.test.ts needs AXT_LAB alone)

export const LAB = process.env.AXT_LAB
export const PACK = process.env.AXT_PACK
/** whether the real-paper tests that read the layout files run: both switches are set */
export const LAB_ON = Boolean(LAB && PACK)
/** the five local papers and the target whose geometry each is cut with */
export const LAB_PAPERS: readonly (readonly [paper: string, target: string])[] = [['1512.03385v1', 'zh'], ['1706.03762v7', 'zh'], ['1810.04805v2', 'zh'], ['2307.16209v1', 'de'], ['2608.04322v1', 'zh']]

/** the files of one paper: its layout file and geometry from the pack, its source from the lab */
export function labFiles(paper: string, target: string): { layoutFile: string; geometryFile: string; sourceFile: string } {
  if (!LAB || !PACK) throw new Error('AXT_LAB and AXT_PACK are not set')
  return {
    layoutFile: join(PACK, 'fixtures', `${paper}-zh`, 'layout.json'),
    geometryFile: join(PACK, 'geometry', `${paper}-${target}-geometry.json`),
    sourceFile: join(LAB, 'data/layout', paper, 'source.gz'),
  }
}
