"""Apply bounded, human-approved pilot source repairs with immutable snapshots."""
import hashlib
import json
from pathlib import Path
import re

BASE = Path(__file__).resolve().parent
SNAPSHOT = BASE / 'snapshots' / 'before-human-repairs-v1'
LOG = BASE / 'human-repair-log-v1.json'


def main():
    if LOG.exists() or SNAPSHOT.exists():
        raise SystemExit('Repair already started/applied; refusing overwrite or double application.')
    SNAPSHOT.mkdir(parents=True)
    changes = []
    def change(ident, field, before, after, decision):
        if before != after:
            changes.append(dict(id=ident, field=field, before=before, after=after, decision=decision))
        return after

    for name in ['it.json', 'sales-marketing.json']:
        path = BASE / 'sources' / name
        raw = path.read_bytes()
        (SNAPSHOT / name).write_bytes(raw)
        data = json.loads(raw)
        for job in data['jobs']:
            jid = job['job_id']
            replacements = {
                'SA-J04': [('Kỹ năng giao tiếp lịch thiệp, giọng nói chuẩn, tư vấn phối màu sắc và chất liệu sản phẩm phù hợp không gian sống.', 'Kỹ năng giao tiếp lịch thiệp, tư vấn phối màu sắc và chất liệu sản phẩm phù hợp không gian sống.', 'HR-SOURCE-002')],
                'MK-J03': [('Tốt nghiệp đại học chuyên ngành Marketing, Truyền thông hoặc Kinh tế tại các trường uy tín, có bằng Thạc sĩ là lợi thế.', 'Tốt nghiệp đại học chuyên ngành Marketing, Truyền thông hoặc Kinh tế, có bằng Thạc sĩ là lợi thế.', 'HR-SOURCE-001')],
                'SA-J01': [('Tác phong làm việc chuyên nghiệp, tư duy hướng đến giải pháp và khả năng chịu áp lực doanh số tốt.', '', 'HR-SOURCE-011')],
                'SA-J02': [('Giao tiếp nhanh nhẹn, trung thực, có sức khỏe tốt và chịu được áp lực doanh số ngành hàng tiêu dùng nhanh.', '', 'HR-SOURCE-011')],
            }
            for old, new, decision in replacements.get(jid, []):
                old_jd = job['jd_text']
                if new:
                    updated = old_jd.replace(old, new)
                else:
                    updated = '\n'.join(line for line in old_jd.split('\n') if line.strip() != '- ' + old)
                job['jd_text'] = change(jid, 'jd_text', old_jd, updated, decision)
                for req in job['requirements']:
                    if req['text'] == old:
                        req['text'] = change(req['requirement_id'], 'text', old, new, decision)
            for c in job['candidates']:
                cid = c['candidate_id']
                # Strip complete negative-list bullet lines only; mixed positive/negative lines remain for manual repair.
                for section in c['sections']:
                    old = section['text']
                    lines = []
                    for line in old.split('\n'):
                        if re.match(r'^- (?:Chưa (?:có|từng)|Không (?:trực tiếp|phụ trách|tham gia)|Bản thân không trực tiếp)', line):
                            change(cid, section['section_id'] + '.removed_line', line, '', 'HR-SOURCE-006')
                        else:
                            lines.append(line)
                    section['text'] = '\n'.join(lines)
                sections = {s['section_id']: s['text'] for s in c['sections']}
                # A null-date record is not automatically ended; require explicit status wording.
                for exp in c['experiences']:
                    text = sections[exp['section_id']]
                    start = text.find(exp['title'] + ' tại ' + exp['company'])
                    if start < 0:
                        continue  # Exact role boundary unavailable: do not guess.
                    rest = text[start:]
                    role = rest.split('\n\n', 1)[0]
                    if exp['start_date'] is None and exp['end_date'] is None:
                        if not re.search(r'trước đây|trước đó|đã kết thúc|đã nghỉ', role, re.I) and not re.search(r'đến nay|hiện tại|đang (?:làm|công tác|hoạt động)', role, re.I):
                            exp['is_current'] = change(exp['experience_id'], 'is_current', exp['is_current'], None, 'HR-SOURCE-005')
                    # Exact role bullets provide faithful descriptions without strengthened paraphrases.
                    bullets = [line[2:] for line in role.split('\n') if line.startswith('- ')]
                    if bullets:
                        exp['description'] = change(exp['experience_id'], 'description', exp['description'], '\n'.join(bullets), 'HR-SOURCE-004')
                for ed in c['education']:
                    if 'Cử nhân Cao đẳng' in sections[ed['section_id']] and ed['degree'] == 'Cao đẳng':
                        ed['degree'] = change(cid, 'education.degree', ed['degree'], 'Cử nhân Cao đẳng', 'HR-SOURCE-010')
                c['cv_text'] = change(cid, 'cv_text', c['cv_text'], '\n\n'.join(s['text'] for s in c['sections']), 'HR-SOURCE-006')
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    LOG.write_text(json.dumps({'changes': changes, 'source_after_sha256': {n: hashlib.sha256((BASE / 'sources' / n).read_bytes()).hexdigest() for n in ['it.json', 'sales-marketing.json']}, 'status': 'partial_approved_repairs_only', 'pending': ['Role/project skill-attribution repair requires semantic field-level pass; no blanket substring deletion.', 'Organization fictionalization and mapping not yet applied.', 'Mixed positive/negative prose and age descriptors require bounded edits.', 'Audit acceptance and degree/tenure ambiguity flags must be reconciled against repaired sources.', 'Old audit-input copies and duplicate reports refer to pre-repair sources; not current acceptance evidence.']}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'changes': len(changes), 'status': 'partial_approved_repairs_only'}, indent=2))


if __name__ == '__main__':
    main()
