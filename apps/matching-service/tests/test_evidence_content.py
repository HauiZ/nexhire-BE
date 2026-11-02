from types import SimpleNamespace
from app.matching.evidence_content import content_warnings, mentions


def hits(*texts):
    return [SimpleNamespace(text=text) for text in texts]


def test_aws_and_git_unrelated_passages_do_not_establish_mentions():
    assert content_warnings('Deploy applications on AWS.', hits('Built Docker and Redis services.')) == ('NO_REQUESTED_TOOL_MENTION_IN_RETRIEVED_PASSAGES',)
    assert content_warnings('Use Git for source control and collaboration.', hits('Bachelor in Software Engineering.'))
    assert mentions('digital GitHub Postgresql') == {'postgresql'}


def test_wrong_top_database_and_lower_exact_technology():
    assert content_warnings('PostgreSQL or MySQL', hits('MSSQL (SQL Server)', 'PostgreSQL')) == ('TOP_PASSAGE_LACKS_REQUESTED_TOOL_MENTION',)


def test_negation_is_warning_not_support_and_no_or_logic_inference():
    assert content_warnings('Python', hits('No Python experience.')) == ('TOOL_MENTION_WITH_NEGATION_REQUIRES_REVIEW',)
    assert content_warnings('Node.js and TypeScript', hits('Node.js')) == ()  # no invented AND satisfaction
    assert content_warnings('Implement authentication and RBAC.', hits('Generic backend.', 'JWT auth and role guards')) == ('TOP_PASSAGE_LACKS_REQUESTED_TOOL_MENTION',)
    assert content_warnings('Lead a team.', hits('Generic backend.')) == ()  # unknown vocabulary
