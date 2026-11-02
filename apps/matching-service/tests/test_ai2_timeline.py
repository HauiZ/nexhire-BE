import copy
import unittest

from ml.ai2.timeline import summarize_timeline


def record(sy=2020, sm=1, ey=2021, em=1, current=False):
    return dict(startYear=sy, startMonth=sm, endYear=ey, endMonth=em, isCurrent=current)


class TimelineTests(unittest.TestCase):
    def test_exact_completed_months_not_inclusive(self):
        self.assertEqual(summarize_timeline([record()], "2026-10-18").known_months, 12)
        self.assertEqual(summarize_timeline([record(2020, 1, 2020, 1)], "2026-10-18").known_months, 0)

    def test_current_reference_month_and_reproducibility(self):
        rows = [record(2026, 1, None, None, True)]
        before = copy.deepcopy(rows)
        self.assertEqual(summarize_timeline(rows, "2026-10-18").known_months, 9)
        self.assertEqual(summarize_timeline(rows, "2026-10-01").known_months, 9)
        self.assertEqual(rows, before)

    def test_overlap_union(self):
        rows = [record(2020, 1, 2021, 1), record(2020, 6, 2021, 6), record(2021, 6, 2022, 1)]
        result = summarize_timeline(rows, "2026-10-18")
        self.assertEqual(result.known_months, 24)
        self.assertTrue(result.complete)
        self.assertEqual(result.valid_record_count, 3)

    def test_known_subset_not_marked_complete(self):
        result = summarize_timeline([record(), record(sm=None)], "2026-10-18")
        self.assertEqual(result.known_months, 12)
        self.assertFalse(result.complete)
        self.assertEqual(result.issues, ((1, "missing_start_date"),))

    def test_empty_and_all_unknown_not_zero(self):
        for rows in ([], [record(sm=None)], [record(ey=None, em=None, current=None)]):
            with self.subTest(rows=rows):
                result = summarize_timeline(rows, "2026-10-18")
                self.assertIsNone(result.known_months)
                self.assertFalse(result.complete)

    def test_invalid_dates_and_status(self):
        cases = [(record(sm=13), "invalid_start_date"),
                 (record(sy=True), "invalid_start_date"),
                 (record(current=1), "invalid_current_status"),
                 (record(2021, 1, 2020, 1), "reversed_interval"),
                 (record(2027, 1, 2027, 2), "future_interval"),
                 (record(2020, 1, 2027, 1), "future_interval"),
                 (record(current=True), "conflicting_current_end_date")]
        for row, reason in cases:
            with self.subTest(row=row):
                result = summarize_timeline([row], "2026-10-18")
                self.assertIsNone(result.known_months)
                self.assertEqual(result.issues, ((0, reason),))

    def test_invalid_contract(self):
        for value in ("2026-02-30", "20261018", None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                summarize_timeline([], value)
        with self.assertRaises(ValueError):
            summarize_timeline({}, "2026-10-18")
        with self.assertRaises(ValueError):
            summarize_timeline(["invalid"], "2026-10-18")


if __name__ == "__main__":
    unittest.main()
