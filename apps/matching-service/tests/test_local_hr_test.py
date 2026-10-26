from types import SimpleNamespace
import unittest

from app.clients.local_hr_test import fixture_endpoint


class LocalHrTestBoundaryTests(unittest.TestCase):
    def settings(self, **changes):
        return SimpleNamespace(**({'node_env': 'test', 'enable_local_hr_test': True,
            'local_hr_test_job_ids': 'synthetic-job', 'local_hr_test_candidate_ids': 'synthetic-cv',
            'local_hr_test_url': 'http://127.0.0.1:12345', 'local_hr_test_token': 'x' * 32,
            'local_hr_test_weights_sha256': 'a' * 64} | changes))

    def test_explicit_fixture_loopback_only(self):
        self.assertEqual(fixture_endpoint(self.settings(), 'synthetic-job', 'synthetic-cv'),
            'http://127.0.0.1:12345/api/v1/shadow/assessments')

    def test_real_id_and_non_test_modes_fail_before_transport(self):
        for job, cv in [('other-job', 'synthetic-cv'), ('synthetic-job', 'other-cv')]:
            with self.assertRaises(ValueError):
                fixture_endpoint(self.settings(), job, cv)
        for change in ({'node_env': 'production'}, {'node_env': 'development'}, {'enable_local_hr_test': False}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                fixture_endpoint(self.settings(**change), 'synthetic-job', 'synthetic-cv')

    def test_nonloopback_dns_proxy_and_credential_urls_fail(self):
        for url in ('https://example.com', 'http://localhost:12345', 'http://10.0.0.1:12345',
                    'http://169.254.169.254:80', 'http://user:secret@127.0.0.1:12345',
                    'http://127.0.0.1:12345/path', 'http://127.0.0.1:12345?target=outside'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                fixture_endpoint(self.settings(local_hr_test_url=url), 'synthetic-job', 'synthetic-cv')


if __name__ == '__main__':
    unittest.main()
