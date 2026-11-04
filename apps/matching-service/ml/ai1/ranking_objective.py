"""Experimental cosine ranking plus frozen-teacher retention, not runtime scoring."""

import math

import torch
from torch.nn import functional as F


def _matrix(value, name):
    if value.ndim != 2 or not value.numel() or not value.is_floating_point() or not torch.isfinite(value).all():
        raise ValueError("Nonempty finite floating embedding matrix required: " + name)
    if torch.any(torch.linalg.vector_norm(value, dim=1) <= 1e-8):
        raise ValueError("Zero embedding cannot define cosine: " + name)


class RankingRetentionLoss(torch.nn.Module):
    def __init__(self, margin=.1, retention_weight=1.0):
        super().__init__()
        if (type(margin) not in (int, float) or not math.isfinite(margin) or not 0 < margin <= 2
                or type(retention_weight) not in (int, float) or not math.isfinite(retention_weight)
                or retention_weight < 0):
            raise ValueError("Finite cosine margin in (0,2] and nonnegative retention weight required")
        self.margin, self.retention_weight = margin, retention_weight

    def forward(self, anchor, positive, negative, replay_student, replay_teacher, weights=None):
        for name, value in (("anchor", anchor), ("positive", positive), ("negative", negative),
                            ("replay_student", replay_student), ("replay_teacher", replay_teacher)):
            _matrix(value, name)
        if anchor.shape != positive.shape or anchor.shape != negative.shape:
            raise ValueError("Aligned anchor/positive/negative shapes required")
        if replay_student.shape != replay_teacher.shape or replay_student.shape[1] != anchor.shape[1]:
            raise ValueError("Aligned replay and shared embedding dimension required")
        if len({v.device for v in (anchor, positive, negative, replay_student, replay_teacher)}) != 1:
            raise ValueError("All embeddings must share a device")
        if weights is None:
            weights = anchor.new_ones(anchor.shape[0])
        if (weights.shape != (anchor.shape[0],) or weights.device != anchor.device
                or not torch.isfinite(weights).all() or torch.any(weights < 0) or weights.sum() <= 0):
            raise ValueError("Finite aligned nonnegative weights with positive total required")
        positive_cosine = F.cosine_similarity(anchor, positive).clamp(-1, 1)
        negative_cosine = F.cosine_similarity(anchor, negative).clamp(-1, 1)
        individual = F.relu(negative_cosine - positive_cosine + self.margin)
        ranking = (individual * weights).sum() / weights.sum()
        # Replay is a separate stream of unique train texts, not repeated triplet slots.
        retention = (1 - F.cosine_similarity(replay_student, replay_teacher.detach()).clamp(-1, 1)).mean()
        total = ranking + self.retention_weight * retention
        return {"loss": total, "ranking_loss": ranking, "retention_loss": retention,
                "active_fraction": (individual > 0).float().mean()}
