import { LogoMark } from "@/components/logo";

/**
 * The opening screen while the app starts (signing in, first data). The same markup is in
 * web/index.html, so it's what shows from the very first paint until the app takes over.
 */
export function Splash({ message = "Opening PurchaseDesk…" }: { message?: string }) {
  return (
    <div className="grid min-h-svh place-items-center bg-background" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="size-12 rounded-xl shadow-sm [&>svg]:size-6" />
        <div className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>
          PurchaseDesk
        </div>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-[busy-slide_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
        <div className="text-xs text-muted-foreground">{message}</div>
      </div>
    </div>
  );
}
