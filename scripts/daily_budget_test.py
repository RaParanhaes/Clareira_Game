import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path

SCRIPT = Path(__file__).with_name('daily_budget.py')


class DailyBudgetTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.environment = os.environ.copy()
        self.environment['AGENT_STATE_DIRECTORY'] = self.temp_dir.name
        self.environment['AGENT_TIMEZONE'] = 'UTC'
        # Fixtures must remain inside the ledger's 14-day retention window.
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        self.day_start = today - timedelta(days=2)
        self.day = self.day_start.date().isoformat()
        self.next_day = (self.day_start + timedelta(days=1)).date().isoformat()

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_budget(self, *arguments):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), *arguments],
            check=True, capture_output=True, text=True, env=self.environment,
        )
        return result.stdout.strip()

    def test_shared_daily_cap_is_enforced_and_usage_is_retained(self):
        day_start = int(self.day_start.timestamp())
        self.assertEqual(self.run_budget('remaining', '--day', self.day), str(8 * 60 * 60))
        self.run_budget('record', str(day_start), str(day_start + 7 * 60 * 60))
        self.assertEqual(self.run_budget('remaining', '--day', self.day), str(60 * 60))
        status = __import__('json').loads(self.run_budget('status'))
        self.assertEqual(status['limit_seconds'], 8 * 60 * 60)
        self.assertEqual(status['used_seconds'], 0)
        self.run_budget('record', str(day_start + 7 * 60 * 60), str(day_start + 25 * 60 * 60))
        self.assertEqual(self.run_budget('remaining', '--day', self.day), '0')
        self.assertEqual(self.run_budget('remaining', '--day', self.next_day), str(7 * 60 * 60))
        self.assertTrue(0 <= int(self.run_budget('until-reset')) <= 24 * 60 * 60)
        state = __import__('json').loads((Path(self.environment['AGENT_STATE_DIRECTORY']) / 'active-time.json').read_text())
        self.assertEqual(state['days'][self.day], 24 * 60 * 60)
        self.assertEqual(state['days'][self.next_day], 60 * 60)

    def test_splits_a_cycle_that_crosses_midnight(self):
        start = int((self.day_start + timedelta(hours=23, minutes=55)).timestamp())
        end = int((self.day_start + timedelta(days=1, minutes=5)).timestamp())
        self.run_budget('record', str(start), str(end))
        self.assertEqual(self.run_budget('remaining', '--day', self.day), str(8 * 60 * 60 - 5 * 60))
        self.assertEqual(self.run_budget('remaining', '--day', self.next_day), str(8 * 60 * 60 - 5 * 60))

    def test_rounds_partial_active_seconds_up_to_protect_the_cap(self):
        start = (self.day_start + timedelta(hours=12)).timestamp()
        self.run_budget('record', str(start), str(start + 0.01))
        self.assertEqual(self.run_budget('remaining', '--day', self.day), str(8 * 60 * 60 - 1))


if __name__ == '__main__':
    unittest.main()
