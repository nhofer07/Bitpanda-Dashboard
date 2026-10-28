from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SynologyUpdaterTest(unittest.TestCase):
    def run_updater(self, actions='', fail_build=False):
        with tempfile.TemporaryDirectory(prefix='bitpanda-updater-test-') as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'scripts/package-release.py').touch()
            (root / 'docker-compose.yml').touch()
            launcher = root / 'Synology aktualisieren.command'
            launcher.write_text((ROOT / launcher.name).read_text())
            commands = root / 'bin'
            commands.mkdir()
            trace = root / 'calls.jsonl'
            def command(name, body):
                target = commands / name
                target.write_text(f'#!{sys.executable}\n' + body)
                target.chmod(0o700)
            command('python3', 'import os,sys\nsys.exit(0)\n')
            command('ditto', "from pathlib import Path\nimport sys\np=Path(sys.argv[-1])/'Bitpanda-Dashboard'\n(p/'synology-frontend').mkdir(parents=True)\n(p/'docker-compose.yml').touch()\n(p/'synology-frontend/index.html').touch()\n")
            command('tar', 'pass\n')
            command('expect', "import os,sys,json\nwith open(os.environ['UPDATE_TEST_TRACE'],'a') as f:f.write(json.dumps(sys.argv[1:])+chr(10))\nsys.exit(1 if os.environ.get('UPDATE_TEST_FAIL')=='1' and any('up -d' in arg for arg in sys.argv) else 0)\n")
            env = dict(os.environ, PATH=str(commands) + ':' + os.environ['PATH'], TERM_PROGRAM='', UPDATE_TEST_TRACE=str(trace), UPDATE_TEST_FAIL='1' if fail_build else '0')
            result = subprocess.run(['/bin/bash', str(launcher)], input='test-password\n' + actions + '\n', text=True, capture_output=True, env=env, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            calls = [json.loads(line) for line in trace.read_text().splitlines()]
            self.assertNotIn('test-password', result.stdout + result.stderr)
            return result.stdout, calls

    def test_default_only_backs_up_and_restarts_nico(self):
        output, calls = self.run_updater()
        remote = '\n'.join(' '.join(call) for call in calls)
        self.assertIn('bitpanda-dashboard-nico', remote)
        self.assertIn('data-nico.tar.gz', remote)
        self.assertNotIn('data-josi', remote)
        self.assertNotIn('bitpanda-dashboard-josi', remote)
        self.assertEqual(remote.count('up -d --build'), 1)
        self.assertIn('-f docker-compose.synology.yml', remote)
        self.assertIn('100%', output)
        for call in calls:
            if 'ssh' in call:
                subprocess.run(['/bin/sh', '-n', '-c', call[-1]], check=True)

    def test_j_selects_only_josi_then_r_returns_to_nico(self):
        _, calls = self.run_updater('J\nR\n')
        builds = [' '.join(call) for call in calls if any('up -d --build' in arg for arg in call)]
        self.assertEqual(len(builds), 3)
        self.assertIn("--env-file '.env'", builds[0])
        self.assertIn("--env-file '.env.josi'", builds[1])
        self.assertIn("-p 'bitpanda-josi'", builds[1])
        self.assertIn("--env-file '.env'", builds[2])

    def test_failed_build_does_not_report_success_or_continue_to_health_check(self):
        output, calls = self.run_updater(fail_build=True)
        self.assertIn('mit einem Fehler beendet', output)
        self.assertNotIn('erfolgreich abgeschlossen', output)
        self.assertIn('Fehler bei Schritt 14/15:', output)
        log_path = output.split('Vollständiges Protokoll: ', 1)[1].splitlines()[0]
        self.assertTrue(Path(log_path).is_file())
        Path(log_path).unlink()
        self.assertNotIn('{{.State.Status}}', '\n'.join(' '.join(call) for call in calls))


if __name__ == '__main__':
    unittest.main()
