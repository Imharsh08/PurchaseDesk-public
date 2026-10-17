/**
 * A screen's data, loaded from the API, then its shared view (src/components/screens). The first load
 * shows the same skeleton as the Next app; while reloading (new date range, after an action) the
 * previous data stays on screen.
 */
import { AlertCircleIcon, SearchXIcon } from "lucide-react";
import { useParams, useSearchParams } from "react-router";
import Loading from "@/app/(app)/loading";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useApi, type ApiState } from "./data";

export function Screen<T>({ state, children }: { state: ApiState<T>; children: (data: T) => React.ReactNode }) {
  if (state.data !== undefined && !(state.status === 404 && !state.loading)) return children(state.data);
  if (state.loading) return <Loading />;
  if (state.status === 404) return <EmptyState icon={SearchXIcon} title="Not found" description="This record doesn't exist, or was deleted." />;
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertDescription className="flex flex-wrap items-center gap-3">
        {state.error ?? "Couldn't load this page."}
        <Button size="sm" variant="outline" onClick={state.reload}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** The page's ?query as the plain object the shared views expect (like Next's searchParams). */
export function useSearchObject() {
  const [params] = useSearchParams();
  return Object.fromEntries(params.entries()) as Record<string, string | undefined>;
}

/** The route's :id as a number (NaN when it isn't one, and the API answers 404). */
export function useIdParam() {
  return Number(useParams().id);
}

export { useApi };
