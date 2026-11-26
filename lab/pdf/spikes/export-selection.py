# The PDF download's selection classed (lab/pdf/README.md, "The PDF download's selection"): a side-by-side page's characters
# and selection lines as PDFKit gives them (export-selection.swift's JSON), against the page's ink (a grey PGM of it at 100
# dpi: CoreGraphics', what Preview draws) and the original half's text area. Each half: its characters, those outside the text
# area, with no ink under them, of no size, taller than 30 pt, across both halves; its lines, their median height, those over
# twice it, into a margin, and the pairs of lines that overlap (more than 1 pt across and 2 pt up). One JSON line.
#   python3 -I lab/pdf/spikes/export-selection.py <page.json> <page.pgm> [--list]
import json, sys, collections, statistics
import numpy as np
j = json.load(open(sys.argv[1])); b = open(sys.argv[2], 'rb').read(); p = b.split(maxsplit=4); W, Hh = int(p[1]), int(p[2])
px = np.frombuffer(p[4][-W * Hh:], dtype=np.uint8).reshape(Hh, W)
k = 100 / 72; PH = j['box'][3]; HALF = (j['box'][2] - j['box'][0]) / 2
def ink(bx, pad=0.0):
    x0, y0, x1, y1 = bx
    c0, c1 = max(0, int((x0 + pad) * k)), min(W, int((x1 - pad) * k) + 1)
    r0, r1 = max(0, int((PH - y1 + pad) * k)), min(Hh, int((PH - y0 - pad) * k) + 1)
    if c1 <= c0 or r1 <= r0: return 0
    return int((px[r0:r1, c0:c1] < 160).sum())
chars = [c for c in j['chars'] if c['c'].strip()]
left = [c for c in chars if c['box'][2] <= HALF and c['box'][2] > c['box'][0]]
# (the original half's text area: its characters' extent, the running head's page number aside)
xs0 = sorted(c['box'][0] for c in left); xs1 = sorted(c['box'][2] for c in left); ys0 = sorted(c['box'][1] for c in left); ys1 = sorted(c['box'][3] for c in left)
q = lambda a, f: a[int(f * (len(a) - 1))]
# (a page whose original half holds no text, a figure alone: its whole half is its area)
area = (q(xs0, 0.002), q(ys0, 0.002), q(xs1, 0.998), q(ys1, 0.995)) if left else (j['box'][0], j['box'][1], HALF, j['box'][3])
out = {}
for half, sel in (('original', lambda c: (c['box'][0] + c['box'][2]) / 2 < HALF), ('translation', lambda c: (c['box'][0] + c['box'][2]) / 2 >= HALF)):
    cs = [c for c in chars if sel(c)]
    dx = 0 if half == 'original' else HALF
    A = (area[0] + dx - 2, area[1] - 2, area[2] + dx + 2, area[3] + 2)
    cnt = collections.Counter()
    eg = collections.defaultdict(list)
    for c in cs:
        x0, y0, x1, y1 = c['box']
        if x1 - x0 <= 0 or y1 - y0 <= 0:
            cnt['zero-size at the origin' if x0 == 0 and y0 == 0 else 'zero-size'] += 1; eg['zero-size'].append(c['c']); continue
        if x0 < HALF < x1: cnt['across both halves'] += 1
        if x0 < A[0] or x1 > A[2] or y0 < A[1] or y1 > A[3]:
            cnt['outside the text area'] += 1; eg['outside the text area'].append(c['c'])
        if ink(c['box']) == 0: cnt['no ink under it'] += 1; eg['no ink under it'].append(c['c'])
        if (y1 - y0) > 3 * 10: cnt['taller than 30 pt'] += 1
    out[half] = {'characters': len(cs), **cnt}
    if '--list' in sys.argv:
        for kx, v in eg.items(): print(half, kx, ''.join(v)[:200])
for half, sel in (('original', lambda l: (l['box'][0] + l['box'][2]) / 2 < HALF), ('translation', lambda l: (l['box'][0] + l['box'][2]) / 2 >= HALF)):
    ls = [l for l in j['lines'] if sel(l)]
    hs = [l['box'][3] - l['box'][1] for l in ls]
    med = statistics.median(hs) if hs else 0
    dx = 0 if half == 'original' else HALF
    A = (area[0] + dx - 2, area[1] - 2, area[2] + dx + 2, area[3] + 2)
    tall = sum(1 for h in hs if h > 2 * med)
    out_l = sum(1 for l in ls if l['box'][0] < A[0] or l['box'][2] > A[2])
    over = 0
    for i, a in enumerate(ls):
        for bb in ls[i + 1:]:
            ix = min(a['box'][2], bb['box'][2]) - max(a['box'][0], bb['box'][0]); iy = min(a['box'][3], bb['box'][3]) - max(a['box'][1], bb['box'][1])
            if ix > 1 and iy > 2: over += 1
    out[half].update({'lines': len(ls), 'median line height': round(med, 1), 'lines over twice that': tall, 'lines into a margin': out_l, 'line pairs overlapping': over})
print(json.dumps({'area': [round(v, 1) for v in area], **out}))
