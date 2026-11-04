"""Explicitly loaded local text-pair verifier; no route or production promotion."""

from pathlib import Path
import hashlib
import json

import numpy as np

from app.experimental.text_verifier import pair_features, probabilities, decisions, LABELS


def _sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class LocalTextVerifier:
    def __init__(self, experiment, model_path):
        experiment, model_path = Path(experiment), Path(model_path)
        result = json.loads((experiment / 'results.json').read_text(encoding='utf-8'))
        self.protocol = json.loads((experiment / 'protocol.json').read_text(encoding='utf-8'))
        if result['protocol_sha256'] != _sha(experiment / 'protocol.json'):
            raise ValueError('Verifier protocol binding changed')
        for name, expected in result['artifact_sha256'].items():
            if Path(name).name != name or _sha(experiment / name) != expected:
                raise ValueError('Verifier artifact binding changed')
        for name, expected in self.protocol['nli_artifact_sha256'].items():
            if Path(name).name != name or _sha(model_path / name) != expected:
                raise ValueError('Frozen text model changed')
        if (self.protocol['target_scope'] != 'selected supplied passage only'
                or self.protocol['production_approved'] is not False
                or self.protocol['context_limit'] != 512):
            raise ValueError('Unsupported verifier contract')
        self.head = json.loads((experiment / 'head.json').read_text(encoding='utf-8'))
        self.weights = self.protocol['nli_artifact_sha256']['model.safetensors']
        from app.experimental.text_verifier import validate_head
        validate_head(self.head, weights_sha256=self.weights)
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(str(model_path), local_files_only=True, trust_remote_code=False)
        self.model = AutoModelForSequenceClassification.from_pretrained(str(model_path),
            local_files_only=True, trust_remote_code=False, use_safetensors=True).eval()

    def verify(self, requirement, sections):
        if (not isinstance(requirement, str) or not requirement.strip() or not sections
                or len(sections) > 32 or any(not isinstance(s, dict)
                    or not isinstance(s.get('evidence_id'), str) or not s['evidence_id'].strip()
                    or not isinstance(s.get('text'), str) or not s['text'].strip() for s in sections)
                or len({s['evidence_id'] for s in sections}) != len(sections)):
            raise ValueError('Nonempty requirement and 1..32 unique source sections required')
        lengths = self.tokenizer([s['text'] for s in sections], [requirement] * len(sections),
            truncation=False, padding=False, verbose=False)['input_ids']
        valid = [i for i, tokens in enumerate(lengths) if len(tokens) <= 512]
        answers = [{**s, 'status': 'PENDING_REVIEW', 'probabilities': None,
            'reason': 'PAIR_CONTEXT_LIMIT_EXCEEDED', 'scope': 'provided_passage_only'} for s in sections]
        if valid:
            import torch
            for start in range(0, len(valid), 16):
                indices = valid[start:start + 16]
                batch = self.tokenizer([sections[i]['text'] for i in indices], [requirement] * len(indices),
                    truncation=False, padding=True, return_tensors='pt')
                with torch.inference_mode():
                    output = self.model(**batch, output_hidden_states=True)
                    hidden = output.hidden_states[-1][:, 0].cpu().numpy()
                    nli = torch.softmax(output.logits, dim=-1).cpu().numpy()
                x = np.array([pair_features(h, p) for h, p in zip(hidden, nli)])
                p = probabilities(self.head, x, weights_sha256=self.weights)
                pred = decisions(p, self.head['confidence_threshold'])
                for i, prob, decision in zip(indices, p, pred):
                    answers[i].update(status=LABELS[int(decision)] if decision >= 0 else 'PENDING_REVIEW',
                        probabilities=dict(zip(LABELS, prob.tolist())), reason='LEARNED_PAIR_STATUS')
        return {'schema': 'nexhire-text-verifier-prediction-v1', 'requirement': requirement,
            'evidence': answers, 'nli_weights_sha256': self.weights,
            'scope': 'provided_passages_individually', 'whole_cv_status': None,
            'production_approved': False, 'candidate_skill_absence_inferred': False}
