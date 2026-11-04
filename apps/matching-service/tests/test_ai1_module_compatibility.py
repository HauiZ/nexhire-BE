"""Refactor compatibility only; never train, load weights or access datasets."""

import importlib
import os
from pathlib import Path
import subprocess
import sys

import pytest

SERVICE = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('name', ['train_semantic', 'train_ranking', 'semantic_evaluation', 'ranking_objective'])
def test_legacy_import_is_same_module(name):
    old = importlib.import_module('ml.' + name)
    current = importlib.import_module('ml.ai1.' + name)
    assert old is current
    assert Path(current.__file__).parent == SERVICE / 'ml/ai1'
    if name.startswith('train_'):
        assert current.SERVICE == SERVICE


@pytest.mark.parametrize('name', ['train_semantic', 'train_ranking'])
@pytest.mark.parametrize('mode', ['legacy_file', 'new_file', 'legacy_module', 'new_module'])
def test_old_and_new_cli_help_without_training(name, mode):
    env = {**os.environ, 'PYTHONPATH': str(SERVICE), 'PYTHONDONTWRITEBYTECODE': '1'}
    if mode.endswith('file'):
        relative = 'ml/' + ('ai1/' if mode == 'new_file' else '') + name + '.py'
        command = [sys.executable, '-B', str(SERVICE / relative), '--help']
    else:
        module = 'ml.' + ('ai1.' if mode == 'new_module' else '') + name
        command = [sys.executable, '-B', '-m', module, '--help']
    result = subprocess.run(command, cwd=SERVICE.parents[1], env=env,
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
    assert '--input-dir' in result.stdout
    assert ('--work-dir' if name == 'train_semantic' else '--output-dir') in result.stdout


def test_archived_review_accepts_relocated_training_source(tmp_path, monkeypatch):
    import importlib.util
    import hashlib
    repo = SERVICE.parents[1]
    review_path = repo / 'trainning/ai1/review_result.py'
    if not review_path.is_file():
        pytest.skip('Local historical review tool not supplied in checkout')
    spec = importlib.util.spec_from_file_location('layout_review', review_path)
    review = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(review)
    monkeypatch.setattr(review, 'REPO', repo)
    source = repo / 'apps/matching-service/ml/ai1/train_semantic.py'
    metadata = {'training_code_sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
    assert review.verify_training_code(metadata, tmp_path) == 'current_source'
