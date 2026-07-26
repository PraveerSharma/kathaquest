import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "pours/**",
    "playwright-report/**",
    "test-results/**",
    ".playwright-cli/**",
    "infra/aws-cdk/cdk.out/**",
    "infra/aws-cdk/node_modules/**",
  ]),
]);
