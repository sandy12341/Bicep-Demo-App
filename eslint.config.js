import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  { files: ['src/public/*.js'], languageOptions: { globals: { document: 'readonly', fetch: 'readonly' } } },
  { ignores: ['dist/**', 'node_modules/**'] },
);
