"""Regression tests for AI2 pilot v1 source validation and parser boundaries."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

BASE = Path(__file__).resolve().parent


class TestAi2PilotSourceValidation(unittest.TestCase):
    def test_validate_sources_exits_zero_on_repaired_sources(self):
        res = subprocess.run(
            [sys.executable, '-I', str(BASE / 'validate_sources.py')],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(res.returncode, 0, msg=res.stderr)
        data = json.loads(res.stdout)
        self.assertEqual(data['jobs'], 20)
        self.assertEqual(data['pairs'], 160)
        self.assertEqual(data['errors'], 0)
        self.assertEqual(data['exact_duplicates'], 0)

    def test_no_cross_role_markers_in_experience_descriptions(self):
        for fname in ['it.json', 'sales-marketing.json']:
            data = json.loads((BASE / 'sources' / fname).read_text(encoding='utf-8'))
            for job in data['jobs']:
                for cand in job['candidates']:
                    for exp in cand['experiences']:
                        self.assertNotIn('Chức danh:', exp['description'], msg=exp['experience_id'])

    def test_prohibited_bias_and_templated_negative_lines_absent(self):
        for fname in ['it.json', 'sales-marketing.json']:
            data = json.loads((BASE / 'sources' / fname).read_text(encoding='utf-8'))
            for job in data['jobs']:
                for req in job['requirements']:
                    self.assertNotIn('tại các trường uy tín', req['text'].casefold())
                    self.assertNotIn('giọng nói chuẩn', req['text'].casefold())
                for cand in job['candidates']:
                    for sec in cand['sections']:
                        self.assertNotIn('trẻ tuổi', sec['text'].casefold(), msg=sec['section_id'])
                        self.assertNotIn('giọng nói chuẩn', sec['text'].casefold(), msg=sec['section_id'])

    def test_exact_cv_text_section_joins_and_nullable_is_current(self):
        null_current_count = 0
        for fname in ['it.json', 'sales-marketing.json']:
            data = json.loads((BASE / 'sources' / fname).read_text(encoding='utf-8'))
            for job in data['jobs']:
                for cand in job['candidates']:
                    expected = '\n\n'.join(s['text'] for s in cand['sections'])
                    self.assertEqual(cand['cv_text'], expected, msg=cand['candidate_id'])
                    for exp in cand['experiences']:
                        self.assertIn(exp['is_current'], {True, False, None})
                        if exp['is_current'] is None:
                            null_current_count += 1
                            self.assertIsNone(exp['end_date'])
                        if exp['is_current'] is True:
                            self.assertIsNone(exp['end_date'])
        self.assertEqual(null_current_count, 11)

    def test_it_role_boundary_parser_rejects_ambiguous_marker(self):
        import runpy
        mod = runpy.run_path(str(BASE / 'repair_it_role_attribution.py'))
        fn = mod['role_description']
        sample = (
            'Kinh nghiệm:\n'
            '- Chức danh: Dev A tại Cty A. Thời gian: 2023-01 đến nay. Mô tả: Làm A.\n'
            '- Chức danh: Dev B tại Cty B. Thời gian: 2021-01 đến 2022-12. Mô tả: Làm B.'
        )
        self.assertEqual(fn(sample, 'Dev A', 'Cty A'), 'Làm A.')
        self.assertEqual(fn(sample, 'Dev B', 'Cty B'), 'Làm B.')
        with self.assertRaises(ValueError):
            fn(sample + sample, 'Dev A', 'Cty A')

    def test_descriptions_verbatim_grounded_and_no_commercial_brands(self):
        import re
        brand_re = re.compile(
            r'\b(wpp|omnicom|union square|vtv3|ogilvy|dentsu|vnexpress|dân trí|tuổi trẻ|co\.opmart|winmart|big c|lotte mart)\b',
            re.IGNORECASE,
        )
        neg_re = re.compile(
            r'^(?:-\s*)?(?:Chưa (?:có|từng|trực tiếp)|Không (?:trực tiếp|phụ trách|tham gia)|Bản thân không trực tiếp)'
        )
        for fname in ['it.json', 'sales-marketing.json']:
            data = json.loads((BASE / 'sources' / fname).read_text(encoding='utf-8'))
            for job in data['jobs']:
                self.assertIsNone(brand_re.search(job['jd_text']), msg=job['job_id'])
                for cand in job['candidates']:
                    secs = {s['section_id']: s['text'] for s in cand['sections']}
                    self.assertIsNone(brand_re.search(cand['cv_text']), msg=cand['candidate_id'])
                    for sk in cand['skills']:
                        self.assertIsNone(brand_re.search(sk), msg=f"{cand['candidate_id']}:{sk}")
                    for exp in cand['experiences']:
                        self.assertIsNone(brand_re.search(exp['description']), msg=exp['experience_id'])
                        for line in (exp['description'] or '').splitlines():
                            clean = line.strip()
                            if clean:
                                self.assertIn(clean, secs[exp['section_id']], msg=exp['experience_id'])
                                self.assertIsNone(neg_re.match(clean), msg=exp['experience_id'])
                    for prj in cand['projects']:
                        self.assertIsNone(brand_re.search(prj['description']), msg=prj['project_id'])
                        for line in (prj['description'] or '').splitlines():
                            clean = line.strip()
                            if clean:
                                self.assertIn(clean, secs[prj['section_id']], msg=prj['project_id'])
                                self.assertIsNone(neg_re.match(clean), msg=prj['project_id'])


if __name__ == '__main__':
    unittest.main()
