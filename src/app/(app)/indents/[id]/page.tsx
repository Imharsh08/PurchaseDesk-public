import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { loadIndentScreen } from "@/lib/screens/indent";
import { fmsReturnTo } from "@/lib/fms-steps";
import { IndentView } from "@/components/screens/indent";

export async function generateMetadata(props: PageProps<"/indents/[id]">): Promise<Metadata> {
  const id = Number((await props.params).id);
  const indent = Number.isInteger(id) ? await db.indent.findUnique({ where: { id }, select: { indentNumber: true } }) : null;
  return { title: indent?.indentNumber ?? "Indent" };
}

export default async function IndentPage(props: PageProps<"/indents/[id]">) {
  const user = await requireUser();
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();
  const returnTo = fmsReturnTo((await props.searchParams).from);

  const data = await loadIndentScreen(id, user);
  if (!data) notFound();
  const { indent, comparison, activity, rfqVendors, company, rfqMessage, isOwnerOrLead, canQuote, approveBlocked, value, limitNote, quoteCount, selectedVendorCount, timeline, showRfq } = data;
  return <IndentView activity={activity} approveBlocked={approveBlocked} canQuote={canQuote} company={company} comparison={comparison} id={id} indent={indent} isOwnerOrLead={isOwnerOrLead} limitNote={limitNote} quoteCount={quoteCount} returnTo={returnTo} rfqMessage={rfqMessage} rfqVendors={rfqVendors} selectedVendorCount={selectedVendorCount} showRfq={showRfq} timeline={timeline} user={user} value={value} />;
}
