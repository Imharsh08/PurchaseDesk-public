import "server-only";

import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Runs a server action body and converts known failures into a serialisable
 * result the client can show, instead of an opaque 500.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof ActionError) return { ok: false, error: error.message };
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const key = issue.path.join(".") || "_";
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return {
        ok: false,
        error: error.issues[0]?.message ?? "Please check the highlighted fields.",
        fieldErrors,
      };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = (error.meta?.target as string[] | undefined)?.join(", ");
      return { ok: false, error: `A record with this ${target ?? "value"} already exists.` };
    }
    console.error(error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
