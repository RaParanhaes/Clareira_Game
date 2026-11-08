import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('cycle_result', Path(__file__).with_name('cycle_result.py'))
cycle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cycle)


class CycleResultTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        (self.root / 'logs').mkdir()
        (self.root / 'game').mkdir()
        (self.root / 'scripts').mkdir()
        (self.root / 'game/main.js').write_text('before')
        cycle.begin(self.root, 'test')

    def tearDown(self):
        self.directory.cleanup()

    def report(self, **changes):
        report = {'cycle_id': 'test', 'status': 'delivered', 'milestone': '1',
                  'feature': 'porta funcional', 'how_to_try': 'entre pela porta',
                  'checks': [{'name': 'room', 'passed': True, 'evidence': 'logs/check.txt'}],
                  'screenshots': ['logs/desktop.png', 'logs/mobile.png']}
        report.update(changes)
        (self.root / 'logs/check.txt').write_text('passed')
        for name in ('desktop.png', 'mobile.png'):
            (self.root / 'logs' / name).write_bytes(b'\x89PNG\r\n\x1a\nfixture')
        (self.root / 'logs/test.result.json').write_text(json.dumps(report))
        started=json.loads((self.root / 'logs/test.baseline.json').read_text())['started']
        # Set fixture time explicitly: filesystem timestamp granularity can precede time.time().
        for name in ('check.txt','desktop.png','mobile.png'):
            os.utime(self.root / 'logs' / name,(started+1,started+1))

    def outcome(self, exit_code=0):
        cycle.finish(self.root, 'test', exit_code)
        return json.loads((self.root / 'logs/latest-cycle.json').read_text())

    def test_no_report_does_not_count_as_delivery(self):
        (self.root / 'game/main.js').write_text('after')
        self.assertEqual(self.outcome()['status'], 'no_delivery')

    def test_docs_and_tests_only_do_not_count_as_game_delivery(self):
        self.report()
        (self.root / 'game/main.test.mjs').write_text('test')
        (self.root / 'STATUS.md').write_text('claims progress')
        self.assertEqual(self.outcome()['status'], 'no_delivery')

    def test_changed_game_and_current_evidence_is_only_reported_delivery(self):
        self.report()
        (self.root / 'game/main.js').write_text('after')
        self.assertEqual(self.outcome()['status'], 'reported_delivery')

    def test_failed_checks_and_reused_screenshots_are_partial(self):
        self.report(checks=[{'name': 'room', 'passed': False, 'evidence': 'logs/check.txt'}])
        (self.root / 'game/main.js').write_text('after')
        self.assertEqual(self.outcome()['status'], 'partial')

    def test_timeout_cannot_be_a_success_even_with_valid_report(self):
        self.report()
        (self.root / 'game/main.js').write_text('after')
        result = self.outcome(124)
        self.assertEqual(result['status'], 'interrupted')
        self.assertEqual(result['exit_code'], 124)

    def test_evidence_outside_logs_or_before_cycle_is_rejected(self):
        self.report(screenshots=['../outside.png', 'logs/mobile.png'])
        (self.root / 'game/main.js').write_text('after')
        self.assertEqual(self.outcome()['status'], 'partial')

    def test_old_screenshot_cannot_count_as_current_evidence(self):
        self.report()
        os.utime(self.root / 'logs/desktop.png',(0,0))
        (self.root / 'game/main.js').write_text('after')
        self.assertEqual(self.outcome()['status'],'partial')

    def test_simulation_clock_change_counts_as_game_runtime_change(self):
        self.report()
        (self.root / 'scripts/simulation-clock.mjs').write_text('clock implementation')
        self.assertEqual(self.outcome()['status'],'reported_delivery')

    def test_external_stop_is_separate_from_unproductive_completed_cycles(self):
        result = self.outcome(143)
        self.assertEqual(result['termination_reason'], 'external_signal')
        self.assertEqual(result['completed_cycles_without_reported_delivery'], 0)

    def test_timeout_counts_as_unfinished_work_not_manual_pause(self):
        result = self.outcome(124)
        self.assertEqual(result['termination_reason'], 'timeout')
        self.assertEqual(result['completed_cycles_without_reported_delivery'], 1)

    def test_store_module_change_counts_as_runtime_delivery(self):
        self.report()
        (self.root / 'scripts/appearance-store.mjs').write_text('store implementation')
        self.assertEqual(self.outcome()['status'], 'reported_delivery')

    def test_in_flight_old_baseline_does_not_claim_unchanged_stores(self):
        baseline_path = self.root / 'logs/test.baseline.json'
        baseline = json.loads(baseline_path.read_text())
        baseline.pop('hash_version')
        baseline['hashes'] = cycle.game_hashes(self.root, version=1)
        baseline_path.write_text(json.dumps(baseline))
        (self.root / 'scripts/appearance-store.mjs').write_text('existing store')
        self.report()
        self.assertEqual(self.outcome()['changed_game_files'], [])

    def test_blocked_requires_reason_and_attempt(self):
        self.report(status='blocked', reason='session unavailable', attempt='reproduce guest login')
        self.assertEqual(self.outcome()['status'], 'blocked')


if __name__ == '__main__':
    unittest.main()
