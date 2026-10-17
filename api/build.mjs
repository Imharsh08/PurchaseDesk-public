// Bundles the API (api/index.ts) into api/dist/index.mjs for Neon Functions.
//
// The API reuses the app's business code in src/, including the server actions. Imports pointed at
// API versions:
//   "@/lib/db"                → api/db.ts (Prisma over a Neon pool, not the Next.js/Workers client)
//   "@/lib/dal"               → api/stubs/dal.ts (the signed-in user from the API request)
//   "@/generated/prisma/…"    → src/generated/prisma-node/… (the Node build of the Prisma client)
//   next/cache, next/navigation, next/server, next/headers → api/stubs/next.ts
//   "server-only"             → an empty module (a Next.js marker)
// Any other Next.js import fails the build, so screen-only code can't slip in.
// "pd:actions" is generated: every server action module ("use server" files in src/app), by path.
import { build } from "esbuild";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Browser-only versions exist for these (web/src/actions), so the API doesn't offer them.
const NOT_IN_API = new Set(["login/actions", "(app)/date-range-actions"]);

/** The server action modules, keyed by their path under src/app without extension ("(app)/bills/actions"). */
function actionModules() {
  const appDir = path.join(root, "src/app");
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && /^\s*["']use server["']/.test(fs.readFileSync(full, "utf8"))) {
        const key = path.relative(appDir, full).split(path.sep).join("/").replace(/\.tsx?$/, "");
        if (!NOT_IN_API.has(key)) found.push({ key, file: full.split(path.sep).join("/") });
      }
    }
  };
  walk(appDir);
  return found.sort((a, b) => a.key.localeCompare(b.key));
}

function actionRegistry() {
  const mods = actionModules();
  return [
    ...mods.map((m, i) => `import * as m${i} from ${JSON.stringify(m.file)};`),
    `export const ACTION_MODULES = { ${mods.map((m, i) => `${JSON.stringify(m.key)}: m${i}`).join(", ")} };`,
  ].join("\n");
}

/** @type {import("esbuild").Plugin} */
const sharedCode = {
  name: "purchasedesk-shared-code",
  setup(b) {
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
    b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "export {};", loader: "js" }));

    b.onResolve({ filter: /^next\/(cache|navigation|server|headers)$/ }, () => ({ path: path.join(root, "api/stubs/next.ts") }));
    b.onResolve({ filter: /^pd:actions$/ }, () => ({ path: "pd:actions", namespace: "actions" }));
    b.onLoad({ filter: /.*/, namespace: "actions" }, () => ({ contents: actionRegistry(), loader: "js", resolveDir: root }));

    b.onResolve({ filter: /^(next|next\/.*|@opennextjs\/.*)$/ }, (args) => ({
      errors: [{ text: `${path.relative(root, args.importer)} imports "${args.path}", which only exists in the Next.js app. Keep API code free of it.` }],
    }));

    b.onResolve({ filter: /^@\// }, (args) => {
      let target = args.path.slice(2);
      if (target === "lib/db") return { path: path.join(root, "api/db.ts") };
      if (target === "lib/dal") return { path: path.join(root, "api/stubs/dal.ts") };
      if (target.startsWith("generated/prisma/")) target = target.replace("generated/prisma/", "generated/prisma-node/");
      return b.resolve(`./${target}`, { resolveDir: path.join(root, "src"), kind: args.kind });
    });
  },
};

await build({
  entryPoints: [path.join(root, "api/index.ts")],
  outfile: path.join(root, "api/dist/index.mjs"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  // pg's optional native binding isn't installed; pg falls back to JavaScript.
  external: ["pg-native"],
  // CommonJS dependencies (pg) call require(); give the ES module one.
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  plugins: [sharedCode],
  sourcemap: "linked",
  logLevel: "warning",
});
console.log("API bundled → api/dist/index.mjs");
