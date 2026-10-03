import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'artifacts/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    plugins: { '@stylistic': stylistic },
    rules: {
      curly: ['error', 'all'],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],
      '@stylistic/max-statements-per-line': ['error', { max: 1 }],
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'function' },
        { blankLine: 'always', prev: 'function', next: '*' },
      ],
      'no-nested-ternary': 'error',
      'no-return-assign': ['error', 'always'],
      'no-sequences': 'error',
      'one-var': ['error', 'never'],
    },
  },
  {
    files: ['app.js', 'background.js', 'lib/**/*.js'],
    languageOptions: { globals: { ...globals.browser, chrome: 'readonly' } },
  },
  {
    files: ['scripts/**/*.js', 'tests/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // These globals occur inside Playwright's browser-side evaluate callbacks.
    files: ['scripts/test-browser.js'],
    languageOptions: { globals: { ...globals.browser, chrome: 'readonly' } },
  },
];
