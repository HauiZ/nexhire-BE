"""Pinned local tokenizer preflight; no encoder loading or network fallback."""
from functools import lru_cache

from app.matching.normalizer import normalize_semantic_text


@lru_cache(maxsize=1)
def _tokenizer(path, pin):
    from app.matching.m1_runtime import verify_manifest
    from transformers import AutoTokenizer
    _, directory = verify_manifest(path, pin)
    return AutoTokenizer.from_pretrained(str(directory), local_files_only=True)


def inspect_query_budget(plan, settings):
    if plan is None:
        return {'status': 'NOT_APPLICABLE', 'limit': 256, 'issues': []}
    try:
        tokenizer = _tokenizer(settings.ai1_manifest_path, settings.ai1_manifest_sha256)
        requests = [(s.source_id, c) for s in plan.sources if s.selected for c in s.components]
        tokens = tokenizer([normalize_semantic_text(c.query) for _, c in requests],
                           truncation=False, add_special_tokens=True, verbose=False)['input_ids']
        if len(tokens) != len(requests):
            raise ValueError('Incomplete token counts')
        issues = [{'source_id': sid, 'component_id': c.id, 'tokens': len(ids),
                   'code': 'QUERY_TOKEN_LIMIT_EXCEEDED'}
                  for (sid, c), ids in zip(requests, tokens) if len(ids) > 256]
        return {'status': 'TOO_LONG' if issues else 'READY', 'limit': 256, 'issues': issues}
    except Exception:
        return {'status': 'UNAVAILABLE', 'limit': 256, 'issues': []}
