import { cn } from "@/lib/utils";

export function LogoMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg",
        inverted ? "bg-white/15 text-white" : "bg-primary text-primary-foreground",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" aria-hidden>
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M4 7.5 12 12l8-4.5M12 12v9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark inverted={inverted} />
      <span className="text-[15px] font-semibold tracking-tight">PurchaseDesk</span>
    </div>
  );
}
