import importlib.util
import json
import os
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNNER_PATH = ROOT / "ops" / "agent-society" / "runner.py"
SPEC = importlib.util.spec_from_file_location("clareira_agent_society_runner", RUNNER_PATH)
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


def plan(domain="general", evidence=None, browser_check=""):
    return {
        "decision": "propose",
        "domain": domain,
        "title": "small game improvement",
        "baseline": "current behavior",
        "goal": "observable change",
        "acceptance_criteria": ["measurable behavior"],
        "allowed_paths": ["game/example.mjs"],
        "required_evidence": evidence or ["code"],
        "test_command": "npm test",
        "browser_check": browser_check,
        "performance_check": "",
        "blocked_reason": "",
    }


class AgentSocietyPolicyTests(unittest.TestCase):
    def test_plan_must_stay_inside_code_roots(self):
        value = plan()
        value["allowed_paths"] = ["infra/clareira-agent-society.service"]
        self.assertFalse(RUNNER.validate_plan(value)[0])

    def test_budget_and_launcher_files_are_protected(self):
        value = plan()
        value["allowed_paths"] = ["scripts/daily_budget.py"]
        self.assertFalse(RUNNER.validate_plan(value)[0])
        self.assertFalse(RUNNER.changed_paths_allowed(["scripts/daily_budget.py"], ["scripts/daily_budget.py"])[0])

    def test_visual_work_remains_blocked_without_game_dev_tooling(self):
        value = plan(evidence=["code", "visual"])
        self.assertFalse(RUNNER.validate_plan(value)[0])
        value["browser_check"] = "scripts/browser-avatar-frame-check.mjs"
        self.assertFalse(RUNNER.validate_plan(value)[0])

    def test_gameplay_work_requires_a_browser_comparison(self):
        value = plan(domain="gameplay_physics", evidence=["code", "gameplay"])
        self.assertFalse(RUNNER.validate_plan(value)[0])
        value["browser_check"] = "scripts/browser-world-check.mjs"
        self.assertTrue(RUNNER.validate_plan(value)[0])

    def test_performance_work_is_blocked_without_sealed_tooling(self):
        value = plan(domain="performance", evidence=["code", "performance"])
        self.assertFalse(RUNNER.validate_plan(value)[0])

    def test_shell_syntax_is_never_forwarded_to_test_runner(self):
        self.assertEqual(RUNNER.safe_test_argv("npm test"), ["npm", "test"])
        self.assertIsNone(RUNNER.safe_test_argv("npm test; touch /tmp/unsafe"))
        self.assertIsNone(RUNNER.safe_test_argv("node --test ../../outside.test.mjs"))
        self.assertEqual(
            RUNNER.safe_test_argv("python3 -m unittest discover -s scripts -p '*_test.py'"),
            ["python3", "-m", "unittest", "discover", "-s", "scripts", "-p", "*_test.py"],
        )

    def test_changed_paths_must_match_the_exact_task_scope(self):
        self.assertTrue(RUNNER.changed_paths_allowed(["game/example.mjs"], ["game/example.mjs"])[0])
        self.assertFalse(RUNNER.changed_paths_allowed(["game/example.test.mjs"], ["game/example.mjs"])[0])

    def test_image_comparison_uses_only_matching_before_after_files(self):
        import tempfile

        with tempfile.TemporaryDirectory() as directory:
            before = Path(directory) / "before"
            after = Path(directory) / "after"
            before.mkdir()
            after.mkdir()
            for target in (before / "desktop.png", after / "desktop.png", before / "old-only.png", after / "mobile.png"):
                target.write_bytes(b"png")
            selected = RUNNER.select_image_pairs(before, after)
            self.assertEqual([item.name for item in selected], ["desktop.png", "desktop.png"])

    def test_candidate_tree_can_be_reverted_without_a_branch_or_checkout(self):
        import subprocess
        import tempfile

        original_root = RUNNER.ROOT
        try:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory) / "repo"
                state = Path(directory) / "state"
                root.mkdir()
                for name in ("game", "scripts", "database"):
                    (root / name).mkdir()
                subprocess.run(["git", "init", "-b", "master", str(root)], check=True, capture_output=True)
                subprocess.run(["git", "-C", str(root), "config", "user.email", "test@example.invalid"], check=True)
                subprocess.run(["git", "-C", str(root), "config", "user.name", "Agent Society Test"], check=True)
                file_path = root / "game" / "example.mjs"
                file_path.write_text("before\n", encoding="utf-8")
                external_path = root / "game" / "external.mjs"
                external_path.write_text("before external\n", encoding="utf-8")
                subprocess.run(["git", "-C", str(root), "add", "game/example.mjs"], check=True)
                subprocess.run(["git", "-C", str(root), "add", "game/external.mjs"], check=True)
                subprocess.run(["git", "-C", str(root), "commit", "-m", "baseline"], check=True, capture_output=True)
                RUNNER.ROOT = root
                cycle = state / "cycle"
                cycle.mkdir(parents=True)
                baseline = RUNNER.snapshot_tree(cycle, "before")
                file_path.write_text("candidate\n", encoding="utf-8")
                external_path.write_text("concurrent edit\n", encoding="utf-8")
                (root / "game" / "new.mjs").write_text("new candidate\n", encoding="utf-8")
                candidate = RUNNER.snapshot_tree(cycle, "after")
                diff = RUNNER.tree_patch(baseline, candidate, cycle)
                self.assertEqual(set(diff["changed_paths"]), {"game/example.mjs", "game/external.mjs", "game/new.mjs"})
                result = RUNNER.rollback_tree(candidate, baseline, cycle, ["game/example.mjs", "game/new.mjs"])
                self.assertTrue(result["rolled_back"])
                self.assertEqual(file_path.read_text(encoding="utf-8"), "before\n")
                self.assertEqual(external_path.read_text(encoding="utf-8"), "concurrent edit\n")
                self.assertFalse((root / "game" / "new.mjs").exists())
                branches = subprocess.run(["git", "-C", str(root), "branch", "--format=%(refname:short)"], check=True, capture_output=True, text=True).stdout.splitlines()
                self.assertEqual(branches, ["master"])
        finally:
            RUNNER.ROOT = original_root

    def test_fake_codex_role_records_active_time_without_provider_access(self):
        import tempfile

        original_state = RUNNER.STATE
        original_codex = RUNNER.CODEX
        original_budget_directory = os.environ.get("AGENT_STATE_DIRECTORY")
        try:
            with tempfile.TemporaryDirectory() as directory:
                state = Path(directory) / "state"
                cycle = state / "cycles" / "fake-cycle"
                cycle.mkdir(parents=True)
                fake_codex = Path(directory) / "fake-codex"
                fake_codex.write_text(
                    "#!/usr/bin/env python3\n"
                    "import json, pathlib, sys\n"
                    "output = pathlib.Path(sys.argv[sys.argv.index('--output-last-message') + 1])\n"
                    "(output.parent / 'fake-codex-argv.json').write_text(json.dumps(sys.argv[1:]), encoding='utf-8')\n"
                    "output.write_text(json.dumps({'fake': True}), encoding='utf-8')\n",
                    encoding="utf-8",
                )
                fake_codex.chmod(0o755)
                RUNNER.STATE = state
                RUNNER.CODEX = str(fake_codex)
                os.environ["AGENT_STATE_DIRECTORY"] = str(state)
                result = RUNNER.invoke_role("planner", "test prompt", cycle, timeout_seconds=5)
                self.assertEqual(result["status"], "ok")
                self.assertTrue(result["response"]["fake"])
                argv = json.loads((cycle / "fake-codex-argv.json").read_text(encoding="utf-8"))
                self.assertIn('approval_policy="never"', argv)
                self.assertNotIn("--ask-for-approval", argv)
                self.assertGreaterEqual(RUNNER.BUDGET.status()["used_seconds"], 1)
        finally:
            RUNNER.STATE = original_state
            RUNNER.CODEX = original_codex
            if original_budget_directory is None:
                os.environ.pop("AGENT_STATE_DIRECTORY", None)
            else:
                os.environ["AGENT_STATE_DIRECTORY"] = original_budget_directory

    def test_existing_baseline_failures_do_not_mask_new_candidate_failures(self):
        import tempfile

        with tempfile.TemporaryDirectory() as directory:
            base_output = Path(directory) / "baseline.txt"
            same_output = Path(directory) / "same.txt"
            new_output = Path(directory) / "new.txt"
            baseline_text = "# Subtest: old mismatch\nnot ok 1 - old mismatch\n# tests 1\n# pass 0\n# fail 1\n"
            base_output.write_text(baseline_text, encoding="utf-8")
            same_output.write_text(baseline_text, encoding="utf-8")
            new_output.write_text(baseline_text + "# Subtest: new regression\nnot ok 2 - new regression\n# tests 2\n# pass 0\n# fail 2\n", encoding="utf-8")
            baseline = [{"name": "baseline-full-suite", "status": "failed", "stdout_path": str(base_output), "stderr_path": str(base_output)}]
            focused = [{"name": "candidate-targeted", "status": "passed"}]
            same = focused + [{"name": "candidate-full-suite", "status": "failed", "stdout_path": str(same_output), "stderr_path": str(same_output)}]
            regression = focused + [{"name": "candidate-full-suite", "status": "failed", "stdout_path": str(new_output), "stderr_path": str(new_output)}]
            self.assertTrue(RUNNER.test_regression_gate(baseline, same)["passed"])
            self.assertFalse(RUNNER.test_regression_gate(baseline, regression)["passed"])


if __name__ == "__main__":
    unittest.main()
