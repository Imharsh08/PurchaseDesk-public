import type { Metadata } from "next";
import { ApprovalsView } from "@/components/screens/approvals";
import { requireUser } from "@/lib/dal";
import { loadApprovals } from "@/lib/screens/approvals";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const user = await requireUser();
  return <ApprovalsView {...await loadApprovals(user)} />;
}
