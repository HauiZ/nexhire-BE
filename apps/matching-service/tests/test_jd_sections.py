import unittest

from types import SimpleNamespace

from app.schemas.jd_sections import suggest_sections, suggest_job_sections
from app.schemas.jd_plan import source_blocks


class JdSectionTests(unittest.TestCase):
    def test_common_en_sections(self):
        blocks = suggest_sections('Requirements:\n• Node.js experience.\n• PostgreSQL.\nPreferred:\n• Docker.')
        self.assertEqual([b.text for b in blocks if b.role == 'query'],
                         ['Node.js experience.', 'PostgreSQL.', 'Docker.'])
        self.assertEqual([b.importance for b in blocks if b.role == 'query'],
                         ['unknown', 'unknown', 'preferred'])
        self.assertEqual(blocks[-1].heading_index, 3)

    def test_hr_vietnamese_field_headings(self):
        blocks = suggest_sections('Yêu cầu công việc:\nNode.js\nKỹ năng và kinh nghiệm: PostgreSQL')
        self.assertEqual([b.text for b in blocks if b.role == 'query'], ['Node.js', 'PostgreSQL'])

    def test_review_context_does_not_change_query_importance(self):
        blocks = suggest_sections('Required: Node.js\nBenefits: Healthcare\nRequirements: SQL')
        self.assertEqual([b.importance for b in blocks if b.role == 'query'], ['core', 'unknown'])

    def test_repeated_heading_does_not_lose_duplicate_requirements(self):
        blocks = suggest_sections('Required: SQL\nPreferred: SQL')
        self.assertEqual([b.text for b in blocks if b.role == 'query'], ['SQL', 'SQL'])
        self.assertNotEqual(blocks[1].heading_index, blocks[3].heading_index)

    def test_vietnamese_normalization(self):
        blocks = suggest_sections(' YÊU CẦU   BẮT BUỘC : Node.js\nƯu tiên: Docker')
        self.assertEqual([b.importance for b in blocks if b.role == 'query'], ['core', 'preferred'])
        self.assertEqual([b.text for b in blocks if b.role == 'query'], ['Node.js', 'Docker'])

    def test_no_substring_classification(self):
        for text in ('Experience administering Benefits systems is required.',
                     'Experience gathering business requirements.',
                     'Preferred experience with Docker.',
                     'QualificationsStrong background in Python',
                     'Requirements engineering: practical experience',
                     'Benefits administration: experience required'):
            with self.subTest(text=text):
                self.assertEqual([(b.text, b.role) for b in suggest_sections(text)], [(text, 'query')])

    def test_explicit_colon_only_splits_known_prefix(self):
        blocks = suggest_sections('Requirements: Node.js: 2 years')
        self.assertEqual([b.text for b in blocks], ['Requirements:', 'Node.js: 2 years'])

    def test_review_is_preserved_and_context_resets(self):
        blocks = suggest_sections('Benefits\nFlexible hours.\nRequired qualifications\nPython.')
        self.assertEqual([(b.text, b.role) for b in blocks],
                         [('Benefits', 'heading'), ('Flexible hours.', 'review'),
                          ('Required qualifications', 'heading'), ('Python.', 'query')])
        self.assertEqual(blocks[-1].importance, 'core')

    def test_ambiguous_benefits_never_deleted(self):
        blocks = suggest_sections('Benefits\nExperience administering Benefits systems is required.')
        self.assertEqual(blocks[-1].role, 'review')
        self.assertIn('systems is required.', blocks[-1].text)

    def test_html_heading_and_hidden_text(self):
        blocks = suggest_sections('<h3>Requirements</h3><p>Node.js &amp; SQL.</p>'
                                  '<script>Preferred</script><style>hidden</style>'
                                  '<h3>Nice to have</h3><ul><li>Docker.</li></ul>')
        self.assertEqual([b.text for b in blocks], ['Requirements', 'Node.js & SQL.', 'Nice to have', 'Docker.'])
        self.assertEqual(blocks[-1].importance, 'preferred')

    def test_unknown_heading_not_silently_discarded(self):
        self.assertEqual(suggest_sections('Our unique criteria')[0].role, 'query')

    def test_versions_and_nested_task_context_retained(self):
        blocks = suggest_sections('<ul><li>Build services using:<ul><li>Node.js 22.</li>'
                                  '<li>.NET 8.</li></ul></li></ul>')
        self.assertEqual([b.text for b in blocks], ['Build services using:', 'Node.js 22.', '.NET 8.'])

    def test_v1_extractor_unchanged(self):
        self.assertEqual(source_blocks('Requirements:\nNode.js\nPreferred:\nDocker'),
                         ['Requirements:', 'Node.js', 'Preferred:', 'Docker'])

    def test_repeated_suggestions_stable(self):
        text = 'Minimum Requirements: Python\nBenefits: flexible hours'
        self.assertEqual(suggest_sections(text), suggest_sections(text))
        self.assertEqual([b.index for b in suggest_sections(text)], list(range(4)))


class StructuredJobSectionTests(unittest.TestCase):
    def job(self, **changes):
        values = dict(skills=[], requirements='', description='', benefits=None)
        values.update(changes)
        return SimpleNamespace(**values)

    def selected(self, job):
        return [(x.source_field, x.block.text) for x in suggest_job_sections(job)
                if x.selected_for_retrieval]

    def test_hr_fields_take_precedence_over_description(self):
        job = self.job(skills=['Python'], requirements='Requirements: SQL\nPreferred: Docker',
                       description='Build APIs.', benefits='Health insurance.')
        self.assertEqual(self.selected(job), [('skills', 'Python'), ('requirements', 'SQL'),
                                              ('requirements', 'Docker')])
        self.assertEqual(len([x for x in suggest_job_sections(job) if x.source_field == 'description']), 1)

    def test_explicit_skill_named_benefits_is_not_heading(self):
        self.assertEqual(self.selected(self.job(skills=['Benefits'])), [('skills', 'Benefits')])

    def test_benefits_field_never_enters_retrieval(self):
        job = self.job(description='Build APIs.', benefits='Required: health insurance')
        self.assertEqual(self.selected(job), [('description', 'Build APIs.')])
        self.assertTrue(any(x.source_field == 'benefits' for x in suggest_job_sections(job)))

    def test_heading_only_requirements_allow_description_fallback(self):
        self.assertEqual(self.selected(self.job(requirements='Requirements:', description='Build APIs.')),
                         [('description', 'Build APIs.')])

    def test_context_does_not_leak_across_fields(self):
        job = self.job(requirements='Benefits: Flexible hours.', description='Python experience.')
        self.assertEqual(self.selected(job), [('description', 'Python experience.')])

    def test_job_input_size_limits_remain_deterministic(self):
        job = self.job(skills=['S' * 80 for _ in range(50)],
                       requirements='R' * 8000, description='D' * 12000,
                       benefits='B' * 8000)
        items = suggest_job_sections(job)
        self.assertEqual(len(items), 53)
        self.assertEqual(sum(x.selected_for_retrieval for x in items), 51)
        self.assertEqual(items[-1].block.text, job.benefits)

    def test_skills_plus_requirements_and_blank_skills(self):
        job = self.job(skills=[' ', 'Python'], requirements='SQL')
        items = [x for x in suggest_job_sections(job) if x.selected_for_retrieval]
        self.assertEqual([x.source_field for x in items], ['skills', 'requirements'])
        self.assertEqual(items[0].source_item, 1)


if __name__ == '__main__':
    unittest.main()
