// ESLint flat config (v9+)
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

// Small, surgical flat ESLint config. We enable the type-aware ruleset for
// TypeScript files and add a narrow override that forbids committing any
// .js/.jsx files under `src/` (project is TS-first).
export default [
  // Ignore build/artifacts
  { ignores: ['dist/', 'node_modules/', 'coverage/', '**/*.d.ts'] },

  // Base config for all source files. Keep a small set of ergonomic rules.
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      // prefer warn by default for consoles; more specific overrides below
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Type-aware rules for TypeScript files. Uses the TypeScript project
  // service to enable selected type-checked rules (minimal, surgical).
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        // Use the TS project service so rules that rely on type information
        // can work without listing explicit project files here.
        projectService: true,
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      // Allow console for CLI/reporting code paths (intentionally used).
      'no-console': 'off',

      // A small, useful subset of type-aware rules (warn/error as appropriate).
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
    },
  },

  // Forbid committing any .js/.jsx files under `src/` (TS-only source tree).
  {
    files: ['src/**/*.{js,jsx}'],
    rules: {
      // Disallow the Program node so any JS file under src/ errors loudly.
      'no-restricted-syntax': [
        'error',
        { selector: 'Program', message: 'No .js files allowed under src/ — use TypeScript.' },
      ],
    },
  },

  // Temporary exemptions for historical/compiled JS artifacts that still
  // exist in the tree. These are narrow, explicit paths so the rule still
  // prevents new .js files while not blocking the current conversion work.
  {
    files: [
      'src/memory/store/db.js',
      'src/memory/store/framestore.js',
      'src/memory/store/images.js',
      'src/memory/store/index.js',
      'src/memory/store/queries.js',
      'src/policy/merge/types.js',
      'src/shared/policy/loader.js',
      'src/shared/types/frame.js',
      'src/shared/types/policy.js',
      'src/shared/types/validation.js',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // Tests commonly call functions that return promises without awaiting
  // at top-level; disable the floating-promises rule for test files only.
  {
    files: ['**/*.test.ts', '**/*.test.mts', '**/*.test.mjs', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
    },
  },

  // Ensure .mjs files are parsed as ESM (node runtime modules)
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module' },
  },
];
