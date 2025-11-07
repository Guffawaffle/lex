#!/usr/bin/env python3
"""
LexMap PHP Scanner Plugin

Scans PHP files and extracts architectural facts.

Contract: Outputs JSON conforming to ../docs/schemas/scanner-output.schema.json

Usage:
    python3 php_scanner.py <directory> [policy.json] > output.json

Philosophy:
    This scanner is DUMB BY DESIGN.
    It observes code and reports facts.
    It does NOT make architectural decisions.

    - Extracts: classes, functions, use statements
    - Detects: feature flags, permission checks
    - Reports: what it sees, nothing more

    LexMap (not the scanner) decides:
    - Which module a file belongs to
    - Whether an import is allowed
    - Whether a boundary is violated

Output Schema:
    {
      "language": "php",
      "files": [
        {
          "path": "relative/path/to/File.php",
          "module_scope": "services/auth-core",
          "declarations": [...],
          "imports": [...],
          "feature_flags": [...],
          "permissions": [...],
          "warnings": []
        }
      ],
      "module_edges": [...]
    }

Dependencies:
    pip install php-parser-python
    (or use nikic/php-parser via PHP CLI wrapper)

Author: LexMap Scanner Plugin
License: MIT
"""

import sys
import json
import os
import re
from typing import List, Dict, Any, Optional
from pathlib import Path
from fnmatch import fnmatch


class PHPScanner:
    """Scans PHP files for architectural facts."""

    def __init__(self, root_dir: str, policy_path: Optional[str] = None):
        self.root_dir = Path(root_dir).resolve()
        self.output = {
            "language": "php",
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
        """Scan all PHP files in directory tree."""
        php_files = self.root_dir.rglob("*.php")

        for php_file in php_files:
            file_data = self.scan_file(php_file)
            if file_data:
                self.output["files"].append(file_data)

        return self.output

    def scan_file(self, filepath: Path) -> Dict[str, Any]:
        """
        Extract facts from a single PHP file.

        Returns file data conforming to scanner-output.schema.json
        """
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            return None

        relative_path = str(filepath.relative_to(self.root_dir))

        imports = self.extract_imports(content)
        file_data = {
            "path": relative_path,
            "declarations": self.extract_declarations(content),
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

                # Detect cross-module imports via use statements
                for imp in imports:
                    # For PHP, we can check namespace relationships
                    target_module_id = self.resolve_namespace_to_module(
                        imp.get("from")
                    )
                    if target_module_id and target_module_id != module_id:
                        self.output["module_edges"].append({
                            "from_module": module_id,
                            "to_module": target_module_id,
                            "from_file": relative_path,
                            "import_statement": imp.get("from")
                        })

        return file_data

    def extract_declarations(self, content: str) -> List[Dict[str, str]]:
        """
        Extract class/interface/trait/function declarations.

        NOTE: This is a REGEX-BASED STUB.
        Real implementation should use nikic/php-parser.
        """
        declarations = []

        # Extract namespace
        namespace_match = re.search(r'namespace\s+([\w\\]+);', content)
        namespace = namespace_match.group(1) if namespace_match else None

        # Extract classes (naive regex - real parser needed for accuracy)
        class_matches = re.finditer(r'class\s+(\w+)', content)
        for match in class_matches:
            declarations.append({
                "type": "class",
                "name": match.group(1),
                "namespace": namespace
            })

        # Extract interfaces
        interface_matches = re.finditer(r'interface\s+(\w+)', content)
        for match in interface_matches:
            declarations.append({
                "type": "interface",
                "name": match.group(1),
                "namespace": namespace
            })

        # Extract functions (top-level only, naive)
        function_matches = re.finditer(r'function\s+(\w+)\s*\(', content)
        for match in function_matches:
            declarations.append({
                "type": "function",
                "name": match.group(1),
                "namespace": namespace
            })

        return declarations

    def extract_imports(self, content: str) -> List[Dict[str, str]]:
        """
        Extract use statements (imports).

        NOTE: Naive regex-based. Real parser needed for full accuracy.
        """
        imports = []

        # Match: use Fully\Qualified\ClassName;
        use_matches = re.finditer(r'use\s+([\w\\]+)(?:\s+as\s+(\w+))?;', content)
        for match in use_matches:
            imports.append({
                "from": match.group(1),
                "type": "use_statement",
                "alias": match.group(2) if match.group(2) else None
            })

        return imports

    def extract_feature_flags(self, content: str) -> List[str]:
        """
        Detect feature flag references.

        Looks for patterns like:
        - FeatureFlags::enabled('flag_name')
        - $featureFlags->isEnabled('flag_name')
        - config('features.flag_name')
        """
        flags = set()

        # Pattern: FeatureFlags::enabled('flag_name')
        pattern1 = re.finditer(r'FeatureFlags::enabled\([\'"](\w+)[\'"]\)', content)
        for match in pattern1:
            flags.add(match.group(1))

        # Pattern: $featureFlags->isEnabled('flag_name')
        pattern2 = re.finditer(r'\$\w+->isEnabled\([\'"](\w+)[\'"]\)', content)
        for match in pattern2:
            flags.add(match.group(1))

        # Pattern: config('features.flag_name')
        pattern3 = re.finditer(r'config\([\'"]features\.(\w+)[\'"]\)', content)
        for match in pattern3:
            flags.add(match.group(1))

        return sorted(list(flags))

    def extract_permissions(self, content: str) -> List[str]:
        """
        Detect permission checks.

        Looks for patterns like:
        - $user->can('permission_name')
        - Gate::allows('permission_name')
        - $this->authorize('permission_name')
        """
        permissions = set()

        # Pattern: $user->can('permission_name')
        pattern1 = re.finditer(r'\$\w+->can\([\'"](\w+)[\'"]\)', content)
        for match in pattern1:
            permissions.add(match.group(1))

        # Pattern: Gate::allows('permission_name')
        pattern2 = re.finditer(r'Gate::allows\([\'"](\w+)[\'"]\)', content)
        for match in pattern2:
            permissions.add(match.group(1))

        # Pattern: $this->authorize('permission_name')
        pattern3 = re.finditer(r'\$this->authorize\([\'"](\w+)[\'"]\)', content)
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

    def resolve_namespace_to_module(self, namespace: str) -> Optional[str]:
        """
        Resolve a PHP namespace/class to a module ID.

        This is a simplified heuristic matching namespaces to owns_namespaces.
        """
        if not namespace or not self.policy:
            return None

        # Check owns_namespaces if available
        for module_id, module_config in self.policy["modules"].items():
            owns_namespaces = module_config.get("owns_namespaces", [])
            for ns_pattern in owns_namespaces:
                # Simple prefix matching for namespaces
                if namespace.startswith(ns_pattern.replace('\\\\', '\\')):
                    return module_id

        return None


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python3 php_scanner.py <directory> [policy.json]", file=sys.stderr)
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

    scanner = PHPScanner(directory, policy_path)
    output = scanner.scan()

    # Output JSON to stdout
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
