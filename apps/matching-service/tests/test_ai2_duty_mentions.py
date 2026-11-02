"""Action/object phrase probes do not establish duty satisfaction."""

import pytest

from app.ranking.duty_mentions import DutyRule, extract_duty_mentions

RULES = (DutyRule('payroll_review', ('review', 'reviewed'), ('payroll',)),)


def test_exact_unicode_spans_and_attachment_limit():
    text = '🙂 Reviewed monthly payroll for staff.'
    mention, = extract_duty_mentions(text, RULES)
    assert mention.quote == text[mention.start:mention.end] == 'Reviewed monthly payroll'
    assert text[mention.action_start:mention.action_end] == 'Reviewed'
    assert text[mention.object_start:mention.object_end] == 'payroll'
    assert mention.status == 'phrase_observation'
    assert mention.reasons == ('action_object_attachment_unverified',)
    assert text[mention.context_start:mention.context_end] == mention.context_quote
    assert 'for staff' in mention.context_quote


@pytest.mark.parametrize('text', ['Never reviewed payroll.', "Didn't review payroll.",
                                  'Would review payroll.', 'Must review payroll.'])
def test_negated_or_hypothetical_is_unknown(text):
    mention, = extract_duty_mentions(text, RULES)
    assert mention.status == 'unknown'


@pytest.mark.parametrize('text', ['Reviewed budgets. Payroll processing.',
    'Reviewed budgets\nPayroll processing', 'Reviewed budgets; payroll processing',
    'Payroll review', 'Reviewed payrolls', '<p>Reviewed payroll</p>'])
def test_no_cross_clause_or_partial_word_inference(text):
    assert not extract_duty_mentions(text, RULES)


def test_shared_words_never_establish_attachment():
    result, = extract_duty_mentions('Reviewed plans for a client who processes payroll.', RULES)
    assert result.status == 'phrase_observation'
    assert 'action_object_attachment_unverified' in result.reasons


def test_context_keeps_domain_and_support_scope():
    text = 'Earlier sentence. Supported senior bankers on roadshows for clients.'
    rules = (DutyRule('roadshow_support', ('supported',), ('roadshows',)),)
    mention, = extract_duty_mentions(text, rules)
    assert 'senior bankers' in mention.quote
    assert 'for clients' in mention.context_quote
    assert text[mention.context_start:mention.context_end] == mention.context_quote
    assert mention.context_start <= mention.start < mention.end <= mention.context_end


def test_deduplicate_overlapping_aliases():
    rules = (DutyRule('payroll', ('reviewed',), ('payroll', 'monthly payroll')),)
    result = extract_duty_mentions('Reviewed monthly payroll', rules)
    assert len(result) == 1


@pytest.mark.parametrize('rules', [[], (DutyRule('', ('a',), ('b',)),),
    (DutyRule('x', (), ('b',)),), (DutyRule('x', ('a',), ('b',)), DutyRule('x', ('a',), ('b',)))])
def test_invalid_vocabulary(rules):
    with pytest.raises(ValueError):
        extract_duty_mentions('a b', rules)
