"""Default-off cached demo loader; no model import when disabled."""
from functools import lru_cache
from threading import Lock
import logging
import time

logger = logging.getLogger(__name__)

_load_lock = Lock()

from app.ranking.demo_predictor import DemoPredictor


@lru_cache(maxsize=1)
def _load(path, node_env):
    started = time.monotonic()
    try:
        return DemoPredictor.load(path, enabled=True, node_env=node_env)
    finally:
        logger.info('AI2 demo cold load duration_ms=%d', round((time.monotonic() - started) * 1000))


def get_demo_predictor(settings):
    if not settings.ai2_demo_enabled:
        return None
    if not settings.ai2_demo_artifact_path:
        raise ValueError('explicit demo artifact path required')
    with _load_lock:
        return _load(settings.ai2_demo_artifact_path, settings.node_env)
