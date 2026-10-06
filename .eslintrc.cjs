module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: [
    'node_modules', 'dist', 'dist-electron', 'dist-react', 'dist_out', 'out', 'release',
    'coverage', 'build', 'graphify-out', 'marketing', 'public', '*.d.ts',
  ],
  rules: {
    // Existing code has conditional hook calls (MovementView, TimelineLane); fixing changes runtime behavior.
    'react-hooks/rules-of-hooks': 'off',
    'react-hooks/exhaustive-deps': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
};
