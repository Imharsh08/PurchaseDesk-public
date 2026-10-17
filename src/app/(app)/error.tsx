"use client";

import { useEffect } from "react";
import Link from "@/components/link";
import { AlertTriangleIcon, RotateCwIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Keeps the sidebar and top bar usable when a page fails, with a one-click retry. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="py-0">
      <EmptyState
        icon={AlertTriangleIcon}
        title="This page couldn't load"
        description="It may be a network hiccup. Try again; if it keeps happening, note the time and tell the admin."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => retry()}>
              <RotateCwIcon />
              Try again
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">Go to dashboard</Link>
            </Button>
          </div>
        }
        className="py-12"
      />
    </Card>
  );
}
