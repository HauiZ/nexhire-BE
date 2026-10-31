"""Offline, label-free CV evidence comparison; never updates model weights."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import time


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def run(args):
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    import torch
    import transformers
    from transformers import AutoModel, AutoTokenizer

    data = json.loads(args.input.read_text(encoding='utf-8'))
    requirements, evidence = data['requirements'], data['evidence']
    if not requirements or not evidence:
        raise ValueError('Nonempty requirements and evidence required')
    if len({e['id'] for e in evidence}) != len(evidence):
        raise ValueError('Duplicate evidence IDs')
    texts = [r['text'] for r in requirements] + [e['text'] for e in evidence]
    result = {
        'purpose': 'Single-CV exploratory retrieval demo, not a heldout benchmark',
        'input_sha256': digest(args.input),
        'environment': {'python': platform.python_version(), 'torch': torch.__version__,
                        'transformers': transformers.__version__, 'device': 'cpu'},
        'protocol': {'max_tokens': 256, 'pooling': 'attention-mask mean',
                     'normalization': 'L2', 'top_k': 3,
                     'latency_note': 'One local encoding pass including tokenization; not a production SLA'},
        'arms': {},
    }
    for arm, folder in [('baseline', args.baseline), ('arm_c', args.arm_c)]:
        folder = folder.resolve()
        weights = sorted(folder.glob('*.safetensors'))
        if not weights:
            raise ValueError(f'Missing safetensors weights: {folder}')
        tokenizer = AutoTokenizer.from_pretrained(
            str(folder), local_files_only=True, trust_remote_code=False)
        model = AutoModel.from_pretrained(
            str(folder), local_files_only=True, trust_remote_code=False,
            use_safetensors=True).to('cpu').eval()
        model.requires_grad_(False)
        vectors, token_lengths = [], []
        started = time.perf_counter()
        with torch.inference_mode():
            for start in range(0, len(texts), 8):
                chunk = texts[start:start + 8]
                token_lengths.extend(len(ids) for ids in tokenizer(chunk, truncation=False)['input_ids'])
                batch = tokenizer(chunk, padding=True, truncation=True,
                                  max_length=256, return_tensors='pt')
                hidden = model(input_ids=batch['input_ids'],
                               attention_mask=batch['attention_mask']).last_hidden_state
                mask = batch['attention_mask'].unsqueeze(-1).to(hidden.dtype)
                pooled = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
                vectors.append(torch.nn.functional.normalize(pooled, p=2, dim=1))
        elapsed = time.perf_counter() - started
        embeddings = torch.cat(vectors)
        scores = embeddings[:len(requirements)] @ embeddings[len(requirements):].T
        if not torch.isfinite(scores).all():
            raise ValueError('Nonfinite model scores')
        rankings = []
        for row, requirement in zip(scores.tolist(), requirements):
            ranked = sorted([dict(e, score=s) for e, s in zip(evidence, row)],
                            key=lambda e: (-e['score'], e['id']))
            rankings.append({'requirement': requirement, 'ranked_evidence': ranked})
        result['arms'][arm] = {
            'model_files_sha256': {p.name: digest(p) for p in weights},
            'encoding_seconds': elapsed,
            'token_lengths': token_lengths,
            'truncated_text_count': sum(n > 256 for n in token_lengths),
            'rankings': rankings,
        }
        del model, tokenizer, embeddings, vectors
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output / 'predictions.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    lines = ['# AI1 — CV retrieval demo', '',
             'Exploratory single-CV comparison. No verified labels: no accuracy or winner claimed.', '']
    for i, requirement in enumerate(requirements):
        lines.extend([f"## {requirement['id']}: {requirement['text']}", ''])
        for arm in result['arms']:
            lines.extend([f'### {arm}', ''])
            for rank, e in enumerate(result['arms'][arm]['rankings'][i]['ranked_evidence'][:3], 1):
                lines.append(f"{rank}. **{e['id']}**, cosine {e['score']:.6f}: {e['text']}")
            lines.append('')
    (args.output / 'REPORT.md').write_text('\n'.join(lines), encoding='utf-8')
    print(f'Results: {args.output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--arm-c', type=Path, required=True)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    run(parser.parse_args())
