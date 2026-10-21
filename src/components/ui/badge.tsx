import { cn } from "@/lib/utils";

export type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "blue" | "violet";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  ok: "bg-ok-wash text-ok",
  warn: "bg-warn-wash text-warn",
  danger: "bg-danger-wash text-danger",
  info: "bg-info-wash text-info",
  blue: "bg-blue-wash text-blue",
  violet: "bg-violet-wash text-violet",
};

const DOT: Record<Tone, string> = {
  neutral: "bg-faint",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-info",
  blue: "bg-blue",
  violet: "bg-violet",
};

/**
 * Status chip. Always carries a text label (and optionally a glyph) so meaning never depends on colour.
 * Use sparingly: for the one or two states that matter. Use <Status> for quiet, repeated states in tables.
 */
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
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {glyph && <span aria-hidden>{glyph}</span>}
      {children}
    </span>
  );
}

/** Quiet status: a coloured dot plus text. Lower visual weight than a Badge, for dense tables. */
export function Status({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium", className)}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}
