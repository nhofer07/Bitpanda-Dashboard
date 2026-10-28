#!/usr/bin/env python3
"""Allowlisted source distribution: never includes user data or dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import re
import argparse
import subprocess
root = Path(__file__).resolve().parents[1]
out = root / 'release' / 'Bitpanda-Dashboard.zip'
out.parent.mkdir(exist_ok=True)
files = [root / name for name in ['README.md', 'SYNOLOGY.md', 'Bitpanda Dashboard.command', 'Synology aktualisieren.command', 'Synology SSH vorbereiten.command', 'Dockerfile', 'Dockerfile.synology', 'docker-compose.yml', 'docker-compose.synology.yml', '.dockerignore', '.env.synology.example', '.gitignore', 'backend/server.js', 'backend/auth-sessions.js', 'backend/test/auth-sessions.test.js', 'backend/portfolio-history.js', 'backend/test/portfolio-history.test.js', 'backend/widget-data.js', 'backend/test/widget-data.test.js', 'backend/local-preview.js', 'backend/test/local-preview.test.js', 'backend/asset-search.js', 'backend/id-validation.js', 'backend/test/asset-search.test.js', 'backend/test/id-validation.test.js', 'backend/market-history.js', 'backend/test/market-history.test.js', 'backend/package.json', 'backend/package-lock.json', 'frontend/package.json', 'frontend/package-lock.json', 'frontend/index.html', 'frontend/vite.config.js', 'scripts/package-release.py']]
files += [p for p in (root / 'frontend/src').rglob('*') if p.suffix in {'.js', '.jsx', '.css', '.svg', '.png'}]
files += [root / 'frontend/playwright.config.js']
files += [p for p in (root / 'frontend/e2e').rglob('*.js')]
files += [p for p in (root / 'frontend/public').rglob('*') if p.is_file()]
files += [p for p in (root / 'frontend/test').rglob('*.test.js')]
files += [root / name for name in [
    'backend/cashflow-classification.js', 'backend/chart-cashflows.js', 'backend/portfolio-history-cashflows.js',
    'backend/reconcile-portfolio-history.js', 'backend/portfolio-chart-points.js',
    'backend/portfolio-api-history.js', 'backend/test/portfolio-api-history.test.js',
    'backend/portfolio-chart-guard.js', 'backend/test/portfolio-chart-guard.test.js',
    'backend/leverage-fees.js', 'backend/test/leverage-fees.test.js',
    'backend/bitpanda-chart.js', 'backend/test/bitpanda-chart.test.js',
    'backend/asset-identity.js', 'backend/test/asset-identity.test.js',
    'backend/reported-portfolio.js', 'backend/test/reported-portfolio.test.js',
    'backend/json-storage.js', 'backend/test/json-storage.test.js',
    'backend/cashflow-store.js', 'backend/test/cashflow-store.test.js',
    'backend/fusion-orders.js', 'backend/test/fusion-orders.test.js',
    'backend/public-pagination.js', 'backend/test/public-pagination.test.js',
    'backend/paid-tax.js', 'backend/trade-amounts.js', 'backend/account-insights.js',
    'backend/test/account-insights.test.js',
    'backend/test/paid-tax.test.js', 'backend/test/trade-amounts.test.js',
    'scripts/test_package_release.py', 'scripts/test_synology_updater.py',
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

def prepare_synology_frontend():
    # Browser assets are architecture-independent. Build them on the Mac; keep
    # native Node dependencies inside the target NAS image.
    if not (root / 'frontend/node_modules/.bin/vite').is_file():
        subprocess.run(['npm', 'ci', '--no-audit', '--no-fund'], cwd=root / 'frontend', check=True)
    subprocess.run(['npm', 'run', 'build'], cwd=root / 'frontend', check=True)
    if not (root / 'backend/node_modules/express/package.json').is_file():
        subprocess.run(['npm', 'ci', '--no-audit', '--no-fund'], cwd=root / 'backend', check=True)
    tests = sorted((root / 'backend/test').glob('*.test.js')) + sorted((root / 'frontend/test').glob('*.test.js'))
    subprocess.run(['node', '--test', *map(str, tests)], cwd=root, check=True)
    output = root / 'frontend/dist'
    if not (output / 'index.html').is_file():
        raise ValueError('Frontend-Build enthält keine index.html.')
    return [(file, Path('Bitpanda-Dashboard/synology-frontend') / file.relative_to(output)) for file in output.rglob('*') if file.is_file()]


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--synology', action='store_true', help='Frontend und Tests lokal ausführen; fertige Browser-Dateien mitliefern.')
    args = parser.parse_args()
    validate_backend_imports(files)
    prebuilt = prepare_synology_frontend() if args.synology else []
    with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
        for file in files:
            if file.is_file(): archive.write(file, Path('Bitpanda-Dashboard') / file.relative_to(root))
        for file, target in prebuilt:
            archive.write(file, target)
    print(out)
