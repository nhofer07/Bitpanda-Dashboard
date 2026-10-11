#!/usr/bin/env python3
"""Allowlisted source distribution: never includes user data or dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
out = root / 'release' / 'Bitpanda-Dashboard.zip'
out.parent.mkdir(exist_ok=True)
files = [root / name for name in ['README.md', 'SYNOLOGY.md', 'Bitpanda Dashboard.command', 'Synology aktualisieren.command', 'Synology SSH vorbereiten.command', 'Dockerfile', 'docker-compose.yml', '.dockerignore', '.env.synology.example', '.gitignore', 'backend/server.js', 'backend/auth-sessions.js', 'backend/test/auth-sessions.test.js', 'backend/portfolio-history.js', 'backend/test/portfolio-history.test.js', 'backend/widget-data.js', 'backend/test/widget-data.test.js', 'backend/local-preview.js', 'backend/test/local-preview.test.js', 'backend/asset-search.js', 'backend/id-validation.js', 'backend/test/asset-search.test.js', 'backend/test/id-validation.test.js', 'backend/market-history.js', 'backend/test/market-history.test.js', 'backend/package.json', 'backend/package-lock.json', 'frontend/package.json', 'frontend/package-lock.json', 'frontend/index.html', 'frontend/vite.config.js', 'scripts/package-release.py']]
files += [p for p in (root / 'frontend/src').rglob('*') if p.suffix in {'.js', '.jsx', '.css', '.svg'}]
files += [p for p in (root / 'desktop-widget').rglob('*') if p.is_file() and 'build' not in p.relative_to(root / 'desktop-widget').parts and p.suffix in {'.py', '.jsx', '.md', '.command', '.swift', '.plist', '.pbxproj', '.xcscheme'}]
with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
    for file in files:
        if file.is_file(): archive.write(file, Path('Bitpanda-Dashboard') / file.relative_to(root))
print(out)
