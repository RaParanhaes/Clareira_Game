"""Exercise the launcher boundary without provider calls or system services."""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


class WakeTests(unittest.TestCase):
    def test_launcher_delegates_to_the_society_runner_without_local_deadline(self):
        source = Path(__file__).resolve().parent.parent
        launcher = (source / 'scripts/wake.sh').read_text()
        self.assertNotIn('DAILY_LIMIT_SECONDS', launcher)
        self.assertNotIn('timeout --signal', launcher)
        self.assertNotIn('CLAREIRA_CYCLE_DEADLINE_UTC', launcher)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runner = root / 'ops/agent-society/runner.py'
            runner.parent.mkdir(parents=True)
            runner.write_text('''import json, os, sys
from pathlib import Path
Path(os.environ["GAME_AGENT_ROOT"], "runner-invocation.json").write_text(json.dumps({
    "argv": sys.argv[1:],
    "cwd": str(Path.cwd()),
    "cycle_seconds": os.environ.get("CLAREIRA_CYCLE_SECONDS"),
    "cycle_deadline": os.environ.get("CLAREIRA_CYCLE_DEADLINE_UTC"),
}), encoding="utf-8")
''', encoding='utf-8')

            environment = {**os.environ, 'GAME_AGENT_ROOT': str(root)}
            environment.pop('CLAREIRA_CYCLE_SECONDS', None)
            environment.pop('CLAREIRA_CYCLE_DEADLINE_UTC', None)
            inherited_cwd = str(Path.cwd())
            result = subprocess.run(['bash', str(source / 'scripts/wake.sh')], env=environment,
                                    capture_output=True, text=True, timeout=20)

            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            invocation = json.loads((root / 'runner-invocation.json').read_text())
            self.assertEqual(invocation['argv'], ['once'])
            self.assertEqual(invocation['cwd'], inherited_cwd)
            self.assertIsNone(invocation['cycle_seconds'])
            self.assertIsNone(invocation['cycle_deadline'])


if __name__ == '__main__':
    unittest.main()
