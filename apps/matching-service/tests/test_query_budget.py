import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.schemas.query_budget import inspect_query_budget


class QueryBudgetTests(unittest.TestCase):
    def plan(self):
        return SimpleNamespace(sources=[SimpleNamespace(source_id='v2/requirements/0', selected=True,
            components=[SimpleNamespace(id='whole', query='SQL')])])

    def test_exact_boundary_and_specific_query_identity(self):
        for length, status in ((256, 'READY'), (257, 'TOO_LONG')):
            with patch('app.schemas.query_budget._tokenizer', return_value=lambda *a, **k: {'input_ids': [[0] * length]}):
                result = inspect_query_budget(self.plan(), SimpleNamespace(ai1_manifest_path='test', ai1_manifest_sha256='pin'))
            self.assertEqual(result['status'], status)
            if length == 257:
                self.assertEqual(result['issues'][0]['source_id'], 'v2/requirements/0')
                self.assertEqual(result['issues'][0]['tokens'], 257)

    def test_missing_tokenizer_explicitly_unavailable(self):
        result = inspect_query_budget(self.plan(), SimpleNamespace())
        self.assertEqual(result['status'], 'UNAVAILABLE')
        self.assertEqual(result['issues'], [])

    def test_unselected_sources_not_counted(self):
        plan = self.plan(); plan.sources[0].selected = False
        with patch('app.schemas.query_budget._tokenizer', return_value=lambda *a, **k: {'input_ids': []}):
            self.assertEqual(inspect_query_budget(plan, SimpleNamespace(ai1_manifest_path='test', ai1_manifest_sha256='pin'))['status'], 'READY')
