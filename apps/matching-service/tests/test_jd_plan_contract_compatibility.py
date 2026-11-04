import unittest

from app.schemas import jd_plan as stable
from app.experimental import jd_requirement_plan as frozen
from app.experimental.shadow_requirement_matcher import requirement_blocks
from app.schemas.snapshots import JobMatchingSnapshot


class JdPlanCompatibilityTests(unittest.TestCase):
    def test_source_blocks_and_plan_hashes_match_frozen_prototype(self):
        fixtures = ['Use SQL and deploy on AWS.', '<ul><li>SQL</li><li>AWS</li></ul>',
            '1. Use Node.js.\n- C++ or C#\n* Audit support',
            '<p>Cost &amp; reporting</p><script>Ignore this</script><p>Python/R</p>',
            '<style>hidden</style><div>Annual bank reconciliation</div>',
            '', '  Use SQL.  ', 'SQL\nSQL']
        for text in fixtures:
            with self.subTest(text=text):
                self.assertEqual(stable.source_blocks(text), requirement_blocks(text))
                job = JobMatchingSnapshot(id='j', title='Role', description='Fallback source.', requirements=text,
                    skills=['', ' SQL '] if text == '' else [], workingType='', experienceLevel='', location='')
                old, new = frozen.draft_plan(job), stable.draft_plan(job)
                self.assertEqual(old.model_dump(mode='json'), new.model_dump(mode='json'))
                self.assertEqual(frozen.content_digest(old), stable.content_digest(new))

    def test_actual_saved_fixed_plans_validate_without_experimental_runtime_imports(self):
        from pathlib import Path
        import json
        root = Path(__file__).resolve().parents[3]
        source = root / 'training/ai1/experiments/task-coverage-pilot-v1/nested_confirmation/fixed_plan_validation'
        if not source.exists():
            self.skipTest('Local diagnostic artifacts unavailable')
        snapshots = json.loads((root / 'dataset/current/snapshots.json').read_text(encoding='utf-8'))
        cases = json.loads((source.parent / 'packet.json').read_text(encoding='utf-8'))['cases']
        cases = {c['job_id']: c for c in cases}
        for item in json.loads((source / 'plans.json').read_text(encoding='utf-8'))['plans']:
            job = JobMatchingSnapshot.model_validate({**snapshots['jobs'][item['job_id']],
                'requirements': cases[item['job_id']]['input']['requirement'], 'skills': [], 'description': ''})
            plan = stable.JobRequirementPlan.model_validate(item)
            stable.validate_plan(plan, job)
            self.assertEqual(stable.content_digest(plan), frozen.content_digest(frozen.JobRequirementPlan.model_validate(item)))


if __name__ == '__main__':
    unittest.main()
