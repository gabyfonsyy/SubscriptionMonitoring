import Link from "next/link";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";
const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover",
  secondary: "border border-border-strong bg-surface text-foreground shadow-sm hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
  danger: "bg-danger-solid text-white shadow-sm hover:opacity-90",
};
const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-9 px-3.5 text-sm",
};

/** One source of truth for button styling; use on <button>, <Link> or <a>. */
export function buttonCls(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cn(BASE, VARIANT[variant], SIZE[size], className);
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonCls(variant, size, className)}>
      {children}
    </Link>
  );
}
