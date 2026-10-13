#!/usr/bin/env python3
"""Allowlisted source distribution: never includes user data or dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import re
root = Path(__file__).resolve().parents[1]
out = root / 'release' / 'Bitpanda-Dashboard.zip'
out.parent.mkdir(exist_ok=True)
files = [root / name for name in ['README.md', 'SYNOLOGY.md', 'Bitpanda Dashboard.command', 'Synology aktualisieren.command', 'Synology SSH vorbereiten.command', 'Dockerfile', 'docker-compose.yml', '.dockerignore', '.env.synology.example', '.gitignore', 'backend/server.js', 'backend/auth-sessions.js', 'backend/test/auth-sessions.test.js', 'backend/portfolio-history.js', 'backend/test/portfolio-history.test.js', 'backend/widget-data.js', 'backend/test/widget-data.test.js', 'backend/local-preview.js', 'backend/test/local-preview.test.js', 'backend/asset-search.js', 'backend/id-validation.js', 'backend/test/asset-search.test.js', 'backend/test/id-validation.test.js', 'backend/market-history.js', 'backend/test/market-history.test.js', 'backend/package.json', 'backend/package-lock.json', 'frontend/package.json', 'frontend/package-lock.json', 'frontend/index.html', 'frontend/vite.config.js', 'scripts/package-release.py']]
files += [p for p in (root / 'frontend/src').rglob('*') if p.suffix in {'.js', '.jsx', '.css', '.svg', '.png'}]
files += [p for p in (root / 'frontend/test').rglob('*.test.js')]
files += [root / name for name in [
    'backend/fusion-orders.js', 'backend/test/fusion-orders.test.js',
    'backend/public-pagination.js', 'backend/test/public-pagination.test.js',
    'backend/paid-tax.js', 'backend/trade-amounts.js', 'backend/account-insights.js',
    'backend/test/account-insights.test.js',
    'backend/test/paid-tax.test.js', 'backend/test/trade-amounts.test.js',
    'scripts/test_package_release.py',
]]
files += [p for p in (root / 'desktop-widget').rglob('*') if p.is_file() and 'build' not in p.relative_to(root / 'desktop-widget').parts and p.suffix in {'.py', '.jsx', '.md', '.command', '.swift', '.plist', '.pbxproj', '.xcscheme'}]

def validate_backend_imports(source_files):
    """Fail before upload when an allowlisted JS file needs an omitted module."""
    included = {file.resolve() for file in source_files if file.is_file()}
    missing = []
    for file in source_files:
        if file.suffix != '.js' or root / 'backend' not in file.parents or not file.is_file():
            continue
        for relative in re.findall(r'''(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.[^"']+)["']''', file.read_text()):
            dependency = (file.parent / relative).resolve()
            if dependency not in included:
                missing.append(f'{file.relative_to(root)} → {relative}')
    if missing:
        raise ValueError('Benötigte Backend-Dateien fehlen im Release-Paket:\n' + '\n'.join(missing))

if __name__ == '__main__':
    validate_backend_imports(files)
    with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
        for file in files:
            if file.is_file(): archive.write(file, Path('Bitpanda-Dashboard') / file.relative_to(root))
    print(out)
