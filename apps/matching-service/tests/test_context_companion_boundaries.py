"""Tester behavioral boundary checks with fabricated retrieval, no model calls."""
import copy
import unittest
from app.experimental.context_companion import augment_context


def row(key, text, source='project'):
    return {'id': key, 'text': text, 'source': source}


def request(inv, hits, query='SQL'):
    return {'requirements': [{'requirement': {'id': 'requirements/0', 'text': query},
        'hits': [{**inv[k], 'comparison_score': 91.25} for k in hits],
        'ranked_evidence_ids': hits + [k for k in inv if k not in hits], 'status': 'REVIEW_REQUIRED'}],
        'automatically_supported': False, 'candidate_rejected': False, 'requires_manual_review': True}


class ContextCompanionBoundaries(unittest.TestCase):
    def test_malformed_inventory_and_foreign_hit_rejected(self):
        inv = {'tag': row('tag', 'SQL', 'skill'), 'p': row('p', 'SQL course only.')}
        baseline = request(inv, ['tag'])
        for broken in [[], {'tag': row('other', 'SQL', 'skill')},
                       {'tag': row('tag', 'SQL', 'invalid')}, {'tag': row('tag', '', 'skill')},
                       {'tag': inv['tag']}]:
            with self.subTest(broken=broken), self.assertRaises(ValueError):
                augment_context(baseline, broken)
        changed = copy.deepcopy(baseline)
        changed['requirements'][0]['hits'][0]['id'] = 'foreign/tag'
        with self.assertRaises(ValueError):
            augment_context(changed, inv)

    def test_altered_case_whitespace_and_rank_rejected(self):
        inv = {'tag': row('tag', 'SQL', 'skill'), 'p': row('p', 'SQL work.')}
        for text in ['sql', ' SQL', 'SQL invented']:
            baseline = request(inv, ['tag'])
            baseline['requirements'][0]['hits'][0]['text'] = text
            with self.subTest(text=text), self.assertRaises(ValueError):
                augment_context(baseline, inv)
        baseline = request(inv, ['tag'])
        baseline['requirements'][0]['ranked_evidence_ids'].reverse()
        with self.assertRaises(ValueError):
            augment_context(baseline, inv)

    def test_sql_nosql_java_javascript_literal_boundaries(self):
        for query, wrong in [('SQL', 'NoSQL'), ('Java', 'JavaScript')]:
            inv = {'tag': row('tag', query, 'skill'), 'wrong': row('wrong', f'Used {wrong} only.')}
            output = augment_context(request(inv, ['tag'], query), inv)
            self.assertEqual(output['context_companion']['requirements'][0]['companions'], [])

    def test_wrong_tool_hit_cannot_amplify_query(self):
        inv = {'tag': row('tag', 'NoSQL', 'skill'), 'p': row('p', 'NoSQL document storage only.')}
        output = augment_context(request(inv, ['tag'], 'SQL'), inv)
        self.assertEqual(output['context_companion']['requirements'][0]['companions'], [])

    def test_same_project_parent_only_and_cross_record_unverified(self):
        inv = {'own': row('own', 'SQL training; no production work.'),
            'own/technologies/0': row('own/technologies/0', 'SQL'),
            'other': row('other', 'SQL in a separate organization.')}
        baseline = request(inv, ['own/technologies/0'])
        before = copy.deepcopy(baseline)
        output = augment_context(baseline, inv)
        cards = output['context_companion']['requirements'][0]['companions']
        self.assertEqual([c['id'] for c in cards], ['own'])
        self.assertTrue(cards[0]['links'][0]['same_record_only'])
        self.assertFalse(cards[0]['same_activity_verified'])
        self.assertTrue(cards[0]['unresolved'])
        self.assertEqual(output['baseline'], before)
        self.assertEqual(baseline, before)
        output['baseline']['requirements'][0]['status'] = 'changed'
        self.assertEqual(baseline, before)
        inv['tag'] = row('tag', 'SQL', 'skill')
        cards = augment_context(request(inv, ['tag']), inv)['context_companion']['requirements'][0]['companions']
        for card in cards:
            self.assertFalse(card['links'][0]['same_record_only'])
            self.assertFalse(card['links'][0]['same_activity_verified'])

    def test_oversize_trailing_denial_omitted_never_clipped(self):
        text = 'SQL ' + 'Training exercise. ' * 120 + 'No professional experience with SQL.'
        inv = {'tag': row('tag', 'SQL', 'skill'), 'long': row('long', text)}
        output = augment_context(request(inv, ['tag']), inv)
        query = output['context_companion']['requirements'][0]
        self.assertEqual(query['companions'], [])
        self.assertEqual(query['omitted_by_reason']['query_char_budget'], 1)
        self.assertEqual(inv['long']['text'], text)

    def test_count_total_budget_duplicates_and_omission_counts(self):
        inv = {'tag': row('tag', 'SQL', 'skill')}
        inv.update({str(i): row(str(i), f'SQL {i} work context.') for i in range(4)})
        baseline = request(inv, ['tag'])
        second = copy.deepcopy(baseline['requirements'][0])
        second['requirement']['id'] = 'requirements/1'
        baseline['requirements'].append(second)
        output = augment_context(baseline, inv, max_total_chars=42)
        self.assertLessEqual(output['context_companion']['chars_used'], 42)
        cards = []
        for query in output['context_companion']['requirements']:
            self.assertLessEqual(len(query['companions']), 2)
            self.assertLessEqual(query['chars_used'], 2000)
            self.assertEqual(query['omitted_count'], sum(query['omitted_by_reason'].values()))
            cards += query['companions']
        self.assertEqual(len(cards), len({c['text'] for c in cards}))

    def test_invalid_project_parent_rejected(self):
        for inv in [{'p/technologies/0': row('p/technologies/0', 'SQL')},
                    {'p': row('p', 'NoSQL only.'), 'p/technologies/0': row('p/technologies/0', 'SQL')}]:
            with self.subTest(inv=inv), self.assertRaises(ValueError):
                augment_context(request(inv, ['p/technologies/0']), inv)


if __name__ == '__main__':
    unittest.main()
