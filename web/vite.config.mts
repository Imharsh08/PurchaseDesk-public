// The PurchaseDesk web app (README: "Deploy"): a static React app for Cloudflare Pages.
// It reuses the UI components, screens and business code in ../src through the "@" alias, like the
// Next app; the plugin below fills in what Next.js provided.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, type Plugin } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "../src/app");
const actionOverrides = path.resolve(here, "src/actions");
const ACTIONS = "\0pd-actions:";

/**
 * Shared code was written for Next.js. In the web app:
 * - next/navigation and next/link → small React Router versions (web/src/shims);
 * - @/lib/app-file (the app's own files, e.g. an attached invoice) → from the API with the token;
 * - server action modules ("use server" files in src/app) → the web version in web/src/actions/<same
 *   path> when there is one, else calls to the same action in the API (web/src/actions-bridge.ts);
 * - anything server-only (database, secrets) or other Next.js modules → a build error naming the file.
 */
function nextStandIns(): Plugin {
  const rel = (file?: string) => (file ? path.relative(path.resolve(here, ".."), file) : "?");
  return {
    name: "purchasedesk-next-stand-ins",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (source === "next/navigation") return path.join(here, "src/shims/next-navigation.ts");
      if (source === "next/link") return path.join(here, "src/shims/next-link.tsx");
      // Shared modules with a web version. The "@" alias is applied before this hook, so match the
      // resolved path too ("…/src/lib/app-file"), not only "@/lib/app-file".
      const shared = source.replace(/\\/g, "/").replace(/\.ts$/, "");
      for (const name of ["app-file", "ai-invoice"]) {
        if (shared === `@/lib/${name}` || shared.endsWith(`/src/lib/${name}`)) return path.join(here, `src/shims/${name}.ts`);
      }
      if (source === "server-only") {
        this.error(`${rel(importer)} is server-only (database or secrets); the web app can't include it. Load its data through the API instead.`);
      }
      if (/^next(\/|$)/.test(source)) this.error(`${rel(importer)} imports "${source}", which only exists in the Next.js app.`);
      if (importer && /actions$/.test(source)) {
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        // Vite reports ids with forward slashes, also on Windows.
        const file = resolved && path.normalize(resolved.id);
        // A server actions module is one that starts with "use server" (po-actions.tsx is a UI component).
        if (file && file.startsWith(appDir) && /actions\.tsx?$/.test(file) && /^\s*["']use server["']/.test(fs.readFileSync(file, "utf8"))) {
          return ACTIONS + path.relative(appDir, file);
        }
      }
      return null;
    },
    load(id) {
      if (!id.startsWith(ACTIONS)) return null;
      const file = id.slice(ACTIONS.length);
      const override = path.join(actionOverrides, file);
      if (fs.existsSync(override)) return `export * from ${JSON.stringify(override.replace(/\\/g, "/"))};`;
      // Each exported action becomes a call to the same action in the API (web/src/actions-bridge.ts).
      const names = [...fs.readFileSync(path.join(appDir, file), "utf8").matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
      const key = file.split(path.sep).join("/").replace(/\.tsx?$/, "");
      const bridge = path.join(here, "src/actions-bridge.ts").split(path.sep).join("/");
      return [
        `import { callAction } from ${JSON.stringify(bridge)};`,
        ...names.map((n) => `export function ${n}(...args) { return callAction(${JSON.stringify(key)}, ${JSON.stringify(n)}, args); }`),
      ].join("\n");
    },
  };
}

export default defineConfig({
  root: here,
  envDir: here,
  plugins: [nextStandIns(), react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(here, "../src") } },
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5173, strictPort: true },
});
