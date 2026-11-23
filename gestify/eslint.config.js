import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    ignores: ["node_modules", "dist", ".output", ".nitro", ".vercel", ".tanstack", "src/routeTree.gen.ts", "src/components/ui/**"],
  },
  pluginJs.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: { react: pluginReact, "react-hooks": pluginReactHooks },
    rules: {
      // Sin esta regla, no-unused-vars marca como "sin usar" todo componente que solo aparece en JSX.
      "react/jsx-uses-vars": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];
