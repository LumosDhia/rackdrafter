import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const sharedBanned = ['src/store', 'src/editor', 'src/panels', 'src/ui', 'src/client'];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.tmp/**',
      'data/**',
      'drizzle/meta/**',
      '*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use src/shared/domain/ids.ts',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Use src/shared/domain/clock.ts',
        },
      ],
    },
  },
  {
    files: ['src/shared/domain/ids.ts', 'src/shared/domain/clock.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: [
      'src/shared/**/*.{ts,tsx}',
      'src/domain/**/*.{ts,tsx}',
      'src/lib/**/*.{ts,tsx}',
      'src/analysis/**/*.{ts,tsx}',
      'src/generators/**/*.{ts,tsx}',
      'src/importers/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['react', 'react-dom', '@xyflow/react', ...sharedBanned],
          patterns: ['src/client/*', 'src/store/*', 'src/editor/*', 'src/panels/*', 'src/ui/*'],
        },
      ],
    },
  },
);
