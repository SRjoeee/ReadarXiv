# The font role table's measured data (src/pdf-reader/engine/rules/font-coverage.mjs), from the very files: each face's code
# points as ranges (start, end, inclusive; its cmap's, but controls and private use: drawn below) and its metrics (units per em, hhea's ascent and descent, whether GSUB has small
# capitals, the file's SHA-256), and each source's release. The faces are font-roles.mjs's FACE_TABLE, read here as text so
# that one table names them for both. Prints the module, or writes it with --out (only on success):
#   python3 scripts/font-roles.py lab/pdf/data/fonts > src/pdf-reader/engine/rules/font-coverage.mjs
#   python3 scripts/font-roles.py lab/pdf/data/fonts --out src/pdf-reader/engine/rules/font-coverage.mjs
# The fonts folder (git-ignored: no font file is committed) holds every face's file under its table name, and
# releases.json, which names each source's release: {"source-han-serif": "<the GitHub release's tag>",
# "urw-base35-fonts": "<the tag>", "texlive": "texlive/texlive@sha256:<the image's digest>"}. Gathering it: Source Han
# Serif's regional OTFs (OTF/SimplifiedChinese, OTF/TraditionalChinese, OTF/Korean) from that release of
# adobe-fonts/source-han-serif; URW's NimbusRoman-*, NimbusSans-* and NimbusMonoPS-*.otf from fonts/ at that tag of
# ArtifexSoftware/urw-base35-fonts; every other file by `docker run --rm --network none <image> kpsewhich <file>`,
# copied out of that image.
#
# Fails (exit 1, nothing written with --out) on a file it cannot find; on a file whose SHA-256 differs from the committed
# METRICS' (git HEAD's font-coverage.mjs, or --against's) while its source's release is unchanged — a re-run after a
# release bump rewrites both; on a release named in no well-formed form; and with less than 10 GiB free where the fonts
# are. Needs fontTools (4.62.1 measured).
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
ROLES = ROOT / 'src/pdf-reader/engine/rules/font-roles.mjs'
COVERAGE_PATH = 'src/pdf-reader/engine/rules/font-coverage.mjs'
FREE_MIN = 10 * 1024 ** 3
RELEASE_FORM = {'texlive': re.compile(r'^texlive/texlive@sha256:[0-9a-f]{64}$'), 'source-han-serif': re.compile(r'^\d+\.\d+R?$'),
                'urw-base35-fonts': re.compile(r'^\d{8}(\.\d+)?$')}
# the hosted files' releases, by file name: Source Han Serif's (adobe-fonts/source-han-serif) and URW's base 35
# (ArtifexSoftware/urw-base35-fonts); every other file is TeX Live's
HOSTED = [(re.compile(r'^SourceHanSerif(SC|TC|K)-'), 'source-han-serif'), (re.compile(r'^(NimbusRoman|NimbusSans|NimbusMonoPS)-'), 'urw-base35-fonts')]


def release_of(source, file):
    if source == 'texlive':
        return 'texlive'
    return next((key for pattern, key in HOSTED if pattern.match(file)), None)


def fail(problems):
    for p in problems:
        print(f'font-roles.py: {p}', file=sys.stderr)
    sys.exit(1)


def faces():
    """FACE_TABLE's rows: id, file, source, group, weight, style, size, licence, web"""
    m = re.search(r'const FACE_TABLE = `\n(.*?)`', ROLES.read_text(encoding='utf-8'), re.S)
    if not m:
        fail([f'no FACE_TABLE in {ROLES}'])
    rows = []
    for line in m.group(1).splitlines():
        if line.strip():
            cols = line.split()
            if len(cols) < 9:
                fail([f'a FACE_TABLE row of {len(cols)} columns: {line.strip()}'])
            if release_of(cols[2], cols[1]) is None:
                fail([f'{cols[0]}: source {cols[2]!r} and file {cols[1]}: neither TeX Live nor a hosted release'])
            # the licence is every column between the size and the web status (an SPDX expression may hold spaces)
            rows.append(cols[:7] + [' '.join(cols[7:-1]), cols[-1]])
    return rows


