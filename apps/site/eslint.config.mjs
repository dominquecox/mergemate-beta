import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['public/**', 'scripts/**', '.wrangler/**', 'worker-configuration.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
);
