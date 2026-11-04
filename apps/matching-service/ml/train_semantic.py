"""Compatibility entry point; implementation lives in ml.ai1.train_semantic."""

import importlib
from pathlib import Path
import runpy
import sys

if __name__ == "__main__":
    service = Path(__file__).resolve().parents[1]
    sys.path = [p for p in sys.path if Path(p or ".").resolve() != Path(__file__).resolve().parent]
    sys.path.insert(0, str(service))
    runpy.run_module("ml.ai1.train_semantic", run_name="__main__")
else:
    # Preserve module identity, including private helpers and monkeypatch targets.
    sys.modules[__name__] = importlib.import_module("ml.ai1.train_semantic")
