"""Generate labelled contact sheets of screenshots that need visual review.

Usage: python extraction/scripts/review_sheets.py [failed|conflicts|ids-file]
Writes extraction/review-sheets/sheet-XX.png and review-list.txt (index -> relPath + current extraction).
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'extraction' / 'lib'))
from PIL import Image, ImageDraw  # noqa: E402

EXT = ROOT / 'extraction'
OUT = EXT / 'review-sheets'


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'failed'
    inv = {s['relPath']: s for s in json.loads((EXT / 'inventory.json').read_text(encoding='utf-8'))['screenshots']}
    recs = {}
    for line in (EXT / 'checkpoints' / 'extract-v6.jsonl').open(encoding='utf-8'):
        r = json.loads(line)
        recs[r['relPath']] = r
    report = json.loads((EXT / 'extraction-report.json').read_text(encoding='utf-8'))
    corr = json.loads((EXT / 'manual-corrections.json').read_text(encoding='utf-8')) if (EXT / 'manual-corrections.json').exists() else {}
    if mode == 'failed':
        paths = [f['screenshot'] for f in report['failedScreenshots']]
    elif mode == 'conflicts':
        qs = json.loads((ROOT / 'public' / 'data' / 'questions.json').read_text(encoding='utf-8'))
        paths = [p for q in qs if q['issues'] for p in q['sourceScreenshotPaths']]
    else:
        paths = [l.strip() for l in Path(mode).read_text(encoding='utf-8').splitlines() if l.strip()]
    paths = [p for p in paths if p not in corr]
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob('sheet-*.png'):
        old.unlink()
    listing = []
    per = 3
    for s in range(0, len(paths), per):
        crops = []
        for i, rel in enumerate(paths[s:s + per], start=s):
            r = recs.get(rel, {})
            with Image.open(inv[rel]['path']) as im:
                im = im.convert('RGB')
            # crop the content column; include the explanation area for feedback screens
            box = (max(0, 0), 120, min(im.width, 1700), im.height)
            c = im.crop(box)
            scale = 1100 / c.width
            c = c.resize((1100, int(c.height * scale)))
            d = ImageDraw.Draw(c)
            d.rectangle((0, 0, 70, 34), fill=(255, 0, 168))
            d.text((10, 8), f'#{i}', fill=(255, 255, 255))
            crops.append(c)
            listing.append(f"#{i} | {rel} | label={inv[rel]['label']} screen={r.get('screen')} sel={r.get('selected')} green={r.get('greenOptions')}\n"
                           f"    Q: {r.get('question')}\n    O: {[o['text'] for o in r.get('options', [])]}\n    issues: {r.get('issues')}")
        sheet = Image.new('RGB', (1100, sum(c.height for c in crops) + 10 * len(crops)), (40, 40, 40))
        y = 0
        for c in crops:
            sheet.paste(c, (0, y))
            y += c.height + 10
        sheet.save(OUT / f'sheet-{s // per:02d}.png')
    (OUT / 'review-list.txt').write_text('\n'.join(listing), encoding='utf-8')
    print(len(paths), 'screenshots ->', (len(paths) + per - 1) // per, 'sheets')


if __name__ == '__main__':
    main()
