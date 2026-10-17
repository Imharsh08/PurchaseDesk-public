"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";

/**
 * A text box with suggestions (the browser's own list under the box): pick one or type anything else,
 * e.g. a transporter that isn't in the list yet.
 */
export function SuggestInput({ suggestions, ...props }: React.ComponentProps<typeof Input> & { suggestions: string[] }) {
  const listId = useId();
  return (
    <>
      <Input list={suggestions.length ? listId : undefined} autoComplete="off" {...props} />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </>
  );
}
