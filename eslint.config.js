import js from '@eslint/js'
import globals from 'globals'
import security from 'eslint-plugin-security'
import sonarjs from 'eslint-plugin-sonarjs'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'coverage']),
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended, sonarjs.configs.recommended],
    plugins: {
      security,
    },
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      complexity: ['warn', 12],
      'max-depth': ['warn', 4],
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'sonarjs/cognitive-complexity': ['warn', 12],
    },
  },
  {
    files: ['test/**/*.{js,mjs,cjs}'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      sonarjs.configs.recommended,
    ],
    plugins: {
      security,
    },
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      complexity: ['warn', 12],
      'max-depth': ['warn', 4],
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-regexp': 'warn',
      'sonarjs/cognitive-complexity': ['warn', 12],
    },
  },
])
