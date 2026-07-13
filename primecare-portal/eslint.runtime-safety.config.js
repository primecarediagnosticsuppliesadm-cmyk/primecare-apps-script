import js from "@eslint/js";
import globals from "globals";

/** Minimal gate — no-undef only (ReferenceError prevention). */
export default [
  { ignores: ["dist/**"] },
  {
    files: ["src/pages/**/*.{js,jsx}", "src/components/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-undef": "error",
      "no-unused-vars": "off",
    },
  },
];
