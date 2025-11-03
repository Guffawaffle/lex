#!/usr/bin/env python3
"""
LexMap Python Scanner Plugin

Scans Python files and extracts architectural facts.

Contract: Outputs JSON conforming to ../docs/schemas/scanner-output.schema.json

Usage:
    python3 python_scanner.py <directory> [policy.json] > output.json

Philosophy:
    This scanner is DUMB BY DESIGN.
    It observes code and reports facts.
    It does NOT make architectural decisions.

    - Extracts: classes, functions, imports
    - Detects: feature flags, permission checks
    - Reports: what it sees, nothing more

    LexMap (not the scanner) decides:
    - Which module a file belongs to
    - Whether an import is allowed
    - Whether a boundary is violated

Output Schema:
    {
      "language": "python",
      "files": [
        {
          "path": "relative/path/to/file.py",
          "module_scope": "services/auth-core",
          "declarations": [...],
          "imports": [...],
          "feature_flags": [...],
          "permissions": [...],
          "warnings": []
        }
      ],
      "module_edges": [
        {
          "from_module": "ui/admin",
          "to_module": "services/auth",
          "from_file": "ui/admin/view.py",
          "import_statement": "services.auth"
        }
      ]
    }

Dependencies:
    Python 3.7+ standard library (ast module)

Author: LexMap Scanner Plugin
License: MIT
"""

import sys
import json
import os
import ast
import re
from typing import List, Dict, Any, Optional
from pathlib import Path
from fnmatch import fnmatch


