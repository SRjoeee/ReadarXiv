# lab/typeset/face-tables.py <fonts dir> <out.json> [--reference=<face-files.json>]: the face-files check's reading of the face
# files, the first of its two steps (the release check's `face-files` gate; lab/typeset/face-files.mjs judges). For each face
# of the check's reference (lab/typeset/face-files.json, beside this file: each face's file, each alphabet's letters, each
# file's binding SHA-256), its file in the fonts folder read with fontTools: its SHA-256; the letters of each alphabet its best
# Unicode cmap subtable does not map (OpenType's character map, the subtable fontTools' getBestCmap picks); whether its GSUB
# table has the `smcp` feature (OpenType's small capitals). Written as JSON, one entry a face; nothing judged here. A file
# missing from the folder is written so, never skipped. The fonts folder holds every face's file under its reference name, as
# lab/typeset/marks-data.py's does (readarxiv-web's scripts/fetch-font-files.mjs fills one; no font file is in this
# repository).
#
#   python3 lab/typeset/face-tables.py <fonts dir> <out.json>    exit 0 written; 2 usage, a reference it cannot read, or
#                                                                no fontTools
#
# Needs fontTools (4.62.1 and 4.53.1 read the 83 files alike).
import hashlib
import json
import sys
from pathlib import Path

REFERENCE = Path(__file__).resolve().parent / 'face-files.json'


def usage(why):
    print(f'face-tables.py: {why}', file=sys.stderr)
    print('usage: python3 lab/typeset/face-tables.py <fonts dir> <out.json> [--reference=<face-files.json>]', file=sys.stderr)
    sys.exit(2)


def face_tables(path, alphabets):
    """one face file's reading: its SHA-256, each alphabet's letters its best Unicode cmap leaves unmapped, its GSUB smcp"""
    from fontTools.ttLib import TTFont

    data = path.read_bytes()
    font = TTFont(path, fontNumber=0, lazy=True)
    cmap = font.getBestCmap() or {}
    unmapped = {a: ''.join(ch for ch in letters if ord(ch) not in cmap) for a, letters in alphabets.items()}
    gsub = font['GSUB'].table if 'GSUB' in font else None
    smcp = bool(gsub and gsub.FeatureList and any(r.FeatureTag == 'smcp' for r in gsub.FeatureList.FeatureRecord))
    return {'sha256': hashlib.sha256(data).hexdigest(), 'unmapped': {a: s for a, s in unmapped.items() if s}, 'smcp': smcp}


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    ref_path = next((Path(a.split('=', 1)[1]) for a in argv if a.startswith('--reference=')), REFERENCE)
    if len(args) != 2:
        usage('a fonts folder and an output file')
    try:
        import fontTools  # noqa: F401
    except ImportError:
        usage(f'no fontTools for {sys.executable}')
    try:
        ref = json.loads(ref_path.read_text(encoding='utf-8'))
        files, alphabets = ref['files']['faces'], ref['letters']['alphabets']
    except (OSError, ValueError, KeyError) as e:
        usage(f'the reference {ref_path}: {e}')
    fonts, out = Path(args[0]), Path(args[1])
    faces = {}
    for face, file in files.items():
        path = fonts / file
        faces[face] = {'file': file, **(face_tables(path, alphabets) if path.is_file() else {'missing': True})}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({'format': 'readarxiv/face-tables 1', 'fonts': str(fonts), 'reference': str(ref_path), 'faces': faces}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'face-tables.py: {len(faces)} faces read from {fonts} ({sum(1 for f in faces.values() if f.get("missing"))} files missing) into {out}')


if __name__ == '__main__':
    main(sys.argv[1:])
