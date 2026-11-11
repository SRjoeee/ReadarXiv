# lab/typeset/marks-data.py <fonts dir> [--check]: writes packages/typeset/src/data/marks.ts, the ink of the full-width marks
# of every CJK face of the role table (src/pdf-reader/engine/rules/font-roles.mjs FACE_TABLE, read as text as
# scripts/font-roles.py reads it), measured in the very files the website subsets and serves: each mark's default glyph (its
# cmap's, no feature applied: the glyph the reader draws, its sheet turning `locl` off, docs/PDF-READER.md §18.47), its ink's
# left and right edges as thousandths of its advance, the left rounded down and the right up so that the stored box holds
# the ink. A face is CJK when its cmap holds U+4E00. Its marks are the code points of general category P it maps in the CJK
# Symbols and Punctuation and the Halfwidth and Fullwidth Forms blocks, and the curly quotes, dashes, ellipsis and middle dot a
# CJK run takes where the rules set them as CJK's (packages/typeset/src/breaker/script.ts CJK_QUOTES); the vertical and
# small forms (U+FE10-FE6F) are vertical text's and compatibility's, which no line the layer sets holds, and a mark the data
# lacks keeps its full box. Each file's SHA-256 must be the binding one (src/pdf-reader/engine/rules/font-coverage.mjs
# METRICS), else the run fails and writes nothing. The fonts folder is the one scripts/font-roles.py reads (every face's
# file under its table name; readarxiv-web's scripts/fetch-font-files.mjs fills one).
#
#   python3 lab/typeset/marks-data.py <fonts dir>           writes the module
#   python3 lab/typeset/marks-data.py <fonts dir> --check   writes nothing; exits 1 where the module differs
#
# Needs fontTools (4.62.1 measured) and the repository's Biome (node_modules/.bin/biome), which formats the module.
import hashlib
import math
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent.parent
ROLES = ROOT / 'src/pdf-reader/engine/rules/font-roles.mjs'
COVERAGE = ROOT / 'src/pdf-reader/engine/rules/font-coverage.mjs'
OUT = ROOT / 'packages/typeset/src/data/marks.ts'
BLOCKS = [(0x3000, 0x303F), (0xFF00, 0xFFEF)]
CJK_QUOTES = [0x201C, 0x201D, 0x2018, 0x2019, 0x2014, 0x2026, 0xB7]


def fail(problems):
    for p in problems:
        print(f'marks-data.py: {p}', file=sys.stderr)
    sys.exit(1)


def faces():
    m = re.search(r'const FACE_TABLE = `\n(.*?)`', ROLES.read_text(encoding='utf-8'), re.S)
    if not m:
        fail([f'no FACE_TABLE in {ROLES}'])
    return [line.split()[:2] for line in m.group(1).splitlines() if line.strip()]


def digests():
    text = COVERAGE.read_text(encoding='utf-8')
    return dict(re.findall(r"'([a-z0-9-]+)': Object\.freeze\(\{ unitsPerEm: [^}]*?sha256: '([0-9a-f]{64})' \}\)", text))


def marks(path):
    """the face's marks: [(code point, left, right)], thousandths of each glyph's advance; None where it is no CJK face"""
    font = TTFont(path, fontNumber=0, lazy=True)
    cmap = font.getBestCmap() or {}
    if 0x4E00 not in cmap:
        return None
    glyphs, hmtx = font.getGlyphSet(), font['hmtx']
    out = []
    for cp in sorted(cmap):
        if not (any(a <= cp <= b for a, b in BLOCKS) or cp in CJK_QUOTES):
            continue
        if not unicodedata.category(chr(cp)).startswith('P'):
            continue
        name = cmap[cp]
        pen = BoundsPen(glyphs)
        glyphs[name].draw(pen)
        advance = hmtx[name][0]
        if pen.bounds is None or advance <= 0:
            continue
        x0, _, x1, _ = pen.bounds
        out.append((cp, math.floor(1000 * x0 / advance), math.ceil(1000 * x1 / advance)))
    return out


def module(table, sources):
    lines = [
        '// The ink of the full-width marks of each CJK face of the catalogue, measured in the face files the website serves (each',
        "// file's SHA-256 below, the binding digests of the engine's rules/font-coverage.mjs METRICS), written by",
        '// lab/typeset/marks-data.py; not edited by hand. A mark is its face\'s default glyph (cmap\'s, the one the reader draws:',
        "// its sheet turns `locl` off): docs/PDF-READER.md §18.47.",
        '',
        "/** each CJK face's marks: per mark its code point, then its ink's left and right edges, thousandths of its advance (the",
        ' *  left rounded down, the right up: the box holds the ink) */',
        'export const MARK_INK: Readonly<Record<string, readonly number[]>> = {',
    ]
    for face_id, rows in table:
        lines.append(f"  '{face_id}': [{', '.join(f'0x{cp:04x}, {a}, {b}' for cp, a, b in rows)}],")
    lines.append('}')
    lines.append('')
    lines.append('/** the SHA-256 of each face file the marks were measured in */')
    lines.append('export const MARK_SOURCES: Readonly<Record<string, string>> = {')
    for face_id, sha in sources:
        lines.append(f"  '{face_id}': '{sha}',")
    lines.append('}')
    raw = '\n'.join(lines) + '\n'
    biome = ROOT / 'node_modules/.bin/biome'
    return subprocess.run([str(biome), 'format', f'--stdin-file-path={OUT}'], input=raw, text=True, capture_output=True,
                          cwd=ROOT, check=True).stdout


def main(argv):
    args = [a for a in argv if a != '--check']
    if len(args) != 1:
        fail(['usage: marks-data.py <fonts dir> [--check]'])
    folder = Path(args[0])
    bound = digests()
    table, sources, problems = [], [], []
    for face_id, file in faces():
        path = folder / file
        if not path.is_file():
            problems.append(f'{face_id}: {path} not found')
            continue
        sha = hashlib.sha256(path.read_bytes()).hexdigest()
        if bound.get(face_id) != sha:
            problems.append(f'{face_id}: {file} is {sha}, the binding METRICS say {bound.get(face_id)}')
            continue
        rows = marks(path)
        if rows is None:
            continue
        table.append((face_id, rows))
        sources.append((face_id, sha))
    if problems:
        fail(problems)
    text = module(table, sources)
    if '--check' in argv:
        same = OUT.read_text(encoding='utf-8') == text if OUT.exists() else False
        print(f'marks-data: {OUT} {"equals" if same else "differs from"} the face files')
        sys.exit(0 if same else 1)
    OUT.write_text(text, encoding='utf-8')
    print(f'marks-data: {len(table)} faces, {sum(len(r) for _, r in table)} marks: {OUT}')


if __name__ == '__main__':
    main(sys.argv[1:])
