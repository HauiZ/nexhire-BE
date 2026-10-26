import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
import httpx

from app.clients.internal import InternalClient
from app.schemas.snapshot_boundary import NULLABLE_JOB_TEXT, normalize_job_snapshot
from app.schemas.snapshots import JobMatchingSnapshot
from app.experimental.shadow_main import create_shadow_app


def job():
    return {"id": "j", "title": "Backend", "skills": ["NestJS"],
        **{name: None for name in NULLABLE_JOB_TEXT}, "benefits": None, "salaryMin": None, "salaryMax": None}


class SnapshotBoundaryTests(unittest.TestCase):
    def test_explicit_nulls_normalized_without_mutating_source(self):
        source = job()
        result = JobMatchingSnapshot.model_validate(normalize_job_snapshot(source))
        self.assertTrue(all(getattr(result, name) == "" for name in NULLABLE_JOB_TEXT))
        self.assertTrue(all(source[name] is None for name in NULLABLE_JOB_TEXT))
        self.assertIsNone(result.benefits)
        self.assertIsNone(result.salaryMin)

    def test_missing_title_skills_or_body_fields_are_still_errors(self):
        for name in ("id", "title", "skills", "requirements"):
            value = job()
            del value[name]
            with self.assertRaises(ValueError):
                JobMatchingSnapshot.model_validate(normalize_job_snapshot(value))

    def test_nonempty_text_and_schema_objects_not_rewritten(self):
        source = {**job(), "requirements": "C++, .NET; SQL.", "description": "Backend work."}
        result = normalize_job_snapshot(source)
        self.assertEqual(result["requirements"], source["requirements"])
        parsed = JobMatchingSnapshot.model_validate(result)
        self.assertIs(normalize_job_snapshot(parsed), parsed)

    def test_internal_client_accepts_actual_nullable_response_shape(self):
        real_client = httpx.AsyncClient
        transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"data": job()}))
        settings = SimpleNamespace(http_timeout_seconds=1, job_service_url="http://test", internal_service_token="unit-token")
        with patch("app.clients.internal.get_settings", return_value=settings), \
                patch("app.clients.internal.httpx.AsyncClient", side_effect=lambda **kw: real_client(transport=transport, **kw)):
            result = asyncio.run(InternalClient().get_job_matching_snapshot("j"))
        self.assertEqual(result.requirements, "")
        self.assertEqual(result.skills, ["NestJS"])

    def test_shadow_http_uses_same_null_contract(self):
        class Engine:
            model_version = "test"
            def score(self, job, candidate):
                return {"requirements": job.requirements, "location": job.location}
        token = "dedicated-unit-token"
        with TestClient(create_shadow_app(Engine(), token)) as client:
            response = client.post("/api/v1/shadow/requirements", json={"job": job(), "candidate": {"candidateId": "c"}},
                headers={"x-internal-service-token": token})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"requirements": "", "location": ""})
