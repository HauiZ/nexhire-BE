"""Offline source checks; lexical warnings require semantic inspection, not auto-repair."""
import collections
import hashlib
import json
from pathlib import Path
import re

BASE = Path(__file__).resolve().parent
errors, warnings, documents, jobs = [], [], [], []

def check(ok, where, message):
    if not ok:
        errors.append({'id': where, 'issue': message})

for filename, expected in [('it.json', {'it': 10}), ('sales-marketing.json', {'sales': 5, 'marketing': 5})]:
    path = BASE / 'sources' / filename
    data = json.loads(path.read_text())
    for key, value in {'schema_version': 'ai2-pilot-source-v1', 'split': 'development', 'synthetic': True, 'generation_model_requested': 'ag/gemini-3.8-flash-high'}.items():
        check(data.get(key) == value, filename, f'root {key}')
    check(dict(collections.Counter(j['domain'] for j in data['jobs'])) == expected, filename, 'domain counts')
    jobs.extend(data['jobs'])

for job in jobs:
    jid = job['job_id']
    check(job['source_family_id'] == jid, jid, 'source family')
    check(job['level'] in {'junior', 'mid', 'senior'} and job['language'] == 'vi', jid, 'level/language')
    check(4 <= len(job['requirements']) <= 7, jid, 'requirement count')
    check(len({r['requirement_id'] for r in job['requirements']}) == len(job['requirements']), jid, 'duplicate requirement ID')
    for req in job['requirements']:
        check(req['text'] in job['jd_text'], req['requirement_id'], 'requirement not verbatim')
        check(req['importance'] in {'required', 'preferred'}, req['requirement_id'], 'importance')
    check({c['candidate_id'] for c in job['candidates']} == {f'{jid}-C{i:02}' for i in range(1, 9)} and len(job['candidates']) == 8, jid, 'candidate IDs/count')
    documents.append((jid, job['jd_text']))
    for c in job['candidates']:
        cid = c['candidate_id']
        sections = {s['section_id']: s for s in c['sections']}
        check(len(sections) == len(c['sections']), cid, 'duplicate section ID')
        for sid, s in sections.items():
            check(sid.startswith(cid + '-'), cid, 'section scope')
            check(s['kind'] in {'summary', 'skills', 'experience', 'project', 'education', 'certification'}, sid, 'section kind')
        check(c['cv_text'] == '\n\n'.join(s['text'] for s in c['sections']), cid, 'cv_text join')
        documents.append((cid, c['cv_text']))
        words = len(c['cv_text'].split())
        if not 200 <= words <= 450:
            warnings.append({'id': cid, 'issue': 'preferred whitespace-token length', 'value': words})
        for skill in c['skills']:
            if skill.casefold() not in c['cv_text'].casefold():
                warnings.append({'id': cid, 'issue': 'skill requires semantic support check', 'value': skill})
        for group, kind, fields, listfield in [('experiences', 'experience', ['title', 'company', 'description', 'start_date', 'end_date'], 'skills_used'), ('projects', 'project', ['name', 'description'], 'technologies_or_methods'), ('education', 'education', ['degree', 'field'], None), ('certifications', 'certification', ['name'], None)]:
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
            check(e['is_current'] is None or type(e['is_current']) is bool, cid, 'current boolean or unknown')
            check(not e['is_current'] or e['end_date'] is None, cid, 'current end date')
            for field in ['start_date', 'end_date']:
                date = e[field]
                check(date is None or isinstance(date, str) and bool(re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', date)) and date <= '2026-11', cid, 'invalid/future date')
            check(not (e['start_date'] and e['end_date']) or e['start_date'] <= e['end_date'], cid, 'reversed dates')

check({j['job_id'] for j in jobs} == {f'{p}-J{i:02}' for p, n in [('IT', 10), ('SA', 5), ('MK', 5)] for i in range(1, n + 1)}, 'all', 'job IDs')
seen = {}
for ident, text in documents:
    if text in seen:
        errors.append({'id': ident, 'issue': 'exact duplicate document', 'other': seen[text]})
    seen[text] = ident
report = {'source_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (BASE / 'sources').glob('*.json')}, 'jobs': len(jobs), 'pairs': sum(len(j['candidates']) for j in jobs), 'errors': errors, 'warnings': warnings, 'limitations': ['Lexical checks do not establish semantic support or fictional entity identity.', 'Near duplicates and natural profile diversity require separate inspection.', 'Whitespace token count is not Vietnamese linguistic word segmentation.', 'No annotation permitted until source acceptance.']}
(BASE / 'source-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'jobs': report['jobs'], 'pairs': report['pairs'], 'errors': len(errors), 'warnings': len(warnings), 'warning_types': dict(collections.Counter(x['issue'] for x in warnings))}, indent=2))
