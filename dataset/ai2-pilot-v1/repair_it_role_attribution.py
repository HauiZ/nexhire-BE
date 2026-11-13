"""Repair exact IT role descriptions and human-approved unsupported skill links."""
import hashlib
import json
from pathlib import Path
import re

BASE = Path(__file__).resolve().parent
REMOVALS = {
    'IT-J02-C01-E01': ['Jest'],
    'IT-J02-C04-E02': ['ASP.NET Core'],
    'IT-J03-C04-E01': ['PySpark'],
    'IT-J03-C03-P01': ['SQL'],
    'IT-J04-C01-E02': ['Dart'],
    'IT-J05-C08-E02': ['Docker'],
    'IT-J07-C04-E01': ['C#'],
    'IT-J09-C02-E01': ['C#'],
    'IT-J09-C04-E01': ['C#'],
    'IT-J09-C07-E02': ['C#'],
    'IT-J10-C02-E02': ['OpenCV'],
    'IT-J10-C04-E02': ['PyTorch'],
    'IT-J10-C07-E02': ['PyTorch'],
    'IT-J10-C07-E01': ['Python'],
    'IT-J10-C08-E01': ['Python'],
}


def role_description(text, title, company):
    marker = title + ' tại ' + company
    if text.count(marker) != 1:
        raise ValueError('Role marker not unique: ' + marker)
    role = re.split(r'\n- Chức danh:', text[text.index(marker):], maxsplit=1)[0]
    if 'Mô tả: ' not in role:
        raise ValueError('Missing exact role description: ' + marker)
    return role.split('Mô tả: ', 1)[1].strip()


def main():
    source = BASE / 'sources' / 'it.json'
    snapshot = BASE / 'snapshots' / 'before-it-role-repair-v2.json'
    log = BASE / 'it-role-repair-log-v2.json'
    if snapshot.exists() or log.exists():
        raise SystemExit('Refusing repeated repair or overwrite')
    raw = source.read_bytes()
    data = json.loads(raw)
    changes, seen = [], set()
    for job in data['jobs']:
        for candidate in job['candidates']:
            sections = {s['section_id']: s['text'] for s in candidate['sections']}
            for record in candidate['experiences']:
                rid = record['experience_id']
                correct = role_description(sections[record['section_id']], record['title'], record['company'])
                if record['description'] != correct:
                    changes.append({'id': rid, 'field': 'description', 'before': record['description'], 'after': correct, 'decision': 'HR-SOURCE-004', 'reason': 'Exact role-bounded source description; correct v1 parser cross-role attribution.'})
                    record['description'] = correct
            for group, idfield, field in [('experiences', 'experience_id', 'skills_used'), ('projects', 'project_id', 'technologies_or_methods')]:
                for record in candidate[group]:
                    rid = record[idfield]
                    if rid not in REMOVALS:
                        continue
                    before = record[field]
                    assert set(REMOVALS[rid]) <= set(before), rid
                    after = [v for v in before if v not in REMOVALS[rid]]
                    changes.append({'id': rid, 'field': field, 'before': before, 'after': after, 'decision': 'HR-SOURCE-003', 'reason': 'Source audit establishes no explicit support for this specific role/project; general CV skills unchanged.'})
                    record[field] = after
                    seen.add(rid)
    assert seen == set(REMOVALS)
    # Assert descriptions never include another role header.
    assert all('Chức danh:' not in e['description'] for j in data['jobs'] for c in j['candidates'] for e in c['experiences'])
    snapshot.write_bytes(raw)
    source.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    log.write_text(json.dumps({'changes': changes, 'before_sha256': hashlib.sha256(raw).hexdigest(), 'after_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'limitations': ['Only 15 explicitly audited skill links repaired; not complete semantic acceptance.', 'CV section prose, dates, IDs and general skills unchanged.', 'Old audits/logs retained as historical records.']}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'description_corrections': sum(c['field'] == 'description' for c in changes), 'skill_records_repaired': len(seen)}))


if __name__ == '__main__':
    main()
