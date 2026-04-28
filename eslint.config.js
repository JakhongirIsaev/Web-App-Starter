import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.replit-artifact/**",
      "**/build/**",
      "**/coverage/**",
      "lib/api-zod/src/generated/**",
      "lib/api-client-react/src/generated/**",
      "lib/db/drizzle/**",
      "artifacts/api-server/src/ocr/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Pragmatic: existing code uses these patterns; we keep the rules off
      // so the lint pass surfaces real bugs instead of style noise. Tighten
      // these one at a time after a dedicated cleanup pass.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          // Accept the codebase's "err" convention for unused caught errors
          // alongside the standard underscore prefix.
          caughtErrorsIgnorePattern: "^(_|err$)",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-escape": "warn",
      "prefer-const": "warn",
    },
  },
  {
    files: ["artifacts/{admin,mini-app}/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["**/*.test.ts", "**/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
);
