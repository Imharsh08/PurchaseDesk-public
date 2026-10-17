"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

const MESSAGES: Record<string, [("success" | "error"), string]> = {
  connected: ["success", "Gmail connected — emails now go out from your address."],
  denied: ["error", "Gmail permission was not granted. Tick “Send email on your behalf” when Google asks."],
  wrong_account: ["error", "Choose your own company Google account when connecting Gmail."],
  no_token: ["error", "Google didn't return offline access. Try “Connect Gmail” again."],
  expired: ["error", "The Gmail connection timed out. Try again."],
  failed: ["error", "Couldn't connect Gmail. Try again."],
  unavailable: ["error", "Google sign-in isn't configured on this server."],
};

/** Shows the result of the Gmail consent (?gmail=…) once, then removes it from the URL. */
export function GmailFlag() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const flag = params.get("gmail");
  useEffect(() => {
    if (!flag) return;
    const [kind, text] = MESSAGES[flag] ?? ["error", "Gmail connection failed."];
    toast[kind](text);
    const rest = new URLSearchParams(params);
    rest.delete("gmail");
    router.replace(rest.size ? `${pathname}?${rest}` : pathname);
  }, [flag, params, pathname, router]);
  return null;
}
