"""Create separate synthetic candidate results using real offline M1 inference."""
import asyncio
import json
import os
import sys
from datetime import date
from pathlib import Path
from uuid import UUID, uuid4

from app.clients.internal import InternalClient
from app.config import get_settings
from app.db import session_scope
from app.matching.ai1 import assess_ai1
from app.matching.evidence_result import evidence_explanation
from app.matching.service import MatchingService
from app.models.matching import MatchRequest, MatchRequestStatus, MatchRequestType
from app.schemas.jd_plan_context import JobPlanContext
from app.schemas.snapshots import CandidateMatchingSnapshot


async def main():
    descriptor = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    job = await InternalClient().get_job_matching_snapshot(descriptor['jobId'])
    service = MatchingService()
    records = []
    for index, app in enumerate(descriptor['applications']):
        # Two identical source profiles exercise shared ties; third has different evidence.
        skill = 'Python' if index < 2 else 'Excel'
        candidate = CandidateMatchingSnapshot(candidateId=app['candidateId'], candidateCvId=app['candidateCvId'],
            skills=[{'id': 'skill-0', 'name': skill}],
            experiences=[{'title': 'Synthetic developer', 'description': f'Built {skill} services.',
                          'startYear': 2020, 'startMonth': 1, 'endYear': 2022, 'endMonth': 1, 'isCurrent': False}])
        assessment = await assess_ai1(get_settings(), job, candidate, JobPlanContext(status='UNPREPARED', reason='SYNTHETIC_E2E_NO_REVIEWED_PLAN'))
        if assessment.status != 'READY':
            raise ValueError('Real local assessment not ready')
        async with session_scope() as session:
            request = MatchRequest(id=uuid4(), application_id=UUID(app['id']), job_id=UUID(job.id),
                candidate_id=UUID(app['candidateId']), candidate_cv_id=UUID(app['candidateCvId']),
                request_type=MatchRequestType.RECRUITER_MANUAL, status=MatchRequestStatus.SUCCEEDED)
            session.add(request)
            await session.flush()
            result = service._build_success_result(request, evidence_explanation(job, candidate, assessment, date(2026, 10, 30)))
            session.add(result)
            await session.flush()
            records.append({'applicationId': app['id'], 'resultId': str(result.id)})
    print(json.dumps({'synthetic': True, 'results': records}))


asyncio.run(main())
