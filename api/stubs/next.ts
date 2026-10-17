/**
 * Stand-ins for the few Next.js functions server actions use, so they run unchanged in the API:
 * - revalidatePath / revalidateTag: nothing to do — the web app reloads its data after an action;
 * - redirect / notFound: reported to the caller ({ redirect } / 404) and the web app follows;
 * - after: work after the response (step emails) via Neon's waitUntil;
 * - cookies / headers: the request's headers; no cookies are kept (the session is a Bearer token).
 * api/build.mjs points next/cache, next/navigation, next/server and next/headers here.
 */
import { waitUntil } from "@neon/functions";
import { currentRequest } from "../context";

export function revalidatePath() {}
export function revalidateTag() {}

/** Thrown by redirect(); the actions endpoint turns it into { redirect: href }. */
export class RedirectSignal extends Error {
  constructor(readonly href: string) {
    super(`redirect to ${href}`);
  }
}

export function redirect(href: string): never {
  throw new RedirectSignal(href);
}

/** Thrown by notFound(); endpoints answer 404. */
export class NotFoundSignal extends Error {
  constructor() {
    super("not found");
  }
}

export function notFound(): never {
  throw new NotFoundSignal();
}

export function after(task: Promise<unknown> | (() => unknown)) {
  const promise = typeof task === "function" ? Promise.resolve().then(task) : task;
  waitUntil(promise.catch((error) => console.error("after() task failed", error)));
}

export async function headers() {
  return currentRequest()?.request.headers ?? new Headers();
}

export async function cookies() {
  return {
    get: () => undefined as { name: string; value: string } | undefined,
    getAll: () => [] as { name: string; value: string }[],
    has: () => false,
    set: () => {},
    delete: () => {},
  };
}
