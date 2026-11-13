"""Comprehensive offline source checks for AI2 synthetic development pilot v1."""
import collections
import hashlib
import json
from pathlib import Path
import re
import sys

BASE = Path(__file__).resolve().parent
errors, warnings, documents, jobs = [], [], [], []
all_experience_ids, all_project_ids, all_section_ids = set(), set(), set()

REAL_BRAND_LEAK_RE = re.compile(
    r'\b(wpp|omnicom|union square|vtv3|ogilvy|dentsu|vnexpress|dân trí|tuổi trẻ|co\.opmart|winmart|big c|lotte mart)\b',
    re.IGNORECASE,
)
NEGATIVE_PROSE_RE = re.compile(
    r'^(?:-\s*)?(?:Chưa (?:có|từng|trực tiếp)|Không (?:trực tiếp|phụ trách|tham gia)|Bản thân không trực tiếp)'
)


def check(ok, where, message):
    if not ok:
        errors.append({'id': where, 'issue': message})


def check_no_duplicate_keys(raw_text: str, filename: str):
    def check_pairs(pairs):
        keys = set()
        for k, v in pairs:
            if k in keys:
                check(False, filename, f"Duplicate JSON key in source: {k}")
            keys.add(k)
        return dict(pairs)
    json.loads(raw_text, object_pairs_hook=check_pairs)


# 1. Parse and validate JSON structure & keys
for filename, expected in [('it.json', {'it': 10}), ('sales-marketing.json', {'sales': 5, 'marketing': 5})]:
    path = BASE / 'sources' / filename
    raw = path.read_text(encoding='utf-8')
    check_no_duplicate_keys(raw, filename)
    data = json.loads(raw)

    for key, value in {
        'schema_version': 'ai2-pilot-source-v1',
        'split': 'development',
        'synthetic': True,
        'generation_model_requested': 'ag/gemini-3.8-flash-high'
    }.items():
        check(data.get(key) == value, filename, f'root {key}')

    check(dict(collections.Counter(j['domain'] for j in data['jobs'])) == expected, filename, 'domain counts')
    jobs.extend(data['jobs'])

