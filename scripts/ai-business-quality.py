"""Bounded local quality comparison; no DB writes/training/provider requests."""
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from types import SimpleNamespace

from app.matching.ai1 import assess_local, load_backend
from app.ranking.demo_predictor import DemoPredictor
from app.ranking.observed_features import extract_observed_features
from app.ranking.demo_predictor import AI1_PINS
from app.schemas.snapshots import JobMatchingSnapshot, CandidateMatchingSnapshot
from app.schemas.jd_plan_context import JobPlanContext

ROOT = Path(__file__).resolve().parents[1]


def lexical(requirement, text):
    tokens = set(re.findall(r'\w+', requirement.lower()))
    return len(tokens & set(re.findall(r'\w+', text.lower()))) / len(tokens) if tokens else 0


def main():
    spec_path = ROOT / 'trainning/ai2/content-review-v1/business-quality-cases.json'
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    settings = SimpleNamespace(ai1_manifest_sha256=AI1_PINS['manifest_sha256'])
    started = time.perf_counter()
    runtime = load_backend(str(ROOT / 'trainning/ai1/exports/kaggle-ranking-v1/shadow-ranking-retention.json'), settings.ai1_manifest_sha256)
    predictor = DemoPredictor.load(ROOT / 'trainning/ai2/demo-artifact-v1', enabled=True, node_env='test')
    startup = time.perf_counter() - started

    def run(identity, requirement, text, **extra):
        job = JobMatchingSnapshot(id=identity, title='Synthetic source review', requirements=requirement,
            skills=[], description='', workingType='', experienceLevel='', location='')
        candidate = CandidateMatchingSnapshot(candidateId=identity, candidateCvId='synthetic', summary=text,
            experiences=[{'title': 'Synthetic record', 'description': text, 'startYear': 2020,
                'startMonth': 1, 'endYear': 2022, 'endMonth': 1, 'isCurrent': False}], **extra)
        before = time.perf_counter()
        assessment = assess_local(runtime, settings, job, candidate, JobPlanContext(status='UNPREPARED', reason='SOURCE_QUALITY_PROBE'))
        features = extract_observed_features(assessment, job, candidate, reference_date='2026-10-30', **AI1_PINS)
        score = predictor.score(assessment, job, candidate, reference_date='2026-10-30')
        return dict(text=text, lexical=lexical(requirement, text), semantic=features.numeric_row()['semantic_mean_top1'],
            ai2=score.score, features=features.numeric_row(), latency_ms=round((time.perf_counter() - before) * 1000, 2),
            hits=[dict(text=h.text, source=h.source, similarity=h.similarityScore) for h in assessment.requirements[0].evidence])

    cases = []
    for case in spec['cases']:
        rows = [run(case['id'], case['requirement'], case[key]) for key in ('stronger', 'contrast')]
        methods = {}
        for method in ('lexical', 'semantic', 'ai2'):
            left, right = rows[0][method], rows[1][method]
            methods[method] = 'PASS' if left > right else 'TIE' if left == right else 'REVERSED'
        cases.append(dict(**case, expectation='stronger strictly above contrast on documented requirement evidence', results=methods, rows=rows))
    invariance = []
    for item in spec['invariance']:
        rows = [run(item['id'], item['requirement'], item['text'], **{item['field']: value}) for value in item['values']]
        invariance.append(dict(**item, passed=rows[0]['features'] == rows[1]['features'] and rows[0]['ai2'] == rows[1]['ai2'], rows=rows))
    report = dict(schema='ai-business-quality-results-v1', spec_sha256=hashlib.sha256(spec_path.read_bytes()).hexdigest(),
        scope=spec['scope'], label_origin=spec['label_origin'], independent_gold=False,
        model_changed=False, startup_seconds=round(startup, 3), cases=cases, invariance=invariance,
        summaries={method: {state: sum(c['results'][method] == state for c in cases) for state in ('PASS', 'TIE', 'REVERSED')} for method in ('lexical', 'semantic', 'ai2')},
        limitations=['Artificial contrast set, no population accuracy estimate', 'Same assistant authored sources and expected directions',
            'Names only invariance is not demographic fairness', 'No measured HR time saving, hiring outcomes or applicant satisfaction',
            'Fixed structured chronology: relevant tenure is represented in text only; chronology does not parse that text',
            'No LLM comparison performed; external provider not used'])
    Path(sys.argv[1]).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'summaries': report['summaries'], 'invariance_passed': sum(x['passed'] for x in invariance), 'invariance_total': len(invariance)}))


main()
