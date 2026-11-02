"""Literal content diagnostics, not entailment or candidate competence labels.

Do not reorder frozen M1 hits or feed these diagnostics into trained AI2 features.
Vocabulary is deliberately bounded; absence outside it remains unknown.
"""
import re

TOOLS = {
    'node': r'node\.?js', 'typescript': r'typescript', 'postgresql': r'postgres(?:ql)?',
    'mysql': r'mysql', 'git': r'git', 'aws': r'aws|amazon web services',
    'python': r'python', 'docker': r'docker',
    'authentication': r'authentication|auth|xác thực',
    'rbac': r'rbac|role[ -]based access control|role guards?|phân quyền',
    'rest': r'rest(?:ful)?\s*apis?',

}


def mentions(text):
    return {name for name, pattern in TOOLS.items()
            if re.search(r'(?<![\w])(?:' + pattern + r')(?![\w])', text, re.I)}


def content_warnings(requirement, hits):
    expected = mentions(requirement)
    if not expected:
        return ()
    if not hits or not any(expected & mentions(hit.text) for hit in hits):
        return ('NO_REQUESTED_TOOL_MENTION_IN_RETRIEVED_PASSAGES',)
    warnings = []
    if not expected & mentions(hits[0].text):
        warnings.append('TOP_PASSAGE_LACKS_REQUESTED_TOOL_MENTION')
    # Never infer AND/OR coverage or proficiency from a lexical match.
    if any(re.search(r'\b(?:no|not|never|without)\b', hit.text, re.I)
           and expected & mentions(hit.text) for hit in hits):
        warnings.append('TOOL_MENTION_WITH_NEGATION_REQUIRES_REVIEW')
    return tuple(warnings)
