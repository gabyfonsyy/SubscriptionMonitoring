"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { buttonCls } from "@/components/ui/button";

export const inputCls =
  "h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-foreground placeholder:text-faint disabled:opacity-60";

export function Field({
  label,
  name,
  error,
  hint,
  required,
  children,
  className,
  id,
}: {
  label: string;
  name: string;
  /** DOM id when the same field name appears in more than one form on a page. */
  id?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id ?? name} className="block text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${id ?? name}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectInput({
  name,
  options,
  defaultValue,
  placeholder,
  error,
  required,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <select
      id={name}
      name={name}
      defaultValue={defaultValue ?? ""}
      required={required}
      aria-invalid={!!error}
      aria-describedby={error ? `${name}-error` : undefined}
      className={inputCls}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function SubmitButton({
  children,
  pendingText = "Saving…",
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonCls(variant, "md", className)}>
      {pending ? pendingText : children}
    </button>
  );
}
