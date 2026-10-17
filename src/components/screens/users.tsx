import { PencilIcon, PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Role } from "@/generated/prisma/enums";
import { formatDate, formatINR } from "@/lib/format";
import { ROLE_LABELS, can } from "@/lib/roles";
import { initials } from "@/lib/utils";
import { UserDialog } from "@/app/(app)/users/user-dialog";
import type { ScreenUser } from "@/components/screens/types";
import type { loadUsersScreen } from "@/lib/screens/admin";

const ROLE_TONE = {
  ADMIN: "bg-primary/10 text-primary",
  MANAGER: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  PURCHASER: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  WAREHOUSE: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ACCOUNTS: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
} as const;

type Data = NonNullable<Awaited<ReturnType<typeof loadUsersScreen>>>;
export type UsersViewProps = Pick<Data, "signIn" | "users"> & {
  me: ScreenUser;
};

export function UsersView({ me, signIn, users }: UsersViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description={signIn.domain ? `Staff with an @${signIn.domain} account you add here can sign in. Their roles decide what they can do.` : "Who can sign in to PurchaseDesk, and what they're allowed to do."}
        actions={
          <UserDialog
            {...signIn}
            trigger={
              <Button>
                <PlusIcon />
                Add user
              </Button>
            }
          />
        }
      />
      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4">User</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Approval limit</TableHead>
              <TableHead>Added</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-muted text-xs font-medium">{initials(u.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">
                        {u.name}
                        {u.id === me.id && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(Object.keys(ROLE_LABELS) as Role[])
                      .filter((r) => u.roles.includes(r))
                      .map((r) => (
                        <Badge key={r} className={ROLE_TONE[r]}>
                          {ROLE_LABELS[r]}
                        </Badge>
                      ))}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{u.department ?? "—"}</TableCell>
                <TableCell className="text-right text-sm tabular">
                  {can(u.roles, "approvePO") ? (u.approvalLimit === null ? "No limit" : formatINR(u.approvalLimit)) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                <TableCell>
                  {u.active ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Disabled</Badge>
                  )}
                </TableCell>
                <TableCell className="pr-4">
                  <UserDialog
                    {...signIn}
                    user={{ ...u, approvalLimit: u.approvalLimit?.toString() ?? null }}
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${u.name}`}>
                        <PencilIcon />
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