class PythonScanner:
    """Scans Python files for architectural facts."""

    def __init__(self, root_dir: str, policy_path: Optional[str] = None):
        self.root_dir = Path(root_dir).resolve()
        self.output = {
            "language": "python",
            "files": [],
            "module_edges": []
        }
        self.policy = None

        # Load policy file if provided
        if policy_path and os.path.exists(policy_path):
            try:
                with open(policy_path, 'r') as f:
                    self.policy = json.load(f)
            except Exception as e:
                print(f"Warning: Failed to load policy file: {e}", file=sys.stderr)

    def scan(self) -> Dict[str, Any]:
        """Scan all Python files in directory tree."""
        py_files = self.root_dir.rglob("*.py")

        for py_file in py_files:
            # Skip __pycache__ and venv directories
            if '__pycache__' in py_file.parts or 'venv' in py_file.parts:
                continue

            file_data = self.scan_file(py_file)
            if file_data:
                self.output["files"].append(file_data)

        return self.output

    def scan_file(self, filepath: Path) -> Dict[str, Any]:
        """
        Extract facts from a single Python file.

        Returns file data conforming to scanner-output.schema.json
        """
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            return None

        relative_path = str(filepath.relative_to(self.root_dir))

        # Parse the Python AST
        try:
            tree = ast.parse(content, filename=str(filepath))
        except SyntaxError:
            # Skip files with syntax errors
            return None

        imports = self.extract_imports(tree)
        file_data = {
            "path": relative_path,
            "declarations": self.extract_declarations(tree),
            "imports": imports,
            "feature_flags": self.extract_feature_flags(content),
            "permissions": self.extract_permissions(content),
            "warnings": []
        }

        # Resolve module ownership if policy is available
        if self.policy:
            module_id = self.resolve_file_to_module(relative_path)
            if module_id:
                file_data["module_scope"] = module_id

                # Detect cross-module imports
                for imp in imports:
                    target_module_id = self.resolve_import_to_module(
                        imp.get("from"), relative_path
                    )
                    if target_module_id and target_module_id != module_id:
                        self.output["module_edges"].append({
                            "from_module": module_id,
                            "to_module": target_module_id,
                            "from_file": relative_path,
                            "import_statement": imp.get("from")
                        })

        return file_data

    def extract_declarations(self, tree: ast.AST) -> List[Dict[str, str]]:
        """
        Extract class and function declarations using AST.
        """
        declarations = []

        for node in ast.walk(tree):
            # Extract classes
            if isinstance(node, ast.ClassDef):
                declarations.append({
                    "type": "class",
                    "name": node.name
                })

            # Extract top-level functions
            if isinstance(node, ast.FunctionDef):
                # Check if it's a top-level function (not a method)
                # This is a simplification - real implementation would track scope
                declarations.append({
                    "type": "function",
                    "name": node.name
                })

        return declarations

    def extract_imports(self, tree: ast.AST) -> List[Dict[str, Any]]:
        """
        Extract import statements using AST.
        """
        imports = []

        for node in ast.walk(tree):
            # import module
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append({
                        "from": alias.name,
                        "type": "import",
                        "alias": alias.asname if alias.asname else None
                    })

            # from module import name
            if isinstance(node, ast.ImportFrom):
                if node.module:  # Handle 'from . import' case
                    imported = [alias.name for alias in node.names]
                    imports.append({
                        "from": node.module,
                        "type": "from_import",
                        "imported": imported
                    })

        return imports

    def extract_feature_flags(self, content: str) -> List[str]:
        """
        Detect feature flag references.

        Looks for patterns like:
        - feature_flags.is_enabled('flag_name')
        - FeatureFlags.enabled('flag_name')
        - settings.FEATURES['flag_name']
        """
        flags = set()

        # Pattern: feature_flags.is_enabled('flag_name')
        pattern1 = re.finditer(r'feature_flags\.is_enabled\([\'"](\w+)[\'"]\)', content)
        for match in pattern1:
            flags.add(match.group(1))

        # Pattern: FeatureFlags.enabled('flag_name')
        pattern2 = re.finditer(r'FeatureFlags\.enabled\([\'"](\w+)[\'"]\)', content)
        for match in pattern2:
            flags.add(match.group(1))

        # Pattern: settings.FEATURES['flag_name']
        pattern3 = re.finditer(r'settings\.FEATURES\[[\'"](\w+)[\'"]\]', content)
        for match in pattern3:
            flags.add(match.group(1))

        return sorted(list(flags))

    def extract_permissions(self, content: str) -> List[str]:
        """
        Detect permission checks.

        Looks for patterns like:
        - user.has_perm('permission_name')
        - check_permission('permission_name')
        - @permission_required('permission_name')
        """
        permissions = set()

        # Pattern: user.has_perm('permission_name')
        pattern1 = re.finditer(r'\.has_perm\([\'"](\w+)[\'"]\)', content)
        for match in pattern1:
            permissions.add(match.group(1))

        # Pattern: check_permission('permission_name')
        pattern2 = re.finditer(r'check_permission\([\'"](\w+)[\'"]\)', content)
        for match in pattern2:
            permissions.add(match.group(1))

        # Pattern: @permission_required('permission_name')
        pattern3 = re.finditer(r'@permission_required\([\'"](\w+)[\'"]\)', content)
        for match in pattern3:
            permissions.add(match.group(1))

        return sorted(list(permissions))

    def resolve_file_to_module(self, file_path: str) -> Optional[str]:
        """
        Find which module owns a given file path based on policy owns_paths.
        """
        if not self.policy or "modules" not in self.policy:
            return None

        # Normalize path to use forward slashes
        normalized_path = file_path.replace('\\', '/')

        for module_id, module_config in self.policy["modules"].items():
            owns_paths = module_config.get("owns_paths", [])
            for pattern in owns_paths:
                # Normalize pattern
                normalized_pattern = pattern.replace('\\', '/')
                # Convert glob pattern to fnmatch compatible
                if fnmatch(normalized_path, normalized_pattern):
                    return module_id

        return None

    def resolve_import_to_module(self, import_path: str, current_file: str) -> Optional[str]:
        """
        Resolve an import statement to a module ID.

        This is a simplified heuristic for Python imports.
        """
        if not import_path or not self.policy:
            return None

        # Convert dotted import to path (e.g., 'services.auth' -> 'services/auth')
        import_as_path = import_path.replace('.', '/')

        # Try to match against module owns_paths
        for module_id, module_config in self.policy["modules"].items():
            owns_paths = module_config.get("owns_paths", [])
            for pattern in owns_paths:
                # Remove wildcards for prefix matching
                path_prefix = pattern.replace('/**', '').replace('/*', '')
                if import_as_path.startswith(path_prefix):
                    return module_id

        return None


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python3 python_scanner.py <directory> [policy.json]", file=sys.stderr)
        print("", file=sys.stderr)
        print("Outputs JSON conforming to ../docs/schemas/scanner-output.schema.json", file=sys.stderr)
        print("", file=sys.stderr)
        print("Options:", file=sys.stderr)
        print("  policy.json  Optional path to lexmap.policy.json for module resolution", file=sys.stderr)
        sys.exit(1)

    directory = sys.argv[1]
    policy_path = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.isdir(directory):
        print(f"Error: {directory} is not a directory", file=sys.stderr)
        sys.exit(1)

    scanner = PythonScanner(directory, policy_path)
    output = scanner.scan()

    # Output JSON to stdout
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
