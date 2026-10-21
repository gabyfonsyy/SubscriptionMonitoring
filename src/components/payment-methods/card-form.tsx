"use client";

import { useActionState } from "react";
import { Field, SubmitButton, inputCls } from "@/components/ui/form";
import type { CardFormState } from "@/app/(app)/payment-methods/actions";
import type { Option } from "@/data/reference";

type Action = (prev: CardFormState, formData: FormData) => Promise<CardFormState>;

export function CardForm({
  action,
  teams,
  initial = {},
  idp,
  submitLabel,
}: {
  action: Action;
  teams: Option[];
  initial?: Record<string, string>;
  idp: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<CardFormState, FormData>(action, {});
  const v = (n: string) => state.values?.[n] ?? initial[n] ?? "";
  const err = (n: string) => state.errors?.[n];
  const id = (n: string) => `${idp}${n}`;

  return (
    <form action={formAction} noValidate className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {state.message && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm sm:col-span-2 lg:col-span-4">
          {state.message}
        </p>
      )}
      <Field id={id("label")} label="Nickname" name="label" required error={err("label")} hint="e.g. Engineering Visa" className="lg:col-span-2">
        <input id={id("label")} name="label" defaultValue={v("label")} className={inputCls} aria-invalid={!!err("label")} />
      </Field>
      <Field id={id("last_four")} label="Last 4 digits" name="last_four" required error={err("last_four")} hint="Never the full number">
        <input id={id("last_four")} name="last_four" inputMode="numeric" maxLength={4} autoComplete="off" defaultValue={v("last_four")} className={inputCls} aria-invalid={!!err("last_four")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id={id("expiry_month")} label="Expiry month" name="expiry_month" required error={err("expiry_month")}>
          <input id={id("expiry_month")} name="expiry_month" inputMode="numeric" maxLength={2} placeholder="MM" defaultValue={v("expiry_month")} className={inputCls} aria-invalid={!!err("expiry_month")} />
        </Field>
        <Field id={id("expiry_year")} label="Expiry year" name="expiry_year" required error={err("expiry_year")}>
          <input id={id("expiry_year")} name="expiry_year" inputMode="numeric" maxLength={4} placeholder="YYYY" defaultValue={v("expiry_year")} className={inputCls} aria-invalid={!!err("expiry_year")} />
        </Field>
      </div>
      <Field id={id("responsible_team_id")} label="Responsible team" name="responsible_team_id" error={err("responsible_team_id")}>
        <select id={id("responsible_team_id")} name="responsible_team_id" defaultValue={v("responsible_team_id")} className={inputCls}>
          <option value="">No team</option>
          {teams.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>
      <Field id={id("cardholder_note")} label="Cardholder" name="cardholder_note" error={err("cardholder_note")} hint="Who holds it (name or role)" className="lg:col-span-2">
        <input id={id("cardholder_note")} name="cardholder_note" maxLength={200} defaultValue={v("cardholder_note")} className={inputCls} aria-invalid={!!err("cardholder_note")} />
      </Field>
      <Field id={id("notes")} label="Notes" name="notes" error={err("notes")} className="sm:col-span-2 lg:col-span-4">
        <input id={id("notes")} name="notes" defaultValue={v("notes")} className={inputCls} aria-invalid={!!err("notes")} />
      </Field>
      <div className="sm:col-span-2 lg:col-span-4">
        <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
