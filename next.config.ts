import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded from node_modules at runtime rather than bundled.
  serverExternalPackages: ["pg"],
  // Next externalises @prisma/client by default, but Cloudflare Workers have no node_modules
  // at runtime ("No such module @prisma/client-…/runtime/wasm-compiler-edge"). Bundle it instead.
  transpilePackages: ["@prisma/client"],
  // Next traces pg-cloudflare's Node entry only; Cloudflare Workers (OpenNext) needs its workerd entry too.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/pg-cloudflare/**/*"],
  },
  // Turbopack's loader for Prisma's .wasm engine uses a wildcard path that matches the whole
  // project, so every route "traces" all of node_modules. Drop build/dev tooling from the trace;
  // the Worker bundle only contains what is actually imported either way.
  outputFileTracingExcludes: {
    "/*": [
      "./node_modules/{eslint,eslint-*,@eslint,@eslint-community,@typescript-eslint,typescript,@types}/**/*",
      "./node_modules/{prisma,@prisma/studio*,@prisma/dev,@prisma/engines,@prisma/fetch-engine,@prisma/get-platform,@electric-sql,effect,hono,@hono,@visx,fast-check,remeda}/**/*",
      "./node_modules/{wrangler,workerd,@cloudflare,cloudflare,miniflare,unenv,esbuild,@esbuild,@opennextjs,@aws-sdk,@smithy,@aws-crypto}/**/*",
      "./node_modules/{vitest,@vitest,vite,rollup,@rollup,tsx,shadcn,@modelcontextprotocol,@neon,neon,caniuse-lite,lodash,es-abstract}/**/*",
      "./.claude/**/*",
      "./prisma/**/*",
      "./scripts/**/*",
    ],
  },
  experimental: {
    // Pages visited in the last 30 s (back / forward, list → record → list) come from the browser's
    // cache instead of a new Worker render. Any save calls revalidatePath, which clears it.
    staleTimes: { dynamic: 30 },
    serverActions: {
      // Logo (1 MB) and quotation document (5 MB) uploads go through server actions.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
