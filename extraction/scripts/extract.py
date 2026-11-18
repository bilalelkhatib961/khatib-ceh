"""KHATIB CEH screenshot extractor (v5).

Reuses the checkpointed Windows OCR word boxes (extraction/ocr/assessment-layout.jsonl)
and combines them with pixel analysis of each screenshot (opened read-only):
  * radio circles are located by scanning pixels (robust to browser zoom level)
  * OCR words are assigned to the question / each option by vertical position
  * radio fill           -> the option I originally selected
  * option text colour   -> green = correct answer, red = not correct (feedback screens)

Each screenshot result is appended to extraction/checkpoints/extract-v5.jsonl, so an
interrupted run resumes where it stopped.

Run from the project root:  python extraction/scripts/extract.py
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'extraction' / 'lib'))
from PIL import Image  # noqa: E402

LAYOUT = ROOT / 'extraction' / 'ocr' / 'assessment-layout.jsonl'
INVENTORY = ROOT / 'extraction' / 'inventory.json'
CHECKPOINT = ROOT / 'extraction' / 'checkpoints' / 'extract-v6.jsonl'
VERSION = 6
WATERMARK = re.compile(r'\s*(Activate Windows|Go to Settings to activate Windows\.?)\s*', re.I)


def load_jsonl(path, key='id'):
    out = {}
    if path.exists():
        for line in path.open(encoding='utf-8'):
            try:
                row = json.loads(line)
                out[row[key]] = row
            except (ValueError, KeyError):
                continue
    return out


def lines_of(layout):
    data = []
    for words in layout.get('boxes') or []:
        words = [w for w in words if w[4].strip()]
        if not words:
            continue
        words.sort(key=lambda w: w[0])
        data.append({'x': min(w[0] for w in words), 'y0': min(w[1] for w in words),
                     'y1': max(w[1] + w[3] for w in words), 'words': words,
                     'text': ' '.join(w[4] for w in words)})
    data.sort(key=lambda l: (l['y0'], l['x']))
    return data


def rows_of(words):
    """Group words into visual rows by vertical centre, return list of (y0, y1, x0, text, words)."""
    words = sorted(words, key=lambda w: (w[1] + w[3] / 2, w[0]))
    rows = []
    for w in words:
        c = w[1] + w[3] / 2
        if rows and abs(c - rows[-1]['c']) <= max(5, w[3] * 0.45):
            rows[-1]['words'].append(w)
        else:
            rows.append({'c': c, 'words': [w]})
    out = []
    for r in rows:
        ws = sorted(r['words'], key=lambda w: w[0])
        out.append({'y0': min(w[1] for w in ws), 'y1': max(w[1] + w[3] for w in ws), 'x': ws[0][0],
                    'text': ' '.join(w[4] for w in ws), 'words': ws})
    return out


class Pix:
    RING = [(1, 0), (0.92, 0.38), (0.71, 0.71), (0.38, 0.92), (0, 1), (-0.38, 0.92), (-0.71, 0.71), (-0.92, 0.38),
            (-1, 0), (-0.92, -0.38), (-0.71, -0.71), (-0.38, -0.92), (0, -1), (0.38, -0.92), (0.71, -0.71), (0.92, -0.38)]

    def __init__(self, path):
        with Image.open(path) as im:
            self.im = im.convert('RGB')
        self.w, self.h = self.im.size
        self.p = self.im.load()
        self._ink = {}

    def ink(self, x, y):
        if not (0 <= x < self.w and 0 <= y < self.h):
            return False
        key = (x, y)
        v = self._ink.get(key)
        if v is None:
            v = min(self.p[x, y]) < 250
            self._ink[key] = v
        return v

    def ring(self, cx, cy, r):
        hit = sum(any(self.ink(int(round(cx + dx * rr)), int(round(cy + dy * rr))) for rr in (r - 1, r, r + 1))
                  for dx, dy in self.RING)
        outside = sum(not self.ink(int(round(cx + dx * (r + 3))), int(round(cy + dy * (r + 3)))) for dx, dy in self.RING)
        return hit, outside

    def scan_radios(self, x0, x1, y0, y1):
        found = []
        for cy in range(y0, y1):
            for cx in range(x0, x1):
                for r in range(6, 21):
                    if not (self.ink(cx - r, cy) or self.ink(cx - r + 1, cy) or self.ink(cx - r - 1, cy)):
                        continue
                    if not (self.ink(cx + r, cy) or self.ink(cx + r - 1, cy) or self.ink(cx + r + 1, cy)):
                        continue
                    if not (self.ink(cx, cy - r) or self.ink(cx, cy - r + 1) or self.ink(cx, cy - r - 1)):
                        continue
                    hit, outside = self.ring(cx, cy, r)
                    if hit >= 14 and outside >= 14:
                        # a radio has a blank gap to its right before the option text (letters do not)
                        gap = any(self.ink(x, y) for x in range(cx + r + 2, cx + r + 5) for y in range(cy - r // 2, cy + r // 2 + 1))
                        if not gap:
                            found.append((hit + outside, cx, cy, r))
        # cluster
        found.sort(key=lambda f: (-f[0], -f[3]))
        clusters = []
        for f in found:
            for c in clusters:
                if abs(c[1] - f[1]) <= 6 and abs(c[2] - f[2]) <= 6:
                    if f[3] > c[3] and f[0] >= c[0] - 1:
                        c[3] = f[3]
                    break
            else:
                clusters.append(list(f))
        return clusters

    def fill(self, cx, cy, r):
        n = k = 0
        rr = max(2, r - 3)
        for dx in range(-rr, rr + 1):
            for dy in range(-rr, rr + 1):
                if dx * dx + dy * dy <= rr * rr:
                    n += 1
                    k += self.ink(cx + dx, cy + dy)
        return k / n if n else 0

    def colour(self, words):
        red = green = 0
        for x, y, w, h, _ in words:
            for px in range(x, min(self.w, x + w)):
                for py in range(y, min(self.h, y + h)):
                    r, g, b = self.p[px, py]
                    if r > 170 and g < 110 and b < 110:
                        red += 1
                    elif g >= 70 and g > r + 50 and g > b + 50:
                        green += 1
        return red, green

    def bullet(self, x, y0, y1):
        return sum(self.ink(px, py) for px in range(x - 24, x - 5) for py in range(y0, y1 + 1)) >= 6


RADIO_GLYPH = re.compile(r'^[oO0QCc©®@•\'`]$')


def parse(row, layout):
    rec = {
        'screenshotId': row['id'], 'path': row['path'], 'relPath': row['relPath'], 'sha256': row['sha256'],
        'source': row['source'], 'chapter': row['chapter'], 'objective': row['objective'],
        'folderLabel': row['label'], 'screen': None, 'title': None,
        'question': None, 'options': [], 'selected': [], 'greenOptions': [], 'redOptions': [],
        'explanation': None, 'explanationTruncated': False, 'issues': [], 'extractorVersion': VERSION,
    }
    if not layout or not layout.get('boxes'):
        rec['issues'].append('OCR missing')
        return rec
    lines = lines_of(layout)
    button = next((l for l in lines if re.match(r'^(ANSWER|NEXT)\b', l['text'], re.I) and l['x'] < 1000 and l['y0'] > 180), None)
    if not button:
        rec['issues'].append('Answer/Next button not found')
        return rec
    rec['screen'] = 'feedback' if button['text'].upper().startswith('NEXT') else 'question'
    left = button['x']
    if row['source'] != 'quiz':
        anchors = [l for l in lines if 'select question' in l['text'].lower() and l['y0'] < button['y0']]
    else:
        anchors = [l for l in lines if 'progress' in l['text'].lower() and l['y0'] < button['y0'] and l['x'] > left + 300]
    if anchors:
        top = max(a['y1'] for a in anchors) + 6
        t = [l for l in lines if abs(l['y0'] - anchors[-1]['y0']) < 30 and l['x'] < left + 200]
        if t and row['source'] == 'quiz':
            rec['title'] = t[0]['text']
    else:
        top = 200
        rec['issues'].append('Header anchor not found')
    pix = Pix(row['path'])
    radios = pix.scan_radios(max(0, left - 30), left + 45, top, button['y0'] - 8)
    if radios:
        # keep the dominant column with consistent radius
        col = max(radios, key=lambda c: sum(abs(o[1] - c[1]) <= 3 for o in radios))
        radios = [c for c in radios if abs(c[1] - col[1]) <= 3 and abs(c[3] - col[3]) <= 2]
        radios.sort(key=lambda c: c[2])
    if len(radios) < 2:
        rec['issues'].append('Could not locate answer options')
        return rec
    cx = round(sum(c[1] for c in radios) / len(radios))
    r = max(c[3] for c in radios)
    right = 100000  # quiz pages: the question column can extend to the image edge when zoomed in
    if row['source'] != 'quiz':  # mock: exclude the progress panel on the right
        panel = [l['x'] for l in lines if 'your progress' in l['text'].lower() and l['x'] > left + 300]
        if panel:
            right = min(panel) - 60
    wm_lines = [l for l in lines if re.search(r'Activate Windows|Go to Settings', l['text'], re.I)]
    wm = {id(w) for l in wm_lines for w in l['words']}
    words = [w for l in lines for w in l['words']
             if top - 2 < w[1] + w[3] / 2 < button['y0'] - 4 and w[0] >= left - 60 and w[0] < right and id(w) not in wm]
    # drop radio glyphs that OCR read as letters
    words = [w for w in words if not (abs(w[0] + w[2] / 2 - cx) <= r + 2 and RADIO_GLYPH.match(w[4]))]
    bounds = [c[2] - r - 3 for c in radios] + [button['y0'] - 4]
    q_words = [w for w in words if w[1] + w[3] / 2 < bounds[0]]
    qrows = rows_of(q_words)
    qx = min((rw['x'] for rw in qrows), default=0)
    qtext = ''
    for n, rw in enumerate(qrows):
        # keep numbered steps / indented blocks and paragraph breaks on their own lines
        brk = n and (re.match(r'^(\d+[.)]|[a-z][.)]|[-•])\s', rw['text']) or
                     (rw['y0'] - qrows[n - 1]['y1'] > (rw['y1'] - rw['y0']) * 1.2))
        qtext += ('\n' if brk else (' ' if n else '')) + rw['text']
    rec['question'] = qtext.strip()
    if len(rec['question']) < 12:
        rec['issues'].append('Question text incomplete')
    for k, c in enumerate(radios):
        ow = [w for w in words if bounds[k] <= w[1] + w[3] / 2 < bounds[k + 1] and w[0] > cx]
        text = ' '.join(rw['text'] for rw in rows_of(ow)).strip()
        red, green = pix.colour(ow)
        f = pix.fill(c[1], c[2], c[3])
        rec['options'].append({'text': text, 'fill': round(f, 3), 'red': red, 'green': green})
        if not text:
            rec['issues'].append(f'Option {k + 1} text not recognised')
        if f >= 0.25:
            rec['selected'].append(k)
        if green > 10 and green > 3 * red:
            rec['greenOptions'].append(k)
        elif red > 10 and red > 3 * green:
            rec['redOptions'].append(k)
    gaps = [b[2] - a[2] for a, b in zip(radios, radios[1:])]
    if not 3 <= len(radios) <= 6:
        rec['issues'].append(f'Unusual option count ({len(radios)})')
    if len(rec['selected']) != 1:
        rec['issues'].append(f'Selected option ambiguous ({len(rec["selected"])} marked)')
    if rec['screen'] == 'feedback':
        if len(rec['greenOptions']) != 1:
            rec['issues'].append(f'Correct (green) option ambiguous ({len(rec["greenOptions"])})')
        elif len(rec['redOptions']) != len(radios) - 1:
            rec['issues'].append('Feedback colours incomplete')
    # explanation
    ex = next((l for l in lines if re.match(r'^Explanation\b', l['text'], re.I) and l['y0'] > button['y0']), None)
    if ex:
        ew = [w for l in lines for w in l['words'] if w[1] > ex['y1'] - 2 and w[0] >= ex['x'] - 10 and w[0] < ex['x'] + 1800]
        paras = []
        prev = None
        for rw in rows_of(ew):
            t = WATERMARK.sub(' ', rw['text']).strip()
            if not t:
                continue
            t = re.sub(r'^[•■▪·]\s*', '', t)
            if not paras or pix.bullet(rw['x'], rw['y0'], rw['y1']) or (prev is not None and rw['y0'] - prev > 20):
                paras.append(t)
            else:
                paras[-1] += ' ' + t
            prev = rw['y1']
        rec['explanation'] = '\n'.join(paras).strip() or None
        if ew and max(w[1] + w[3] for w in ew) > pix.h - 30:
            rec['explanationTruncated'] = True
    return rec


def main():
    inv = json.loads(INVENTORY.read_text(encoding='utf-8'))
    layout = {r['path'].lower(): r for r in load_jsonl(LAYOUT).values()}  # OCR records keyed by screenshot path
    done ={k: v for k, v in load_jsonl(CHECKPOINT, 'screenshotId').items() if v.get('extractorVersion') == VERSION}
    CHECKPOINT.parent.mkdir(parents=True, exist_ok=True)
    todo = [r for r in inv['screenshots'] if r['id'] not in done or done[r['id']]['sha256'] != r['sha256']]
    only = sys.argv[1:]  # optional: limit to N items for testing
    if only:
        todo = todo[:int(only[0])]
    print(f'{len(inv["screenshots"])} screenshots, {len(done)} checkpointed, {len(todo)} to process')
    with CHECKPOINT.open('a', encoding='utf-8') as out:
        for n, row in enumerate(todo, 1):
            try:
                rec = parse(row, layout.get(row['path'].lower()))
            except Exception as e:  # never silently skip
                rec = {'screenshotId': row['id'], 'sha256': row['sha256'], 'path': row['path'], 'relPath': row['relPath'],
                       'source': row['source'], 'chapter': row['chapter'], 'objective': row['objective'],
                       'folderLabel': row['label'], 'issues': [f'Extractor error: {e!r}'], 'extractorVersion': VERSION}
            out.write(json.dumps(rec, ensure_ascii=False) + '\n')
            out.flush()
            if n % 100 == 0:
                print('processed', n, flush=True)
    print('done')


if __name__ == '__main__':
    main()
