"""Generate reports/initial-study-report.md from the question bank and original attempts.

Run from the project root:  python extraction/scripts/study_report.py
"""
import json, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / 'public' / 'data'
load = lambda n: json.loads((D / n).read_text(encoding='utf-8'))
chapters, objectives, questions, attempts, report = (load(n) for n in (
    'chapters.json', 'learning-objectives.json', 'questions.json', 'original-attempts.json', 'extraction-report.json'))
qmap = {q['id']: q for q in questions}
obj_by = {o['id']: o for o in objectives}
ch_by = {c['id']: c for c in chapters}


def band(p):
    return 'Critical' if p < 50 else 'Weak' if p < 70 else 'Needs Review' if p < 80 else 'Strong' if p < 90 else 'Mastered'


ch_stats = collections.defaultdict(lambda: [0, 0])
ob_stats = collections.defaultdict(lambda: [0, 0])
tag_stats = collections.defaultdict(lambda: [0, 0])
for a in attempts:
    if a['result'] not in ('correct', 'incorrect'):
        continue
    q = qmap[a['questionId']]
    i = 0 if a['result'] == 'correct' else 1
    ch_stats[q['chapterId']][i] += 1
    ob_stats[q['learningObjectiveId']][i] += 1
    for t in q['tags']:
        tag_stats[t][i] += 1

acc = lambda s: 100 * s[0] / (s[0] + s[1]) if s[0] + s[1] else None
total = [sum(s[0] for s in ch_stats.values()), sum(s[1] for s in ch_stats.values())]
ch_rows = sorted(((ch_by[k], v, acc(v)) for k, v in ch_stats.items()), key=lambda r: r[2])
ob_rows = sorted(((obj_by[k], v, acc(v)) for k, v in ob_stats.items() if sum(v) >= 5), key=lambda r: (r[2], -r[1][1]))
weight = {c['id']: 0 for c in chapters}

L = []
w = L.append
w('# KHATIB CEH — Initial Personalized Study Report\n')
w(f'Generated {report["generatedAt"].replace("T", " ")} from {report["screenshotsDiscovered"]} assessment screenshots. '
  'These figures come only from the original CEH quiz screenshots. Your KHATIB CEH practice results are tracked separately in the app.\n')
w('## Headline numbers\n')
w('| Metric | Value |\n|---|---|')
for k, v in [
    ('Screenshots discovered / processed', f'{report["screenshotsDiscovered"]} / {report["screenshotsProcessed"]}'),
    ('Unique questions', report['uniqueQuestions']),
    ('Questions with a verified answer', report['verifiedQuestions']),
    ('Unresolved (mock captures with no answer shown)', report['unresolvedQuestions']),
    ('Chapters / learning objectives', f'{report["chaptersDiscovered"]} / {report["objectivesDiscovered"]}'),
    ('Original quiz attempts (correct / incorrect)', f'{total[0]} / {total[1]}'),
    ('Original overall accuracy', f'{acc(total):.1f}%'),
]:
    w(f'| {k} | {v} |')
w('\nAccuracy = correct ÷ (correct + incorrect) original quiz attempts. The bands (Critical below 50%, Weak 50–69%, Needs Review 70–79%, Strong 80–89%, Mastered 90%+) '
  'are personal study indicators, not official CEH thresholds.\n')
w('## Chapters, weakest first\n')
w('| # | Chapter | Correct | Incorrect | Accuracy | Band |\n|---|---|---|---|---|---|')
for c, v, a in ch_rows:
    w(f'| {c["number"]} | {c["name"]} | {v[0]} | {v[1]} | {a:.1f}% | {band(a)} |')
w('\n## Weakest learning objectives (at least 5 attempts)\n')
w('| LO | Chapter | Correct | Incorrect | Accuracy |\n|---|---|---|---|---|')
for o, v, a in ob_rows[:15]:
    w(f'| {ch_by[o["chapterId"]]["number"]}.{o["number"]} {o["name"]} | {ch_by[o["chapterId"]]["name"]} | {v[0]} | {v[1]} | {a:.1f}% |')
w('\n## Inferred topic tags, weakest first\n')
w('These tags come from keyword matching, not from an official CEH classification.\n')
w('| Tag | Correct | Incorrect | Accuracy |\n|---|---|---|---|')
for t, v in sorted(tag_stats.items(), key=lambda kv: acc(kv[1])):
    w(f'| {t} | {v[0]} | {v[1]} | {acc(v):.1f}% |')

# priorities: most original misses in weakest areas
miss_by_ch = sorted(ch_rows, key=lambda r: (-(r[1][1]) * (100 - r[2])))[:5]
w('\n## Recommended revision priorities (exam: Saturday 21 November 2026)\n')
w('The order below ranks chapters by the number of original misses weighted by low accuracy, so the topics with the most points to recover come first.\n')
for i, (c, v, a) in enumerate(miss_by_ch, 1):
    los = [r for r in ob_rows if r[0]['chapterId'] == c['id']][:2]
    lo_txt = '; '.join(f'LO {c["number"]}.{o["number"]} {o["name"]} ({x:.0f}%)' for o, _, x in los)
    w(f'{i}. **Ch {c["number"]} {c["name"]}**: {v[1]} misses, {a:.1f}% accuracy. Start with {lo_txt or "its chapter quiz"}.')
w('\n**Suggested 3-day plan**')
w('- **Wed 18 Nov (today):** In each of the top 3 chapters above, open the *Incorrect Answers* tab of the two weakest objectives. Answer each question before using Reveal Answer, then run *Practice Chapter Mistakes*.')
w('- **Thu 19 Nov:** Take one full **125-question / 4-hour mock exam** in the Exam Center. Then run *Retry Incorrect Questions* from its results page, and work through *Weakness Radar → Prioritized study queue*.')
w('- **Fri 20 Nov:** Run chapter quizzes for priorities 4–5 and any chapter below your target, then *Practice My Mistakes* until the queue is mostly *Recovered*. Keep the evening light and review bookmarks only.')
w('- **Sat 21 Nov (exam day):** No new material. Do a 10-question objective quiz as a warm-up if you like.\n')
w('No practice score guarantees a result on the official exam; use the scores to decide where to spend your remaining hours.\n')
w('## Data caveats\n')
w(f'- {report["mockOnlyQuestions"]} mock-exam questions show your selection but not the correct answer. They are kept out of graded tests until you verify them in **Settings → Manual question review queue**.')
misfiled = sum(1 for a in attempts if a['sourceFolderClassification'] == 'correct' and a['result'] == 'incorrect')
w(f'- {misfiled} screenshots in "correct answers" folders turned out to be wrong attempts: their feedback screen showed a different green answer, or a matching feedback screenshot exists. Those attempts are recorded as incorrect, and the folder label is kept on each record.')
w(f'- {report["screenshotsVisuallyReviewed"]} screenshots that OCR could not parse (arrow-sequence options, short command flags, scrolled pages) were transcribed by visual review. '
  f'{report["screenshotsFailed"]} screenshot was excluded because its question text is scrolled out of view.')
w('- OCR can still mis-read single characters (for example I/l, O/0). Every question card has a button that opens the original screenshot.')
out = ROOT / 'reports' / 'initial-study-report.md'
out.parent.mkdir(exist_ok=True)
out.write_text('\n'.join(L) + '\n', encoding='utf-8')
print(out)
