"""Build the KHATIB CEH question bank from extraction checkpoints.

Inputs
  extraction/inventory.json                 dynamic chapter / objective / screenshot inventory
  extraction/checkpoints/extract-v6.jsonl   per-screenshot extraction (OCR + pixel analysis)
  extraction/manual-corrections.json        visual-review corrections keyed by screenshot relPath

Outputs (public/data)
  chapters.json, learning-objectives.json, questions.json, original-attempts.json, extraction-report.json
and extraction/unresolved-questions.json (manual review queue).

How the correct answer is established (answerBasis):
  feedback          the quiz feedback screen showed this option in green
  folder-correct    screenshot is in a "correct answers" folder and shows exactly one selected option
  manual-visual     transcribed / confirmed by visual inspection of the screenshot
Questions without any of these stay "unresolved" and are excluded from graded tests.
"""
import json, re, hashlib, difflib, collections, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXT = ROOT / 'extraction'
OUT = ROOT / 'public' / 'data'
CHECKPOINT = EXT / 'checkpoints' / 'extract-v6.jsonl'
LETTERS = 'abcdefgh'


def norm(t):
    t = (t or '').lower()
    t = t.replace('–', '-').replace('—', '-').replace('’', "'").replace('“', '"').replace('”', '"')
    return re.sub(r'[^a-z0-9]+', ' ', t).strip()


def sim(a, b):
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def stamp(rel):
    name = rel.rsplit('/', 1)[-1]
    m = re.search(r'(\d{4})-(\d{2})-(\d{2})\s+(?:at\s+)?(\d{2})-?(\d{2})-?(\d{2})', name)
    if not m:
        return None
    y, mo, d, h, mi, s = map(int, m.groups())
    try:
        return datetime.datetime(y, mo, d, h, mi, s).isoformat()
    except ValueError:
        return None


TAG_RULES = [
    ('Tools', r'\b(tool|utility|nmap|hping|wireshark|metasploit|burp|nessus|netcat|john|hashcat|aircrack|sqlmap|nikto|maltego|shodan|mimikatz|hydra|tcpdump|snort|ettercap|cain|bloodhound|responder|recon-ng|theharvester)\b'),
    ('Attacks', r'\b(attack|attacker|exploit|injection|hijack|spoof|poison|flood|phishing|malware|trojan|worm|ransomware|botnet|overflow|xss|csrf)\b'),
    ('Definitions', r'^(what is|which of the following (best )?(describes|defines|refers)|what does .* stand for)|\bis (called|known as|referred to as)\b'),
    ('Commands', r'(\s-{1,2}[a-z]{1,12}\b|\bcommand\b|\bsyntax\b|\$\s|\bsudo\b|\bnet (user|view|use)\b|\bnbtstat\b|\bnslookup\b|\bdig\b)'),
    ('Protocols', r'\b(tcp|udp|icmp|arp|dns|dhcp|snmp|ldap|smtp|ntp|nfs|smb|netbios|http|https|ftp|ssh|tls|ssl|ipsec|kerberos|rdp|bgp|ipv6|802\.11|wpa|wpa2|wpa3|wep|mqtt|coap|zigbee|bluetooth)\b'),
    ('Techniques', r'\b(technique|method|methodology|approach|procedure|phase|step)\b'),
    ('Cryptography', r'\b(crypt|cipher|encrypt|decrypt|hash|md5|sha-?\d*|aes|des|rsa|ecc|pki|certificate|digital signature|key exchange|diffie|steganograph|quantum)\w*'),
    ('Network Scanning', r'\b(scan|scanning|port|ping sweep|banner grab|os fingerprint|nmap|hping)\w*'),
    ('Wireless Security', r'\b(wireless|wi-?fi|wpa\d?|wep|ssid|access point|bluetooth|bluejack|bluesnarf|rogue ap|evil twin|802\.11|krack)\b'),
    ('Cloud Security', r'\b(cloud|aws|azure|gcp|s3|kubernetes|docker|container|serverless|saas|paas|iaas|lambda)\b'),
    ('Scenario-Based Questions', r'\b(an? (attacker|ethical hacker|security (analyst|professional)|pen ?tester|organization|company|employee)|named|is trying to|was asked to)\b'),
]


