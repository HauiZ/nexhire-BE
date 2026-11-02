"""Source-first semantic acceptance probes; no training, DB writes or gold claim."""
import asyncio
import json
import sys
from pathlib import Path
from types import SimpleNamespace

from app.matching.ai1 import assess_local, load_backend
from app.ranking.demo_predictor import DemoPredictor
from app.schemas.snapshots import JobMatchingSnapshot, CandidateMatchingSnapshot
from app.schemas.jd_plan_context import JobPlanContext
from app.matching.evidence_content import content_warnings

ROOT = Path(__file__).resolve().parents[1]


def main():
    manifest = ROOT / 'trainning/ai1/exports/kaggle-ranking-v1/shadow-ranking-retention.json'
    settings = SimpleNamespace(ai1_manifest_sha256='bdfc4c0aef381cc73de2447251a27d4f1381f3787606833f79657931190620d4')
    runtime = load_backend(str(manifest), settings.ai1_manifest_sha256)
    predictor = DemoPredictor.load(ROOT / 'trainning/ai2/demo-artifact-v1', enabled=True, node_env='test')
    # Freeze directional expectations before inference. These are tiny diagnostic
    # probes, not independent expert labels or an evaluation dataset.
    cases = [
        ('aws', 'Deploy applications on AWS.', 'Deployed backend services on AWS EC2 and configured IAM.', 'Built Docker services with Redis and MinIO.'),
        ('git', 'Use Git for source control and team collaboration.', 'Used Git branches and pull requests to collaborate on code.', 'Bachelor in Software Engineering with GPA 3.8.'),
        ('database', 'Design and query PostgreSQL or MySQL databases.', 'Designed PostgreSQL schemas and optimized SQL queries.', 'Designed MSSQL SQL Server schemas and optimized SQL queries.'),
        ('rbac', 'Implement authentication and role-based access control.', 'Implemented JWT authentication and role guards for role-based access control.', 'Backend developer building scalable APIs and databases.'),
        ('negation', 'Develop Python backend services.', 'Built Python backend services in a team project.', 'No Python experience. Never built Python backend services.'),
        ('and', 'Develop REST APIs using Node.js and TypeScript.', 'Built REST APIs using Node.js and TypeScript.', 'Node.js'),
    ]
    output = []
    for name, requirement, positive, contrast in cases:
        job = JobMatchingSnapshot(id=f'probe-{name}', title='Synthetic backend role', requirements=requirement,
            skills=[], description='', workingType='', experienceLevel='', location='')
        rows = []
        for label, text in [('expected_stronger', positive), ('contrast', contrast)]:
            candidate = CandidateMatchingSnapshot(candidateId=f'{name}-{label}', candidateCvId='synthetic',
                summary=text, experiences=[{'title': 'Synthetic role', 'description': text,
                    'startYear': 2020, 'startMonth': 1, 'endYear': 2022, 'endMonth': 1, 'isCurrent': False}])
            assessment = assess_local(runtime, settings, job, candidate,
                JobPlanContext(status='UNPREPARED', reason='CONTENT_DIAGNOSTIC'))
            score = predictor.score(assessment, job, candidate, reference_date='2026-10-30')
            requirement_result = assessment.requirements[0]
            rows.append(dict(label=label, source=text, rawScore=score.score,
                retrievalStatus=requirement_result.retrievalStatus,
                hits=[dict(text=h.text, source=h.source, similarity=h.similarityScore) for h in requirement_result.evidence],
                contentWarnings=content_warnings(requirement, requirement_result.evidence)))
        output.append(dict(case=name, requirement=requirement, expectation='expected_stronger must score strictly above contrast',
            passed=rows[0]['rawScore'] > rows[1]['rawScore'], rows=rows))
    report = dict(scope='SMALL_SYNTHETIC_CONTENT_PROBES_NOT_GOLD', modelChanged=False,
        cases=output, passed=sum(x['passed'] for x in output), total=len(output))
    Path(sys.argv[1]).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'total': report['total'],
        'failures': [x['case'] for x in output if not x['passed']]}))


main()
