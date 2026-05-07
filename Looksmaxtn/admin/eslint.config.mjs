import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const relaxedNextVitals = nextVitals.map((config) =>
  config.plugins?.["react-hooks"]
    ? {
        ...config,
        rules: {
          ...config.rules,
          "react-hooks/purity": "warn",
          "react-hooks/set-state-in-effect": "warn",
        },
      }
    : config
);

const eslintConfig = defineConfig([
  ...relaxedNextVitals,
  ...nextTs,
  {
    files: ["tests/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
