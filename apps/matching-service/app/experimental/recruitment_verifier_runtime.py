"""Pinned recruitment checkpoint, exposed only as unverified HR suggestions."""

import json
from pathlib import Path, PurePosixPath
import re

import numpy as np

from app.experimental.shadow_runtime import ShadowInputError, checksum

LABELS = ('matched', 'partial', 'not_established_in_provided_evidence')
MODEL_FILES = {'config.json', 'model.safetensors', 'tokenizer.json',
               'tokenizer_config.json', 'special_tokens_map.json'}


def verify_export(directory, expected_results_sha256):
    directory = Path(directory).resolve()
    if (not isinstance(expected_results_sha256, str)
            or not re.fullmatch('[0-9a-f]{64}', expected_results_sha256)
            or checksum(directory / 'results.json') != expected_results_sha256):
        raise ValueError('Explicit results checksum pin required')
    result = json.loads((directory / 'results.json').read_text(encoding='utf-8'))
    if (result['production_approved'] is not False or result['ai1_finalized'] is not False
            or checksum(directory / 'protocol.json') != result['protocol_sha256']):
        raise ValueError('Unpromoted checkpoint and bound training protocol required')
    artifacts = result['artifact_sha256']
    for name, expected in artifacts.items():
        relative = PurePosixPath(name)
        if (relative.is_absolute() or '..' in relative.parts or '\\' in name or ':' in name
                or not re.fullmatch('[0-9a-f]{64}', expected)):
            raise ValueError('Unsafe checkpoint artifact path/hash')
        path = directory.joinpath(*relative.parts)
        if (not path.resolve().is_relative_to(directory)
                or any(p.is_symlink() for p in (path, *path.parents) if p != directory)
                or checksum(path) != expected):
            raise ValueError('Checkpoint artifact changed')
    model = directory / 'model'
    if ({p.relative_to(model).as_posix() for p in model.rglob('*') if p.is_file()} != MODEL_FILES
            or any(p.is_symlink() for p in model.rglob('*'))
            or any('model/' + name not in artifacts for name in MODEL_FILES)):
        raise ValueError('Only the pinned safetensors model files may be loaded')
    config = json.loads((model / 'config.json').read_text(encoding='utf-8'))
    if config['id2label'] != {str(i): name for i, name in enumerate(LABELS)}:
        raise ValueError('Recruitment classifier labels required, not NLI neutral mapping')
    return result, model


class RecruitmentVerifier:
    def __init__(self, directory, expected_results_sha256):
        result, model_path = verify_export(directory, expected_results_sha256)
        self.weights_sha256 = result['artifact_sha256']['model/model.safetensors']
        self.model_version = 'ai1-verifier-shadow:' + self.weights_sha256[:12]
        self.results_sha256 = expected_results_sha256
        from transformers import AutoTokenizer, AutoModelForSequenceClassification
        self.tokenizer = AutoTokenizer.from_pretrained(str(model_path), local_files_only=True, trust_remote_code=False)
        self.model = AutoModelForSequenceClassification.from_pretrained(str(model_path), local_files_only=True,
            trust_remote_code=False, use_safetensors=True).eval()
        if self.model.config.id2label != dict(enumerate(LABELS)):
            raise ValueError('Loaded classifier label order changed')

    def suggest(self, requirement, premise):
        if (not isinstance(requirement, str) or not requirement.strip() or len(requirement) > 5000
                or not isinstance(premise, str) or not premise.strip() or len(premise) > 16000):
            raise ShadowInputError('Bounded nonempty verifier text required')
        encoded = self.tokenizer(premise, requirement, truncation=False, return_tensors='pt')
        common = {'model_version': self.model_version, 'weights_sha256': self.weights_sha256,
            'results_sha256': self.results_sha256, 'scope': 'provided_retrieval_window_only',
            'assessment_status': 'PENDING_REVIEW', 'verified_support': False,
            'decision_threshold_applied': False, 'probabilities_are_calibrated': False}
        if encoded['input_ids'].shape[1] > 512:
            return {**common, 'model_suggestion': None, 'probabilities': None,
                    'reason': 'PAIR_CONTEXT_LIMIT_EXCEEDED'}
        import torch
        with torch.inference_mode():
            p = torch.softmax(self.model(**encoded).logits, dim=-1)[0].cpu().numpy()
        if (p.shape != (3,) or not np.isfinite(p).all() or (p < 0).any() or (p > 1).any()
                or not np.isclose(p.sum(), 1., atol=1e-6)):
            raise RuntimeError('Invalid recruitment verifier probabilities')
        return {**common, 'model_suggestion': LABELS[int(p.argmax())],
                'probabilities': dict(zip(LABELS, p.tolist())),
                'reason': 'UNVALIDATED_ARGMAX_REQUIRES_HR_REVIEW'}
