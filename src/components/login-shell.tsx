import {
  AlertCircleIcon,
  BadgeCheckIcon,
  CheckIcon,
  ClipboardListIcon,
  FileTextIcon,
  PackageCheckIcon,
  ReceiptTextIcon,
  ScaleIcon,
  SettingsIcon,
  TruckIcon,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/** The purchase flow shown on the brand panel; the scene shows an order at "Receipt". */
const FLOW = [
  { label: "Indent", icon: ClipboardListIcon },
  { label: "Quotes", icon: ScaleIcon },
  { label: "Approval", icon: BadgeCheckIcon },
  { label: "PO", icon: FileTextIcon },
  { label: "Receipt", icon: PackageCheckIcon },
  { label: "Bill", icon: ReceiptTextIcon },
];
const CURRENT = 4;

/** Why a sign-in failed, from the ?error= code (both the Next app and the web app use these). */
export function loginErrorMessage(code: string | undefined, email: string | undefined, domain: string) {
  switch (code) {
    case undefined:
      return null;
    case "not_registered":
      return `${email ?? "This account"} isn't set up in PurchaseDesk yet. Ask your administrator to add you under Users.`;
    case "disabled":
      return "Your account is disabled. Contact your administrator.";
    case "not_workspace":
    case "wrong_domain":
      return `Please sign in with your @${domain} Google Workspace account.`;
    case "email_unverified":
      return "Google couldn't confirm this email address. Try a different account.";
    case "google_cancelled":
      return "Google sign-in was cancelled.";
    case "expired":
    case "nonce_mismatch":
      return "The sign-in attempt expired. Please try again.";
    case "google_disabled":
      return "Google sign-in isn't configured on the server yet.";
    default:
      return "Google sign-in failed. Please try again.";
  }
}

/** The sign-in screen's frame: brand panel on the left, the form (children) on the right. */
export function LoginShell({ domain, message, children }: { domain: string; message: string | null; children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <aside className="login-panel relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:gap-8 lg:p-12">
        <PanelBackdrop />
        <div className="relative flex w-fit items-center gap-2.5 rounded-full bg-white py-1.5 pr-4 pl-1.5 text-[#1E3A5F] shadow-xl shadow-black/15 login-rise">
          <LogoMark className="rounded-full bg-[#1E3A5F] text-white" />
          <span className="text-[15px] font-semibold tracking-tight">PurchaseDesk</span>
        </div>
        <div className="relative flex flex-1 items-center justify-center">
          <ProcurementScene />
        </div>
        <div className="relative max-w-md login-rise" style={{ "--delay": "0.5s" } as React.CSSProperties}>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">Procurement that runs on process, not follow-ups.</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-white/90">
            Indent to goods receipt in one place: GST-ready purchase orders, approvals in minutes and a complete audit trail.
          </p>
          <p className="mt-8 text-sm text-white/80">© {new Date().getFullYear()} PurchaseDesk</p>
        </div>
      </aside>

      <main className="relative flex items-center justify-center p-6 sm:p-12">
        <div aria-hidden className="login-panel absolute inset-x-0 top-0 h-1.5 lg:hidden" />
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1.5 mb-8 text-sm text-muted-foreground">
            {domain ? `For ${domain} staff only.` : "Sign in with your work account to continue."}
          </p>
          {message && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircleIcon />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

/** Soft shapes behind the scene: rings, a slow gear and a few paper triangles. */
function PanelBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -top-28 -right-28 size-[420px] rounded-full border-[48px] border-white/[0.07]" />
      <div className="absolute -bottom-48 -left-40 size-[520px] rounded-full bg-white/[0.07]" />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/15 to-transparent" />
      <SettingsIcon className="login-spin absolute top-[36%] right-[6%] size-14 text-white/25" strokeWidth={1.5} />
      {[
        "top-[13%] left-[14%] size-3 -rotate-12",
        "top-[8%] right-[32%] size-2.5 rotate-[28deg]",
        "bottom-[36%] left-[7%] size-3 rotate-[40deg]",
        "top-[60%] right-[16%] size-2 -rotate-[35deg]",
      ].map((position) => (
        <span key={position} className={cn("absolute bg-white/60 [clip-path:polygon(50%_0,100%_100%,0_100%)]", position)} />
      ))}
    </div>
  );
}

/** One part of the scene: rises in after `delay` seconds, then floats gently (out of phase by `float`). */
function Piece({ className, delay, float, children }: { className: string; delay: number; float?: number; children: React.ReactNode }) {
  return (
    <div className={cn("login-rise absolute", className)} style={{ "--delay": `${delay}s` } as React.CSSProperties}>
      {float === undefined ? children : (
        <div className="login-float" style={{ "--delay": `${-float}s` } as React.CSSProperties}>
          {children}
        </div>
      )}
    </div>
  );
}

function Bars({ widths, className }: { widths: string[]; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {widths.map((w, i) => (
        <div key={i} className={cn("h-2 rounded-full bg-[#EFE9DF]", w)} />
      ))}
    </div>
  );
}

/** A purchase in motion: the indent, compared quotes, an approved PO, vendor dispatch and the flow it follows. */
function ProcurementScene() {
  return (
    <div aria-hidden className="login-scene relative h-[380px] w-[440px] shrink-0 text-[#1E3A5F]">
      <div className="absolute top-4 left-[96px] size-[300px] rounded-full bg-white/15 blur-2xl" />

      <Piece className="top-[52px] left-[22px]" delay={0.05} float={0.8}>
        <div className="w-[150px] -rotate-[8deg] rounded-2xl bg-white/85 p-4 shadow-xl shadow-black/10">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold">
            <ClipboardListIcon className="size-3.5" />
            Indent
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-[#6B645B]">IND-0231</p>
          <Bars widths={["w-full", "w-4/5", "w-3/5"]} className="mt-4" />
          <span className="mt-4 inline-block rounded-full bg-[#E8590C]/12 px-2 py-0.5 text-[10px] font-semibold text-[#C2410C]">Urgent</span>
          <Bars widths={["w-full", "w-2/3"]} className="mt-4" />
        </div>
      </Piece>

      <Piece className="top-2 left-[136px]" delay={0.15} float={2.5}>
        <div className="relative w-[214px] rounded-2xl bg-white p-5 shadow-2xl shadow-black/20">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.14em] text-[#6B645B] uppercase">Purchase order</p>
              <p className="mt-0.5 font-heading text-lg font-bold">PO-0142</p>
            </div>
            <span className="grid size-8 place-items-center rounded-lg bg-[#1E3A5F] text-white">
              <FileTextIcon className="size-4" />
            </span>
          </div>
          <p className="mt-4 text-[10px] text-[#6B645B]">Vendor</p>
          <div className="mt-1.5 h-2 w-28 rounded-full bg-[#E4DDD1]" />
          <div className="mt-4 space-y-2.5 border-t border-[#EFE9DF] pt-3">
            {["w-24", "w-20", "w-28"].map((w) => (
              <div key={w} className="flex items-center justify-between">
                <div className={cn("h-2 rounded-full bg-[#EFE9DF]", w)} />
                <div className="h-2 w-9 rounded-full bg-[#EFE9DF]" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-[#EFE9DF] pt-3">
            <span className="text-[10px] text-[#6B645B]">Total incl. GST</span>
            <span className="figure text-[15px] font-semibold">₹1,24,500</span>
          </div>
          <span className="absolute top-[108px] right-4 -rotate-12 rounded border-2 border-[#2F855A] bg-white/80 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.18em] text-[#2F855A] uppercase">
            Approved
          </span>
        </div>
      </Piece>

      <Piece className="top-[172px] left-0" delay={0.3} float={1.6}>
        <div className="flex items-center gap-2.5 rounded-full bg-white py-1.5 pr-4 pl-1.5 shadow-xl shadow-black/15">
          <span className="grid size-8 place-items-center rounded-full bg-[#E8590C] text-white">
            <ScaleIcon className="size-4" />
          </span>
          <span className="text-[13px] font-semibold">3 quotes compared</span>
          <CheckIcon className="size-4 text-[#2F855A]" strokeWidth={2.5} />
        </div>
      </Piece>

      <Piece className="top-[112px] left-[318px]" delay={0.4} float={3.4}>
        <div className="relative grid size-[76px] place-items-center rounded-full bg-white shadow-xl shadow-black/15">
          <TruckIcon className="size-8 text-[#E8590C]" strokeWidth={1.75} />
          <span className="absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-[#2F855A] text-white ring-2 ring-white">
            <CheckIcon className="size-3" strokeWidth={3} />
          </span>
        </div>
      </Piece>

      <Piece className="top-[200px] left-[356px]" delay={0.5} float={0.3}>
        <div className="rounded-xl bg-white px-3 py-2 shadow-lg shadow-black/10">
          <p className="text-[10px] text-[#6B645B]">Dispatch</p>
          <p className="text-xs font-semibold whitespace-nowrap">On time</p>
        </div>
      </Piece>

      <Piece className="inset-x-0 top-[292px]" delay={0.65}>
        <div className="rounded-2xl bg-white px-3 pt-3 pb-2.5 shadow-2xl shadow-black/20">
          <div className="relative flex justify-between">
            <div className="absolute top-4 right-7 left-7 h-0.5 rounded-full bg-[#EFE9DF]" />
            <div
              className="absolute top-4 left-7 h-0.5 rounded-full bg-[#1E3A5F]"
              style={{ width: `calc((100% - 56px) * ${CURRENT / (FLOW.length - 1)})` }}
            >
              <span className="login-travel absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#E8590C] shadow-[0_0_0_3px_rgb(232_89_12/0.25)] motion-reduce:hidden" />
            </div>
            {FLOW.map(({ label, icon: Icon }, i) => (
              <div key={label} className="relative flex w-14 flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "relative grid size-8 place-items-center rounded-full",
                    i < CURRENT && "bg-[#1E3A5F] text-white",
                    i === CURRENT && "bg-[#E8590C] text-white",
                    i > CURRENT && "border border-dashed border-[#CFC6B8] bg-white text-[#8A8378]",
                  )}
                >
                  {i === CURRENT && <span className="absolute inset-0 rounded-full bg-[#E8590C]/40 motion-safe:animate-ping" />}
                  <Icon className="relative size-4" />
                </span>
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    i < CURRENT && "text-[#1E3A5F]",
                    i === CURRENT && "text-[#C2410C]",
                    i > CURRENT && "text-[#6B645B]",
                  )}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Piece>
    </div>
  );
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.95l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
