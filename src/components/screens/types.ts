/**
 * Shared screen views (src/components/screens) draw a screen from its loader's data; the Next pages
 * and the web app both render them. These are the inputs every view may take besides that data.
 */
import type { Role } from "@/generated/prisma/enums";

/** The signed-in user, as both apps provide it. */
export type ScreenUser = {
  id: number;
  name: string;
  email: string;
  roles: Role[];
  department: string | null;
  active: boolean;
  approvalLimit: number | null;
  gmailConnected: boolean;
};

/** The page's ?query (Next's searchParams; the web app builds the same object). */
export type SearchParams = Record<string, string | string[] | undefined>;
