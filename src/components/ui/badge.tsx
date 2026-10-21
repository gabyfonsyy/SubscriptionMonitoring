import { cn } from "@/lib/utils";

export type Tone = "neutral" | "ok" | "warn" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "border-border bg-background text-muted",
  ok: "border-ok/40 bg-ok/10 text-ok",
  warn: "border-warn/40 bg-warn/10 text-warn",
  danger: "border-danger/40 bg-danger/10 text-danger",
  info: "border-accent/40 bg-accent/10 text-accent",
};

/** Status chip. Always carries a text label and a glyph so meaning never depends on colour. */
export function Badge({
  tone = "neutral",
  glyph,
  children,
  className,
}: {
  tone?: Tone;
  glyph?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {glyph && <span aria-hidden>{glyph}</span>}
      {children}
    </span>
  );
}
