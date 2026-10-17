/**
 * The current request, for shared code that asks "who is calling?" without being handed it — the
 * server actions call authorize() / getCurrentUser() (src/lib/dal in the Next app; api/stubs/dal.ts
 * here). Set by the signed-in middleware in index.ts for the rest of the request.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = { userId: number; request: Request; user?: Promise<unknown> };

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentRequest() {
  return requestContext.getStore() ?? null;
}
