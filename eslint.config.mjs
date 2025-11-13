// ESLint flat config (v9+)
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

// Small, surgical flat ESLint config. We enable the type-aware ruleset for
// TypeScript files and add a narrow override that forbids committing any
// .js/.jsx files under `src/` (project is TS-first).
export default [
  // Ignore build/artifacts, scripts, examples, and generated schemas
  {
    ignores: [
      "dist/",
      "node_modules/",
      "coverage/",
      "**/*.d.ts",
      "scripts/",
      "examples/",
      "schemas/",
    ],
  },

  // Base config for all source files. Keep a small set of ergonomic rules.
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      // Enforce no-console globally (default to error)
      // Only src/shared/cli/output.ts is allowed (see override below)
      "no-console": "error",

      // Forbid imports from removed legacy paths
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/framestore", "**/framestore.js"],
              message: "FrameStore is removed. Use modular API from db.js and queries.js",
            },
            {
              group: ["**/validateModuleIdsSync*"],
              message: "validateModuleIdsSync is removed. Use async validateModuleIds",
            },
          ],
        },
      ],

      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Type-aware rules for TypeScript files. Uses the TypeScript project
  // service to enable selected type-checked rules (minimal, surgical).
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        // Use a dedicated tsconfig for ESLint that includes test files so the
        // parser's project can resolve them (avoids "was not found by the
        // project service" parser errors).
        project: ["./tsconfig.eslint.json"],
      },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      // A small, useful subset of type-aware rules (warn/error as appropriate).
      "@typescript-eslint/no-floating-promises": "error",
      // Disabled: too pedantic about nullable checks (would need 194 explicit null/undefined checks)
      // "@typescript-eslint/strict-boolean-expressions": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",
    },
  },

  // Allow console ONLY in the CLI output wrapper (single chokepoint)
  {
    files: ["src/shared/cli/output.ts"],
    rules: {
      "no-console": "off",
    },
  },

  // Allow console in development/demo scripts and policy checker CLI tools
  {
    files: [
      "src/shared/atlas/demo.ts",
      "src/shared/atlas/perf-test.ts",
      "src/shared/atlas/verify-format.ts",
      "src/policy/check/lexmap-check.ts",
      "src/policy/check/reporter.ts",
      "src/policy/scanners/ts_scanner.ts",
      "src/policy/merge/lexmap-merge.ts",
      "src/shared/aliases/resolver.ts", // Debug logging gated by LEX_DEBUG
    ],
    rules: {
      "no-console": "off",
    },
  },

  // Allow console in MCP server entry points (stdio protocol requires it)
  {
    files: ["**/mcp_server/**/*.mjs", "**/mcp_server/**/*-mcp.ts"],
    rules: {
      "no-console": "off",
    },
  },

  // Forbid committing any .js/.jsx files under `src/` (TS-only source tree).
  {
    files: ["src/**/*.{js,jsx}"],
    rules: {
      // Disallow the Program node so any JS file under src/ errors loudly.
      "no-restricted-syntax": [
        "error",
        { selector: "Program", message: "No .js files allowed under src/ — use TypeScript." },
      ],
    },
  },

  // NOTE: historical exemptions were removed once legacy .js artifacts
  // were converted/cleaned. The `src/**/*.{js,jsx}` rule is now strict.

  // Tests commonly call functions that return promises without awaiting
  // at top-level; disable the floating-promises rule for test files only.
  // Also relax type-safety rules since tests often deal with mock data.
  // Allow console in tests for debugging (but prefer test assertions).
  {
    files: [
      "**/*.test.ts",
      "**/*.test.mts",
      "**/*.test.mjs",
      "**/*.spec.ts",
      "**/*.spec.mjs",
      "test/**/*.ts",
      "test/**/*.mts",
      "**/test_*.ts",
      "**/*_test.ts", // Test utility files
    ],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // MCP servers and CLI commands deal with external untyped data (user input,
  // network requests); relax type-safety rules for these boundary files.
  // Atlas Frame and policy loader also handle external/dynamic structures.
  {
    files: [
      "**/mcp_server/**/*.ts",
      "src/shared/cli/**/*.ts",
      "src/shared/atlas/**/*.ts",
      "src/shared/policy/loader.ts",
    ],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },

  // Ensure .mjs files are parsed as ESM (node runtime modules)
  {
    files: ["**/*.mjs"],
    languageOptions: { sourceType: "module" },
  },
];