def tags_for(text):
    t = text.lower()
    return [name for name, rx in TAG_RULES if re.search(rx, t)]


WORD = re.compile(r"[A-Za-z]+")


def repair_splits(questions):
    """Join OCR word splits such as 'fol lowing' or 'I ntegrity'.

    Two adjacent fragments are joined only if the joined word appears elsewhere in the bank
    (>= 2 times) and one of the fragments never appears as a standalone word. Visually reviewed
    text is left untouched.
    """
    freq = collections.Counter()
    for q in questions:
        for t in [q['text'], q['explanation'] or ''] + [o['text'] for o in q['options']]:
            freq.update(w.lower() for w in WORD.findall(t))
    pat = re.compile(r'\b([A-Za-z]+) ([a-z]+)\b')

    def symbols(t):
        # percent-encodings: OCR reads 0 as O (e.g. %OO -> %00, %2O -> %20)
        t = re.sub(r'%([0-9A-FO]{2})', lambda m: '%' + m.group(1).replace('O', '0'), t)
        # Google dorks: OCR reads the pipe operator as I / II
        if re.search(r'\b(ext|filetype|intext|inurl|intitle|allinurl|site):', t):
            t = re.sub(r' II (?=[a-z]+:)', ' || ', t)
            t = re.sub(r' I (?=[a-z]+:)', ' | ', t)
        return t

    def acronyms(t):
        # 'I RDP' -> 'IRDP' when the joined acronym occurs elsewhere in the bank
        t = re.sub(r'\b([A-Z]) ([A-Z]{2,})\b', lambda m: m.group(1) + m.group(2) if freq[(m.group(1) + m.group(2)).lower()] >= 2 else m.group(0), t)
        # 'FATvirus' -> 'FAT virus' when the glued token is rare and the word part is common
        return re.sub(r'\b([A-Z]{2,})([a-z]{3,})\b',
                      lambda m: m.group(1) + ' ' + m.group(2) if freq[m.group(0).lower()] <= 1 and freq[m.group(2)] >= 5 and freq[m.group(1).lower()] >= 2 else m.group(0), t)

    def fix(t):
        t = acronyms(symbols(t))

        def rep(m):
            a, b = m.group(1), m.group(2)
            joined = (a + b).lower()
            if freq[joined] >= 2 and (freq[a.lower()] <= 1 or freq[b.lower()] <= 1) and len(a) + len(b) >= 5:
                return a + b
            return m.group(0)
        return pat.sub(rep, t)

    n = 0
    for q in questions:
        if q['answerBasis'] == 'manual-visual':
            continue
        for obj, key in [(q, 'text'), (q, 'explanation')] + [(o, 'text') for o in q['options']]:
            if obj.get(key):
                new = fix(obj[key])
                if new != obj[key]:
                    n += 1
                    obj[key] = new
    return n


