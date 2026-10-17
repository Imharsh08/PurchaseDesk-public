"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMarkBusy } from "@/components/live-status";
import type { ActionResult } from "@/lib/action";

type Failure = Extract<ActionResult, { ok: false }>;

export type RunOptions<T> = {
  /** Shown the moment the user acts (e.g. "Approving…") and replaced by the outcome. */
  pending?: string;
  /** Success message; a function can build it from the returned data, or return null for none. */
  success?: string | ((data: T) => string | null);
  /** UI changes after success (close a dialog, navigate). They land together with the refreshed page. */
  onSuccess?: (data: T) => void;
  onError?: (failure: Failure) => void;
  /** The reply was lost, so the outcome is unknown. Default: reload the current page's data. */
  onLost?: () => void;
  /** Show the expected outcome at once (useOptimistic setters, e.g. the page's live status). */
  optimistic?: () => void;
};

const OFFLINE = "The server didn't answer properly. Showing the latest data; check it before trying again.";

/** A Server Action that calls redirect() rejects with this; Next navigates when it is rethrown. */
const isRedirect = (error: unknown) =>
  typeof error === "object" && error !== null && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");

/**
 * Runs server actions with immediate feedback: a loading toast appears on click and turns into the
 * result, the caller's `pending` drives spinners, and post-success updates (closing a dialog,
 * navigating) are applied in the same render as the server's refreshed data, so the screen never
 * shows a closed dialog over stale data. Network failures become a toast instead of an error page.
 *
 * Call `useOptimistic` setters inside the action callback to show the outcome before the server answers.
 */
export function useServerAction() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const markBusy = useMarkBusy();

  function run<T>(action: () => Promise<ActionResult<T>>, options: RunOptions<T> = {}) {
    const id = options.pending ? toast.loading(options.pending) : undefined;
    startTransition(async () => {
      // Same frame as the click: lock the page's buttons and show the expected result.
      markBusy?.();
      options.optimistic?.();
      let result: ActionResult<T>;
      try {
        result = await action();
      } catch (error) {
        if (isRedirect(error)) {
          // Succeeded and moved to another page; there is no result to build a message from.
          if (typeof options.success === "string") toast.success(options.success, { id });
          else if (id !== undefined) toast.dismiss(id);
          throw error;
        }
        console.error(error);
        toast.error(OFFLINE, { id });
        // The change may have gone through even though the reply was lost (e.g. a 503 from the
        // host): reload the page's data so the screen shows what actually happened.
        if (options.onLost) startTransition(() => options.onLost!());
        else router.refresh();
        return;
      }
      if (!result.ok) {
        toast.error(result.error, { id });
        const failure = result;
        if (options.onError) startTransition(() => options.onError!(failure));
        return;
      }
      const data = result.data;
      const message = typeof options.success === "function" ? options.success(data) : options.success;
      if (message) toast.success(message, { id });
      else if (id !== undefined) toast.dismiss(id);
      // State updates after an await aren't part of the transition unless wrapped again.
      if (options.onSuccess) startTransition(() => options.onSuccess!(data));
    });
  }

  return [pending, run] as const;
}
