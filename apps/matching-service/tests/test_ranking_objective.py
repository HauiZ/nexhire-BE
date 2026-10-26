import math
import unittest

import torch
from sentence_transformers.losses import TripletLoss, TripletDistanceMetric

from ml.ranking_objective import RankingRetentionLoss


class Identity(torch.nn.Module):
    def forward(self, feature):
        return feature


class RankingObjectiveTests(unittest.TestCase):
    def vectors(self):
        return (torch.tensor([[1., 0.]], requires_grad=True),
                torch.tensor([[.8, .6]], requires_grad=True),
                torch.tensor([[.9, math.sqrt(.19)]], requires_grad=True),
                torch.tensor([[0., 1.]], requires_grad=True),
                torch.tensor([[1., 0.]], requires_grad=True))

    def test_matches_official_cosine_triplet_not_euclidean_default(self):
        a, p, n, s, t = self.vectors()
        actual = RankingRetentionLoss(.1, 0)(a, p, n, s, t)
        official = TripletLoss(Identity(), distance_metric=TripletDistanceMetric.COSINE, triplet_margin=.1)(
            [{"sentence_embedding": v} for v in (a, p, n)], torch.empty(0))
        self.assertAlmostEqual(float(actual["loss"].detach()), float(official.detach()), places=6)
        self.assertAlmostEqual(float(actual["ranking_loss"].detach()), .2, places=6)

    def test_retention_weight_and_teacher_detachment(self):
        a, p, n, s, t = self.vectors()
        result = RankingRetentionLoss(.1, 2)(a, p, n, s, t)
        self.assertAlmostEqual(float(result["loss"].detach()), 2.2, places=6)
        result["loss"].backward()
        self.assertIsNone(t.grad)
        for v in (a, p, n, s):
            self.assertTrue(torch.isfinite(v.grad).all())
            self.assertGreater(float(v.grad.abs().sum()), 0)

    def test_identical_teacher_zero_retention(self):
        a, p, n, s, t = self.vectors()
        result = RankingRetentionLoss()(a, p, n, t, t)
        self.assertAlmostEqual(float(result["retention_loss"].detach()), 0, places=6)

    def test_bilingual_half_weight_preserves_loss_and_gradient(self):
        a, p, n, s, t = self.vectors()
        one = RankingRetentionLoss(.1, 0)(a, p, n, s, t)["loss"]
        one.backward()
        gradient = a.grad.clone()
        a2, p2, n2, s2, t2 = self.vectors()
        doubled = RankingRetentionLoss(.1, 0)(a2.repeat(2, 1), p2.repeat(2, 1), n2.repeat(2, 1),
            s2, t2, torch.tensor([.5, .5]))["loss"]
        doubled.backward()
        self.assertAlmostEqual(float(one.detach()), float(doubled.detach()), places=6)
        self.assertTrue(torch.allclose(gradient, a2.grad, atol=1e-6))

    def test_rejects_bad_weights_and_embeddings(self):
        values = self.vectors()
        for weights in (torch.tensor([0.]), torch.tensor([-1.]), torch.tensor([float("nan")]), torch.ones(2)):
            with self.assertRaises(ValueError):
                RankingRetentionLoss()(*values, weights=weights)
        for bad in (torch.zeros(1, 2), torch.tensor([[float("nan"), 1.]])):
            with self.assertRaises(ValueError):
                RankingRetentionLoss()(bad, *values[1:])

    def test_rejects_shape_or_config_errors(self):
        a, p, n, s, t = self.vectors()
        with self.assertRaises(ValueError):
            RankingRetentionLoss()(a, p.repeat(2, 1), n, s, t)
        for margin, retention in ((0, 1), (.1, -1), (True, 1), (.1, float("inf"))):
            with self.assertRaises(ValueError):
                RankingRetentionLoss(margin, retention)

    def test_no_pressure_to_make_positive_cosine_one_when_margin_met(self):
        a, _, _, s, t = self.vectors()
        p = torch.tensor([[.7, math.sqrt(.51)]], requires_grad=True)
        n = torch.tensor([[.2, math.sqrt(.96)]], requires_grad=True)
        result = RankingRetentionLoss(.1, 0)(a, p, n, s, t)
        self.assertEqual(float(result["ranking_loss"].detach()), 0)