def committed(against):
    """the binding METRICS digests and releases: --against's file, else git HEAD's (none before the first commit)"""
    if against:
        text = Path(against).read_text(encoding='utf-8')
    else:
        try:
            text = subprocess.run(['git', 'show', f'HEAD:{COVERAGE_PATH}'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
        except (subprocess.CalledProcessError, FileNotFoundError):
            print(f'font-roles.py: no committed {COVERAGE_PATH} (not a git checkout, or none at HEAD) and no --against: '
                  'no digest is checked against binding METRICS', file=sys.stderr)
            return {}, {}
    digests = dict(re.findall(r"'([a-z0-9-]+)': Object\.freeze\(\{ unitsPerEm: [^}]*?sha256: '([0-9a-f]{64})' \}\)", text))
    m = re.search(r'release: Object\.freeze\(\{ (.*?) \}\)', text)
    releases = dict(re.findall(r"'([^']+)': '([^']+)'", m.group(1))) if m else {}
    return digests, releases


def drawn(cp):
    """a code point a translation's text may be drawn with: not a control (C0, DEL, C1), whose cmap entry draws nothing,
    and not a private use code point, whose glyph means what each font makes it mean (TeX Gyre's and Libertine's
    alternates sit there): a text holding one is not drawable, and its unit stays the original's"""
    return not (cp < 0x20 or 0x7F <= cp <= 0x9F or 0xE000 <= cp <= 0xF8FF or cp >= 0xF0000)


def ranges(code_points):
    out = []
    for cp in sorted(cp for cp in set(code_points) if drawn(cp)):
        if out and cp == out[-1] + 1:
            out[-1] = cp
        else:
            out += [cp, cp]
    return out


def measure(path):
    data = path.read_bytes()
    font = TTFont(path, fontNumber=0, lazy=True)
    cmap = font.getBestCmap() or {}
    gsub = font['GSUB'].table if 'GSUB' in font else None
    smcp = bool(gsub and gsub.FeatureList and any(r.FeatureTag == 'smcp' for r in gsub.FeatureList.FeatureRecord))
    hhea = font['hhea']
    return ranges(cmap.keys()), {
        'unitsPerEm': font['head'].unitsPerEm, 'ascent': hhea.ascent, 'descent': -hhea.descent, 'smcp': smcp,
        'sha256': hashlib.sha256(data).hexdigest(),
    }


def base36(n):
    digits = '0123456789abcdefghijklmnopqrstuvwxyz'
    out = ''
    while True:
        out, n = digits[n % 36] + out, n // 36
        if n == 0:
            return out


def encoded(r):
    """a face's ranges as text: per range, the gap after the previous range's end and its length, in base 36 (a third of
    the decimal list's bytes; the module decodes it once, as it loads)"""
    parts, end = [], -1
    for i in range(0, len(r), 2):
        parts += [base36(r[i] - end - 1), base36(r[i + 1] - r[i])]
        end = r[i + 1]
    lines, line = [], []
    for p in parts:
        if line and len(' '.join(line)) + len(p) > 116:
            lines.append(' '.join(line))
            line = []
        line.append(p)
    return '\n'.join(lines + [' '.join(line)])


def module(rows, coverage, metrics, releases):
    names, lines = {}, []
    lines.append('// Generated by scripts/font-roles.py from the face files font-roles.mjs names: each face\'s code points as ranges')
    lines.append('// (start, end, inclusive), its metrics in its own units (hhea\'s ascent and descent, the descent positive below the')
    lines.append('// baseline; small capitals by GSUB smcp; the file\'s SHA-256), and the releases the files come from. Not edited by')
    lines.append('// hand: re-run the script (its header says how)')
    lines.append('')
    lines.append('// a face\'s ranges from their text: per range, the gap after the previous range\'s end and its length, in base 36')
    lines.append('const ranges = text => {')
    lines.append('  const parts = text.trim().split(/\\s+/), out = []')
    lines.append('  let end = -1')
    lines.append('  for (let i = 0; i + 1 < parts.length; i += 2) {')
    lines.append('    const start = end + 1 + Number.parseInt(parts[i], 36)')
    lines.append('    end = start + Number.parseInt(parts[i + 1], 36)')
    lines.append('    out.push(start, end)')
    lines.append('  }')
    lines.append('  return Object.freeze(out)')
    lines.append('}')
    for face_id, *_ in rows:
        key = tuple(coverage[face_id])
        if key not in names:
            names[key] = f'C{len(names)}'
            lines.append(f'const {names[key]} = ranges(`\n{encoded(key)}\n`)')
    lines.append('')
    lines.append('export const COVERAGE = Object.freeze({')
    lines += [f"  '{face_id}': {names[tuple(coverage[face_id])]}," for face_id, *_ in rows]
    lines.append('})')
    lines.append('export const METRICS = Object.freeze({')
    for face_id, *_ in rows:
        m = metrics[face_id]
        lines.append(f"  '{face_id}': Object.freeze({{ unitsPerEm: {m['unitsPerEm']}, ascent: {m['ascent']}, descent: {m['descent']}, smcp: {str(m['smcp']).lower()}, sha256: '{m['sha256']}' }}),")
    lines.append('})')
    release = ', '.join(f"'{k}': '{releases[k]}'" for k in sorted(releases))
    lines.append(f'export const COVERAGE_SOURCE = Object.freeze({{ release: Object.freeze({{ {release} }}) }})')
    return '\n'.join(lines) + '\n'


def main(argv):
    args, out, against = [], None, None
    it = iter(argv)
    for a in it:
        if a == '--out':
            out = next(it, None)
        elif a == '--against':
            against = next(it, None)
        else:
            args.append(a)
    if len(args) != 1 or (out is None and '--out' in argv) or (against is None and '--against' in argv):
        fail(['usage: font-roles.py <fonts dir> [--out <font-coverage.mjs>] [--against <font-coverage.mjs>]'])
    folder = Path(args[0])
    if not folder.is_dir():
        fail([f'{folder}: no such folder'])
    free = shutil.disk_usage(folder).free
    if free < FREE_MIN:
        fail([f'{free / 1024 ** 3:.1f} GiB free where the fonts are; at least 10 GiB are kept free'])
    rows = faces()
    problems = []
    try:
        releases = json.loads((folder / 'releases.json').read_text(encoding='utf-8'))
    except (OSError, ValueError) as e:
        fail([f'{folder / "releases.json"}: {e}'])
    used = {release_of(source, file) for _, file, source, *_ in rows}
    for key in sorted(used):
        if not isinstance(releases.get(key), str) or not RELEASE_FORM[key].match(releases[key]):
            problems.append(f'releases.json: {key} is {releases.get(key)!r}, not a release in the form {RELEASE_FORM[key].pattern}')
    releases = {k: releases[k] for k in sorted(used) if isinstance(releases.get(k), str)}
    digests, released = committed(against)
    coverage, metrics = {}, {}
    for face_id, file, source, *_ in rows:
        path = folder / file
        if not path.is_file():
            problems.append(f'{face_id}: {path} not found')
            continue
        coverage[face_id], metrics[face_id] = measure(path)
        if not coverage[face_id]:
            problems.append(f'{face_id}: {file} maps no character')
        was, key = digests.get(face_id), release_of(source, file)
        if was and released.get(key) == releases.get(key) and was != metrics[face_id]['sha256']:
            problems.append(f'{face_id}: {file} is {metrics[face_id]["sha256"]}, the committed METRICS say {was}, and {key} is still {releases.get(key)}')
    if problems:
        fail(problems)
    text = module(rows, coverage, metrics, releases)
    if out:
        tmp = Path(f'{out}.tmp')
        tmp.write_text(text, encoding='utf-8')
        os.replace(tmp, out)
    else:
        sys.stdout.write(text)


if __name__ == '__main__':
    main(sys.argv[1:])
