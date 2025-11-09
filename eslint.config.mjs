// ESLint flat config (v9+)
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

// Small, surgical flat ESLint config. We enable the type-aware ruleset for
// TypeScript files and add a narrow override that forbids committing any
// .js/.jsx files under `src/` (project is TS-first).
export default [
  // Ignore build/artifacts and scripts
  { ignores: ["dist/", "node_modules/", "coverage/", "**/*.d.ts", "scripts/", "examples/lexrunner/"] },

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
      // prefer warn by default for consoles; more specific overrides below
      "no-console": "warn",
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
      // Allow console for CLI/reporting code paths (intentionally used).
      "no-console": "off",

      // A small, useful subset of type-aware rules (warn/error as appropriate).
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/strict-boolean-expressions": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",
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
  {
    files: ["**/*.test.ts", "**/*.test.mts", "**/*.test.mjs", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
    },
  },

  // Ensure .mjs files are parsed as ESM (node runtime modules)
  {
    files: ["**/*.mjs"],
    languageOptions: { sourceType: "module" },
  },
];