def main():
    inv = json.loads((EXT / 'inventory.json').read_text(encoding='utf-8'))
    recs = {}
    for line in CHECKPOINT.open(encoding='utf-8'):
        r = json.loads(line)
        recs[r['screenshotId']] = r
    corrections = {}
    cpath = EXT / 'manual-corrections.json'
    if cpath.exists():
        corrections = json.loads(cpath.read_text(encoding='utf-8'))

    shots = inv['screenshots']
    processed = [s for s in shots if s['id'] in recs]

    # ---------- per screenshot interpretation ----------
    items = []  # usable screenshots
    failed = []  # screenshots that could not be turned into a question
    for s in processed:
        r = dict(recs[s['id']])
        issues = list(r.get('issues', []))
        corr = corrections.get(s['relPath'])
        manual = False
        if corr:
            if corr.get('exclude'):
                failed.append({'screenshot': s['relPath'], 'issues': ['Excluded after visual review: ' + corr.get('note', '')]})
                continue
            manual = True
            aslist = lambda v: [] if v is None else (list(v) if isinstance(v, list) else [v])
            if 'question' in corr:
                r['question'] = corr['question']
            if 'options' in corr:
                r['options'] = [{'text': t} for t in corr['options']]
            if 'selected' in corr:
                r['selected'] = aslist(corr['selected'])
            if 'correct' in corr:
                r['greenOptions'] = aslist(corr['correct'])
            if 'explanation' in corr:
                r['explanation'] = corr['explanation']
                r['explanationTruncated'] = False
            issues = [f'Visually reviewed: {corr["note"]}'] if corr.get('note') else []
        opts = [o['text'].strip() for o in r.get('options') or []]
        q = (r.get('question') or '').strip()
        blocking = [i for i in issues if not i.startswith('Visually reviewed')
                    and not i.startswith('Selected option ambiguous') and not i.startswith('Correct (green)')
                    and not i.startswith('Feedback colours')]
        if not q or len(q) < 12 or len(opts) < 2 or any(not o for o in opts) or blocking:
            failed.append({'screenshot': s['relPath'], 'issues': issues or ['Question/options incomplete'],
                           'partial': {'question': q, 'options': opts}})
            continue
        sel = sorted(r.get('selected') or [])  # list of selected option indexes (may be empty)
        green = sorted(r.get('greenOptions') or [])
        label = s['label']
        corr = corr or {}
        correct, basis = None, None
        if manual and corr.get('correct') is not None:
            correct, basis = green, 'manual-visual'
        elif len(green) == 1 and r.get('screen') == 'feedback':
            correct, basis = green, 'feedback'
        elif label == 'correct' and len(sel) == 1 and r.get('screen') != 'feedback' and not corr.get('noFolderAnswer'):
            correct, basis = sel, 'folder-correct'
        result = label if s['source'] == 'quiz' else 'unknown'
        if corr.get('result'):
            result = corr['result']
        elif correct is not None and sel and s['source'] == 'quiz':
            actual = 'correct' if correct == sel else 'incorrect'
            if label and actual != label:
                # the visible feedback (green answer vs. my selection) is stronger evidence than the folder name
                issues.append(f'Filed under "{label} answers" but the feedback screen shows my selection was {actual}; recorded as {actual}')
                result = actual
        items.append({'shot': s, 'question': q, 'options': opts, 'selected': sel, 'correct': correct, 'basis': basis,
                      'result': result, 'explanation': r.get('explanation'), 'explTrunc': r.get('explanationTruncated', False),
                      'issues': issues, 'manual': manual})

    # ---------- dedupe ----------
    groups = []  # each: list of items
    by_q = collections.defaultdict(list)
    for it in items:
        it['nq'] = norm(it['question'])
        it['nopts'] = [norm(o) for o in it['options']]
        by_q[it['nq'][:60]].append(it)
    for key, lst in by_q.items():
        local = []
        for it in lst:
            placed = False
            for g in local:
                h = g[0]
                if len(h['nopts']) != len(it['nopts']):
                    continue
                # same question only if the stems are identical apart from OCR spacing, or >= 98% similar;
                # similar-but-distinct scenario questions (e.g. "UDP" vs "fragmented" packets) stay separate
                same_stem = h['nq'].replace(' ', '') == it['nq'].replace(' ', '') or sim(h['nq'], it['nq']) >= 0.98
                if not same_stem:
                    continue
                if not all(max(sim(a, b) for b in h['nopts']) >= 0.85 for a in it['nopts']):
                    continue
                # never merge records whose verified answers point at different option texts
                def ans(x):
                    return None if x['correct'] is None else tuple(sorted(x['nopts'][i] for i in x['correct']))
                if any(ans(o) and ans(it) and max(sim(' '.join(ans(o)), ' '.join(ans(it))), 0) < 0.85 for o in g):
                    continue
                if True:
                    g.append(it)
                    placed = True
                    break
            if not placed:
                local.append([it])
        groups.extend(local)

    objectives = {o['id']: o for o in inv['objectives']}
    questions, attempts, unresolved = [], [], []
    dup_screens = 0
    for g in groups:
        # canonical = best quality record: manual > feedback > others; fewer issues
        g.sort(key=lambda it: (not it['manual'], it['basis'] != 'feedback', len(it['issues'])))
        canon = g[0]
        copts = canon['options']
        cn = canon['nopts']

        def map_idx(it, idxs):
            if idxs is None:
                return None
            return tuple(sorted(max(range(len(cn)), key=lambda j: sim(cn[j], it['nopts'][i])) for i in idxs))

        qhash = hashlib.sha1((canon['nq'] + '|' + '|'.join(sorted(cn))).encode()).hexdigest()[:12]
        qid = f'q-{qhash}'
        votes = collections.Counter()
        bases = set()
        for it in g:
            if it['correct'] is not None:
                votes[map_idx(it, it['correct'])] += 1
                bases.add(it['basis'])
        issues = sorted({i for it in g for i in it['issues'] if not i.startswith('Selected option ambiguous')})
        correct_idx = None
        if len(votes) == 1:
            correct_idx = next(iter(votes))
        elif len(votes) > 1:
            issues.append('Conflicting correct answers across screenshots: ' + ', '.join(
                f'{"+".join(copts[i] for i in k)!r} x{v}' for k, v in votes.items()))
        chap = next((it['shot']['chapter'] for it in g if it['shot']['chapter']), None)
        obj_ids = collections.Counter(it['shot']['objective'] for it in g if it['shot']['objective'])
        obj = obj_ids.most_common(1)[0][0] if obj_ids else None
        if len(obj_ids) > 1:
            issues.append('Question appears under several objectives: ' + ', '.join(obj_ids))
        sources = sorted({it['shot']['source'] for it in g})
        expl_it = next((it for it in g if it['explanation'] and not it['explTrunc']), None) or \
            next((it for it in g if it['explanation']), None)
        options = [{'id': f'option-{LETTERS[i]}', 'text': t, 'isCorrect': correct_idx is not None and i in correct_idx}
                   for i, t in enumerate(copts)]
        verified = correct_idx is not None
        low = any('not recognised' in i or 'incomplete' in i for i in issues)
        confidence = 'high' if verified and not issues else ('low' if low else 'medium')
        if any(it['manual'] for it in g):
            confidence = 'high' if verified else 'medium'
        joined = ' '.join(copts).lower()
        shuffle_safe = not re.search(r'\b(all of the above|none of the above|both (a|b)|a and b|above|options? [a-d]\b|only [a-d]\b)', joined)
        qtext = canon['question']
        q = {
            'id': qid, 'chapterId': chap, 'learningObjectiveId': obj, 'sources': sources,
            'type': 'multiple-choice' if verified and len(correct_idx) > 1 else 'single-choice',
            'text': qtext, 'options': options,
            'correctOptionIds': [f'option-{LETTERS[i]}' for i in correct_idx] if verified else [],
            'answerBasis': '+'.join(sorted(bases)) if verified else None,
            'explanation': expl_it['explanation'] if expl_it else None,
            'explanationSource': 'CEH quiz feedback screen (OCR)' if expl_it else None,
            'explanationTruncated': bool(expl_it and expl_it['explTrunc']),
            'sourceScreenshotPaths': [it['shot']['relPath'] for it in g],
            'verificationStatus': 'verified' if verified else 'unresolved',
            'extractionConfidence': confidence, 'issues': issues,
            'tags': tags_for(qtext + ' ' + joined), 'shuffleSafe': shuffle_safe,
        }
        questions.append(q)
        dup_screens += len(g) - 1
        for it in g:
            sel = map_idx(it, it['selected'])
            attempts.append({
                'id': 'oa-' + hashlib.sha1(it['shot']['relPath'].encode()).hexdigest()[:12],
                'questionId': qid,
                'selectedOptionIds': [f'option-{LETTERS[i]}' for i in sel] if sel else [],
                'result': it['result'] if it['result'] in ('correct', 'incorrect') else 'unknown',
                'source': it['shot']['source'],
                'sourceScreenshotPath': it['shot']['relPath'],
                'sourceFolderClassification': it['shot']['label'],
                'attemptedAt': stamp(it['shot']['relPath']),
            })
        if not verified or q['issues']:
            unresolved.append({'questionId': qid, 'reason': 'No verified correct answer' if not verified else 'Has extraction notes',
                               'issues': q['issues'], 'text': qtext, 'options': copts,
                               'screenshots': q['sourceScreenshotPaths']})

    order = {o['id']: (int(o['chapterId'].split('-')[1]), o['number']) for o in inv['objectives']}
    questions.sort(key=lambda q: (order.get(q['learningObjectiveId'], (99, 99)), q['id']))

    chapters = [{'id': c['id'], 'number': c['number'], 'name': c['name'],
                 'objectiveIds': [o['id'] for o in inv['objectives'] if o['chapterId'] == c['id']]}
                for c in inv['chapters']]
    objs = [{'id': o['id'], 'chapterId': o['chapterId'], 'number': o['number'], 'name': o['name']} for o in inv['objectives']]

    # ---------- report ----------
    per_ch = collections.OrderedDict()
    for c in chapters:
        per_ch[c['id']] = {'chapter': c['number'], 'name': c['name'], 'screenshots': 0, 'questions': 0, 'verified': 0}
    per_obj = collections.OrderedDict((o['id'], {'objective': o['name'], 'chapterId': o['chapterId'], 'screenshots': 0, 'questions': 0, 'verified': 0}) for o in objs)
    for s in shots:
        if s['chapter']:
            per_ch[s['chapter']]['screenshots'] += 1
        if s['objective']:
            per_obj[s['objective']]['screenshots'] += 1
    for q in questions:
        if q['chapterId']:
            per_ch[q['chapterId']]['questions'] += 1
            per_ch[q['chapterId']]['verified'] += q['verificationStatus'] == 'verified'
        if q['learningObjectiveId']:
            per_obj[q['learningObjectiveId']]['questions'] += 1
            per_obj[q['learningObjectiveId']]['verified'] += q['verificationStatus'] == 'verified'
    oc = collections.Counter(a['result'] for a in attempts)
    report = {
        'generatedAt': datetime.datetime.now().isoformat(timespec='seconds'),
        'sourceRoot': inv['sourceRoot'],
        'method': 'Windows OCR word boxes + pixel analysis (radio fill, green/red option colour) + visual review of flagged screenshots',
        'screenshotsDiscovered': len(shots),
        'screenshotsProcessed': len(processed),
        'screenshotsRemaining': len(shots) - len(processed),
        'screenshotsUsable': len(items),
        'screenshotsFailed': len(failed),
        'screenshotsVisuallyReviewed': len(corrections),
        'bySource': dict(collections.Counter(s['source'] for s in shots)),
        'uniqueQuestions': len(questions),
        'duplicateScreenshots': dup_screens,
        'verifiedQuestions': sum(q['verificationStatus'] == 'verified' for q in questions),
        'unresolvedQuestions': sum(q['verificationStatus'] != 'verified' for q in questions),
        'questionsWithNotes': sum(bool(q['issues']) for q in questions),
        'questionsWithExplanations': sum(bool(q['explanation']) for q in questions),
        'mockOnlyQuestions': sum(q['chapterId'] is None for q in questions),
        'answerBasis': dict(collections.Counter(q['answerBasis'] for q in questions)),
        'originalAttempts': len(attempts),
        'originalAttemptResults': dict(oc),
        'chaptersDiscovered': len(chapters),
        'objectivesDiscovered': len(objs),
        'perChapter': list(per_ch.values()),
        'perObjective': list(per_obj.values()),
        'failedScreenshots': failed,
        'inventoryProblems': inv.get('problems', []),
    }
    report['ocrWordSplitsRepaired'] = repair_splits(questions)
    OUT.mkdir(parents=True, exist_ok=True)
    dump = lambda p, d: p.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding='utf-8')
    dump(OUT / 'chapters.json', chapters)
    dump(OUT / 'learning-objectives.json', objs)
    dump(OUT / 'questions.json', questions)
    dump(OUT / 'original-attempts.json', attempts)
    dump(OUT / 'extraction-report.json', report)
    dump(EXT / 'extraction-report.json', report)
    dump(EXT / 'unresolved-questions.json', {'failedScreenshots': failed, 'questions': unresolved})
    ver = hashlib.sha1(json.dumps([[q['id'], q['correctOptionIds']] for q in questions]).encode()).hexdigest()[:10]
    dump(OUT / 'bank-version.json', {'version': ver, 'generatedAt': report['generatedAt']})
    for k in ('screenshotsDiscovered', 'screenshotsProcessed', 'screenshotsUsable', 'screenshotsFailed', 'uniqueQuestions',
              'duplicateScreenshots', 'verifiedQuestions', 'unresolvedQuestions', 'questionsWithNotes',
              'questionsWithExplanations', 'mockOnlyQuestions', 'answerBasis', 'originalAttemptResults'):
        print(f'{k}: {report[k]}')


if __name__ == '__main__':
    main()
