"""Export exposed diagnostic probes as development-only review proposals."""
import json
import sys
from pathlib import Path
from ml.ai2.content_protocol import training_readiness

root = Path(__file__).resolve().parents[1]
report = json.loads((root / 'trainning/_maintenance/ai2-content-audit.json').read_text(encoding='utf-8'))
output = root / 'trainning/ai2/content-review-v1'
output.mkdir(parents=True, exist_ok=True)
contrast_states = {'aws': 'NOT_ESTABLISHED', 'git': 'NOT_ESTABLISHED',
    'database': 'ALTERNATIVE_MISMATCH', 'rbac': 'NOT_ESTABLISHED',
    'negation': 'NEGATED', 'and': 'PARTIAL_COMPOSITE'}
rows = []
for case in report['cases']:
    for item in case['rows']:
        positive = item['label'] == 'expected_stronger'
        state = 'EXPLICIT_CONTEXT' if positive else contrast_states[case['case']]
        rows.append(dict(id=f"{case['case']}-{item['label']}", job_group=case['case'],
            split='development', state=state, job_text=case['requirement'], candidate_text=item['source'],
            job_quote=case['requirement'], candidate_quote=None if state == 'NOT_ESTABLISHED' else item['source'],
            reviewer_id='assistant-proposal-not-human-approved', review_event_id='content-draft-2026-10-30',
            independent_review=False, adjudicated=False, author_is_reviewer=True,
            scope='SUPPLIED_SYNTHETIC_TEXT_ONLY', label_status='PROPOSAL_NOT_APPROVED',
            model_outputs_already_exposed=True, independent_labeling=False))
(output / 'development-proposals.jsonl').write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows), encoding='utf-8')
readiness = training_readiness(rows)
readiness.update(existing_test_reusable=False, validation_and_test_created=False,
    reason='Existing probes are exposed; require new independently reviewed groups and separate ranking targets.',
    kaggle_training_prepared=False, runtime_ranking_enabled=False)
(output / 'readiness.json').write_text(json.dumps(readiness, indent=2), encoding='utf-8')
print(json.dumps(readiness))
