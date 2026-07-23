import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // React Refresh
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // TypeScript
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off', // project uses any heavily
      '@typescript-eslint/ban-ts-comment': 'warn',

      // Common bugs
      'no-constant-condition': 'error',
      'no-duplicate-case': 'error',
      'no-empty': 'warn',
      'no-irregular-whitespace': 'error',
      'no-unreachable': 'error',
      'eqeqeq': ['warn', 'always'], // prefer === over ==
      'no-eval': 'error',
      'no-implied-eval': 'error',

      // Three.js / React-three specific
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.*', 'eslint-rules.config.mjs'],
  },
];
