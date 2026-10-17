"use client";

import { useState } from "react";
import { CheckIcon, FilePenLineIcon, Loader2Icon, UndoIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { ReasonDialog } from "@/components/reason-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerAction } from "@/hooks/use-server-action";
import { cn } from "@/lib/utils";
import { approveAmendment, rejectAmendment, withdrawAmendment } from "../actions";

export type AmendmentView = {
  id: number;
  revisionNo: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  reason: string;
  summary: string[];
  oldTotal: string;
  newTotal: string;
  increase: boolean;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
};

const STATUS_TONE = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REJECTED: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  WITHDRAWN: "bg-muted text-muted-foreground",
} as const;
const STATUS_LABEL = { PENDING: "Awaiting approval", APPROVED: "Approved", REJECTED: "Sent back", WITHDRAWN: "Withdrawn" } as const;

export function AmendmentCard({
  amendments,
  canDecide,
  limitNote,
  canWithdraw,
}: {
  amendments: AmendmentView[];
  /** Approver who is not the requester and within limit. */
  canDecide: boolean;
  limitNote: string | null;
  canWithdraw: boolean;
}) {
  const [pending, run] = useServerAction();
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const open = amendments.find((a) => a.status === "PENDING");

  return (
    <Card className={cn(open && "ring-amber-400/60")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FilePenLineIcon className="size-4" />
          Amendments
        </CardTitle>
        <CardDescription>Revisions to this PO after it was issued</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {amendments.map((a) => (
          <div key={a.id} className="space-y-2 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Rev. {a.revisionNo}</span>
              <Badge className={cn("border-transparent", STATUS_TONE[a.status])}>{STATUS_LABEL[a.status]}</Badge>
              <span className="ml-auto text-xs tabular">
                {a.oldTotal} → <span className={cn("font-medium", a.increase ? "text-rose-600" : "text-emerald-600")}>{a.newTotal}</span>
              </span>
            </div>
            <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
              {a.summary.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p>
              <span className="text-muted-foreground">Reason: </span>
              {a.reason}
            </p>
            <p className="text-xs text-muted-foreground">
              Requested by {a.requestedBy} · {a.requestedAt}
              {a.decidedBy && ` · ${STATUS_LABEL[a.status].toLowerCase()} by ${a.decidedBy}, ${a.decidedAt}`}
              {a.decisionNote && ` — “${a.decisionNote}”`}
            </p>
            {a.status === "PENDING" && (
              <div className="flex flex-wrap gap-2 pt-1">
                {canDecide && (
                  <>
                    <Button size="sm" onClick={() => setDialog("approve")} disabled={pending}>
                      <CheckIcon />
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDialog("reject")} disabled={pending}>
                      <UndoIcon />
                      Send back
                    </Button>
                  </>
                )}
                {canWithdraw && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => withdrawAmendment(a.id), { pending: "Withdrawing…", success: "Amendment withdrawn" })}
                  >
                    {pending ? <Loader2Icon className="animate-spin" /> : <XIcon />}
                    Withdraw
                  </Button>
                )}
                {limitNote && <p className="w-full text-xs text-amber-700 dark:text-amber-400">{limitNote}</p>}
              </div>
            )}
          </div>
        ))}
      </CardContent>
      {open && (
        <>
          <ReasonDialog
            open={dialog === "approve"}
            onOpenChange={(o) => !o && setDialog(null)}
            title={`Approve Rev. ${open.revisionNo}?`}
            description="The changes are applied to the PO and its PDF is regenerated. If the vendor already had the PO, send them the revised copy."
            label="Note (optional)"
            confirmLabel="Approve amendment"
            minLength={0}
            pending={pending}
            onConfirm={(note) =>
              run(() => approveAmendment(open.id, note), {
                pending: `Approving Rev. ${open.revisionNo} and regenerating PDF…`,
                success: `Rev. ${open.revisionNo} approved`,
                onSuccess: (data) => {
                  if (data.pdfError) toast.warning(data.pdfError);
                  setDialog(null);
                },
              })
            }
          />
          <ReasonDialog
            open={dialog === "reject"}
            onOpenChange={(o) => !o && setDialog(null)}
            title="Send back amendment"
            description="The PO stays as it is. Your note is shown to the requester."
            label="Why?"
            confirmLabel="Send back"
            pending={pending}
            onConfirm={(reason) =>
              run(() => rejectAmendment(open.id, reason), {
                pending: "Sending back…",
                success: "Amendment sent back",
                onSuccess: () => setDialog(null),
              })
            }
          />
        </>
      )}
    </Card>
  );
}
