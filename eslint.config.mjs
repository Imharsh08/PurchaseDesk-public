import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The web app (Vite, not Next.js): Next's routing rules don't apply there.
  {
    files: ["web/**"],
    rules: {
      "@next/next/no-location-assign-relative-destination": "off",
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output: Cloudflare (OpenNext) deploys, the API bundle and the web app.
    ".open-next/**",
    "api/dist/**",
    "web/dist/**",
  ]),
]);

export default eslintConfig;
