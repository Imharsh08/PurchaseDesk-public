import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { loadSettingsScreen } from "@/lib/screens/admin";
import { SettingsView } from "@/components/screens/settings";

export const metadata: Metadata = { title: "Company settings" };

export default async function SettingsPage() {
  await requirePermission("manageSettings");
  const { company, users, addresses, notConnected, lastIssued } = await loadSettingsScreen();  return <SettingsView addresses={addresses} company={company} lastIssued={lastIssued} notConnected={notConnected} users={users} />;
}
