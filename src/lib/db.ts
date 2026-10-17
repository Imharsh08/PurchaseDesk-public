import "server-only";

import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/**
 * On Workers, prefer the Hyperdrive binding (warm, pooled connections near the database) when it
 * is configured in wrangler.jsonc; otherwise connect straight to DATABASE_URL.
 */
function connectionString() {
  if (onWorkers) {
    try {
      const env = getCloudflareContext().env as { HYPERDRIVE?: { connectionString: string } };
      if (env.HYPERDRIVE?.connectionString) return env.HYPERDRIVE.connectionString;
    } catch {
      // No Cloudflare context (e.g. during build): fall back to DATABASE_URL.
    }
  }
  return process.env.DATABASE_URL!;
}

function createClient() {
  const adapter = new PrismaPg({
    connectionString: connectionString(),
    // Workers: the pool lives for one request, so its connections are reused by every query of that
    // request (no reconnect + auth per query). Up to 5 lets a page's parallel queries run side by side.
    // No idle timer: the sockets are dropped with the request.
    ...(onWorkers ? { max: 5, idleTimeoutMillis: 0 } : { max: Number(process.env.DATABASE_POOL_MAX) || undefined }),
  });
  return new PrismaClient({ adapter });
}

function nodeClient() {
  const g = globalThis as unknown as { prisma?: PrismaClient };
  return (g.prisma ??= createClient());
}

/**
 * Workers can't reuse a socket opened by another request, so each request gets its own client.
 * It is keyed on the request's ExecutionContext, which (unlike React's cache) also holds in server
 * actions and route handlers — otherwise every `db.x` access there would open a new pool.
 */
const clients = new WeakMap<object, PrismaClient>();
const renderClient = cache(createClient);

function requestClient() {
  let ctx: object | undefined;
  try {
    ctx = getCloudflareContext().ctx;
  } catch {
    // Outside a request (e.g. build time).
  }
  if (!ctx) return renderClient();
  let client = clients.get(ctx);
  if (!client) clients.set(ctx, (client = createClient()));
  return client;
}

/**
 * The database client. On Node it's a shared, pooled client; on Cloudflare Workers
 * every property access resolves the current request's client.
 */
export const db: PrismaClient = onWorkers
  ? new Proxy({} as PrismaClient, {
      get(_target, prop) {
        const client = requestClient();
        const value = Reflect.get(client, prop, client);
        return typeof value === "function" ? value.bind(client) : value;
      },
    })
  : nodeClient();
