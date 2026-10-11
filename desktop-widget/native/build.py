#!/usr/bin/env python3
"""Build the native app and extension through Xcode's signing workflow."""
from pathlib import Path
import os
import subprocess
root=Path(__file__).resolve().parent
env=dict(os.environ,DEVELOPER_DIR='/Applications/Xcode.app/Contents/Developer')
derived=Path('/tmp/bitpanda-native-xcode')
subprocess.run(['xcodebuild','-project',str(root/'BitpandaWidget.xcodeproj'),'-scheme','Bitpanda Widget','-configuration','Debug','-derivedDataPath',str(derived),'-allowProvisioningUpdates','build'],env=env,check=True)
app=derived/'Build/Products/Debug/Bitpanda Widget.app'
subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
print(app)
