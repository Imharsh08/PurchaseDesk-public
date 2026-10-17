import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { loadDashboard } from "@/lib/screens/dashboard";
import { DashboardView } from "@/components/screens/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const today = new Date();
  const { s, l, onTime, overdueByStep, overdueByDoer, myTaskCount, myOverdue, totalOverdue, deliveriesPct, todos, topMax, awaiting } = await loadDashboard(user);  return <DashboardView awaiting={awaiting} deliveriesPct={deliveriesPct} l={l} myOverdue={myOverdue} myTaskCount={myTaskCount} onTime={onTime} overdueByDoer={overdueByDoer} overdueByStep={overdueByStep} s={s} today={today} todos={todos} topMax={topMax} totalOverdue={totalOverdue} user={user} />;
}
