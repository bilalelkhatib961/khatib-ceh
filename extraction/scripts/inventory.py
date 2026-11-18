"""Discover screenshots under the CEH assessment directory (read-only).

Chapters / objectives are discovered from folder names ("<n> - <name>"), sorted numerically.
Result folders: names containing "wrong"/"incorrect" -> incorrect, "correct" -> correct.
Top-level folders starting with "Mock" -> mock exam sources.
Never touches D:\\CEH\\Tools (outside the assessment root anyway).
"""
import json, re, hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(r'D:\CEH\CEH Quizzes And Mocks')
EXT = {'.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'}
NUM = re.compile(r'^\s*(\d+)\s*[-–.)]\s*(.+?)\s*$')


def label_of(name):
    n = name.lower()
    if re.search(r'wrong|incorrect|false', n):
        return 'incorrect'
    if 'correct' in n or 'right' in n:
        return 'correct'
    return None


def main():
    layout_ids = {}
    lay = ROOT / 'extraction' / 'ocr' / 'assessment-layout.jsonl'
    for line in lay.open(encoding='utf-8'):
        r = json.loads(line)
        layout_ids[r['path'].lower()] = r['id']
    chapters, objectives, shots, problems = [], [], [], []
    tops = sorted([p for p in SRC.iterdir() if p.is_dir()],
                  key=lambda p: (0, int(NUM.match(p.name)[1])) if NUM.match(p.name) else (1, p.name.lower()))
    for top in tops:
        m = NUM.match(top.name)
        mock = re.match(r'^\s*mock\s*(\d+)', top.name, re.I)
        if m:
            cnum = int(m[1])
            chapters.append({'id': f'chapter-{cnum}', 'number': cnum, 'name': m[2], 'folder': top.name})
            subs = sorted([p for p in top.iterdir() if p.is_dir()],
                          key=lambda p: int(NUM.match(p.name)[1]) if NUM.match(p.name) else 999)
            for sub in subs:
                om = NUM.match(sub.name)
                if not om:
                    problems.append(f'Unrecognised objective folder: {sub}')
                    continue
                onum = int(om[1])
                objectives.append({'id': f'chapter-{cnum}-objective-{onum}', 'chapterId': f'chapter-{cnum}',
                                   'number': onum, 'name': om[2], 'folder': sub.name})
            source = 'quiz'
        elif mock:
            source = f'mock-{mock[1]}'
        else:
            problems.append(f'Unrecognised top-level folder (skipped): {top}')
            continue
        for path in sorted(top.rglob('*')):
            if not path.is_file() or path.suffix.lower() not in EXT:
                continue
            rel = path.relative_to(SRC)
            parts = rel.parts
            chap = obj = label = None
            if source == 'quiz':
                chap = f'chapter-{cnum}'
                if len(parts) >= 3 and NUM.match(parts[1]):
                    obj = f'{chap}-objective-{int(NUM.match(parts[1])[1])}'
                label = next((label_of(p) for p in parts[2:-1] if label_of(p)), None)
                if not obj:
                    problems.append(f'No objective folder for {rel}')
                if not label:
                    problems.append(f'No correct/incorrect folder for {rel}')
            sha = hashlib.sha256(path.read_bytes()).hexdigest()
            shots.append({'id': 's-' + sha[:12] + '-' + hashlib.md5(str(rel).encode()).hexdigest()[:6],
                          'path': str(path), 'relPath': str(rel).replace('\\', '/'), 'source': source,
                          'chapter': chap, 'objective': obj, 'label': label, 'sha256': sha,
                          'layoutId': layout_ids.get(str(path).lower())})
    missing = [s['relPath'] for s in shots if s['layoutId'] is None]
    for s in missing:
        problems.append(f'No OCR layout yet (run scripts/ocr.ps1): {s}')
    out = {'sourceRoot': str(SRC), 'chapters': chapters, 'objectives': objectives, 'screenshots': shots, 'problems': problems}
    (ROOT / 'extraction').mkdir(exist_ok=True)
    (ROOT / 'extraction' / 'inventory.json').write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding='utf-8')
    print(len(chapters), 'chapters', len(objectives), 'objectives', len(shots), 'screenshots', len(problems), 'problems')
    for p in problems[:20]:
        print(' ', p)


if __name__ == '__main__':
    main()
