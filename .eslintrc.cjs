module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'dev-dist', 'node_modules', '*.cjs', 'scripts/*.mjs'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
    'no-restricted-syntax': [
      'error',
      {
        selector: "Literal[value=/^#(?:fff|ffffff)$/i]",
        message: 'Never pure white — use var(--mt-cream) / palette.cream.',
      },
    ],
  },
};
