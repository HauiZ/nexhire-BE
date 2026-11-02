"""Synthetic boundary fixtures only; run with unittest discovery."""

from dataclasses import FrozenInstanceError
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.ranking.source_extractor import (  # noqa: E402
    extract_tools, extract_year_constraints, extract_education,
)


class SourceExtractorTests(unittest.TestCase):
    vocabulary = {"NetSuite": (), "C++": (), "SQL": (), "SQL Server": (),
                  "Python": (), "Vietnamese": ("Tiếng Việt",)}

    def tools(self, text, vocabulary=None):
        return extract_tools(text, "skills[0]", self.vocabulary if vocabulary is None else vocabulary)

    def assert_spans(self, text, result):
        for anchor in result.anchors:
            self.assertEqual(text[anchor.start:anchor.end], anchor.quote)
            self.assertEqual(anchor.field_path, "skills[0]")
            self.assertGreater(anchor.end, anchor.start)

    def test_longest_repeated_and_unicode_offsets(self):
        text = "😀 SQL Server; sql; SQL Server; Tiếng Việt; C++"
        result = self.tools(text)
        self.assertEqual([a.normalized for a in result.anchors],
                         ["SQL Server", "SQL", "SQL Server", "Vietnamese", "C++"])
        self.assert_spans(text, result)

    def test_wrong_tokens_and_combining_marks(self):
        result = self.tools("NetSuiteStrong xPython Python3 SQL_Server C++17 éSQL SQĹ")
        self.assertEqual(result.anchors, ())
        self.assertEqual(result.status, "no_explicit_constraint")
        self.assertEqual(result.reasons, ("no_observed_match",))

    def test_local_priority_and_heading(self):
        result = self.tools("Required: Python; SQL preferred. C++ required, NetSuite")
        self.assertEqual([a.priority for a in result.anchors],
                         ["unspecified", "preferred", "required", "unspecified"])
        result = self.tools("Python required but SQL preferred")
        self.assertEqual([a.priority for a in result.anchors], ["required", "preferred"])

    def test_ambiguous_negation_and_priority(self):
        for text in ("Python not required", "No Python experience", "Python required or preferred"):
            result = self.tools(text)
            self.assertEqual(result.status, "unknown")
            self.assertTrue(result.anchors[0].unknown_reason)
        self.assertEqual(self.tools("No Python experience").anchors[0].polarity, "unknown")

    def test_alias_collision_and_overlap(self):
        result = self.tools("abc abc", {"one": ["abc"], "two": ["abc"]})
        self.assertEqual(len(result.anchors), 2)
        self.assertTrue(all(a.unknown_reason == "ambiguous_alias" for a in result.anchors))
        self.assertEqual(len(self.tools("SQL Server", {"SQL Server": ["SQL Server", "SQL"]}).anchors), 1)

    def test_missing_is_not_no_match_or_inability(self):
        for function in (extract_tools, extract_year_constraints, extract_education):
            args = (self.vocabulary,) if function is extract_tools else ()
            self.assertEqual(function(None, "skills[0]", *args).reasons, ("missing_source",))
            self.assertEqual(function("  ", "skills[0]", *args).status, "unknown")
            result = function("Nothing asserted here", "skills[0]", *args)
            self.assertEqual(result.status, "no_explicit_constraint")
            self.assertNotIn("inability", result.reasons)

    def test_year_bounds(self):
        for text, low, high in (("at least 3 years of professional experience required", 3, None),
                                ("5+ years work experience preferred", 5, None),
                                ("2 to 4 years of total experience required", 2, 4)):
            result = extract_year_constraints(text, "skills[0]")
            self.assertEqual(result.status, "observed")
            self.assertEqual(result.anchors[0].normalized.minimum, low)
            self.assertEqual(result.anchors[0].normalized.maximum, high)
            self.assertEqual(result.anchors[0].scope, "total_professional_experience")
            self.assert_spans(text, result)

    def test_scoped_years_not_total(self):
        result = extract_year_constraints("3+ years of experience in Python required", "skills[0]")
        self.assertEqual(result.status, "observed")
        self.assertEqual(result.anchors[0].scope, "in Python required")
        text = "at least 3 years of experience required"
        result = extract_year_constraints(text, "skills[0]")
        self.assertEqual(result.status, "unknown")
        self.assertEqual(result.anchors[0].quote, text)
        self.assertIsNone(result.anchors[0].scope)

    def test_year_rejections(self):
        for text in ("3+ years contract", "contract duration at least 3 years", "2010 to 2020"):
            self.assertEqual(extract_year_constraints(text, "skills[0]").anchors, ())
        for text in ("5 years of experience", "experience in Python at least 3 years",
                     "4 to 2 years of professional experience", "contract with 3+ years of experience"):
            self.assertEqual(extract_year_constraints(text, "skills[0]").status, "unknown")
        self.assertEqual(extract_year_constraints("1.5+ years experience", "skills[0]").status, "unknown")

    def test_language_support_is_explicit(self):
        for function in (extract_year_constraints, extract_education):
            for text, language in (("3+ years professional experience", "vi"),
                                   ("Cần bachelor degree và 3+ years experience", "en")):
                result = function(text, "skills[0]", language=language)
                self.assertEqual(result.status, "unknown")
                self.assertEqual(result.reasons, ("unsupported_language",))
                self.assert_spans(text, result)
        self.assertEqual(self.tools("Biết Tiếng Việt").status, "observed")

    def test_education(self):
        for credential in ("bachelor", "master", "doctorate", "associate"):
            text = "Earned " + credential + " degree in Computer Science"
            result = extract_education(text, "skills[0]")
            self.assertEqual(result.status, "observed")
            self.assertTrue(result.anchors[0].normalized.completed)
            self.assertEqual(result.anchors[0].normalized.field, "Computer Science")
            self.assert_spans(text, result)
        result = extract_education("Bachelor's degree in CS required", "skills[0]")
        self.assertEqual(result.status, "observed")
        self.assertIsNone(result.anchors[0].normalized.completed)
        self.assertEqual(result.anchors[0].scope, "credential_requirement")

    def test_education_uncertainty(self):
        for text in ("Bachelor degree or equivalent required", "Pursuing master degree",
                     "Bachelor in related field required", "Master degree expected",
                     "Bachelor degree", "PhD required", "Bachelor or master required",
                     "No bachelor degree required"):
            self.assertEqual(extract_education(text, "skills[0]").status, "unknown", text)
        self.assertEqual(extract_education("Famous University", "skills[0]").anchors, ())

    def test_conservative_adversarial_attachment(self):
        for text in ("3+ years professional experience in Python required",
                     "3+ years professional experience as a developer"):
            result = extract_year_constraints(text, "skills[0]")
            self.assertNotEqual(result.anchors[0].scope, "total_professional_experience")
        result = extract_year_constraints("3+ years professional experience developing systems", "skills[0]")
        self.assertEqual(result.status, "unknown")
        self.assertEqual(self.tools("I don't know Python").status, "unknown")
        self.assertEqual(self.tools("C++ C#", {"C": ()}).anchors, ())
        self.assertEqual(extract_year_constraints("3 yrs experience", "skills[0]").status, "unknown")

    def test_coursework_and_future_award_are_not_completed(self):
        for text in ("Completed coursework for bachelor degree",
                     "Will be awarded bachelor degree next year"):
            with self.subTest(text=text):
                result = extract_education(text, "skills[0]")
                self.assertEqual(result.status, "unknown")
                self.assertIsNot(result.anchors[0].normalized.completed, True)
                self.assertNotEqual(result.anchors[0].scope, "completed_credential")
                self.assert_spans(text, result)

    def test_education_comma_alternative_is_retained(self):
        text = "Bachelor degree required, or equivalent experience"
        result = extract_education(text, "skills[0]")
        self.assertEqual(result.status, "unknown")
        self.assertEqual(result.anchors[0].quote, text)
        self.assert_spans(text, result)

    def test_social_title_and_combining_mark_are_not_credentials(self):
        for text in ("Earned associate status at the company", "Earned bacheloŕ degree"):
            with self.subTest(text=text):
                result = extract_education(text, "skills[0]")
                self.assertEqual(result.status, "unknown")
                self.assertTrue(all(a.normalized is None for a in result.anchors))
                self.assert_spans(text, result)

    def test_signed_and_grouped_years_do_not_parse_suffix(self):
        for text in ("-3+ years professional experience required",
                     "−3+ years professional experience required",
                     "1,000+ years professional experience required",
                     "at least -3 years professional experience required"):
            with self.subTest(text=text):
                result = extract_year_constraints(text, "skills[0]")
                self.assertEqual(result.status, "unknown")
                self.assertTrue(all(a.normalized is None for a in result.anchors))
                self.assertEqual(result.anchors[0].quote, text)
                self.assert_spans(text, result)

    def test_unnecessary_tool_is_not_plain_positive_mention(self):
        result = self.tools("Python is unnecessary")
        self.assertEqual(result.status, "unknown")
        self.assertEqual(result.anchors[0].polarity, "unknown")
        self.assertEqual(result.reasons, ("ambiguous_negation",))

    def test_extended_numeric_experience_grammar(self):
        for text, low, high in (("0 - 2 years' experience", 0, 2),
                                ("1-5 year’s experience", 1, 5),
                                ("3+ years experience", 3, None),
                                ("minimum of 10+ years experience", 10, None),
                                ("3 years experience", 3, None)):
            with self.subTest(text=text):
                result = extract_year_constraints(text, "skills[0]")
                self.assertEqual(result.status, "unknown")
                self.assertEqual(result.anchors[0].normalized.minimum, low)
                self.assertEqual(result.anchors[0].normalized.maximum, high)
                self.assertEqual(result.reasons, ("unresolved_experience_scope",))
                self.assertEqual(result.anchors[0].quote, text)
                self.assert_spans(text, result)

    def test_extended_explicit_scope_and_total(self):
        result = extract_year_constraints("5 years minimum nonprofit experience", "skills[0]")
        self.assertEqual(result.status, "observed")
        self.assertEqual(result.anchors[0].scope, "nonprofit")
        self.assertEqual(result.anchors[0].normalized.minimum, 5)
        for text in ("2-5 years professional experience required",
                     "3 years of total experience required"):
            self.assertEqual(extract_year_constraints(text, "skills[0]").anchors[0].scope,
                             "total_professional_experience")
        self.assertEqual(extract_year_constraints("3 years professional experience in sales", "skills[0]").anchors[0].scope,
                         "in sales")

    def test_unsupported_spelled_and_inverted_grammar(self):
        for text in ("Min two years experience", "fluid power systems: 3 years (Required)",
                     "sales: 3 years (Preferred)"):
            result = extract_year_constraints(text, "skills[0]")
            self.assertEqual(result.status, "unknown")
            self.assertTrue(all(a.normalized is None for a in result.anchors))

    def test_extended_year_numeric_and_contract_adversaries(self):
        for number in ("1.5", "1,000", "-3", "−3", "+3", "-3-5", "1.5-3", "2-3.5"):
            text = number + " years professional experience required"
            result = extract_year_constraints(text, "skills[0]")
            self.assertEqual(result.status, "unknown", text)
            self.assertTrue(all(a.normalized is None for a in result.anchors), text)
        for text in ("contract duration: 2-5 years", "contract 2020-2023",
                     "3 years warranty", "3 years building scheduled"):
            self.assertEqual(extract_year_constraints(text, "skills[0]").anchors, ())
        self.assertEqual(extract_year_constraints("contract requires 3 years professional experience", "skills[0]").status, "unknown")

    def test_frozen_records_and_determinism(self):
        result = self.tools("Python preferred")
        self.assertEqual(result, self.tools("Python preferred"))
        with self.assertRaises(FrozenInstanceError):
            result.anchors[0].start = 99


if __name__ == "__main__":
    unittest.main()
