import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('package_release', Path(__file__).with_name('package-release.py'))
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class PackageReleaseTest(unittest.TestCase):
    def test_current_release_contains_all_backend_dependencies(self):
        package.validate_backend_imports(package.files)

    def test_omitted_tax_modules_fail_before_archive_creation(self):
        files = [file for file in package.files if file.name not in {'paid-tax.js', 'trade-amounts.js'}]
        with self.assertRaisesRegex(ValueError, 'paid-tax.js'):
            package.validate_backend_imports(files)

    def test_transitive_and_dynamic_relative_imports_are_checked(self):
        original_root = package.root
        with tempfile.TemporaryDirectory() as directory:
            try:
                package.root = Path(directory)
                backend = package.root / 'backend'
                backend.mkdir()
                server = backend / 'server.js'
                helper = backend / 'helper.js'
                server.write_text("import { helper } from './helper.js'; import fs from 'node:fs';")
                helper.write_text("const module = await import('./missing.js');")
                with self.assertRaisesRegex(ValueError, 'missing.js'):
                    package.validate_backend_imports([server, helper])
                missing = backend / 'missing.js'
                missing.write_text('export default 0;')
                package.validate_backend_imports([server, helper, missing])
            finally:
                package.root = original_root


if __name__ == '__main__':
    unittest.main()