# 2. Per-job and per-candidate validation
for job in jobs:
    jid = job['job_id']
    check(job['source_family_id'] == jid, jid, 'source family')
    check(job['level'] in {'junior', 'mid', 'senior'} and job['language'] == 'vi', jid, 'level/language')
    check(4 <= len(job['requirements']) <= 7, jid, 'requirement count')
    check(len({r['requirement_id'] for r in job['requirements']}) == len(job['requirements']), jid, 'duplicate requirement ID')

    # Requirement verbatim check in JD
    for req in job['requirements']:
        check(req['text'] in job['jd_text'], req['requirement_id'], 'requirement not verbatim in jd_text')
        check(req['importance'] in {'required', 'preferred'}, req['requirement_id'], 'importance')
        check('tại các trường uy tín' not in req['text'].casefold(), req['requirement_id'], 'unapproved school prestige criterion')
        check('giọng nói chuẩn' not in req['text'].casefold(), req['requirement_id'], 'unapproved voice norm criterion')

    check({c['candidate_id'] for c in job['candidates']} == {f'{jid}-C{i:02}' for i in range(1, 9)} and len(job['candidates']) == 8, jid, 'candidate IDs/count')
    documents.append((jid, job['jd_text']))

    for c in job['candidates']:
        cid = c['candidate_id']
        sections = {s['section_id']: s for s in c['sections']}
        check(len(sections) == len(c['sections']), cid, 'duplicate section ID')

        for sid, s in sections.items():
            check(sid.startswith(cid + '-'), cid, 'section scope')
            check(s['kind'] in {'summary', 'skills', 'experience', 'project', 'education', 'certification'}, sid, 'section kind')
            check(sid not in all_section_ids, sid, 'global duplicate section ID')
            all_section_ids.add(sid)

            # Check prohibited age proxies, brands, or negative lists in candidate prose
            text = s['text']
            check('trẻ tuổi' not in text.casefold(), sid, 'prohibited applicant age proxy (trẻ tuổi)')
            check('giọng nói chuẩn' not in text.casefold(), sid, 'prohibited voice proxy (giọng nói chuẩn)')
            check(not REAL_BRAND_LEAK_RE.search(text), sid, f'prohibited commercial brand in section text: {REAL_BRAND_LEAK_RE.findall(text)}')
            for line in text.split('\n'):
                if NEGATIVE_PROSE_RE.match(line.strip()):
                    check(False, sid, f'prohibited templated negative bullet: {line[:60]}')

        # Exact double-newline join check
        check(c['cv_text'] == '\n\n'.join(s['text'] for s in c['sections']), cid, 'cv_text join')
        documents.append((cid, c['cv_text']))

        words = len(c['cv_text'].split())
        if not 200 <= words <= 450:
            warnings.append({'id': cid, 'issue': 'preferred whitespace-token length', 'value': words})

        for skill in c['skills']:
            check(not REAL_BRAND_LEAK_RE.search(skill), cid, f'prohibited commercial brand in skill: {skill}')
            if skill.casefold() not in c['cv_text'].casefold():
                warnings.append({'id': cid, 'issue': 'skill requires semantic support check', 'value': skill})

        for group, kind, fields, listfield in [
            ('experiences', 'experience', ['title', 'company', 'description', 'start_date', 'end_date'], 'skills_used'),
            ('projects', 'project', ['name', 'description'], 'technologies_or_methods'),
            ('education', 'education', ['degree', 'field'], None),
            ('certifications', 'certification', ['name'], None)
        ]:
            for item in c[group]:
                sid = item['section_id']
                check(sid in sections, cid, 'missing section reference')
                if sid not in sections:
                    continue
                check(sections[sid]['kind'] == kind, cid, 'section kind mismatch')
                text = sections[sid]['text'].casefold()
                for value in [item[f] for f in fields if item.get(f) is not None] + (item[listfield] if listfield else []):
                    if value.casefold() not in text:
                        warnings.append({'id': cid, 'section_id': sid, 'issue': 'structured fact requires semantic support check', 'value': value})

        for e in c['experiences']:
            eid = e['experience_id']
            check(eid not in all_experience_ids, eid, 'global duplicate experience ID')
            all_experience_ids.add(eid)

            # Grounding and negative check on experience descriptions
            check('Chức danh:' not in e['description'], eid, 'description contains cross-role marker (Chức danh:)')
            check(not REAL_BRAND_LEAK_RE.search(e['description']), eid, 'prohibited commercial brand in experience description')
            for su in (e.get('skills_used') or []):
                check(not REAL_BRAND_LEAK_RE.search(su), eid, f'prohibited commercial brand in skills_used: {su}')

            sec_text = sections[e['section_id']]['text'] if e['section_id'] in sections else ''
            for line in (e.get('description') or '').splitlines():
                clean_line = line.strip()
                if clean_line:
                    check(clean_line in sec_text, eid, f'experience description line not verbatim in cited section: {clean_line[:50]}')
                    check(not NEGATIVE_PROSE_RE.match(clean_line), eid, f'prohibited negative prose in experience description: {clean_line[:50]}')

            check(e['is_current'] is None or type(e['is_current']) is bool, cid, 'current boolean or unknown')
            check(not e['is_current'] or e['end_date'] is None, cid, 'current end date')
            for field in ['start_date', 'end_date']:
                date = e[field]
                check(date is None or isinstance(date, str) and bool(re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', date)) and date <= '2026-11', cid, 'invalid/future date')
            check(not (e['start_date'] and e['end_date']) or e['start_date'] <= e['end_date'], cid, 'reversed dates')

        for p in c['projects']:
            pid = p['project_id']
            check(pid not in all_project_ids, pid, 'global duplicate project ID')
            all_project_ids.add(pid)

            check(not REAL_BRAND_LEAK_RE.search(p['description']), pid, 'prohibited commercial brand in project description')
            for tm in (p.get('technologies_or_methods') or []):
                check(not REAL_BRAND_LEAK_RE.search(tm), pid, f'prohibited commercial brand in technologies_or_methods: {tm}')

            sec_text = sections[p['section_id']]['text'] if p['section_id'] in sections else ''
            for line in (p.get('description') or '').splitlines():
                clean_line = line.strip()
                if clean_line:
                    check(clean_line in sec_text, pid, f'project description line not verbatim in cited section: {clean_line[:50]}')
                    check(not NEGATIVE_PROSE_RE.match(clean_line), pid, f'prohibited negative prose in project description: {clean_line[:50]}')

check({j['job_id'] for j in jobs} == {f'{p}-J{i:02}' for p, n in [('IT', 10), ('SA', 5), ('MK', 5)] for i in range(1, n + 1)}, 'all', 'job IDs')

# 3. Exact and near-duplicate check
seen = {}
for ident, text in documents:
    if text in seen:
        errors.append({'id': ident, 'issue': 'exact duplicate document', 'other': seen[text]})
    seen[text] = ident

# Near-duplicate analysis (5-gram Jaccard)
shingles = {}
for ident, text in documents:
    tokens = re.findall(r'\w+', text.casefold())
    shingles[ident] = {tuple(tokens[i:i + 5]) for i in range(len(tokens) - 4)}

near_duplicates = []
doc_keys = list(shingles.keys())
for i in range(len(doc_keys)):
    for k in range(i + 1, len(doc_keys)):
        a, c = doc_keys[i], doc_keys[k]
        if ('-C' in a) != ('-C' in c):
            continue
        sa, sc = shingles[a], shingles[c]
        if not sa or not sc:
            continue
        jaccard = len(sa & sc) / len(sa | sc)
        if jaccard >= 0.5:
            near_duplicates.append({'left': a, 'right': c, 'five_token_jaccard': round(jaccard, 4)})

# 4. Generate refreshed reports
dup_report = {
    'documents': len(documents),
    'exact_duplicate_pairs': [e for e in errors if e.get('issue') == 'exact duplicate document'],
    'near_duplicate_threshold': 0.5,
    'near_duplicate_pairs': sorted(near_duplicates, key=lambda x: -x['five_token_jaccard']),
    'limitations': [
        'Whitespace/word-token five-gram Jaccard is lexical only, not semantic duplicate detection.',
        'Near-duplicate analysis does not exclude shared prompt templates or candidate-index scenarios.',
        'No AI1 contamination check performed; separately approved phase required.'
    ]
}
(BASE / 'source-duplicate-report.json').write_text(json.dumps(dup_report, ensure_ascii=False, indent=2) + '\n')

source_hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (BASE / 'sources').glob('*.json') if p.name != '.test.json'}

report = {
    'source_sha256': source_hashes,
    'jobs': len(jobs),
    'pairs': sum(len(j['candidates']) for j in jobs),
    'errors': errors,
    'warnings': warnings,
    'warning_types': dict(collections.Counter(x['issue'] for x in warnings)),
    'limitations': [
        'Lexical checks do not establish semantic support or fictional entity identity.',
        'Zero mechanical errors is a necessary gate, not complete silver relevance acceptance.',
        'Whitespace token count is not linguistic word segmentation.',
        'No annotation permitted until source acceptance manifest is approved.'
    ]
}
(BASE / 'source-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

print(json.dumps({
    'jobs': report['jobs'],
    'pairs': report['pairs'],
    'errors': len(errors),
    'warnings': len(warnings),
    'warning_types': report['warning_types'],
    'exact_duplicates': len(dup_report['exact_duplicate_pairs']),
    'near_duplicates_0_5': len(near_duplicates),
    'source_sha256': source_hashes
}, indent=2))

if errors:
    print(f"\nFATAL: Source validation failed with {len(errors)} errors!", file=sys.stderr)
    for err in errors[:10]:
        print(f"  {err}", file=sys.stderr)
    sys.exit(1)
