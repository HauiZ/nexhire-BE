"""Architecture guard for the production/experimental import boundary."""

import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ModuleLayoutTests(unittest.TestCase):
    def test_production_and_train_modules_do_not_import_experiments(self):
        paths = list((ROOT / "app").rglob("*.py")) + list((ROOT / "ml").glob("*.py"))
        for path in paths:
            if path.is_relative_to(ROOT / "app/experimental"):
                continue
            with self.subTest(path=str(path.relative_to(ROOT))):
                tree = ast.parse(path.read_text(encoding="utf-8-sig"))
                for node in ast.walk(tree):
                    if isinstance(node, ast.Import):
                        self.assertFalse(any(a.name.startswith("app.experimental") for a in node.names))
                    elif isinstance(node, ast.ImportFrom):
                        module = node.module or ""
                        self.assertFalse(module.startswith("app.experimental"))
                        if module == "app":
                            self.assertFalse(any(a.name == "experimental" for a in node.names))

    def test_experimental_implementations_have_only_one_location(self):
        names = ("shadow_runtime", "shadow_requirement_matcher", "shadow_capabilities",
                 "shadow_conditions", "shadow_pipeline", "evidence_analysis", "automatic_evidence_analysis")
        for name in names:
            self.assertTrue((ROOT / "app/experimental" / (name + ".py")).is_file())
            self.assertFalse((ROOT / "app/matching" / (name + ".py")).exists())
        self.assertTrue((ROOT / "app/experimental/shadow_main.py").is_file())
        self.assertFalse((ROOT / "app/shadow_main.py").exists())
