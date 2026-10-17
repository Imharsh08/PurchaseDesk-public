"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

/** Debounced search box that writes ?q= to the URL so results render on the server. */
export function SearchInput({ placeholder = "Search…" }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (value === current) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (value) next.set("q", value);
      else next.delete("q");
      next.delete("page");
      startTransition(() => router.replace(`${pathname}?${next.toString()}`));
    }, 300);
    return () => clearTimeout(timer);
  }, [value, params, pathname, router]);

  return (
    <InputGroup className="w-full sm:w-72">
      <InputGroupAddon>
        {pending ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </InputGroup>
  );
}
