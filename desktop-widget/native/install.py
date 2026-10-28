#!/usr/bin/env python3
"""Install the signed widget app and its per-user background data updater."""
from pathlib import Path
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent
if '--skip-build' not in sys.argv:
    subprocess.run([sys.executable, str(root / 'build.py')], check=True)
source = Path('/tmp/bitpanda-native-xcode/Build/Products/Debug/Bitpanda Widget.app')
target = Path.home() / 'Applications/Bitpanda Widget.app'
label = 'com.bitpanda.local.widget.refresh'
domain = f'gui/{os.getuid()}'
agent = Path.home() / 'Library/LaunchAgents' / f'{label}.plist'
subprocess.run(['launchctl', 'bootout', f'{domain}/{label}'], capture_output=True)
for name in ['BitpandaWidget', 'Bitpanda Widget']:
    subprocess.run(['pkill', '-TERM', '-x', name], capture_output=True)
if target.exists():
    backup = Path(tempfile.mkdtemp(prefix='bitpanda-widget-backup-')) / 'previous-app'
    shutil.move(str(target), str(backup))
target.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(['ditto', str(source), str(target)], check=True)
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(target)], check=True)
subprocess.run(['pluginkit', '-r', str(source / 'Contents/PlugIns/BitpandaWidget.appex')], capture_output=True)
subprocess.run(['/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', '-f', str(target)], check=True)
subprocess.run(['pluginkit', '-a', str(target / 'Contents/PlugIns/BitpandaWidget.appex')], check=True)

# Fetch through the existing agent app identity and permissions, without a window or Dock icon.
initial = subprocess.run([str(target / 'Contents/MacOS/Bitpanda Widget'), '--refresh-widgets'])
log = Path.home() / '.bitpanda-dashboard/desktop-widget/native-updater.log'
log.parent.mkdir(parents=True, exist_ok=True)
agent.parent.mkdir(parents=True, exist_ok=True)
agent.write_bytes(plistlib.dumps({
    'Label': label,
    'ProgramArguments': [str(target / 'Contents/MacOS/Bitpanda Widget'), '--refresh-widgets'],
    'RunAtLoad': True,
    'StartCalendarInterval': [{'Minute': minute} for minute in range(0, 60, 5)],
    'ProcessType': 'Background',
    'StandardOutPath': str(log),
    'StandardErrorPath': str(log),
}))
subprocess.run(['launchctl', 'bootstrap', domain, str(agent)], check=True)
print('Installed widget app and background updater.' + (' Connection verified.' if initial.returncode == 0 else ' Offline; the updater will retry automatically.'))
