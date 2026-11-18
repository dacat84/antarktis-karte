"""Liest die OziExplorer-Tracklogs (raw/*.plt) und schreibt data/track.json.
Aufruf:  python3 scripts/build_track.py
Format:  {"t0": Startzeit (UTC, ISO), "p": [[sek_seit_t0, lat, lon], ...]}
Punkte werden auf ~1 pro 3 Minuten bzw. 0,25 sm Versatz ausgedünnt."""
import glob, json, math, os
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def hav(a, b):  # Seemeilen
    la1, lo1, la2, lo2 = map(math.radians, (a[1], a[2], b[1], b[2]))
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*3440.065*math.asin(math.sqrt(h))

pts = []
for f in sorted(glob.glob(os.path.join(ROOT, 'raw', '*.plt'))):
    for line in open(f, encoding='latin-1').read().splitlines()[6:]:
        p = [x.strip() for x in line.split(',')]
        if len(p) < 7:
            continue
        t = datetime.strptime(p[5]+' '+p[6], '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
        pts.append((t, float(p[0]), float(p[1])))
pts.sort()

out = [pts[0]]
for p in pts[1:]:
    last = out[-1]
    if (p[0]-last[0]).total_seconds() >= 180 or hav(last, p) >= 0.25:
        out.append(p)
if out[-1] is not pts[-1]:
    out.append(pts[-1])

t0 = pts[0][0]
data = {"t0": t0.strftime('%Y-%m-%dT%H:%M:%SZ'),
        "p": [[int((p[0]-t0).total_seconds()), round(p[1], 5), round(p[2], 5)] for p in out]}
with open(os.path.join(ROOT, 'data', 'track.json'), 'w') as fh:
    json.dump(data, fh, separators=(',', ':'))
print(len(pts), '->', len(out), 'Punkte')
