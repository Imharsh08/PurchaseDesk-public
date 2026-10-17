import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { loadUsersScreen } from "@/lib/screens/admin";
import { UsersView } from "@/components/screens/users";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requirePermission("manageUsers");
  const { users, signIn } = await loadUsersScreen();
  return <UsersView me={me} signIn={signIn} users={users} />;
}
