import { MailCheckIcon, MailWarningIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { resolveTat } from "@/lib/fms-steps";
import { DEFAULT_COMPANY } from "@/lib/company-defaults";
import { AddressBook } from "@/app/(app)/settings/address-book";
import { SettingsForm } from "@/app/(app)/settings/settings-form";
import { NotificationsForm } from "@/app/(app)/settings/notifications-form";
import { SettingsTabs } from "@/app/(app)/settings/settings-tabs";
import { TatForm } from "@/app/(app)/settings/tat-form";
import { TransportForm } from "@/app/(app)/settings/transport-form";
import { resolveNotifications } from "@/lib/notification-events";
import { resolveTransport } from "@/lib/transport";
import type { loadSettingsScreen } from "@/lib/screens/admin";

type Data = NonNullable<Awaited<ReturnType<typeof loadSettingsScreen>>>;
export type SettingsViewProps = Pick<Data, "addresses" | "company" | "lastIssued" | "notConnected" | "users">;

export function SettingsView({ addresses, company, lastIssued, notConnected, users }: SettingsViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader title="Company settings" description="Letterhead and PO numbering, addresses, transport, FMS steps and the emails the app sends." />
      <SettingsTabs
        panels={{
          company: (
            <SettingsForm
              logos={{ logo: !!company?.logoPath, logo2: !!company?.logo2Path }}
              lastIssued={lastIssued}
              company={company ?? { ...DEFAULT_COMPANY, name: "" }}
            />
          ),
          addresses: <AddressBook addresses={addresses} />,
          transport: <TransportForm initial={resolveTransport(company?.transport)} />,
          tat: (
            <TatForm initial={resolveTat(company?.tat)} countSundays={company?.tatCountSundays ?? false} users={users.map(({ id, name, roles }) => ({ id, name, roles }))} />
          ),
          notifications: (
            <>
              <Alert>
                {notConnected.length ? <MailWarningIcon /> : <MailCheckIcon />}
                <AlertTitle>Email is sent from each user&apos;s own Gmail</AlertTitle>
                <AlertDescription>
                  POs, quotation requests and step notifications go out from the person who does the action. Each user connects once from their
                  profile menu (bottom-left) → “Connect Gmail”.{" "}
                  {notConnected.length ? `Not connected yet: ${notConnected.map((u) => u.name).join(", ")}.` : "Everyone is connected."} The Gmail API must
                  be enabled in the Google Cloud project that holds the sign-in client.
                </AlertDescription>
              </Alert>
              <NotificationsForm initial={resolveNotifications(company?.notifications)} notConnected={notConnected.map((u) => u.name)} />
            </>
          ),
        }}
      />
    </div>
  );
}
