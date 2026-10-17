/**
 * Stand-in for "next/link" in the web app: React Router's Link with Next's props (href, replace,
 * scroll; prefetch is ignored). Used by src/components/link.tsx, which every screen imports.
 */
import { Link as RouterLink } from "react-router";

type Props = Omit<React.ComponentProps<"a">, "href"> & {
  href: string | { pathname?: string; search?: string; hash?: string };
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null | "auto";
};

// prefetch is a Next.js hint with no meaning here: taken out so it doesn't reach the <a>.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function Link({ href, replace, scroll, prefetch, ...props }: Props) {
  const to = typeof href === "string" ? href : `${href.pathname ?? ""}${href.search ?? ""}${href.hash ?? ""}`;
  // Absolute or special links (mailto:, https:) and files (/api/..., opened by web/src/files.ts) are ordinary anchors.
  if (/^([a-z]+:|\/\/|\/api\/)/i.test(to)) return <a href={to} {...props} />;
  return <RouterLink to={to} replace={replace} preventScrollReset={scroll === false} {...props} />;
}

/** Navigation here is instant (data loads on the next screen), so a link is never "pending". */
export function useLinkStatus() {
  return { pending: false };
}
