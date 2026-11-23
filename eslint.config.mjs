import js from "@eslint/js";
import ts from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
export default ts.config(
  {
    ignores: [
      ".next/**",
      ".postgres/**",
      "next-env.d.ts",
      "node_modules/**",
      "research/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/lib/zod.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "zod",
              message:
                'Import { z } from "@/lib/zod" (or "./zod" in src/lib) so the CSP-safe jitless setting applies.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.tsx"],
    plugins: { "react-hooks": hooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["extension/**/*.js"],
    languageOptions: {
      globals: {
        chrome: "readonly",
        document: "readonly",
        location: "readonly",
        fetch: "readonly",
        URL: "readonly",
        HTMLTextAreaElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLInputElement: "readonly",
        Event: "readonly",
        File: "readonly",
        DataTransfer: "readonly",
        atob: "readonly",
        module: "readonly",
      },
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        setInterval: "readonly",
        URL: "readonly",
        fetch: "readonly",
      },
    },
  },
);
